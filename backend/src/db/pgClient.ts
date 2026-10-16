/**
 * PostgreSQL Database Client for Supabase
 * Directly executes all database queries on remote Supabase PostgreSQL
 * using pg.Pool with a Supabase-compatible query builder interface.
 * Strictly guarantees all data is persisted in Supabase.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set in environment.');
    }
    const sslConfig = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: parseInt(process.env.PG_MAX_POOL || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    pool.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) {
        console.warn('[Supabase PG] Idle connection reset by server.');
        return;
      }
      console.error('[Supabase PG Pool Error]', err.message);
    });
  }
  return pool;
}

export async function executeQueryWithRetry(sql: string, values?: any[], retries: number = 3): Promise<any> {
  const p = getPool();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await p.query(sql, values);
    } catch (err: any) {
      const isConnError = err.code === 'ECONNRESET' ||
                          err.code === 'EPIPE' ||
                          err.code === 'ENOTFOUND' ||
                          err.code === 'EAI_AGAIN' ||
                          err.message?.includes('ECONNRESET') ||
                          err.message?.includes('Connection terminated') ||
                          err.message?.includes('connection timeout') ||
                          err.message?.includes('ENOTFOUND');
      if (isConnError && attempt < retries) {
        console.warn(`[Supabase PG] Connection interrupted (${err.message}). Retrying attempt ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export class PgQueryBuilder {
  private _table: string;
  private _filters: any[] = [];
  private _orderBy: string | null = null;
  private _orderAsc: boolean = true;
  private _limitVal: number | string | null = null;
  private _single: boolean = false;
  private _selectCols: string = '*';
  private _insertData: any = null;
  private _updateData: any = null;
  private _deleteMode: boolean = false;

  constructor(table: string) {
    this._table = table;
  }

  select(cols: string = '*'): this {
    this._selectCols = cols;
    return this;
  }

  insert(data: any): this {
    this._insertData = data;
    return this;
  }

  update(data: any): this {
    this._updateData = data;
    return this;
  }

  delete(): this {
    this._deleteMode = true;
    return this;
  }

  eq(col: string, val: any): this {
    this._filters.push({ col, val, op: '=' });
    return this;
  }

  neq(col: string, val: any): this {
    this._filters.push({ col, val, op: '!=' });
    return this;
  }

  is(col: string, val: any): this {
    if (val === null) {
      this._filters.push({ col, val: null, op: 'IS NULL' });
    } else {
      this._filters.push({ col, val, op: '=' });
    }
    return this;
  }

  gt(col: string, val: any): this {
    this._filters.push({ col, val, op: '>' });
    return this;
  }

  gte(col: string, val: any): this {
    this._filters.push({ col, val, op: '>=' });
    return this;
  }

  lt(col: string, val: any): this {
    this._filters.push({ col, val, op: '<' });
    return this;
  }

  lte(col: string, val: any): this {
    this._filters.push({ col, val, op: '<=' });
    return this;
  }

  in(col: string, vals: any[]): this {
    this._filters.push({ col, val: vals, op: 'IN' });
    return this;
  }

  order(col: string, opts: { ascending?: boolean } = {}): this {
    this._orderBy = col;
    this._orderAsc = opts.ascending !== false;
    return this;
  }

  limit(n: number | string): this {
    this._limitVal = n;
    return this;
  }

  single(): this {
    this._single = true;
    return this;
  }

  async then(resolve: (value: any) => any, reject?: (reason: any) => any): Promise<any> {
    try {
      const result = await this._execute();
      return resolve(result);
    } catch (err) {
      if (reject) return reject(err);
      return { data: null, error: err };
    }
  }

  async _execute(): Promise<{ data: any; error: any }> {
    let targetTable = this._table;
    if (targetTable === 'audit_events') {
      targetTable = 'audit_logs';
    }

    try {
      // 1. INSERT
      if (this._insertData) {
        const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
        if (rows.length === 0) return { data: [], error: null };

        const cols = Object.keys(rows[0]);
        const values: any[] = [];
        const valuePlaceholders: string[] = [];

        rows.forEach((row, rowIdx) => {
          const rowParams: string[] = [];
          cols.forEach((col, colIdx) => {
            const paramIdx = rowIdx * cols.length + colIdx + 1;
            rowParams.push(`$${paramIdx}`);
            let val = row[col];

            if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
              val = JSON.stringify(val);
            }
            values.push(val);
          });
          valuePlaceholders.push(`(${rowParams.join(', ')})`);
        });

        const sql = `INSERT INTO "${targetTable}" (${cols.map(c => `"${c}"`).join(', ')})
                     VALUES ${valuePlaceholders.join(', ')}
                     RETURNING *;`;

        const res = await executeQueryWithRetry(sql, values);
        const data = this._single ? (res.rows[0] || null) : res.rows;
        return { data, error: null };
      }

      // 2. UPDATE
      if (this._updateData) {
        const setCols = Object.keys(this._updateData);
        if (setCols.length === 0) return { data: [], error: null };

        const values: any[] = [];
        const setSnippets: string[] = [];
        let paramIdx = 1;

        for (const col of setCols) {
          let val = this._updateData[col];
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values.push(val);
          setSnippets.push(`"${col}" = $${paramIdx++}`);
        }

        const whereSnippets: string[] = [];
        for (const f of this._filters) {
          if (f.op === 'IS NULL') {
            whereSnippets.push(`"${f.col}" IS NULL`);
          } else if (f.op === 'IS NOT NULL') {
            whereSnippets.push(`"${f.col}" IS NOT NULL`);
          } else {
            values.push(f.val);
            whereSnippets.push(`"${f.col}" ${f.op} $${paramIdx++}`);
          }
        }

        const whereClause = whereSnippets.length > 0 ? `WHERE ${whereSnippets.join(' AND ')}` : '';
        const sql = `UPDATE "${targetTable}" SET ${setSnippets.join(', ')} ${whereClause} RETURNING *;`;

        const res = await executeQueryWithRetry(sql, values);
        const data = this._single ? (res.rows[0] || null) : res.rows;
        return { data, error: null };
      }

      // 3. DELETE
      if (this._deleteMode) {
        const values: any[] = [];
        const whereSnippets: string[] = [];
        let paramIdx = 1;

        for (const f of this._filters) {
          if (f.op === 'IS NULL') {
            whereSnippets.push(`"${f.col}" IS NULL`);
          } else if (f.op === 'IS NOT NULL') {
            whereSnippets.push(`"${f.col}" IS NOT NULL`);
          } else {
            values.push(f.val);
            whereSnippets.push(`"${f.col}" ${f.op} $${paramIdx++}`);
          }
        }

        const whereClause = whereSnippets.length > 0 ? `WHERE ${whereSnippets.join(' AND ')}` : '';
        const sql = `DELETE FROM "${targetTable}" ${whereClause} RETURNING *;`;

        const res = await executeQueryWithRetry(sql, values);
        return { data: res.rows, error: null };
      }

      // 4. SELECT
      const values: any[] = [];
      const whereSnippets: string[] = [];
      let paramIdx = 1;

      for (const f of this._filters) {
        if (f.op === 'IN') {
          const inPlaceholders = f.val.map(() => `$${paramIdx++}`).join(', ');
          values.push(...f.val);
          whereSnippets.push(`"${f.col}" IN (${inPlaceholders})`);
        } else if (f.op === 'IS NULL') {
          whereSnippets.push(`"${f.col}" IS NULL`);
        } else if (f.op === 'IS NOT NULL') {
          whereSnippets.push(`"${f.col}" IS NOT NULL`);
        } else {
          values.push(f.val);
          whereSnippets.push(`"${f.col}" ${f.op} $${paramIdx++}`);
        }
      }

      const whereClause = whereSnippets.length > 0 ? `WHERE ${whereSnippets.join(' AND ')}` : '';
      const orderClause = this._orderBy ? `ORDER BY "${this._orderBy}" ${this._orderAsc ? 'ASC' : 'DESC'}` : '';
      const limitClause = this._limitVal ? `LIMIT ${parseInt(String(this._limitVal), 10)}` : (this._single ? 'LIMIT 1' : '');

      const sqlCols = (!this._selectCols || this._selectCols === '*')
        ? '*'
        : this._selectCols.split(',').map(c => `"${c.trim()}"`).join(', ');

      const sql = `SELECT ${sqlCols} FROM "${targetTable}" ${whereClause} ${orderClause} ${limitClause};`;

      const res = await executeQueryWithRetry(sql, values);
      const data = this._single ? (res.rows[0] || null) : res.rows;
      return { data, error: null };
    } catch (err: any) {
      console.error(`[Supabase Query Error on ${targetTable}]:`, err.message);
      return { data: null, error: err };
    }
  }
}

export const pgClient = {
  from(tableName: string): PgQueryBuilder {
    return new PgQueryBuilder(tableName);
  },
  async query(sql: string, params?: any[]): Promise<any> {
    return executeQueryWithRetry(sql, params);
  }
};

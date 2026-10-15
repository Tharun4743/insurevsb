/**
 * PostgreSQL Database Client for Supabase
 * Directly executes all database queries on remote Supabase PostgreSQL
 * using pg.Pool with a Supabase-compatible query builder interface.
 * Strictly guarantees all data is persisted in Supabase.
 */

'use strict';

const { Pool } = require('pg');

let pool = null;

function getPool() {
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

    pool.on('error', (err) => {
      // Suppress unhandled socket resets from idle connection drops
      if (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET')) {
        console.warn('[Supabase PG] Idle connection reset by server.');
        return;
      }
      console.error('[Supabase PG Pool Error]', err.message);
    });
  }
  return pool;
}

async function executeQueryWithRetry(sql, values, retries = 2) {
  const p = getPool();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await p.query(sql, values);
    } catch (err) {
      const isConnError = err.code === 'ECONNRESET' ||
                          err.code === 'EPIPE' ||
                          err.message?.includes('ECONNRESET') ||
                          err.message?.includes('Connection terminated') ||
                          err.message?.includes('connection timeout');
      if (isConnError && attempt < retries) {
        console.warn(`[Supabase PG] Connection interrupted (${err.message}). Retrying attempt ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

class PgQueryBuilder {
  constructor(table) {
    this._table = table;
    this._filters = [];
    this._orderBy = null;
    this._orderAsc = true;
    this._limitVal = null;
    this._single = false;
    this._selectCols = '*';
    this._insertData = null;
    this._updateData = null;
    this._deleteMode = false;
  }

  select(cols = '*') {
    this._selectCols = cols;
    return this;
  }

  insert(data) {
    this._insertData = data;
    return this;
  }

  update(data) {
    this._updateData = data;
    return this;
  }

  delete() {
    this._deleteMode = true;
    return this;
  }

  eq(col, val) {
    this._filters.push({ col, val, op: '=' });
    return this;
  }

  neq(col, val) {
    this._filters.push({ col, val, op: '!=' });
    return this;
  }

  is(col, val) {
    if (val === null) {
      this._filters.push({ col, val: null, op: 'IS NULL' });
    } else {
      this._filters.push({ col, val, op: '=' });
    }
    return this;
  }

  gt(col, val) {
    this._filters.push({ col, val, op: '>' });
    return this;
  }

  gte(col, val) {
    this._filters.push({ col, val, op: '>=' });
    return this;
  }

  lt(col, val) {
    this._filters.push({ col, val, op: '<' });
    return this;
  }

  lte(col, val) {
    this._filters.push({ col, val, op: '<=' });
    return this;
  }

  in(col, vals) {
    this._filters.push({ col, val: vals, op: 'IN' });
    return this;
  }

  order(col, opts = {}) {
    this._orderBy = col;
    this._orderAsc = opts.ascending !== false;
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  async then(resolve, reject) {
    try {
      const result = await this._execute();
      return resolve(result);
    } catch (err) {
      if (reject) return reject(err);
      return { data: null, error: err };
    }
  }

  async _execute() {
    const p = getPool();

    // Map table aliases if needed
    let targetTable = this._table;
    if (targetTable === 'audit_events') {
      targetTable = 'audit_logs';
    }

    try {
      // 1. INSERT
      if (this._insertData) {
        const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
        if (rows.length === 0) return { data: [], error: null };

        // Collect all column names from first object
        const cols = Object.keys(rows[0]);
        const values = [];
        const valuePlaceholders = [];

        rows.forEach((row, rowIdx) => {
          const rowParams = [];
          cols.forEach((col, colIdx) => {
            const paramIdx = rowIdx * cols.length + colIdx + 1;
            rowParams.push(`$${paramIdx}`);
            let val = row[col];

            // Normalize JSON fields if passed as object
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

        const values = [];
        const setSnippets = [];
        let paramIdx = 1;

        for (const col of setCols) {
          let val = this._updateData[col];
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values.push(val);
          setSnippets.push(`"${col}" = $${paramIdx++}`);
        }

        const whereSnippets = [];
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
        const values = [];
        const whereSnippets = [];
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
      const values = [];
      const whereSnippets = [];
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
      const limitClause = this._limitVal ? `LIMIT ${parseInt(this._limitVal, 10)}` : (this._single ? 'LIMIT 1' : '');

      const sqlCols = (!this._selectCols || this._selectCols === '*')
        ? '*'
        : this._selectCols.split(',').map(c => `"${c.trim()}"`).join(', ');

      const sql = `SELECT ${sqlCols} FROM "${targetTable}" ${whereClause} ${orderClause} ${limitClause};`;

      const res = await executeQueryWithRetry(sql, values);
      const data = this._single ? (res.rows[0] || null) : res.rows;
      return { data, error: null };
    } catch (err) {
      console.error(`[Supabase Query Error on ${targetTable}]:`, err.message);
      return { data: null, error: err };
    }
  }
}

const pgClient = {
  from(tableName) {
    return new PgQueryBuilder(tableName);
  },
  async query(sql, params) {
    return executeQueryWithRetry(sql, params);
  }
};

module.exports = { pgClient, getPool };

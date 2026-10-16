/**
 * In-memory store — used when Supabase is not configured.
 * Mimics the Supabase JS client's chainable query interface just enough to
 * satisfy the service layer without duplicating logic.
 */

import { v4 as uuidv4 } from 'uuid';

export const store: Record<string, any[]> = {
  users:                          [],
  profiles:                       [],
  consents:                       [],
  trips:                          [],
  telemetry_readings:             [],
  trip_metrics:                   [],
  risk_assessments:               [],
  quotes:                         [],
  review_cases:                   [],
  audit_events:                   [],
  audit_logs:                     [],
  accident_records:               [],
  financial_scenarios:            [],
  otp_challenges:                 [],
  password_reset_authorizations:  [],
  pricing_disputes:               [],
  vehicles:                       [],
  provider_configs:               [],
};

export const DEMO_USER_ID = process.env.DEMO_USER_ID || '00000000-0000-0000-0000-000000000001';

// Pre-seed demo vehicles in in-memory fallback
store.vehicles.push(
  {
    id: '00000000-0000-0000-0000-000000000101',
    user_id: DEMO_USER_ID,
    vehicle_identifier: 'INSURE-BIKE-001',
    make: 'Ather',
    model: '450X Gen 3',
    year: 2024,
    device_id: 'ESP32-DEV-001',
    provider_id: 'iot_esp32_telematics',
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    user_id: DEMO_USER_ID,
    vehicle_identifier: 'INSURE-BIKE-002',
    make: 'Ola Electric',
    model: 'S1 Pro',
    year: 2024,
    device_id: 'ESP32-DEV-002',
    provider_id: 'iot_esp32_telematics',
    status: 'active',
  }
);

export class QueryBuilder {
  private _table: string;
  private _filters: any[] = [];
  private _orderBy: string | null = null;
  private _orderAsc: boolean = true;
  private _limitVal: number | null = null;
  private _single: boolean = false;
  private _selectCols: string | null = null;
  private _insertData: any = null;
  private _updateData: any = null;
  private _upsertData: any = null;
  private _deleteMode: boolean = false;

  constructor(table: string) {
    this._table = table;
  }

  select(cols: string): this { this._selectCols = cols; return this; }
  insert(data: any): this { this._insertData = data; return this; }
  update(data: any): this { this._updateData = data; return this; }
  upsert(data: any): this { this._upsertData = data; return this; }
  delete(): this { this._deleteMode = true; return this; }
  eq(col: string, val: any): this { this._filters.push({ col, val, op: 'eq' }); return this; }
  neq(col: string, val: any): this { this._filters.push({ col, val, op: 'neq' }); return this; }
  is(col: string, val: any): this { this._filters.push({ col, val, op: 'is' }); return this; }
  gt(col: string, val: any): this { this._filters.push({ col, val, op: 'gt' }); return this; }
  gte(col: string, val: any): this { this._filters.push({ col, val, op: 'gte' }); return this; }
  lt(col: string, val: any): this { this._filters.push({ col, val, op: 'lt' }); return this; }
  lte(col: string, val: any): this { this._filters.push({ col, val, op: 'lte' }); return this; }
  in(col: string, vals: any[]): this { this._filters.push({ col, val: vals, op: 'in' }); return this; }
  order(col: string, opts: { ascending?: boolean } = {}): this { this._orderBy = col; this._orderAsc = opts.ascending !== false; return this; }
  limit(n: number): this { this._limitVal = n; return this; }
  single(): this { this._single = true; return this; }

  private _applyFilters(rows: any[]): any[] {
    return rows.filter(row =>
      this._filters.every(f => {
        if (f.op === 'eq' || f.op === 'is')  return row[f.col] === f.val;
        if (f.op === 'neq') return row[f.col] !== f.val;
        if (f.op === 'gt')  return row[f.col] > f.val;
        if (f.op === 'gte') return row[f.col] >= f.val;
        if (f.op === 'lt')  return row[f.col] < f.val;
        if (f.op === 'lte') return row[f.col] <= f.val;
        if (f.op === 'in')  return Array.isArray(f.val) && f.val.includes(row[f.col]);
        return true;
      })
    );
  }

  private _project(rows: any[]): any[] {
    if (!this._selectCols || this._selectCols === '*') return rows;
    const cols = this._selectCols.split(',').map(c => c.trim());
    return rows.map(r => Object.fromEntries(cols.filter(c => c in r).map(c => [c, r[c]])));
  }

  then(resolve: (val: any) => any, reject?: (err: any) => any): Promise<any> {
    return Promise.resolve(this._execute()).then(resolve, reject);
  }

  private _execute(): { data: any; error: any } {
    const table = store[this._table];
    if (!table) return { data: null, error: { message: `Unknown table: ${this._table}` } };

    try {
      if (this._insertData) {
        const rows = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
        const inserted = rows.map(r => {
          const row = { id: uuidv4(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r };
          table.push(row);
          return row;
        });
        const data = this._single ? inserted[0] : inserted;
        return { data, error: null };
      }

      if (this._upsertData) {
        const rows = Array.isArray(this._upsertData) ? this._upsertData : [this._upsertData];
        const upserted = rows.map(r => {
          const idx = table.findIndex(t => t.id === r.id);
          if (idx >= 0) {
            table[idx] = { ...table[idx], ...r, updated_at: new Date().toISOString() };
            return table[idx];
          }
          const row = { id: r.id || uuidv4(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r };
          table.push(row);
          return row;
        });
        return { data: this._single ? upserted[0] : upserted, error: null };
      }

      if (this._updateData) {
        let rows = this._applyFilters(table);
        rows.forEach(row => {
          Object.assign(row, this._updateData, { updated_at: new Date().toISOString() });
        });
        return { data: this._single ? rows[0] : rows, error: null };
      }

      if (this._deleteMode) {
        const before = table.length;
        const toRemove = this._applyFilters(table);
        toRemove.forEach(r => { const i = table.indexOf(r); if (i >= 0) table.splice(i, 1); });
        return { data: { count: before - table.length }, error: null };
      }

      let rows = this._applyFilters([...table]);
      if (this._orderBy) {
        rows.sort((a, b) => {
          if (a[this._orderBy!] < b[this._orderBy!]) return this._orderAsc ? -1 : 1;
          if (a[this._orderBy!] > b[this._orderBy!]) return this._orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (this._limitVal) rows = rows.slice(0, this._limitVal);
      rows = this._project(rows);
      if (this._single) {
        if (rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        return { data: rows[0], error: null };
      }
      return { data: rows, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }
}

export const inMemoryStore = {
  from: (table: string) => new QueryBuilder(table),
  _store: store,
  _demo_user_id: DEMO_USER_ID,
};

export default inMemoryStore;

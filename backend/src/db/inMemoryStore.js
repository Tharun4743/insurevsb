/**
 * In-memory store — used when Supabase is not configured.
 * Mimics the Supabase JS client's chainable query interface just enough to
 * satisfy the service layer without duplicating logic.
 *
 * NOTE: All data is lost when the process restarts.
 * This is clearly marked as a development-only fallback.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

// ── Storage ───────────────────────────────────────────────────────────────────
const store = {
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
};

// Clean empty store — no mock data
const DEMO_USER_ID = process.env.DEMO_USER_ID || '00000000-0000-0000-0000-000000000001';

// ── Query builder ─────────────────────────────────────────────────────────────
class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._filters = [];
    this._orderBy = null;
    this._orderAsc = true;
    this._limitVal = null;
    this._single = false;
    this._selectCols = null;
    this._insertData = null;
    this._updateData = null;
    this._upsertData = null;
    this._deleteMode = false;
  }

  select(cols) { this._selectCols = cols; return this; }
  insert(data) { this._insertData = data; return this; }
  update(data) { this._updateData = data; return this; }
  upsert(data) { this._upsertData = data; return this; }
  delete() { this._deleteMode = true; return this; }
  eq(col, val) { this._filters.push({ col, val, op: 'eq' }); return this; }
  neq(col, val){ this._filters.push({ col, val, op: 'neq' }); return this; }
  is(col, val) { this._filters.push({ col, val, op: 'is' }); return this; }
  gt(col, val) { this._filters.push({ col, val, op: 'gt' }); return this; }
  gte(col, val){ this._filters.push({ col, val, op: 'gte' }); return this; }
  lt(col, val) { this._filters.push({ col, val, op: 'lt' }); return this; }
  lte(col, val){ this._filters.push({ col, val, op: 'lte' }); return this; }
  in(col, vals){ this._filters.push({ col, val: vals, op: 'in' }); return this; }
  order(col, opts = {}) { this._orderBy = col; this._orderAsc = opts.ascending !== false; return this; }
  limit(n) { this._limitVal = n; return this; }
  single() { this._single = true; return this; }

  _applyFilters(rows) {
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

  _project(rows) {
    if (!this._selectCols || this._selectCols === '*') return rows;
    const cols = this._selectCols.split(',').map(c => c.trim());
    return rows.map(r => Object.fromEntries(cols.filter(c => c in r).map(c => [c, r[c]])));
  }

  then(resolve, reject) {
    return Promise.resolve(this._execute()).then(resolve, reject);
  }

  _execute() {
    const table = store[this._table];
    if (!table) return { data: null, error: { message: `Unknown table: ${this._table}` } };

    try {
      // INSERT
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

      // UPSERT
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

      // UPDATE
      if (this._updateData) {
        let rows = this._applyFilters(table);
        rows.forEach(row => {
          Object.assign(row, this._updateData, { updated_at: new Date().toISOString() });
        });
        return { data: this._single ? rows[0] : rows, error: null };
      }

      // DELETE
      if (this._deleteMode) {
        const before = table.length;
        const toRemove = this._applyFilters(table);
        toRemove.forEach(r => { const i = table.indexOf(r); if (i >= 0) table.splice(i, 1); });
        return { data: { count: before - table.length }, error: null };
      }

      // SELECT
      let rows = this._applyFilters([...table]);
      if (this._orderBy) {
        rows.sort((a, b) => {
          if (a[this._orderBy] < b[this._orderBy]) return this._orderAsc ? -1 : 1;
          if (a[this._orderBy] > b[this._orderBy]) return this._orderAsc ? 1 : -1;
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
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }
}

// ── Public API (mirrors Supabase client) ──────────────────────────────────────
const inMemoryStore = {
  from: (table) => new QueryBuilder(table),
  _store: store,            // exposed for tests only
  _demo_user_id: DEMO_USER_ID,
};

module.exports = inMemoryStore;

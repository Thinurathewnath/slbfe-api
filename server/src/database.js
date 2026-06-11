/**
 * Database module using `sqlite3` npm package wrapped with promisify.
 * Provides async/await compatible API for all routes.
 */
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');
const { promisify } = require('util');

const DB_PATH = path.join(__dirname, '../../data/slbfe.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const raw = new sqlite3.Database(DB_PATH);

// ─── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    nid TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL,
    address TEXT NOT NULL, latitude REAL, longitude REAL, profession TEXT,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'citizen' CHECK(role IN ('citizen','officer','company')),
    affiliation TEXT, password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1, is_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS qualifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nid TEXT NOT NULL,
    degree TEXT NOT NULL, institution TEXT NOT NULL, field TEXT NOT NULL, year INTEGER NOT NULL,
    FOREIGN KEY (nid) REFERENCES users(nid) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nid TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('birth_cert','cv','passport','other')),
    original_name TEXT NOT NULL, file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL, mime_type TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0, verified_by TEXT, verified_at TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (nid) REFERENCES users(nid) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nid TEXT NOT NULL,
    name TEXT NOT NULL, relationship TEXT NOT NULL, phone TEXT NOT NULL,
    email TEXT, address TEXT,
    FOREIGN KEY (nid) REFERENCES users(nid) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nid TEXT NOT NULL,
    country TEXT NOT NULL, city TEXT NOT NULL, employer TEXT,
    latitude REAL, longitude REAL, notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (nid) REFERENCES users(nid) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT, complainant_nid TEXT NOT NULL,
    subject TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','under_review','resolved','closed')),
    officer_reply TEXT, officer_nid TEXT, replied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complainant_nid) REFERENCES users(nid)
  );
  CREATE INDEX IF NOT EXISTS idx_qual_nid   ON qualifications(nid);
  CREATE INDEX IF NOT EXISTS idx_qual_field ON qualifications(field);
  CREATE INDEX IF NOT EXISTS idx_docs_nid   ON documents(nid);
  CREATE INDEX IF NOT EXISTS idx_cont_nid   ON contacts(nid);
  CREATE INDEX IF NOT EXISTS idx_loc_nid    ON locations(nid);
  CREATE INDEX IF NOT EXISTS idx_comp_nid   ON complaints(complainant_nid);
`;

// ─── DB Async Helpers ─────────────────────────────────────────────────────────

function _run(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}
function _get(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.get(sql, params, (err, row) => { if(err) reject(err); else resolve(row); });
  });
}
function _all(sql, params = []) {
  return new Promise((resolve, reject) => {
    raw.all(sql, params, (err, rows) => { if(err) reject(err); else resolve(rows||[]); });
  });
}
function _exec(sql) {
  return new Promise((resolve, reject) => {
    raw.exec(sql, err => { if(err) reject(err); else resolve(); });
  });
}

// ─── Normalize Params ─────────────────────────────────────────────────────────
// Handles both positional arrays and named-object params
function toParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const a = args[0];
    if (a !== null && typeof a === 'object' && !Array.isArray(a)) {
      // Named params: convert { @key: val } to sqlite3 named format
      // sqlite3 supports { $key: val } or { ':key': val }
      const out = {};
      for (const [k,v] of Object.entries(a)) {
        out[k.startsWith('@') || k.startsWith('$') || k.startsWith(':') ? k : `$${k}`] = v;
      }
      return out;
    }
    return [a];
  }
  return args;
}

// ─── Public API ───────────────────────────────────────────────────────────────
const db = {
  /** Initialize schema. Must be awaited at startup. */
  init: () => _exec(SCHEMA),

  prepare(sql) {
    return {
      run:  (...args) => _run(sql, toParams(args)),
      get:  (...args) => _get(sql, toParams(args)),
      all:  (...args) => _all(sql, toParams(args))
    };
  },

  run:  (sql, params) => _run(sql, params || []),
  get:  (sql, params) => _get(sql, params || []),
  all:  (sql, params) => _all(sql, params || []),
  exec: sql => _exec(sql),

  /**
   * Transaction helper. `fn` must be an async function.
   * Returns a function that, when called, executes fn in a transaction.
   */
  transaction(fn) {
    return async () => {
      await _run('BEGIN');
      try {
        const result = await fn();
        await _run('COMMIT');
        return result;
      } catch (err) {
        await _run('ROLLBACK');
        throw err;
      }
    };
  }
};

module.exports = db;

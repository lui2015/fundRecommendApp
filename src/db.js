const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'reports'), { recursive: true });

const db = new Database(path.join(config.dataDir, 'recommend.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  type TEXT,
  risk TEXT,
  horizon TEXT,
  sort TEXT,
  fund_code TEXT,
  fund_name TEXT,
  fund_type TEXT,
  reason TEXT,
  score REAL,
  metrics TEXT,
  report_path TEXT,
  seed TEXT,
  used_defaults TEXT,
  data_source TEXT
);
`);

module.exports = db;

-- SOURCE SCHEMA SNAPSHOT for bahith-mcp-smoke-20261017 (2026-11-14)
-- Not a D1-ready import. No data rows exported.
-- FTS shadow tables and internal SQLite tables are excluded below; rebuild derived indexes at destination.

-- table: bahith_probe
CREATE TABLE bahith_probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));

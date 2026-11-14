-- SOURCE SCHEMA SNAPSHOT for bahith-federated-public-mcp (2026-11-14)
-- Not a D1-ready import. No data rows exported.
-- FTS shadow tables and internal SQLite tables are excluded below; rebuild derived indexes at destination.

-- table: gateway_quota
CREATE TABLE gateway_quota (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

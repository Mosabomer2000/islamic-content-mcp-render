-- SOURCE SCHEMA SNAPSHOT for research-execution-gateway (2026-11-14)
-- Not a D1-ready import. No data rows exported.
-- FTS shadow tables and internal SQLite tables are excluded below; rebuild derived indexes at destination.

-- table: gateway_quota
CREATE TABLE gateway_quota (bucket TEXT NOT NULL, host TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY(bucket,host));

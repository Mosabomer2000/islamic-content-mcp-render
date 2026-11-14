-- SOURCE SCHEMA SNAPSHOT for bahith-bulk-domain-research (2026-11-14)
-- Not a D1-ready import. No data rows exported.
-- FTS shadow tables and internal SQLite tables are excluded below; rebuild derived indexes at destination.

-- table: jobs
CREATE TABLE jobs (id INTEGER PRIMARY KEY, query TEXT NOT NULL UNIQUE, domain TEXT NOT NULL, phrase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, found INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- table: native_articles
CREATE TABLE native_articles (url TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',error TEXT);

-- table: native_categories
CREATE TABLE native_categories (page INTEGER PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',count_urls INTEGER DEFAULT 0,error TEXT);

-- table: pages
CREATE TABLE pages (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, job_id INTEGER NOT NULL, title TEXT, domain TEXT, excerpt TEXT, chars INTEGER DEFAULT 0, http_status INTEGER, fetch_status TEXT NOT NULL, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- index: idx_jobs_status
CREATE INDEX idx_jobs_status ON jobs(status,id);

-- index: idx_pages_domain
CREATE INDEX idx_pages_domain ON pages(domain);

-- SOURCE SCHEMA SNAPSHOT for bahith-aleman-native-mcp (2026-11-14)
-- Not a D1-ready import. No data rows exported.
-- FTS shadow tables and internal SQLite tables are excluded below; rebuild derived indexes at destination.

-- table: books
CREATE TABLE books (id INTEGER PRIMARY KEY,title TEXT NOT NULL,normalized_title TEXT NOT NULL,author TEXT,category TEXT,url TEXT NOT NULL,origin TEXT NOT NULL,seen_at TEXT NOT NULL);

-- table: catalog_roots
CREATE TABLE catalog_roots (url TEXT PRIMARY KEY, visited INTEGER NOT NULL DEFAULT 0);

-- table: control
CREATE TABLE control (id INTEGER PRIMARY KEY CHECK(id=1),next_page INTEGER NOT NULL DEFAULT 1,last_sync INTEGER DEFAULT 0,last_status TEXT DEFAULT 'new',last_error TEXT,ended INTEGER NOT NULL DEFAULT 0);

-- table: sections
CREATE TABLE sections (book_id INTEGER NOT NULL,id INTEGER NOT NULL,title TEXT,url TEXT NOT NULL,text_excerpt TEXT,normalized_excerpt TEXT,sha256 TEXT,seen_at TEXT,PRIMARY KEY(book_id,id));

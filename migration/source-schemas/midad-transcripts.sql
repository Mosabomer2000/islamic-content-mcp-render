-- SOURCE SCHEMA SNAPSHOT for midad-transcripts (2026-11-14)
-- Not a D1-ready import. No data rows exported.
-- FTS shadow tables and internal SQLite tables are excluded below; rebuild derived indexes at destination.

-- table: channels
CREATE TABLE channels(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT DEFAULT '');

-- table: search_fts
CREATE VIRTUAL TABLE search_fts USING fts5(normalized, video_id UNINDEXED, start UNINDEXED, tokenize='unicode61');

-- table: segment_editions
CREATE TABLE segment_editions (segment_id INTEGER PRIMARY KEY, text TEXT NOT NULL, normalized TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'mechanical', remarks TEXT DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- table: segments
CREATE TABLE segments(id INTEGER PRIMARY KEY AUTOINCREMENT,video_id TEXT NOT NULL,start REAL DEFAULT 0,text TEXT NOT NULL,normalized TEXT NOT NULL);

-- table: transcript_audits
CREATE TABLE transcript_audits (video_id TEXT PRIMARY KEY, raw_source TEXT, processed_segments INTEGER DEFAULT 0, human_verified_segments INTEGER DEFAULT 0, notes TEXT DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- table: transcript_review_flags
CREATE TABLE transcript_review_flags(id INTEGER PRIMARY KEY AUTOINCREMENT,video_id TEXT NOT NULL,segment_id INTEGER,flag_type TEXT NOT NULL,detail TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'needs_audio_review',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(video_id,segment_id,flag_type));

-- table: videos
CREATE TABLE videos(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,series TEXT DEFAULT '',source TEXT DEFAULT 'manual',duration INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);

-- index: idx_editions_norm
CREATE INDEX idx_editions_norm ON segment_editions(normalized);

-- index: idx_editions_normalized
CREATE INDEX idx_editions_normalized ON segment_editions(normalized);

-- index: idx_segments_norm
CREATE INDEX idx_segments_norm ON segments(normalized);

-- index: idx_segments_video
CREATE INDEX idx_segments_video ON segments(video_id,start);

-- index: idx_video_channel
CREATE INDEX idx_video_channel ON videos(channel_id);

-- trigger: segments_search_ad
CREATE TRIGGER segments_search_ad AFTER DELETE ON segments BEGIN DELETE FROM search_fts WHERE rowid=old.id; END;

-- trigger: segments_search_ai
CREATE TRIGGER segments_search_ai AFTER INSERT ON segments BEGIN INSERT INTO search_fts(rowid,normalized,video_id,start) VALUES(new.id,new.normalized,new.video_id,new.start); END;

-- trigger: segments_search_au
CREATE TRIGGER segments_search_au AFTER UPDATE ON segments BEGIN UPDATE search_fts SET normalized=new.normalized,video_id=new.video_id,start=new.start WHERE rowid=old.id; END;

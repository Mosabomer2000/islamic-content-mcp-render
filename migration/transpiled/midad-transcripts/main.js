import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { serveFile } from "https://esm.town/v/std/utils/index.ts";
const norm = (v) => String(v ?? "").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[آأإٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
let bootstrap;
async function setup() {
    if (!bootstrap)
        bootstrap = (async () => {
            await sqlite.execute("CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
            await sqlite.execute("CREATE TABLE IF NOT EXISTS videos(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,series TEXT DEFAULT '',source TEXT DEFAULT 'manual',duration INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
            await sqlite.execute("CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY AUTOINCREMENT,video_id TEXT NOT NULL,start REAL DEFAULT 0,text TEXT NOT NULL,normalized TEXT NOT NULL)");
            await sqlite.execute("CREATE INDEX IF NOT EXISTS idx_segments_video ON segments(video_id,start)");
            await sqlite.execute("CREATE INDEX IF NOT EXISTS idx_segments_norm ON segments(normalized)");
            await sqlite.execute("CREATE TABLE IF NOT EXISTS segment_editions(segment_id INTEGER PRIMARY KEY,text TEXT NOT NULL,normalized TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'mechanical',remarks TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
            await sqlite.execute("CREATE INDEX IF NOT EXISTS idx_editions_norm ON segment_editions(normalized)");
            await sqlite.execute("CREATE TABLE IF NOT EXISTS transcript_audits(video_id TEXT PRIMARY KEY,raw_source TEXT,processed_segments INTEGER DEFAULT 0,human_verified_segments INTEGER DEFAULT 0,notes TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP)");
        })().catch(e => { bootstrap = undefined; throw e; });
    return bootstrap;
}
const auth = (req) => !!Deno.env.get("MIDAD_ADMIN_TOKEN") && req.headers.get("authorization") === "Bearer " + Deno.env.get("MIDAD_ADMIN_TOKEN");
const vidid = (url) => { try {
    const u = new URL(url);
    if (u.hostname === "youtu.be")
        return u.pathname.slice(1);
    if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(u.hostname))
        return u.searchParams.get("v") || "";
}
catch { } return ""; };
export default async function (req) {
    const url = new URL(req.url), p = url.pathname;
    if (req.method === "GET" && (p === "/" || p === "/index.html"))
        return serveFile("/index.html", import.meta.url);
    if (p === "/api/health")
        return response({ ok: true, app: "midad", schema: 2 });
    if (!p.startsWith("/api/"))
        return response({ error: "غير موجود" }, 404);
    try {
        await setup();
        if (req.method === "GET" && p === "/api/stats") {
            const r = await sqlite.execute(`SELECT (SELECT COUNT(*) FROM channels) AS channels,(SELECT COUNT(*) FROM videos) AS videos,(SELECT COUNT(*) FROM segments) AS segments,(SELECT COUNT(*) FROM segment_editions) AS polishedSegments,(SELECT COUNT(DISTINCT video_id) FROM segments) AS transcribedVideos,(SELECT COUNT(*) FROM videos WHERE id NOT IN (SELECT DISTINCT video_id FROM segments)) AS pendingVideos,(SELECT COALESCE(SUM(duration),0) FROM videos) AS totalSeconds,(SELECT COALESCE(SUM(duration),0) FROM videos WHERE id IN (SELECT DISTINCT video_id FROM segments)) AS transcribedSeconds`);
            const x = r.rows[0] || {};
            return response({ channels: Number(x.channels || 0), videos: Number(x.videos || 0), segments: Number(x.segments || 0), hours: Math.round(Number(x.totalSeconds || 0) / 3600), transcribedVideos: Number(x.transcribedVideos || 0), pendingVideos: Number(x.pendingVideos || 0), transcribedHours: Math.round(Number(x.transcribedSeconds || 0) / 3600 * 10) / 10, polishedSegments: Number(x.polishedSegments || 0) });
        }
        if (req.method === "GET" && p === "/api/channels") {
            const r = await sqlite.execute("SELECT c.id,c.name,c.url,COUNT(v.id) AS videos FROM channels c LEFT JOIN videos v ON v.channel_id=c.id GROUP BY c.id ORDER BY c.name");
            return response({ items: r.rows });
        }
        if (req.method === "GET" && p === "/api/videos") {
            const ch = url.searchParams.get("channel") || "";
            const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 500));
            const off = Math.max(0, Number(url.searchParams.get("offset")) || 0);
            const r = await sqlite.execute({ sql: "SELECT v.id,v.title,v.url,v.series,v.source,v.duration,v.channel_id,c.name AS channel,COUNT(s.id) AS segments,COUNT(e.segment_id) AS edited FROM videos v JOIN channels c ON c.id=v.channel_id LEFT JOIN segments s ON s.video_id=v.id LEFT JOIN segment_editions e ON e.segment_id=s.id WHERE (?='' OR v.channel_id=?) GROUP BY v.id ORDER BY v.created_at DESC,v.title LIMIT ? OFFSET ?", args: [ch, ch, limit, off] });
            return response({ items: r.rows });
        }
        if (req.method === "GET" && p === "/api/search") {
            const q = norm((url.searchParams.get("q") || "").slice(0, 160)), ch = url.searchParams.get("channel") || "";
            if (q.length < 2)
                return response({ items: [], total: 0 });
            const words = q.split(" ").filter(Boolean).slice(0, 8), exact = url.searchParams.get("exact") === "1";
            const tests = exact ? [q] : words, filter = tests.map(() => "COALESCE(e.normalized,s.normalized) LIKE ?").join(" AND ");
            const r = await sqlite.execute({ sql: "SELECT s.id,s.video_id,s.start,COALESCE(e.text,s.text) AS text,v.title,v.url,v.series,v.source,c.name AS channel,c.id AS channel_id,COALESCE(e.stage,'raw') AS stage FROM segments s LEFT JOIN segment_editions e ON e.segment_id=s.id JOIN videos v ON v.id=s.video_id JOIN channels c ON c.id=v.channel_id WHERE (?='' OR c.id=?) AND " + filter + " ORDER BY v.created_at DESC,s.start ASC LIMIT 250", args: [ch, ch, ...tests.map(x => "%" + x + "%")] });
            return response({ items: r.rows.map((x) => ({ ...x, snippet: x.text })), returned: r.rows.length, truncated: r.rows.length === 250 });
        }
        if (req.method === "GET" && p === "/api/transcript") {
            const id = url.searchParams.get("id") || "";
            const v = await sqlite.execute({ sql: "SELECT v.id,v.title,v.url,v.series,v.source,v.duration,c.name AS channel FROM videos v JOIN channels c ON c.id=v.channel_id WHERE v.id=?", args: [id] });
            if (!v.rows.length)
                return response({ error: "الفيديو غير موجود" }, 404);
            const s = await sqlite.execute({ sql: "SELECT s.id,s.start,COALESCE(e.text,s.text) AS text,s.text AS raw_text,COALESCE(e.stage,'raw') AS stage FROM segments s LEFT JOIN segment_editions e ON e.segment_id=s.id WHERE s.video_id=? ORDER BY s.start,s.id LIMIT 20000", args: [id] });
            return response({ video: v.rows[0], segments: s.rows });
        }
        if (req.method === "POST" && p === "/api/import") {
            if (!auth(req))
                return response({ error: "غير مخوّل" }, 401);
            let b;
            try {
                b = await req.json();
            }
            catch {
                return response({ error: "بيانات غير صالحة" }, 400);
            }
            const channel = String(b.channel || "").slice(0, 160).trim(), title = String(b.title || "").slice(0, 300).trim(), id = vidid(String(b.url || "")), arr = b.segments;
            if (!channel || !title || !/^[a-zA-Z0-9_-]{11}$/.test(id) || !Array.isArray(arr) || !arr.length || arr.length > 2500)
                return response({ error: "بيانات الاستيراد غير صالحة" }, 400);
            const clean = arr.map((s) => ({ start: Number(s.start), text: String(s.text || "").slice(0, 10000).trim() })).filter((s) => Number.isFinite(s.start) && s.start >= 0 && s.text);
            if (!clean.length)
                return response({ error: "لا توجد مقاطع صالحة للاستيراد" }, 400);
            const prior = await sqlite.execute({ sql: "SELECT COUNT(*) AS n FROM segments WHERE video_id=?", args: [id] });
            if (Number(prior.rows[0]?.n || 0) > 0) {
                if (b.replace !== true)
                    return response({ error: "يوجد لهذا الفيديو تفريغ محفوظ؛ مُنع الاستبدال لحماية النص والتصحيحات", code: "transcript_exists", video_id: id }, 409);
                const edits = await sqlite.execute({ sql: "SELECT COUNT(*) AS n FROM segment_editions WHERE segment_id IN (SELECT id FROM segments WHERE video_id=?)", args: [id] });
                if (Number(edits.rows[0]?.n || 0) > 0 && b.confirm_erase_edits !== true)
                    return response({ error: "هذا التفريغ يحتوي على تصحيحات؛ يلزم تأكيد مستقل قبل محوها", code: "reviewed_edits_protected", video_id: id }, 409);
            }
            const cid = norm(channel), series = String(b.series || "").slice(0, 160), source = String(b.source || "imported").slice(0, 80), dur = Math.max(0, Number(b.duration) || 0);
            const statements = [
                { sql: "INSERT INTO channels(id,name,url) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=CASE WHEN excluded.url='' THEN channels.url ELSE excluded.url END", args: [cid, channel, String(b.channel_url || "").slice(0, 500)] },
                { sql: "INSERT INTO videos(id,channel_id,title,url,series,source,duration) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,channel_id=excluded.channel_id,url=excluded.url,series=CASE WHEN excluded.series='' THEN videos.series ELSE excluded.series END,source=excluded.source,duration=CASE WHEN excluded.duration=0 THEN videos.duration ELSE excluded.duration END", args: [id, cid, title, "https://www.youtube.com/watch?v=" + id, series, source, dur] },
                { sql: "DELETE FROM segment_editions WHERE segment_id IN (SELECT id FROM segments WHERE video_id=?)", args: [id] },
                { sql: "DELETE FROM segments WHERE video_id=?", args: [id] },
                { sql: "DELETE FROM transcript_audits WHERE video_id=?", args: [id] },
                ...clean.map((s) => ({ sql: "INSERT INTO segments(video_id,start,text,normalized) VALUES(?,?,?,?)", args: [id, s.start, s.text, norm(s.text)] }))
            ];
            await sqlite.batch(statements, "write");
            return response({ ok: true, video_id: id, segments: clean.length, stage: "raw" });
        }
        if (req.method === "POST" && p === "/api/curate") {
            if (!auth(req))
                return response({ error: "غير مخوّل" }, 401);
            let b;
            try {
                b = await req.json();
            }
            catch {
                return response({ error: "بيانات غير صالحة" }, 400);
            }
            const id = String(b.video_id || ""), stage = String(b.stage || "mechanical"), a = b.segments;
            if (!/^[\w-]{11}$/.test(id) || !["mechanical", "provisional", "human_audio_verified"].includes(stage) || !Array.isArray(a) || !a.length || a.length > 2500)
                return response({ error: "مدخلات غير صالحة" }, 400);
            const changed = a.filter((s) => Number.isInteger(Number(s.id)) && Number(s.id) > 0 && String(s.text || "").trim() && String(s.text).length < 12000).map((s) => ({ id: Number(s.id), text: String(s.text).trim(), remarks: String(s.remarks || "").slice(0, 250) }));
            const owned = await sqlite.execute({ sql: "SELECT COUNT(*) AS n FROM segments WHERE video_id=? AND id IN (" + changed.map(() => "?").join(",") + ")", args: [id, ...changed.map((s) => s.id)] });
            if (Number(owned.rows[0]?.n) !== changed.length)
                return response({ error: "مقاطع لا تخص هذا الفيديو" }, 400);
            await sqlite.batch([...changed.map((s) => ({ sql: "INSERT INTO segment_editions(segment_id,text,normalized,stage,remarks,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(segment_id) DO UPDATE SET text=excluded.text,normalized=excluded.normalized,stage=excluded.stage,remarks=excluded.remarks,updated_at=CURRENT_TIMESTAMP", args: [s.id, s.text, norm(s.text), stage, s.remarks] })), { sql: "INSERT INTO transcript_audits(video_id,raw_source,processed_segments,human_verified_segments,notes) VALUES(?,?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET processed_segments=transcript_audits.processed_segments+excluded.processed_segments,human_verified_segments=transcript_audits.human_verified_segments+excluded.human_verified_segments,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP", args: [id, String(b.method || "").slice(0, 100), changed.length, stage === "human_audio_verified" ? changed.length : 0, String(b.notes || "").slice(0, 1000)] }], "write");
            return response({ ok: true, video_id: id, updated: changed.length, stage });
        }
        return response({ error: "غير موجود" }, 404);
    }
    catch (e) {
        console.error(e);
        return response({ error: "خطأ في الخادم", detail: String(e).slice(0, 160) }, 500);
    }
}

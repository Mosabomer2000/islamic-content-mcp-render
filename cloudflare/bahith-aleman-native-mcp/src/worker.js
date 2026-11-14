// D1 compatibility adapter for Val Town's sqlite.execute() API.
let db;
const sqlite = {
 async execute(query) {
   if (!db) throw new Error("D1 binding not initialized");
   const q = typeof query === "string" ? {sql: query, args: []} : query;
   let stmt = db.prepare(q.sql);
   const args = q.args || [];
   if (!Array.isArray(args)) throw new Error("Unsupported SQLite named parameters");
   if (args.length) stmt = stmt.bind(...args.map(x => x === undefined ? null : x));
   const result = await stmt.all();
   const rows = result.results || [];
   return {rows, columns: rows.length ? Object.keys(rows[0]) : [], rowsAffected: result.meta?.changes || 0, lastInsertRowid: result.meta?.last_row_id ?? null};
 },
 async batch(items) {
   if (!db) throw new Error("D1 binding not initialized");
   const stmts = items.map(item => {
     const q = typeof item === "string" ? {sql: item, args: []} : item;
     const args=q.args||[];
     if(!Array.isArray(args))throw new Error("Unsupported named parameters");
     const stmt=db.prepare(q.sql);
     return args.length ? stmt.bind(...args.map(x=>x===undefined?null:x)) : stmt;
   });
   const results=await db.batch(stmts);
   return {results:results.map(r=>({rows:r.results||[],rowsAffected:r.meta?.changes||0}))};
 }
};

const ROOT = "https://www.al-eman.com", RSS = "https://al-eman.com/aleman/rss/rssbook.xml";
const HEAD = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,mcp-protocol-version,mcp-method,mcp-name", "access-control-allow-methods": "GET,POST,OPTIONS" };
const norm = (s) => String(s || "").normalize("NFKC").replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
function plain(s) { return String(s || "").replace(/<[^>]*>/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))).replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x))).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim(); }
const int = (n, def, max) => Math.max(1, Math.min(max, Math.floor(Number(n) || def)));
async function init() {
    await sqlite.execute("CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY,title TEXT NOT NULL,normalized_title TEXT NOT NULL,author TEXT,category TEXT,url TEXT NOT NULL,origin TEXT NOT NULL,seen_at TEXT NOT NULL)");
    await sqlite.execute("CREATE TABLE IF NOT EXISTS sections (book_id INTEGER NOT NULL,id INTEGER NOT NULL,title TEXT,url TEXT NOT NULL,text_excerpt TEXT,normalized_excerpt TEXT,sha256 TEXT,seen_at TEXT,PRIMARY KEY(book_id,id))");
    await sqlite.execute("CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY CHECK(id=1),next_page INTEGER NOT NULL DEFAULT 1,last_sync INTEGER DEFAULT 0,last_status TEXT DEFAULT 'new',last_error TEXT,ended INTEGER NOT NULL DEFAULT 0)");
    await sqlite.execute("INSERT OR IGNORE INTO control(id) VALUES(1)");
    await sqlite.execute("CREATE TABLE IF NOT EXISTS catalog_roots (url TEXT PRIMARY KEY, visited INTEGER NOT NULL DEFAULT 0)");
    await sqlite.execute({ sql: "INSERT OR IGNORE INTO catalog_roots(url) VALUES(?)", args: [ROOT + "/الكتب/p1"] });
}
function urlSafe(raw) {
    const u = new URL(plain(raw), ROOT), path = decodeURIComponent(u.pathname);
    if (!["www.al-eman.com", "al-eman.com"].includes(u.hostname) || u.protocol !== "https:" || u.port || u.username || u.password)
        throw Error("Origin denied");
    if (!path.startsWith("/الكتب/") || u.search || /\.pdf$|\.mp3$|download\.htm/i.test(path))
        throw Error("Robots-sensitive URL denied");
    u.hostname = "www.al-eman.com";
    u.hash = "";
    return u.href;
}
async function getHtml(url, max = 900000) {
    const isRss = url === RSS;
    const u = isRss ? url : urlSafe(url), ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(u, { redirect: "manual", signal: ctrl.signal, headers: { "accept": "text/html,application/xml,text/xml", "user-agent": "BahithIslamicResearch/1.0 (+private scholarly indexing)" } });
        if (res.status >= 300 && res.status < 400)
            throw Error("Redirect denied");
        if (!res.ok)
            throw Error("Upstream " + res.status);
        if (!/text|xml|html/i.test(res.headers.get("content-type") || ""))
            throw Error("Unexpected content type");
        const b = await res.arrayBuffer();
        if (b.byteLength > max)
            throw Error("Page too large");
        return new TextDecoder().decode(b);
    }
    finally {
        clearTimeout(timer);
    }
}
function anchors(html, base) {
    html = html.replace(/<!--[\s\S]*?-->/g, " ");
    const out = [];
    const rx = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = rx.exec(html)) && out.length < 9000) {
        try {
            const url = urlSafe(new URL(plain(m[1] || m[2]), base).href), p = decodeURIComponent(new URL(url).pathname), b = /(?:^|\/)i(\d+)(?=&|$)/.exec(p), d = /(?:^|&)d(\d+)(?=&|$)/.exec(p), title = plain(m[3]);
            if (b && title.length > 2 && title.length < 350 && /^\/الكتب\/(?:[^/]+\/)+i\d+/.test(p))
                out.push({ book_id: Number(b[1]), section_id: d ? Number(d[1]) : null, title, url });
        }
        catch { }
    }
    return out;
}
function booksFromPage(html) { const books = new Map(); for (const a of anchors(html, ROOT)) {
    if (a.section_id)
        continue;
    if (!books.has(a.book_id))
        books.set(a.book_id, { id: a.book_id, title: a.title, url: a.url, origin: "alphabetical" });
} return [...books.values()]; }
function booksFromRss(xml) {
    const out = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
        const inner = m[1], get = (tag) => plain(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i").exec(inner)?.[1] || "");
        try {
            const title = get("title"), raw = get("link"), u = new URL(raw), p = decodeURIComponent(u.pathname), b = /(?:^|\/)i(\d+)(?=&|$)/.exec(p);
            if (b)
                out.push({ id: Number(b[1]), title, url: urlSafe(ROOT + u.pathname), origin: "rss" });
        }
        catch { }
    }
    return out;
}
async function saveBooks(items) {
    const data = new Map();
    for (const item of items)
        if (item.title?.length > 2 && item.id > 0)
            data.set(item.id, item);
    for (const b of data.values())
        await sqlite.execute({ sql: "INSERT INTO books(id,title,normalized_title,url,origin,seen_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,normalized_title=excluded.normalized_title,url=excluded.url,seen_at=excluded.seen_at", args: [b.id, b.title, norm(b.title), b.url, b.origin, new Date().toISOString()] });
    return data.size;
}
async function sync({ pages = 1 } = {}) {
    await init();
    const ctl = (await sqlite.execute("SELECT * FROM control WHERE id=1")).rows[0];
    if (ctl.ended) {
        if (Date.now() - Number(ctl.last_sync) < 86400000)
            return { status: "catalog_roots_exhausted", rss_refresh: "not_due", next_page: ctl.next_page };
        try {
            const rss = booksFromRss(await getHtml(RSS, 100000));
            const newCount = await saveBooks(rss);
            await sqlite.execute({ sql: "UPDATE control SET last_sync=?,last_status='rss_refreshed' WHERE id=1", args: [Date.now()] });
            return { status: "rss_refreshed", book_links_seen: newCount, exhaustive: false };
        }
        catch (e) {
            return { status: "rss_error", message: String(e).slice(0, 220), exhaustive: false };
        }
    }
    if (Date.now() - Number(ctl.last_sync) < 120000)
        return { status: "throttled", cursor: ctl.next_page };
    const max = int(pages, 1, 4);
    let processed = 0, discovered = 0, rssCount = 0, rootsAdded = 0;
    try {
        if (ctl.next_page === 1) {
            const rss = booksFromRss(await getHtml(RSS, 100000));
            rssCount = await saveBooks(rss);
        }
        for (let k = 0; k < max; k++) {
            const row = (await sqlite.execute("SELECT url FROM catalog_roots WHERE visited=0 ORDER BY rowid LIMIT 1")).rows[0];
            if (!row) {
                await sqlite.execute("UPDATE control SET ended=1,last_status='catalog_roots_exhausted' WHERE id=1");
                break;
            }
            const html = await getHtml(row.url), books = booksFromPage(html);
            if (row.url === ROOT + "/الكتب/p1") {
                const rx = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>[\s\S]*?<\/a>/gi;
                let m;
                while ((m = rx.exec(html))) {
                    try {
                        const u = urlSafe(new URL(plain(m[1] || m[2]), ROOT).href), p = decodeURIComponent(new URL(u).pathname);
                        if (/^\/الكتب\/i\d+&p1$/.test(p)) {
                            await sqlite.execute({ sql: "INSERT OR IGNORE INTO catalog_roots(url) VALUES(?)", args: [u] });
                            rootsAdded++;
                        }
                    }
                    catch { }
                }
            }
            discovered += await saveBooks(books);
            await sqlite.execute({ sql: "UPDATE catalog_roots SET visited=1 WHERE url=?", args: [row.url] });
            processed++;
            await sqlite.execute({ sql: "UPDATE control SET next_page=next_page+1,last_sync=?,last_status='ok',last_error=NULL WHERE id=1", args: [Date.now()] });
            if (k < max - 1)
                await new Promise(r => setTimeout(r, 1100));
        }
        const pending = (await sqlite.execute("SELECT count(*) n FROM catalog_roots WHERE visited=0")).rows[0];
        return { status: "ok", roots_processed: processed, book_links_seen: discovered, new_catalog_roots: rootsAdded, rss_links_seen: rssCount, remaining_known_roots: pending?.n, exhaustive: false, source: "al-eman.com", robots_respected: true };
    }
    catch (e) {
        await sqlite.execute({ sql: "UPDATE control SET last_sync=?,last_status='error',last_error=? WHERE id=1", args: [Date.now(), String(e).slice(0, 300)] });
        return { status: "error", roots_processed: processed, message: String(e), exhaustive: false };
    }
}
async function status() {
    await init();
    const [control, b, s] = await Promise.all([sqlite.execute("SELECT * FROM control WHERE id=1"), sqlite.execute("SELECT count(*) n FROM books"), sqlite.execute("SELECT count(*) n,count(text_excerpt) extracted FROM sections")]);
    return { source_id: "aleman", kind: "native_source", title: "نداء الإيمان", source_url: ROOT, control: control.rows[0], indexed_books: b.rows[0]?.n ?? 0, located_sections: s.rows[0]?.n ?? 0, extracted_sections: s.rows[0]?.extracted ?? 0, coverage_complete: false, source_is_secondary: true, source_quote_verification_required: true };
}
async function search(args) {
    await init();
    const q = norm(args.query || "").slice(0, 120), lim = int(args.limit, 12, 30);
    if (q.length < 2)
        throw Error("Query too short");
    const pat = "%" + q.replace(/[%_]/g, " ") + "%";
    const [books, sections] = await Promise.all([sqlite.execute({ sql: "SELECT id AS book_id,title,author,category,url AS canonical_url FROM books WHERE normalized_title LIKE ? ORDER BY id LIMIT ?", args: [pat, lim] }), sqlite.execute({ sql: "SELECT book_id,id AS section_id,title,url AS canonical_url,substr(normalized_excerpt,max(1,instr(normalized_excerpt,?)-160),550) AS normalized_match_context,length(normalized_excerpt) AS indexed_chars FROM sections WHERE normalized_excerpt LIKE ? ORDER BY book_id LIMIT ?", args: [q, pat, lim] })]);
    const c = (await sqlite.execute("SELECT next_page,ended FROM control WHERE id=1")).rows[0];
    return { source_id: "aleman", query: q, books: books.rows, sections: sections.rows, next_catalog_page: c?.next_page, local_text_coverage: "only chapters explicitly opened", corpus_exhaustion: false, search_is_native_local_index: true };
}
async function openBook(args) {
    await init();
    const bid = Number(args.book_id);
    if (!Number.isInteger(bid) || bid < 1)
        throw Error("Invalid book id");
    const b = (await sqlite.execute({ sql: "SELECT * FROM books WHERE id=?", args: [bid] })).rows[0];
    if (!b)
        throw Error("Book not indexed");
    const page = int(args.page, 1, 500), bookPage = b.url.replace(/&p\d+(?=$|#)/, "&p" + page);
    const html = await getHtml(bookPage);
    const sections = new Map();
    for (const a of anchors(html, b.url)) {
        if (a.book_id === bid && a.section_id && !sections.has(a.section_id))
            sections.set(a.section_id, a);
    }
    let added = 0;
    for (const a of [...sections.values()].slice(0, 700)) {
        await sqlite.execute({ sql: "INSERT INTO sections(book_id,id,title,url) VALUES(?,?,?,?) ON CONFLICT(book_id,id) DO UPDATE SET title=excluded.title,url=excluded.url", args: [bid, a.section_id, a.title, a.url] });
        added++;
    }
    return { book_id: bid, title: b.title, author: b.author, canonical_url: bookPage, page, sections: [...sections.values()].slice(0, int(args.limit, 60, 150)), sections_located: added, truncated: sections.size > 700, evidence_stage: "located", edition_verified: false };
}
function extract(html) {
    const marker = /<div\s+id\s*=\s*["']page_content["'][^>]*>/i.exec(html);
    if (!marker)
        throw Error("Original full-text content container missing; do not index navigation as text.");
    let x = html.slice(marker.index + marker[0].length);
    const end = x.search(/<\/div\s*>/i);
    if (end >= 0)
        x = x.slice(0, end);
    x = x.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
    x = x.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|article|section|h[1-6]|li)>/gi, "\n");
    x = x.replace(/<[^>]*>/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"');
    const value = x.replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
    if (value.length < 80)
        throw Error("Original chapter returned no substantive text.");
    return value.slice(0, 160000);
}
async function openSection(args) {
    await init();
    const bid = Number(args.book_id), sid = Number(args.section_id);
    if (!Number.isInteger(bid) || !Number.isInteger(sid) || bid < 1 || sid < 1)
        throw Error("Invalid ids");
    let row = (await sqlite.execute({ sql: "SELECT * FROM sections WHERE book_id=? AND id=?", args: [bid, sid] })).rows[0];
    if (!row) {
        await openBook({ book_id: bid });
        row = (await sqlite.execute({ sql: "SELECT * FROM sections WHERE book_id=? AND id=?", args: [bid, sid] })).rows[0];
    }
    if (!row)
        throw Error("Section unavailable");
    const fullTextUrl = row.url.includes("&c&") ? row.url : row.url.replace(/&p(\d+)(?=$|#)/, "&c&p$1");
    const html = await getHtml(fullTextUrl), text = extract(html);
    const linked = anchors(html, fullTextUrl).filter((x) => x.book_id === bid && x.section_id > 0);
    for (const a of linked.slice(0, 220))
        await sqlite.execute({ sql: "INSERT OR IGNORE INTO sections(book_id,id,title,url) VALUES(?,?,?,?)", args: [bid, a.section_id, a.title, a.url] });
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, "0")).join("");
    await sqlite.execute({ sql: "UPDATE sections SET url=?,text_excerpt=?,normalized_excerpt=?,sha256=?,seen_at=? WHERE book_id=? AND id=?", args: [fullTextUrl, text, norm(text), hash, new Date().toISOString(), bid, sid] });
    return { source_id: "aleman", book_id: bid, section_id: sid, title: row.title, canonical_url: fullTextUrl, text: text.slice(Math.max(0, Math.floor(Number(args.start_chars) || 0)), Math.max(0, Math.floor(Number(args.start_chars) || 0)) + int(args.max_chars, 9000, 14000)), extracted_chars: text.length, returned_start_chars: Math.max(0, Math.floor(Number(args.start_chars) || 0)), next_start_chars: Math.max(0, Math.floor(Number(args.start_chars) || 0)) + int(args.max_chars, 9000, 14000) < text.length ? Math.max(0, Math.floor(Number(args.start_chars) || 0)) + int(args.max_chars, 9000, 14000) : null, sha256: hash, source_is_secondary: true, quote_verified: false, edition_verified: false, extraction_note: "Text extraction may contain site navigation; verify original before publishing." };
}
async function resolveBook(args) {
    await init();
    const bid = Number(args.book_id), requested = String(args.title || "").trim().slice(0, 220);
    if (!Number.isInteger(bid) || bid < 1 || bid > 10000000 || requested.length < 6)
        throw Error("Requires book_id and precise original book title");
    const current = (await sqlite.execute({ sql: "SELECT * FROM books WHERE id=?", args: [bid] })).rows[0];
    if (current) {
        const actual = norm(current.title), wanted = norm(requested);
        if (!actual.includes(wanted) && !wanted.includes(actual))
            throw Error("Provided title disagrees with existing original-source book ID");
        return { status: "already_indexed", book_id: bid, title: current.title, canonical_url: current.url };
    }
    ;
    const url = urlSafe(ROOT + "/الكتب/" + encodeURIComponent(requested) + "/i" + bid + "&p1");
    const html = await getHtml(url);
    const mt = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    const heading = plain(mt?.[1] || "");
    if (!heading.startsWith("كتاب:") || !heading.includes("نداء الإيمان"))
        throw Error("Origin book identity rejected: expected named book page");
    const originalTitle = heading.replace(/^كتاب:\s*/, "").replace(/\|\s*نداء الإيمان\s*$/, "").trim();
    const n = norm(originalTitle), want = norm(requested);
    if (!n || (!n.includes(want) && !want.includes(n)))
        throw Error("Origin book-title identity mismatch");
    await saveBooks([{ id: bid, title: originalTitle, url, origin: "direct_verified_book_page" }]);
    return { status: "verified_direct_original", book_id: bid, title: originalTitle, canonical_url: url, edition_verified: false, quote_verified: false, can_use_aleman_open_book: true };
}
async function expandSection(args) {
    await init();
    const bid = Number(args.book_id), sid = Number(args.section_id);
    if (!Number.isInteger(bid) || !Number.isInteger(sid) || bid < 1 || sid < 1)
        throw Error("Invalid ids");
    const row = (await sqlite.execute({ sql: "SELECT * FROM sections WHERE book_id=? AND id=?", args: [bid, sid] })).rows[0];
    if (!row)
        throw Error("Section not indexed; call aleman_open_book first");
    const indexUrl = String(row.url).replace(/&c(?=&p\d+)/, "");
    const html = await getHtml(indexUrl);
    const found = new Map();
    for (const a of anchors(html, indexUrl)) {
        if (a.book_id === bid && a.section_id && a.section_id !== sid && !found.has(a.section_id))
            found.set(a.section_id, a);
    }
    const all = [...found.values()].slice(0, 450);
    for (const a of all)
        await sqlite.execute({ sql: "INSERT OR IGNORE INTO sections(book_id,id,title,url) VALUES(?,?,?,?)", args: [bid, a.section_id, a.title, a.url] });
    return { source_id: "aleman", book_id: bid, parent_section_id: sid, original_index_url: indexUrl, subsections: all.slice(0, int(args.limit, 25, 100)), subsection_count: all.length, truncated: found.size > 450, text_not_bulk_fetched: true, search_coverage_of_subsections: "metadata_only_until_opened" };
}
async function readCached(args) {
    await init();
    const bid = Number(args.book_id), sid = Number(args.section_id);
    if (!Number.isInteger(bid) || !Number.isInteger(sid) || bid < 1 || sid < 1)
        throw Error("Invalid ids");
    const row = (await sqlite.execute({ sql: "SELECT title,url,sha256,seen_at,text_excerpt FROM sections WHERE book_id=? AND id=?", args: [bid, sid] })).rows[0];
    if (!row || typeof row.text_excerpt !== "string")
        throw Error("Text not in local index: call aleman_open_section for initial original retrieval");
    const offset = Math.max(0, Math.min(160000, Math.floor(Number(args.start_chars) || 0))), size = int(args.max_chars, 9000, 14000), t = String(row.text_excerpt);
    return { source_id: "aleman", book_id: bid, section_id: sid, title: row.title, canonical_url: row.url, content_sha256: row.sha256, extracted_at: row.seen_at, extracted_chars: t.length, returned_start_chars: offset, next_start_chars: offset + size < t.length ? offset + size : null, text: t.slice(offset, offset + size), offline_local_read: true, quote_verified: false, edition_verified: false };
}
const defs = [
    { name: "aleman_status", description: "Current directly indexed original-domain al-eman.com corpus coverage, not web search", inputSchema: { type: "object", properties: {} } },
    { name: "aleman_sync_catalog", description: "Incremental direct catalog and RSS import; bound max 4 listing pages per call, 2-minute throttle", inputSchema: { type: "object", properties: { pages: { type: "integer", minimum: 1, maximum: 4 } } } },
    { name: "aleman_search", description: "Search local SQLite book index and locally read chapter excerpts", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["query"] } },
    { name: "aleman_open_book", description: "Fetch exact original book and register its chapter index", inputSchema: { type: "object", properties: { book_id: { type: "integer" }, page: { type: "integer", minimum: 1, maximum: 500 }, limit: { type: "integer", minimum: 1, maximum: 150 } }, required: ["book_id"] } },
    { name: "aleman_open_section", description: "Fetch an original book chapter, index its text, return original URL and SHA-256", inputSchema: { type: "object", properties: { book_id: { type: "integer" }, section_id: { type: "integer" }, start_chars: { type: "integer", minimum: 0, maximum: 160000 }, max_chars: { type: "integer" } }, required: ["book_id", "section_id"] } },
    { name: "aleman_resolve_book", description: "Directly resolve a known book number and exact title against original al-eman.com book page even before incremental catalog indexing", inputSchema: { type: "object", properties: { book_id: { type: "integer" }, title: { type: "string" } }, required: ["book_id", "title"] } },
    { name: "aleman_expand_section_index", description: "Read exact section TOC and locally index nested subsection IDs without bulk downloading chapter texts", inputSchema: { type: "object", properties: { book_id: { type: "integer" }, section_id: { type: "integer" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["book_id", "section_id"] } },
    { name: "aleman_read_cached_section", description: "Read paginated locally cached chapter text without making additional origin fetches", inputSchema: { type: "object", properties: { book_id: { type: "integer" }, section_id: { type: "integer" }, start_chars: { type: "integer", minimum: 0, maximum: 160000 }, max_chars: { type: "integer" } }, required: ["book_id", "section_id"] } }
];
function jr(id, result) { return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: HEAD }); }
function ok(id, obj) { return jr(id, { content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj, isError: false }); }
function bad(id, e) { return jr(id, { content: [{ type: "text", text: String(e) }], isError: true }); }
async function alemHandler(req) {
    if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers: HEAD });
    if (req.method === "GET")
        return new Response(JSON.stringify({ service: "aleman-native-mcp", status: "online", version: "0.1.0", source: "al-eman.com", mcp: true }), { headers: HEAD });
    if (req.method !== "POST")
        return new Response("method", { status: 405, headers: HEAD });
    let v;
    try {
        v = await req.json();
    }
    catch {
        return new Response("JSON required", { status: 400, headers: HEAD });
    }
    const id = v.id ?? null;
    if (v.method === "initialize")
        return jr(id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "bahith-aleman-native", version: "0.1.0" } });
    if (v.method === "notifications/initialized")
        return new Response(null, { status: 202, headers: HEAD });
    if (v.method === "tools/list")
        return jr(id, { tools: defs });
    if (v.method === "ping")
        return jr(id, {});
    if (v.method !== "tools/call")
        return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method" } }), { headers: HEAD });
    try {
        const a = v.params?.arguments || {};
        switch (v.params?.name) {
            case "aleman_status": return ok(id, await status());
            case "aleman_sync_catalog": return ok(id, await sync(a));
            case "aleman_search": return ok(id, await search(a));
            case "aleman_open_book": return ok(id, await openBook(a));
            case "aleman_open_section": return ok(id, await openSection(a));
            case "aleman_resolve_book": return ok(id, await resolveBook(a));
            case "aleman_expand_section_index": return ok(id, await expandSection(a));
            case "aleman_read_cached_section": return ok(id, await readCached(a));
            default: throw Error("Unknown tool");
        }
    }
    catch (e) {
        return bad(id, e);
    }
}

export default {
 async fetch(request,env) { db=env.DB; return alemHandler(request); },
 async scheduled(controller,env,ctx) {
  db=env.DB;
  const request = new Request("https://bahith-aleman.internal/mcp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:"scheduled",method:"tools/call",params:{name:"aleman_sync_catalog",arguments:{pages:4}}})});
  const response=await alemHandler(request);
  const payload=await response.json();
  if(!response.ok||payload.result?.isError)throw new Error("Al-Eman scheduled sync failed");
 }
};

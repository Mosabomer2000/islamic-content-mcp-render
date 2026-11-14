import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import * as cheerio from "npm:cheerio@1.0.0";
import { setup, pageText, allowedUrl } from "./core.js";
async function init() {
    await setup();
    await sqlite.batch([
        "CREATE TABLE IF NOT EXISTS native_categories (page INTEGER PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',count_urls INTEGER DEFAULT 0,error TEXT)",
        "CREATE TABLE IF NOT EXISTS native_articles (url TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',error TEXT)"
    ]);
    const r = await sqlite.execute("SELECT COUNT(*) n FROM native_categories");
    if (Number(r.rows[0]?.n || 0) === 0) {
        const ops = [];
        for (let n = 1; n <= 70; n++)
            ops.push({ sql: "INSERT OR IGNORE INTO native_categories(page) VALUES(?)", args: [n] });
        await sqlite.batch(ops);
    }
}
async function oneCategory() {
    const r = await sqlite.execute("SELECT page FROM native_categories WHERE status='pending' ORDER BY page LIMIT 1");
    const n = Number(r.rows[0]?.page || 0);
    if (!n)
        return { state: "categories_complete" };
    const url = "https://binbaz.org.sa/categories/fiqhi/48/fatwa?page=" + n;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "user-agent": "Mozilla/5.0", "accept-encoding": "identity" } });
        if (!response.ok) {
            await sqlite.execute({ sql: "UPDATE native_categories SET status='error',error=? WHERE page=?", args: ["HTTP " + response.status, n] });
            return { state: "category_error", page: n, http: response.status };
        }
        const html = (await response.text()).slice(0, 900000);
        const $ = cheerio.load(html);
        const links = [];
        $("a[href]").each((_, el) => {
            const h = $(el).attr("href") || "";
            let u = "";
            try {
                u = new URL(h, "https://binbaz.org.sa").href;
            }
            catch { }
            if (/\/fatwas\/[0-9]+\//.test(u) && allowedUrl(u, "binbaz.org.sa") && !links.includes(u))
                links.push(u);
        });
        const ops = links.slice(0, 45).map(url => ({ sql: "INSERT OR IGNORE INTO native_articles(url) VALUES(?)", args: [url] }));
        if (ops.length)
            await sqlite.batch(ops);
        await sqlite.execute({ sql: "UPDATE native_categories SET status='done',count_urls=? WHERE page=?", args: [links.length, n] });
        return { state: "category_indexed", page: n, discovered: links.length };
    }
    catch (e) {
        await sqlite.execute({ sql: "UPDATE native_categories SET status='error',error=? WHERE page=?", args: [String(e).slice(0, 140), n] });
        return { state: "category_error", page: n, error: String(e) };
    }
}
async function oneArticle() {
    const r = await sqlite.execute("SELECT url FROM native_articles WHERE status='pending' LIMIT 1");
    const u = String(r.rows[0]?.url || "");
    if (!u)
        return { state: "articles_empty" };
    const p = await pageText(u, "صلاة الجماعة");
    await sqlite.execute({ sql: "INSERT OR IGNORE INTO pages(url,job_id,title,domain,excerpt,chars,http_status,fetch_status) VALUES(?,?,?,?,?,?,?,?)", args: [u, 0, p.title, new URL(u).hostname, p.excerpt, p.chars, p.status, p.state] });
    await sqlite.execute({ sql: "UPDATE native_articles SET status=?,error=? WHERE url=?", args: [p.state === "fetch_error" ? "error" : "done", p.state === "fetch_error" ? p.excerpt.slice(0, 120) : null, u] });
    return { state: "article_read", url: u, title: p.title, chars: p.chars, excerpts: p.excerpt.length, fetch: p.state };
}
export default async function (_interval) {
    await init();
    const stats = await sqlite.execute("SELECT count(*) n FROM pages");
    if (Number(stats.rows[0]?.n || 0) >= 1500) {
        console.log("Storage safety stop: 1500 document records");
        return;
    }
    const count = await sqlite.execute("SELECT COUNT(*) n FROM native_articles WHERE status='pending'");
    let result;
    if (Number(count.rows[0]?.n || 0) < 3)
        result = await oneCategory();
    else
        result = { state: "ready_to_read" };
    const found = await sqlite.execute("SELECT COUNT(*) n FROM native_articles WHERE status='pending'");
    const entries = Number(found.rows[0]?.n || 0);
    const details = [];
    for (let n = 0; n < Math.min(3, entries); n++)
        details.push(await oneArticle());
    console.log(JSON.stringify({ indexing: result, read: details }));
    return { indexing: result, read: details };
}

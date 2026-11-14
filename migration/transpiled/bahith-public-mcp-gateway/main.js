// Bahith Islamic Research: read-only public-source MCP fallback on Val Town.
// No user content, secrets, private databases, arbitrary URLs or background jobs.
const UPSTREAM = "https://mcp.turath.io/mcp/";
const API_VERSION = "2025-11-25";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const res = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: JSON_HEADERS });
const ok = (id, result) => res({ jsonrpc: "2.0", id, result });
const fail = (id, code, message, status = 200) => res({ jsonrpc: "2.0", id, error: { code, message } }, status);
const tools = [
    { name: "bahith_turath_search", title: "Search Turath via Val Town", description: "Read-only fallback for Turath public classical book text. Search results are candidates, not verified quotations. Prefer Turath direct when available.", inputSchema: { type: "object", properties: { q: { type: "string", minLength: 2, maxLength: 150 }, page: { type: "integer", minimum: 1, maximum: 10 }, book_id: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: 4 }, author_id: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: 4 }, cat_id: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: 4 } }, required: ["q"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
    { name: "bahith_turath_get_page", title: "Open an exact Turath page", description: "Read-only fallback for a specific Turath book_id and page_id. Read the primary witness, independently verify printed edition/page.", inputSchema: { type: "object", properties: { book_id: { type: "integer", minimum: 1 }, page_id: { type: "integer", minimum: 1 } }, required: ["book_id", "page_id"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
    { name: "bahith_public_source_status", title: "Check public Turath MCP reachability", description: "Read-only live discovery of the configured public Turath MCP, distinguishing gateway reachability from scholarly source accuracy.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } }
];
function integer(v) { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function arraysOK(a) { return ["book_id", "author_id", "cat_id"].every(k => a[k] === undefined || (Array.isArray(a[k]) && a[k].length <= 4 && a[k].every(integer))); }
function parseSse(raw) { for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
        try {
            return JSON.parse(line.slice(5).trim());
        }
        catch { }
    }
} return null; }
async function upstream(name, args = {}) {
    const body = { jsonrpc: "2.0", id: 17, method: name === "tools/list" ? "tools/list" : "tools/call", params: name === "tools/list" ? {} : { name, arguments: args } };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 11000);
    try {
        const x = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" }, body: JSON.stringify(body), signal: controller.signal, redirect: "error" });
        if (!x.ok)
            throw new Error("upstream HTTP " + x.status);
        if (Number(x.headers.get("content-length") || "0") > 125000)
            throw new Error("upstream response exceeds size bound");
        const raw = await x.text();
        if (raw.length > 125000)
            throw new Error("upstream response exceeds size bound");
        const y = x.headers.get("content-type")?.includes("text/event-stream") ? parseSse(raw) : JSON.parse(raw);
        if (!isObj(y) || !(isObj(y.result) || isObj(y.error)))
            throw new Error("unexpected upstream MCP shape");
        return y;
    }
    finally {
        clearTimeout(t);
    }
}
function validate(name, args) {
    if (!isObj(args))
        return null;
    if (name === "bahith_public_source_status")
        return Object.keys(args).length === 0 ? {} : null;
    if (name === "bahith_turath_get_page")
        return Object.keys(args).length === 2 && integer(args.book_id) && integer(args.page_id) ? args : null;
    if (name !== "bahith_turath_search")
        return null;
    const keys = ["q", "page", "book_id", "author_id", "cat_id"];
    if (Object.keys(args).some(k => !keys.includes(k)))
        return null;
    if (typeof args.q !== "string" || args.q.trim().length < 2 || args.q.length > 150)
        return null;
    if (args.page !== undefined && (!integer(args.page) || Number(args.page) > 10))
        return null;
    if (!arraysOK(args))
        return null;
    return { ...args, q: args.q.trim() };
}
export default async function handler(req) {
    if (req.method === "GET")
        return res({ service: "bahith-valtown-readonly-gateway", status: "running", role: "public-readonly-fallback", providers: ["turath"], persistent_private_data: false, upstream_health: "not_checked_by_get", mcp_version: API_VERSION });
    if (req.method !== "POST")
        return res({ error: "method not allowed" }, 405);
    const type = req.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(type))
        return res({ error: "application/json required" }, 415);
    if (Number(req.headers.get("content-length") || "0") > 12000)
        return res({ error: "request too large" }, 413);
    let payload;
    try {
        const raw = await req.text();
        if (raw.length > 12000)
            return res({ error: "request too large" }, 413);
        payload = JSON.parse(raw);
    }
    catch {
        return fail(null, -32700, "Parse error", 400);
    }
    if (!isObj(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string")
        return fail(null, -32600, "Invalid Request", 400);
    const id = payload.id ?? null;
    if (payload.method === "notifications/initialized")
        return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (payload.method === "server/discover")
        return ok(id, { resultType: "complete", supportedVersions: [API_VERSION], capabilities: { tools: { listChanged: false } }, ttlMs: 300000, cacheScope: "public" });
    if (payload.method === "initialize")
        return ok(id, { protocolVersion: API_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "bahith-valtown-public-source-fallback", version: "1.0.0" }, instructions: "Public source-only fallback. Original sources remain authoritative for verification. Never use for private research state." });
    if (payload.method === "ping")
        return ok(id, {});
    if (payload.method === "tools/list")
        return ok(id, { tools });
    if (payload.method !== "tools/call")
        return fail(id, -32601, "Method not found");
    const params = payload.params;
    if (!isObj(params) || typeof params.name !== "string")
        return fail(id, -32602, "Invalid params");
    const args = validate(params.name, params.arguments ?? {});
    if (!args)
        return fail(id, -32602, "Unknown tool or invalid input");
    try {
        if (params.name === "bahith_public_source_status") {
            const j = await upstream("tools/list");
            const list = isObj(j.result) && Array.isArray(j.result.tools) ? j.result.tools : [];
            return ok(id, { isError: false, content: [{ type: "text", text: JSON.stringify({ provider: "turath", reachable: true, tool_count: list.length, names: list.map((t) => String(t.name)).slice(0, 10), coverage: "reachability_only" }) }] });
        }
        const actual = params.name === "bahith_turath_search" ? "search_turath" : "get_page";
        const j = await upstream(actual, args);
        if (isObj(j.error))
            return ok(id, { isError: true, content: [{ type: "text", text: "Public Turath MCP returned an error; no source quotation established." }] });
        return ok(id, j.result);
    }
    catch (e) {
        return ok(id, { isError: true, content: [{ type: "text", text: "Public Turath MCP unavailable or response invalid: " + (e instanceof Error ? e.message : "unknown error") }] });
    }
}

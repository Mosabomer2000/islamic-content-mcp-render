// Val Town / Islamic Research MCP smoke test (read-only, no secrets or storage).
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const asJson = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const good = (id, result) => asJson({ jsonrpc: "2.0", id, result });
const bad = (id, code, message) => asJson({ jsonrpc: "2.0", id, error: { code, message } });
const tools = [
    { name: "bahith_ping", description: "Read-only test of MCP availability. No research data or secrets.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
    { name: "bahith_echo", description: "Return a short test message. This is a diagnostics-only tool.", inputSchema: { type: "object", properties: { message: { type: "string", maxLength: 100 } }, required: ["message"], additionalProperties: false }, annotations: { readOnlyHint: true } },
];
export default async function handler(req) {
    if (req.method === "GET")
        return asJson({ ok: true, service: "bahith-mcp-smoke", protocol: "2025-11-25", tools: tools.length, store: false });
    if (req.method !== "POST")
        return asJson({ error: "Method not allowed" }, 405);
    if (!(req.headers.get("content-type") ?? "").includes("application/json"))
        return asJson({ error: "Expected application/json" }, 415);
    if (Number(req.headers.get("content-length") ?? 0) > 8192)
        return asJson({ error: "Payload too large" }, 413);
    let body;
    try {
        const txt = await req.text();
        if (txt.length > 8192)
            return asJson({ error: "Payload too large" }, 413);
        body = JSON.parse(txt);
    }
    catch {
        return bad(null, -32700, "Parse error");
    }
    const id = body?.id ?? null;
    if (body?.method === "initialize")
        return good(id, { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "bahith-valtown-smoke", version: "0.1.0" } });
    if (body?.method === "notifications/initialized")
        return new Response(null, { status: 204 });
    if (body?.method === "ping")
        return good(id, {});
    if (body?.method === "tools/list")
        return good(id, { tools });
    if (body?.method === "tools/call") {
        const name = body.params?.name;
        if (name === "bahith_ping")
            return good(id, { content: [{ type: "text", text: "pong — Val Town MCP HTTP runtime responding" }], isError: false });
        if (name === "bahith_echo" && typeof body.params?.arguments?.message === "string" && body.params.arguments.message.length <= 100)
            return good(id, { content: [{ type: "text", text: body.params.arguments.message }], isError: false });
        return bad(id, -32602, "Unknown tool or invalid arguments");
    }
    return bad(id, -32601, "Unknown MCP method");
}

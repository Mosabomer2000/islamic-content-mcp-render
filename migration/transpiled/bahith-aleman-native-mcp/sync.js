import handler from "./aleman.js";
export default async function (_interval) {
    const request = new Request("https://bahith-aleman.local/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "scheduled", method: "tools/call", params: { name: "aleman_sync_catalog", arguments: { pages: 4 } } })
    });
    const reply = await handler(request);
    const data = await reply.json();
    const result = data?.result?.structuredContent ?? { error: data?.result?.content?.[0]?.text ?? "unknown" };
    console.log(JSON.stringify({ source: "aleman", scheduled: true, http_status: reply.status, result }));
    if (data?.result?.isError)
        throw new Error("Al-Eman scheduled sync returned an MCP error");
}

// Safe read-only outbound MCP discovery probe; no credentials or persistence.
const endpoint = "https://mcp.turath.io/mcp";
for (const [label, request] of [
  ["get", { method: "GET", headers: { accept: "application/json, text/event-stream" }}],
  ["tools_list", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({jsonrpc:"2.0",id:7,method:"tools/list",params:{}}) }]
] as const) {
 try {
  const resp = await fetch(endpoint, { ...request, signal: AbortSignal.timeout(10000) });
  const txt = await resp.text();
  let toolCount: number | null = null;
  let firstTools: string[] = [];
  for (const line of txt.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try { const j = JSON.parse(line.slice(5)); if (Array.isArray(j?.result?.tools)) { toolCount = j.result.tools.length; firstTools = j.result.tools.slice(0,4).map((t: any) => String(t.name)); } } catch {}
  }
  if(toolCount===null){try{const j=JSON.parse(txt);if(Array.isArray(j?.result?.tools)){toolCount=j.result.tools.length;firstTools=j.result.tools.slice(0,4).map((t: any)=>String(t.name));}}catch{}}
  console.log(JSON.stringify({phase:label,reachable:true,http_status:resp.status,content_type:resp.headers.get("content-type"),tools_found:toolCount,first_tools:firstTools,body_bytes:txt.length}));
 }catch(e){console.log(JSON.stringify({phase:label,reachable:false,error:e instanceof Error?e.message:String(e)}))}
}

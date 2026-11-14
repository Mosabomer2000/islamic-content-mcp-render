const URL_TARGET="https://mosab-bahith-mcp-smoke.mosabomer2015.workers.dev/";
const cases=[
["initialize",{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"cloudflare-cutover-check",version:"1.0.0"}}}],
["tools/list",{jsonrpc:"2.0",id:2,method:"tools/list",params:{}}],
["ping",{jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"bahith_ping",arguments:{}}}],
["echo",{jsonrpc:"2.0",id:4,method:"tools/call",params:{name:"bahith_echo",arguments:{message:"edge-parity-ok"}}}],
["unknown",{jsonrpc:"2.0",id:5,method:"tools/call",params:{name:"nonexistent",arguments:{}}}]
];
export default {async fetch(req,env){
if(new URL(req.url).pathname!=="/")return new Response("Not found",{status:404});
const checks=[];
for(const [name,body] of cases){try{const r=await env.SMOKE.fetch(URL_TARGET,{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(8000)});const z=await r.json();checks.push({name,http:r.status,code:z.error?.code||null,toolnames:z.result?.tools?.map(t=>t.name),text:z.result?.content?.[0]?.text,protocol:z.result?.protocolVersion})}catch(e){checks.push({name,error:String(e).slice(0,200)})}}

const fallbackCases=[
["initialize",{jsonrpc:"2.0",id:21,method:"initialize",params:{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"cloudflare-qa",version:"1"}}}],
["tools/list",{jsonrpc:"2.0",id:22,method:"tools/list",params:{}}],
["unknown",{jsonrpc:"2.0",id:23,method:"tools/call",params:{name:"unknown",arguments:{}}}]
];
const fallbackChecks=[];
for(const [name,body] of fallbackCases){
try{const r=await env.FALLBACK.fetch("https://service.internal/",{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body)});const data=await r.json();fallbackChecks.push({name,http:r.status,protocol:data.result?.protocolVersion,tools:data.result?.tools?.map(t=>t.name),error:data.error?.code})}
catch(e){fallbackChecks.push({name,error:String(e).slice(0,200)})}
}
const fallbackPass=fallbackChecks.every(x=>x.http===200)&&fallbackChecks[0].protocol==="2025-11-25"&&fallbackChecks[1].tools?.includes("bahith_turath_search")&&fallbackChecks[2].error===-32602;


const midadChecks=[];
for(const [name,path,opts] of [["stats","/api/stats",{}],["search","/api/search?q=%D8%A7%D9%86%D9%8A%D9%82%20%D8%B1%D9%88%D8%B6&exact=1",{}],["no-write","/api/import",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}]]){
try{const r=await env.MIDAD.fetch("https://service.internal"+path,opts);const j=await r.json();midadChecks.push({name,http:r.status,videos:j.videos,segments:j.segments,matches:j.returned,error:j.error})}
catch(e){midadChecks.push({name,error:String(e).slice(0,200)})}
}
const midadPass=midadChecks[0].http===200&&midadChecks[0].segments===21893&&midadChecks[1].http===200&&midadChecks[1].matches===1&&midadChecks[2].http===405;


const alemanChecks=[];
const alemanCases=[
["initialize",{jsonrpc:"2.0",id:31,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"migration-qa",version:"1.0.0"}}}],
["tools/list",{jsonrpc:"2.0",id:32,method:"tools/list",params:{}}],
["status",{jsonrpc:"2.0",id:33,method:"tools/call",params:{name:"aleman_status",arguments:{}}}],
["search",{jsonrpc:"2.0",id:34,method:"tools/call",params:{name:"aleman_search",arguments:{query:"الفرائض",limit:15}}}],
["cached",{jsonrpc:"2.0",id:35,method:"tools/call",params:{name:"aleman_read_cached_section",arguments:{book_id:606,section_id:940264,start_chars:0,max_chars:60}}}],
["blocked-sync",{jsonrpc:"2.0",id:36,method:"tools/call",params:{name:"aleman_sync_catalog",arguments:{pages:4}}}]
];
for(const [name,body] of alemanCases){try{const r=await env.ALEMAN.fetch("https://service.internal/mcp",{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify(body)});const z=await r.json();const t=z.result?.structuredContent;alemanChecks.push({name,http:r.status,protocol:z.result?.protocolVersion,tools:z.result?.tools?.map(x=>x.name),isError:z.result?.isError,indexed_books:t?.indexed_books,located_sections:t?.located_sections,book_ids:t?.books?.map(x=>x.book_id),extracted_chars:t?.extracted_chars,excerpt:t?.text?.slice(0,45)})}catch(e){alemanChecks.push({name,error:String(e).slice(0,200)})}}
const alemanPass=alemanChecks.every(x=>x.http===200)&&alemanChecks[0].protocol==="2025-06-18"&&alemanChecks[1].tools?.length===3&&alemanChecks[2].indexed_books===424&&alemanChecks[2].located_sections===299&&alemanChecks[3].book_ids?.includes(180)&&alemanChecks[4].extracted_chars===15543&&alemanChecks[5].isError===true;


const bulkChecks=[];
for(const [name,path,opts] of [
["stats","/?format=json&q="+encodeURIComponent("نزع البركة"),{}],
["csv","/?format=csv&q="+encodeURIComponent("نزع البركة"),{}],
["html","/?q="+encodeURIComponent("نزع البركة"),{}],
["blocked-post","/",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}]
]){
try{const resp=await env.BULK.fetch("https://service.internal"+path,opts),ct=resp.headers.get("content-type")||"",txt=await resp.text();let d;try{d=JSON.parse(txt)}catch{}
bulkChecks.push({name,http:resp.status,content_type:ct.slice(0,40),mode:d?.mode,stats:d?.stats,rows:d?.records?.length,hasHtml:txt.includes("محرك البحث الجماعي"),hasCsv:txt.startsWith("﻿")||txt.startsWith('"title"')})}
catch(e){bulkChecks.push({name,error:String(e).slice(0,250)})}
}
const bulkPass=bulkChecks[0].http===200&&bulkChecks[0].stats?.sourceLinksDiscovered===1059&&bulkChecks[0].rows===3&&bulkChecks[1].http===200&&bulkChecks[1].hasCsv&&bulkChecks[2].http===200&&bulkChecks[2].hasHtml&&bulkChecks[3].http===405;

const pass=bulkPass&&alemanPass&&midadPass&&fallbackPass&&checks.every(x=>x.http===200)&&checks[0].protocol==="2025-11-25"&&checks[1].toolnames?.length===2&&checks[2].text?.includes("responding")&&checks[3].text==="edge-parity-ok"&&checks[4].code===-32602;
return new Response(JSON.stringify({pass,checks,fallbackPass,fallbackChecks,midadPass,midadChecks,alemanPass,alemanChecks,bulkPass,bulkChecks}),{headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}})}
};
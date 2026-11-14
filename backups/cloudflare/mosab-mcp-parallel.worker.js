// Mosab Research Parallel MCP v1.0.0 — strict read-only subset of retired Railway gateway.
// Sources are public fixed-origin Supabase Edge Functions; no arbitrary URLs, credentials or writes.
const VERSION="1.2.0",ROOT="https://pdsxlmrfmbdhobcgujje.supabase.co/functions/v1/";
const ORIGINS=Object.freeze({
  legacy:"islamic-research-mcp",os:"islamic-research-v0205-acceptance-next",
  aljam3:"aljam3-mcp",usul:"usul-mcp",dorar:"dorar-mcp"
});
const SAFE_SEARCH_SOURCES=new Set(["aljam3","usul","dorar","ketabonline","waqfeya","turath","salafiyah","golden_shamela","atharia","alathar"]);
const NATIVE_ALLOWED=Object.freeze({
  aljam3:new Set(["aljam3_search","aljam3_get_page","aljam3_get_book","aljam3_search_book","aljam3_verify_quote","aljam3_get_context"]),
  usul:new Set(["usul_search","usul_search_content","usul_search_books","usul_get_book","usul_get_page","usul_search_book"]),
  dorar:new Set(["dorar_search","dorar_hadith_search","dorar_hadith_get_sharh","dorar_aqeeda_search","dorar_fiqh_search","dorar_tafsir_search"])
});
const ROUTED_TOOLS=Object.freeze({
  aljam3_search:"aljam3",aljam3_get_page:"aljam3",aljam3_search_book:"aljam3",
  usul_search:"usul",usul_search_content:"usul",usul_get_page:"usul",
  dorar_search:"dorar",dorar_hadith_search:"dorar",
  islamic_search_source:"legacy",islamic_source_status:"legacy",research_self_test:"os"
});
const CORS={"access-control-allow-origin":"*","access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"content-type, accept, mcp-protocol-version, mcp-session-id","access-control-expose-headers":"mcp-protocol-version","x-content-type-options":"nosniff"};
const HEADERS={...CORS,"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const textErr=e=>e instanceof Error?e.message.slice(0,100):"unavailable";
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:HEADERS});
const success=(id,result)=>json({jsonrpc:"2.0",id,result});
const fail=(id,code,message,status=200)=>json({jsonrpc:"2.0",id,error:{code,message}},status);
const result=(data)=>({content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data,isError:false});
const finite=(v,base,max)=>Number.isInteger(v)&&v>=1&&v<=max?v:base;
const simpleString=(v,min,max)=>typeof v==="string"&&v.trim().length>=min&&v.length<=max;
const tools=[
  {name:"railway_parallel_calls",title:"Parallel read-only tools (Cloudflare)",description:"Restricted compatibility replacement for Railway parallel_calls. Only whitelisted read-only tools; up to four calls, three concurrent calls, 12s maximum each. No writes or arbitrary URL execution.",
  inputSchema:{type:"object",properties:{calls:{type:"array",minItems:1,maxItems:4,items:{type:"object",properties:{tool:{type:"string",enum:Object.keys(ROUTED_TOOLS)},args:{type:"object"}},required:["tool"],additionalProperties:false}},concurrency:{type:"integer",minimum:1,maximum:3},timeout_ms:{type:"integer",minimum:1000,maximum:12000}},required:["calls"],additionalProperties:false},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  {name:"railway_parallel_search",title:"Parallel Islamic source searches (Cloudflare)",description:"Restricted compatibility replacement for Railway parallel_search, using the existing Islamic source registry. Up to four sources per call, three concurrent requests. Hits require verification in primary texts.",
  inputSchema:{type:"object",properties:{query:{type:"string",minLength:2,maxLength:160},sources:{type:"array",minItems:1,maxItems:4,uniqueItems:true,items:{type:"string",enum:[...SAFE_SEARCH_SOURCES]}},search_mode:{type:"string",enum:["auto","literal","semantic","comprehensive"]},exact_phrase:{type:"boolean"},limit:{type:"integer",minimum:1,maximum:5},concurrency:{type:"integer",minimum:1,maximum:3}},required:["query","sources"],additionalProperties:false},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  {name:"railway_parallel_native",title:"Parallel native source reads (Cloudflare)",description:"Restricted compatibility replacement for Railway parallel_native. Only verified read-only tool names at AlJam3, Usul, Dorar. Up to four calls; unsupported sources/tools return per-call errors.",
  inputSchema:{type:"object",properties:{calls:{type:"array",minItems:1,maxItems:4,items:{type:"object",properties:{source:{type:"string",enum:Object.keys(NATIVE_ALLOWED)},tool_name:{type:"string",minLength:2,maxLength:80},args:{type:"object"},timeout_ms:{type:"integer",minimum:1000,maximum:12000},retry_transient:{type:"boolean"}},required:["source","tool_name"],additionalProperties:false}},concurrency:{type:"integer",minimum:1,maximum:3}},required:["calls"],additionalProperties:false},
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}}
];
async function invoke(slug,name,args,timeout){
 const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),timeout);
 try{
   const response=await fetch(ROOT+slug,{method:"POST",redirect:"manual",signal:ctrl.signal,
    headers:{"accept":"application/json, text/event-stream","content-type":"application/json","mcp-protocol-version":"2025-11-25"},
    body:JSON.stringify({jsonrpc:"2.0",id:1001,method:"tools/call",params:{name,arguments:args}})});
   if(response.status<200||response.status>=300)throw Error("http_"+response.status);
   if(Number(response.headers.get("content-length")||0)>100000)throw Error("response_too_large");
   const body=await response.text();
   if(body.length>100000)throw Error("response_too_large");
   let envelope=null;
   if((response.headers.get("content-type")||"").includes("text/event-stream")){
    const events=body.split(/\r?\n/).filter(t=>t.startsWith("data:"));
    if(events.length)envelope=JSON.parse(events[events.length-1].slice(5).trim());
   }else envelope=JSON.parse(body);
   if(!isObj(envelope))throw Error("invalid_rpc_response");
   if(envelope.error)throw Error("rpc_"+String(envelope.error.code??"unknown"));
   if(!isObj(envelope.result))throw Error("missing_tool_result");
   if(envelope.result.isError)throw Error("tool_returned_error");
   return envelope.result;
 }finally{clearTimeout(tm);}
}
async function parallelMap(items,concurrency,fn){
 const output=new Array(items.length);
 let cursor=0;
 const workers=Array.from({length:Math.min(concurrency,items.length)},async()=>{
   while(cursor<items.length){
    const i=cursor++;const t=Date.now();
    try{output[i]=await fn(items[i],i);output[i].elapsed_ms=Date.now()-t;}
    catch(e){output[i]={success:false,error:textErr(e),elapsed_ms:Date.now()-t};}
   }
 });
 await Promise.all(workers);
 return output;
}
function validateInput(name,args){
 if(!isObj(args))return "object_expected";
 if(name==="railway_parallel_calls"){
  if(!Array.isArray(args.calls)||args.calls.length<1||args.calls.length>4)return "calls_1_to_4";
  if(args.concurrency!==undefined&&finite(args.concurrency,-1,3)===-1)return "invalid_concurrency";
  if(args.timeout_ms!==undefined&&(!Number.isInteger(args.timeout_ms)||args.timeout_ms<1000||args.timeout_ms>12000))return "timeout_out_of_range";
  for(const c of args.calls)if(!isObj(c)||!Object.hasOwn(ROUTED_TOOLS,c.tool)||!(c.args===undefined||isObj(c.args)))return "unsafe_tool_or_args";
 }else if(name==="railway_parallel_search"){
  if(!simpleString(args.query,2,160)||!Array.isArray(args.sources)||args.sources.length<1||args.sources.length>4||new Set(args.sources).size!==args.sources.length||!args.sources.every(x=>SAFE_SEARCH_SOURCES.has(x)))return "invalid_query_or_sources";
  if(args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>5))return "limit_out_of_range";
  if(args.search_mode!==undefined&&!["auto","literal","semantic","comprehensive"].includes(args.search_mode))return "invalid_search_mode";
  if(args.exact_phrase!==undefined&&typeof args.exact_phrase!=="boolean")return "invalid_exact_phrase";
  if(args.concurrency!==undefined&&finite(args.concurrency,-1,3)===-1)return "invalid_concurrency";
 }else if(name==="railway_parallel_native"){
  if(!Array.isArray(args.calls)||args.calls.length<1||args.calls.length>4)return "calls_1_to_4";
  if(args.concurrency!==undefined&&finite(args.concurrency,-1,3)===-1)return "invalid_concurrency";
  for(const c of args.calls)if(!isObj(c)||!NATIVE_ALLOWED[c.source]?.has(c.tool_name)||!(c.args===undefined||isObj(c.args))||(c.timeout_ms!==undefined&&(!Number.isInteger(c.timeout_ms)||c.timeout_ms<1000||c.timeout_ms>12000)))return "unsafe_native_tool_or_args";
 }else return "unknown_tool";
 return null;
}
async function runTool(name,args){
 if(name==="railway_parallel_calls"){
  const calls=await parallelMap(args.calls,finite(args.concurrency,2,3),async c=>{
   if(c.tool==="islamic_search_source"&&!SAFE_SEARCH_SOURCES.has(c.args?.source))return {success:false,error:"source_not_allowed"};
   const v=await invoke(ORIGINS[ROUTED_TOOLS[c.tool]],c.tool,c.args||{},finite(args.timeout_ms,10000,12000));
   return {success:true,result:v};
  });
  return {calls,successful:calls.filter(x=>x.success).length,total:calls.length,read_only:true};
 }
 if(name==="railway_parallel_search"){
  const sources=await parallelMap(args.sources,finite(args.concurrency,2,3),async source=>{
   const q={source,query:args.query,search_mode:args.search_mode||"comprehensive",limit:args.limit||3};
   if(args.exact_phrase!==undefined)q.exact_phrase=args.exact_phrase;
   const v=await invoke(ORIGINS.legacy,"islamic_search_source",q,12000);
   return {source,success:true,results:v};
  });
  return {sources,successful:sources.filter(x=>x.success).length,total:sources.length,read_only:true,independent_primary_witnesses_verified:false};
 }
 if(name==="railway_parallel_native"){
  const calls=await parallelMap(args.calls,finite(args.concurrency,2,3),async c=>{
   const v=await invoke(ORIGINS[c.source],c.tool_name,c.args||{},finite(c.timeout_ms,10000,12000));
   return {source:c.source,tool_name:c.tool_name,success:true,result:v};
  });
  return {calls,successful:calls.filter(x=>x.success).length,total:calls.length,read_only:true};
 }
 throw Error("unknown_tool");
}

const MCPCATALOG={name:"Mosab Research Parallel MCP",description:"Public read-only, fixed-origin concurrent Islamic research tools",endpoint:"/mcp",protocolVersions:["2026-07-28","2025-11-25","2025-06-18"],auth:"none",tools:[
{name:"railway_parallel_calls",example:{calls:[{tool:"aljam3_search",args:{query:"إنما الأعمال بالنيات",limit:1}}]}},
{name:"railway_parallel_search",example:{query:"الصلاة",sources:["aljam3","usul"],limit:1}},
{name:"railway_parallel_native",example:{calls:[{source:"aljam3",tool_name:"aljam3_search",args:{query:"الصلاة",limit:1}}]}}
]};
const SMOKE_TESTS={
 calls:{calls:[{tool:"aljam3_search",args:{query:"إنما الأعمال بالنيات",scope:"pages",limit:1}},{tool:"research_self_test",args:{}}],concurrency:2},
 search:{query:"الصلاة",sources:["aljam3","usul"],search_mode:"literal",limit:1,concurrency:2},
 native:{calls:[{source:"aljam3",tool_name:"aljam3_search",args:{query:"الإيمان",limit:1}},{source:"aljam3",tool_name:"aljam3_search",args:{query:"الصلاة",limit:1}}],concurrency:2}
};
const SMOKE_CACHE=new Map();
async function smoke(which){
 const now=Date.now(),cached=SMOKE_CACHE.get(which);
 if(cached&&now-cached.at<90000)return {...cached.data,cached:true};
 const name={calls:"railway_parallel_calls",search:"railway_parallel_search",native:"railway_parallel_native"}[which];
 const started=Date.now(),d=await runTool(name,SMOKE_TESTS[which]);
 const list=d.calls||d.sources||[];
 const data={service:"Mosab Research Parallel MCP",version:VERSION,test:which,status:d.successful===d.total?"passed":"degraded",total:d.total,successful:d.successful,elapsed_ms:Date.now()-started,checks:list.map(c=>({name:c.tool_name||c.source||"tool",success:c.success,error:c.error||null,elapsed_ms:c.elapsed_ms})),scope:"live_read_only_tool_execution",verified_scholarly_citations:false};
 SMOKE_CACHE.set(which,{at:now,data});return data;
}
const HELLO={service:"Mosab Research Parallel MCP",version:VERSION,status:"ready",transport:"stateless_json_rpc",methods:["initialize","ping","tools/list","tools/call","server/discover"],tool_names:tools.map(t=>t.name),limits:{max_calls:4,max_concurrent:3,max_timeout_ms:12000,request_body_bytes:16000},migration:{from:"Railway gateway-2v7a",parity:"restricted_read_only_subset",known_limitation:"Only approved sources and read tools; does not implement all legacy Railway or Vercel bridge tools."}};
export default {
 async fetch(request){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const path=new URL(request.url).pathname.replace(/\/+$/,"");
  if(request.method==="GET"){
 if(path==="/.well-known/mcp"||path==="/.well-known/mcp.json"||path==="/mcp.json")return json(MCPCATALOG);
 if(path==="/llms.txt")return new Response(["# Mosab Research Parallel MCP","Public read-only MCP endpoint: /mcp","Discovery: /.well-known/mcp.json","Tools: railway_parallel_calls, railway_parallel_search, railway_parallel_native."].join("\n"),{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=300",...CORS}});
 if(path==="/smoke"){
  const test=new URL(request.url).searchParams.get("test")||"calls";
  if(!Object.hasOwn(SMOKE_TESTS,test))return json({error:"test_must_be_calls_search_or_native"},400);
  try{return json(await smoke(test));}catch(e){return json({status:"failed",test,error:textErr(e)},200);}
 }
 return path===""||path==="/health"||path==="/manifest"?json(HELLO):json({error:"not_found"},404);
}
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  if(path!==""&&path!=="/mcp")return json({error:"not_found"},404);
  if(Number(request.headers.get("content-length")||0)>16000)return fail(null,-32600,"Request too large",413);
  let bodyText="";
  try{bodyText=await request.text()}catch{return fail(null,-32700,"Parse error",400);}
  if(bodyText.length>16000)return fail(null,-32600,"Request too large",413);
  let rpc;
  try{rpc=JSON.parse(bodyText)}catch{return fail(null,-32700,"Parse error",400);}
  if(!isObj(rpc)||rpc.jsonrpc!=="2.0"||typeof rpc.method!=="string"||!(rpc.id===undefined||rpc.id===null||typeof rpc.id==="string"||typeof rpc.id==="number"))return fail(isObj(rpc)?rpc.id??null:null,-32600,"Invalid Request",400);
  if(rpc.method==="notifications/initialized"&&rpc.id===undefined)return new Response(null,{status:204,headers:CORS});
  const id=rpc.id??null;
  if(rpc.method==="server/discover")return success(id,{resultType:"complete",supportedVersions:["2026-07-28","2025-11-25","2025-06-18"],capabilities:{tools:{listChanged:false}},ttlMs:120000,cacheScope:"public"});
  if(rpc.method==="initialize")return success(id,{protocolVersion:["2026-07-28","2025-11-25","2025-06-18"].includes(rpc.params?.protocolVersion)?rpc.params.protocolVersion:"2025-11-25",capabilities:{tools:{listChanged:false}},serverInfo:{name:"mosab-research-parallel",title:"Mosab Research Parallel",version:VERSION},instructions:"Restricted read-only parallel compatibility gateway; quotations and chains are not source verified by this layer."});
  if(rpc.method==="ping")return success(id,{});
  if(rpc.method==="tools/list")return success(id,request.headers.get("mcp-protocol-version")==="2026-07-28"||rpc.params?.protocolVersion==="2026-07-28"?{resultType:"complete",tools,ttlMs:120000,cacheScope:"public"}:{tools});
  if(rpc.method!=="tools/call")return fail(id,-32601,"Method not found");
  const p=rpc.params;
  if(!isObj(p)||typeof p.name!=="string")return fail(id,-32602,"Invalid params: tool name required");
  const args=p.arguments??{};
  const issue=validateInput(p.name,args);
  if(issue)return fail(id,-32602,"Invalid params: "+issue);
  try{return success(id,result(await runTool(p.name,args)));}
  catch(e){return success(id,{content:[{type:"text",text:"Parallel call failed: "+textErr(e)}],isError:true});}
 }
};
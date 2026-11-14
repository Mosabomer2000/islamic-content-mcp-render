// Mosab MCP Edge Gateway v1.0 — Cloudflare Workers, stateless fixed-origin MCP relay.
// The worker has no credentials and stores no requests, bodies, or user data.
const V="1.2.0";
const ORIGIN="https://pdsxlmrfmbdhobcgujje.supabase.co/functions/v1/";
const TARGETS=Object.freeze({
  mcp:"islamic-research-v0205-acceptance-next",
  legacy:"islamic-research-mcp",
  sources:"extended-islamic-sources-mcp",
  aljam3:"aljam3-mcp",
  hub:"mcp",
  reddit:"reddit-research-mcp",
  reader:"chat-share-reader"
});
const ACCESS="allow";
const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET, POST, OPTIONS",
  "access-control-allow-headers":"authorization, content-type, accept, mcp-method, mcp-name, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers":"mcp-session-id, mcp-protocol-version, retry-after, www-authenticate",
  "x-content-type-options":"nosniff"
};
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store",...CORS};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const manifest=()=>{
  const paths=Object.fromEntries(Object.entries(TARGETS).map(([route,slug])=>[route,{url:route==="mcp"?"/mcp":"/"+route,upstream_slug:slug}]));
  return {service:"Mosab MCP Edge Gateway",version:V,status:"operational_proxy",host_platform:"Cloudflare Workers",transport:"stateless_streamable_http",primary_path:"/mcp",routes:paths,transparency:{fixed_origins_only:true,no_credentials_stored:true,no_user_data_persisted:true,bodies_not_logged:true,content_preserved:true},health:{path:"/health",deep_path:"/health?deep=1",smoke_path:"/smoke"},caveat:"Proxy connectivity is distinct from verification of every upstream tool or scholarly quotation."};
};
const err=(kind,status)=>json({status:"error",type:kind,version:V},status);
async function pingUpstream(route,slug){
  const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),4500),started=Date.now();
  try{
    const resp=await fetch(ORIGIN+slug,{method:"GET",headers:{"accept":"application/json"},redirect:"manual",signal:ctrl.signal});
    return {route,http_status:resp.status,http_response_received:true,get_supported:resp.status!==405,auth_required:[401,403].includes(resp.status),latency_ms:Date.now()-started};
  }catch(e){return {route,http_status:null,http_response_received:false,reason:e?.name==="AbortError"?"timeout":"network_error",latency_ms:Date.now()-started};}
  finally{clearTimeout(tm);}
}
async function proxy(req,route){
  const target=TARGETS[route];
  if(!target)return err("unknown_route",404);
  // Fail before buffering unexpectedly large inputs; protect Workers Free subrequest budget.
  const max=512*1024;
  const declared=Number(req.headers.get("content-length")||"0");
  if(declared>max)return err("request_too_large",413);
  const data=await req.arrayBuffer();
  if(data.byteLength>max)return err("request_too_large",413);
  const h=new Headers();
  for(const key of ["accept","content-type","authorization","mcp-protocol-version","mcp-method","mcp-name","mcp-session-id","last-event-id"]){
    const val=req.headers.get(key); if(val)h.set(key,val);
  }
  if(!h.has("content-type"))h.set("content-type","application/json");
  if(!h.has("accept"))h.set("accept","application/json, text/event-stream");
  const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),30000);
  try{
    const upstream=await fetch(ORIGIN+target,{method:"POST",headers:h,body:data,redirect:"manual",signal:ctrl.signal});
    const oh=new Headers(CORS);
    for(const key of ["content-type","mcp-session-id","mcp-protocol-version","www-authenticate","retry-after","location"]){
      const val=upstream.headers.get(key); if(val)oh.set(key,val);
    }
    oh.set("cache-control","no-store");
    oh.set("x-mosab-mcp-gateway-version",V);
    return new Response(upstream.body,{status:upstream.status,headers:oh});
  }catch(e){return err(e?.name==="AbortError"?"upstream_timeout":"upstream_network_error",502);}
  finally{clearTimeout(tm);}
}

let smokeMemo=null;
async function smokeTest(){
 if(smokeMemo && Date.now()-smokeMemo.at<60000)return {...smokeMemo.result,cached:true};
 const cases=[
  {route:"hub",tool:"ping",args:{}},
  {route:"aljam3",tool:"aljam3_search",args:{query:"إنما الأعمال بالنيات",scope:"pages",limit:1}},
  {route:"mcp",tool:"research_self_test",args:{}}
 ];
 const results=await Promise.all(cases.map(async t=>{
  const started=Date.now();
  try{
   const body=JSON.stringify({jsonrpc:"2.0",id:9001,method:"tools/call",params:{name:t.tool,arguments:t.args}});
   const req=new Request("https://internal.invalid/"+t.route,{method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream"},body});
   const resp=await proxy(req,t.route),text=(await resp.text()).slice(0,150000),ct=resp.headers.get("content-type")||"";
   let envelope;
   if(ct.includes("text/event-stream")){
     const lines=text.split(/\r?\n/).filter(x=>x.startsWith("data:"));
     if(!lines.length)throw Error("no_sse_data");
     envelope=JSON.parse(lines[lines.length-1].slice(5).trim());
   }else envelope=JSON.parse(text);
   if(envelope.error||envelope.result?.isError||!envelope.result)throw Error("rpc_error");
   let value=envelope.result.structuredContent;
   if(!value && typeof envelope.result?.content?.[0]?.text==="string"){
     try{value=JSON.parse(envelope.result.content[0].text)}catch{}
   }
   let passed=false;
   if(t.tool==="ping")passed=value?.message==="pong"||JSON.stringify(value).includes("pong");
   else if(t.tool==="aljam3_search")passed=Array.isArray(value?.pages)&&value.pages.length>0;
   else if(t.tool==="research_self_test")passed=Number(value?.passed)>=100&&Number(value?.failed)===0;
   return {route:t.route,tool:t.tool,passed,http_status:resp.status,latency_ms:Date.now()-started,
     ...(t.tool==="aljam3_search"?{page_hits:value?.pages?.length??0}:{}),
     ...(t.tool==="research_self_test"?{passed_tests:value?.passed??null,failed_tests:value?.failed??null}:{})};
  }catch(e){return {route:t.route,tool:t.tool,passed:false,latency_ms:Date.now()-started,error_type:e instanceof Error?e.message.slice(0,60):"unknown"};}
 }));
 const result={service:"Mosab MCP Edge Gateway",version:V,status:results.every(x=>x.passed)?"passed":"degraded",checks:results,scope:"read_only_known_tools",checked_at:new Date().toISOString()};
 smokeMemo={at:Date.now(),result};
 return result;
}

export default {
 async fetch(req){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const url=new URL(req.url),path=url.pathname.replace(/\/+$/,"");
  if(req.method==="GET"){
    if(path===""||path==="/manifest")return json(manifest());
    if(path==="/smoke")return json(await smokeTest());
    if(path==="/health"){
      if(url.searchParams.get("deep")!=="1")return json({service:"Mosab MCP Edge Gateway",status:"ready",version:V,upstream_unprobed:true});
      const probes=await Promise.all(Object.entries(TARGETS).map(([route,slug])=>pingUpstream(route,slug)));
      return json({service:"Mosab MCP Edge Gateway",version:V,status:probes.every(p=>p.http_response_received)?"http_endpoints_responding":"degraded",mcp_tools_untested:true,probes,checked_at:new Date().toISOString()});
    }
    return err("GET_only_manifest_or_health",405);
  }
  if(req.method!=="POST")return err("method_not_allowed",405);
  const route=path===""?"mcp":path.slice(1);
  if(!Object.hasOwn(TARGETS,route))return err("unknown_route",404);
  return proxy(req,route);
 }
};
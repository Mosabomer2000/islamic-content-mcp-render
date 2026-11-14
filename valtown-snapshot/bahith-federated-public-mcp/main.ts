// Bahith: federated, public-source-only MCP adapter. No credentials or private state.
// Input allowlist, bounded calls, no arbitrary URL, no write tools, no source conflation.
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
const SOURCES={"turath":"https://mcp.turath.io/mcp/","baheth":"https://baheth-mcp.val.run/mcp","hadith_dev":"https://hadith.dev/mcp","makteb":"https://api.makteb.org/mcp","dalail_tafsir":"https://tafsir.dalail.ai/mcp","tafsir_center":"https://mcp.tafsir.net/mcp","tarteel":"https://mcp.tarteel.ai/mcp","quranhub":"https://mcp.quranhub.com/mcp"};
const DEFINITIONS=[{"name":"bahith_turath_search","description":"Read-only Turath candidate-text search; open exact page for verification.","source":"turath","original":"search_turath","inputSchema":{"type":"object","required":["q"],"properties":{"q":{"type":"string","maxLength":150,"minLength":2},"page":{"type":"integer","minimum":1,"maximum":10}},"additionalProperties":false}},{"name":"bahith_turath_get_page","description":"Read-only exact Turath page opener with original attribution.","source":"turath","original":"get_page","inputSchema":{"type":"object","required":["book_id","page_id"],"properties":{"book_id":{"type":"integer","minimum":1,"maximum":100000000},"page_id":{"type":"integer","minimum":1,"maximum":100000000}},"additionalProperties":false}},{"name":"bahith_baheth_transcripts","description":"Find contemporary scholarly lecture transcripts in Baheth; metadata links are discovery only.","source":"baheth","original":"search_transcriptions","inputSchema":{"type":"object","required":["query"],"properties":{"query":{"type":"string","maxLength":140,"minLength":2},"page":{"type":"integer","minimum":1,"maximum":20}},"additionalProperties":false}},{"name":"bahith_hadith_search","description":"Hadith.dev text search; search hits require separate isnad/text verification.","source":"hadith_dev","original":"search_hadith","inputSchema":{"type":"object","required":["query"],"properties":{"query":{"type":"string","maxLength":140,"minLength":2},"match":{"type":"string","enum":["phrase","all","any"]},"limit":{"type":"integer","minimum":1,"maximum":10},"page":{"type":"integer","minimum":1,"maximum":20}},"additionalProperties":false}},{"name":"bahith_hadith_get","description":"Read original Hadith.dev record including reported isnad/matn and reference.","source":"hadith_dev","original":"get_hadith","inputSchema":{"type":"object","required":["id"],"properties":{"id":{"type":"integer","minimum":1,"maximum":100000000}},"additionalProperties":false}},{"name":"bahith_makteb_catalog","description":"Search historical Islamic books and authors via Makteb catalogue; metadata only.","source":"makteb","original":"search_catalog","inputSchema":{"type":"object","required":["query"],"properties":{"query":{"type":"string","maxLength":120,"minLength":2},"limit":{"type":"integer","minimum":1,"maximum":8},"tradition":{"type":"string","enum":["sunni","shia"]}},"additionalProperties":false}},{"name":"bahith_makteb_read","description":"Read a bounded Makteb book page; verify original edition and provenance.","source":"makteb","original":"read_book_pages","inputSchema":{"type":"object","required":["slug"],"properties":{"slug":{"type":"string","minLength":2,"maxLength":120,"pattern":"^[a-zA-Z0-9-]+$"},"page":{"type":"integer","minimum":1,"maximum":15000}},"additionalProperties":false}},{"name":"bahith_dalail_ayah","description":"Read an ayah record from Dalail Tafsir, not an independent mushaf edition.","source":"dalail_tafsir","original":"get_ayah","inputSchema":{"type":"object","required":["surah","ayah"],"properties":{"surah":{"type":"integer","minimum":1,"maximum":114},"ayah":{"type":"integer","minimum":1,"maximum":286}},"additionalProperties":false}},{"name":"bahith_dalail_tafsir","description":"Retrieve short Dalail tafsir passages for a specific verse with provenance.","source":"dalail_tafsir","original":"get_tafsir","inputSchema":{"type":"object","required":["surah","ayah"],"properties":{"surah":{"type":"integer","minimum":1,"maximum":114},"ayah":{"type":"integer","minimum":1,"maximum":286},"maxChunksPerBook":{"type":"integer","minimum":1,"maximum":2}},"additionalProperties":false}},{"name":"bahith_tafsir_center_ayah","description":"Read Quran verse text from Tafsir Center MCP.","source":"tafsir_center","original":"fetch_ayah","inputSchema":{"type":"object","required":["surah","ayah"],"properties":{"surah":{"type":"integer","minimum":1,"maximum":114},"ayah":{"type":"integer","minimum":1,"maximum":286}},"additionalProperties":false}},{"name":"bahith_tafsir_center_tafsir","description":"Fetch tafsir text with exact source from Tafsir Center MCP.","source":"tafsir_center","original":"fetch_tafsir","inputSchema":{"type":"object","required":["surah","ayah"],"properties":{"surah":{"type":"integer","minimum":1,"maximum":114},"ayah":{"type":"integer","minimum":1,"maximum":286},"part":{"type":"integer","minimum":1,"maximum":10}},"additionalProperties":false}},{"name":"bahith_tarteel_ayah_search","description":"Bounded Tarteel Quran verse search; verify ayah against a canonical witness.","source":"tarteel","original":"ayah_search","inputSchema":{"type":"object","required":["query"],"properties":{"query":{"type":"string","maxLength":140,"minLength":1},"max_results":{"type":"integer","minimum":1,"maximum":10}},"additionalProperties":false}},{"name":"bahith_quranhub_surah","description":"Get a small section of an identified surah via QuranHub.","source":"quranhub","original":"get_a_surah_by_number_v1_surah_surahnumber_get","inputSchema":{"type":"object","required":["surahNumber"],"properties":{"surahNumber":{"type":"integer","minimum":1,"maximum":114},"limit":{"type":"integer","minimum":1,"maximum":10},"offset":{"type":"integer","minimum":0,"maximum":500}},"additionalProperties":false}},{"name":"bahith_public_provider_status","description":"Probe the MCP tools/list of ONE supported public source; reachability only.","source":"__status__","original":"tools/list","inputSchema":{"type":"object","required":["source"],"properties":{"source":{"type":"string","enum":["turath","baheth","hadith_dev","makteb","dalail_tafsir","tafsir_center","tarteel","quranhub"]}},"additionalProperties":false}}];
const VERS="2025-11-25";
const COMMON={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const respond=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:COMMON});
const rpc=(id:unknown,result:unknown)=>respond({jsonrpc:"2.0",id,result});
const rpcErr=(id:unknown,code:number,message:string,s=200)=>respond({jsonrpc:"2.0",id,error:{code,message}},s);
const isObj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==="object"&&!Array.isArray(x);
function validate(d:any,input:unknown):input is Record<string,any>{
 if(!isObj(input))return false;
 const sc=d.inputSchema, keys=Object.keys(input), props=sc.properties;
 if(keys.length>6||keys.some((k:string)=>!Object.hasOwn(props,k)))return false;
 if(sc.required.some((k:string)=>!(k in input)))return false;
 for(const k of keys){
  const v=input[k],p=props[k];
  if(p.type==="string"){
   if(typeof v!=="string" ||(p.minLength!==undefined&&v.length<p.minLength)||v.length>(p.maxLength||150))return false;
   if(p.enum&&!p.enum.includes(v))return false;
   if(p.pattern&&!/^[a-zA-Z0-9-]+$/.test(v))return false;
  }else if(p.type==="integer"){
   if(!Number.isSafeInteger(v)||v<p.minimum||v>p.maximum)return false;
  }else return false;
 }
 return true;
}
function sse(s:string):any{for(const line of s.split(/\r?\n/)){if(line.startsWith("data:"))try{return JSON.parse(line.slice(5).trim())}catch{}}return null;}
async function upstream(source:string,name:string,args:any={}):Promise<any>{
 if(!Object.hasOwn(SOURCES,source))throw new Error("source not allowed");
 const url=SOURCES[source as keyof typeof SOURCES];
 const request={jsonrpc:"2.0",id:1,method:name==="tools/list"?"tools/list":"tools/call",params:name==="tools/list"?{}:{name,arguments:args}};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8500);
 try{
  const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream"},body:JSON.stringify(request),signal:controller.signal,redirect:"error"});
  if(!res.ok)throw new Error("upstream HTTP "+res.status);
  if(Number(res.headers.get("content-length")||"0")>160000)throw new Error("upstream response too large");
  const txt=await res.text();
  if(txt.length>160000)throw new Error("upstream response too large");
  const data=res.headers.get("content-type")?.includes("text/event-stream")?sse(txt):JSON.parse(txt);
  if(!isObj(data)||(!isObj(data.result)&&!isObj(data.error)))throw new Error("invalid upstream JSON-RPC");
  return data;
 }finally{clearTimeout(timer);}
}
async function quotaOk():Promise<boolean>{
 const now=new Date().toISOString();
 const limits:[[string,number],[string,number]]=[["h:"+now.slice(0,13),120],["d:"+now.slice(0,10),800]];
 for(const [bucket,max] of limits){
  const x=await sqlite.execute({sql:"INSERT INTO gateway_quota (bucket,hits) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1, updated_at=CURRENT_TIMESTAMP WHERE hits < ?",args:[bucket,max]});
  if((x.rowsAffected??0)<1)return false;
 }
 return true;
}
export default async function(req:Request):Promise<Response>{
 if(req.method==="GET")return respond({status:"running",name:"bahith-federated-public-mcp",mode:"read-only-public-sources",provider_names:Object.keys(SOURCES),tool_count:DEFINITIONS.length,private_storage:false,upstream_health:"not_tested_by_get"});
 if(req.method!=="POST")return respond({error:"method not allowed"},405);
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type")||""))return respond({error:"application/json required"},415);
 if(Number(req.headers.get("content-length")||"0")>12000)return respond({error:"request too large"},413);
 let x:any;
 try{const s=await req.text();if(s.length>12000)return respond({error:"request too large"},413);x=JSON.parse(s);}catch{return rpcErr(null,-32700,"Parse error",400);}
 if(!isObj(x)||x.jsonrpc!=="2.0"||typeof x.method!=="string")return rpcErr(null,-32600,"Invalid Request",400);
 const id=x.id??null;
 if(x.method==="notifications/initialized")return new Response(null,{status:204,headers:COMMON});
 if(x.method==="server/discover")return rpc(id,{resultType:"complete",supportedVersions:[VERS],capabilities:{tools:{listChanged:false}},ttlMs:300000,cacheScope:"public"});
 if(x.method==="initialize")return rpc(id,{protocolVersion:VERS,serverInfo:{name:"bahith-federated-public-mcp",version:"1.0.0"},capabilities:{tools:{listChanged:false}},instructions:"Only public external scholarly sources. Search candidates are unverified; verify original edition and attribution. No private research state or write tools."});
 if(x.method==="ping")return rpc(id,{});
 if(x.method==="tools/list")return rpc(id,{tools:DEFINITIONS.map((d:any)=>({name:d.name,title:d.name,description:d.description,inputSchema:d.inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}}))});
 if(x.method!=="tools/call")return rpcErr(id,-32601,"Method not found");
 const params=x.params;
 if(!isObj(params)||typeof params.name!=="string")return rpcErr(id,-32602,"Invalid parameters");
 const def=DEFINITIONS.find((d:any)=>d.name===params.name);
 if(!def||!validate(def,params.arguments??{}))return rpcErr(id,-32602,"Unknown tool or invalid input");
 try{if(!(await quotaOk()))return rpcErr(id,-32029,"Public gateway usage cap reached",429);}catch{return rpcErr(id,-32003,"Gateway quota store unavailable",503);}
 try{
  if(def.source==="__status__"){
   const j=await upstream(params.arguments.source,"tools/list");
   const items=Array.isArray(j.result?.tools)?j.result.tools:[];
   return rpc(id,{isError:false,content:[{type:"text",text:JSON.stringify({provider:params.arguments.source,reachable:true,declared_tools:items.length,scope:"transport_discovery_not_scholarly_validation"})}]});
  }
  const j=await upstream(def.source,def.original,params.arguments);
  if(j.error)return rpc(id,{isError:true,content:[{type:"text",text:"Public provider returned an MCP error; no evidence verified."}]});
  return rpc(id,j.result);
 }catch(e){
  return rpc(id,{isError:true,content:[{type:"text",text:"Public provider unavailable, slow or invalid; no source fact verified: "+(e instanceof Error?e.message:"unknown failure")}]});
 }
}
// Al-Eman / نداء الإيمان: read-only Cloudflare D1 MCP preview.
// Only cached local source data. No website fetches, mutation endpoints, secret keys or background work.
// Original Val Town service remains authoritative for sync, indexing, and full MCP coverage.
const ROOT="https://www.al-eman.com";
const HEAD={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,accept,mcp-protocol-version,mcp-session-id","cache-control":"no-store","x-content-type-options":"nosniff"};
const defs=[
{name:"aleman_status",description:"Inspect index status of the copied Al-Eman corpus (Cloudflare read-only mirror).",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false}},
{name:"aleman_search",description:"Search copied book titles and previously cached chapter excerpts. Original source verification remains required.",inputSchema:{type:"object",properties:{query:{type:"string",minLength:2,maxLength:120},limit:{type:"integer",minimum:1,maximum:30}},required:["query"],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false}},
{name:"aleman_read_cached_section",description:"Read an already cached section; does not fetch additional original text.",inputSchema:{type:"object",properties:{book_id:{type:"integer",minimum:1},section_id:{type:"integer",minimum:1},start_chars:{type:"integer",minimum:0,maximum:160000},max_chars:{type:"integer",minimum:1,maximum:14000}},required:["book_id","section_id"],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false}}
];
const norm=(s)=>String(s||"").normalize("NFKC").replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g,"").replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
const limitInt=(n,d,max)=>Math.max(1,Math.min(max,Math.floor(Number(n)||d)));
const jr=(id,result)=>new Response(JSON.stringify({jsonrpc:"2.0",id,result}),{headers:HEAD});
const fail=(id,code,message)=>new Response(JSON.stringify({jsonrpc:"2.0",id,error:{code,message}}),{headers:HEAD});
const toolOk=(id,obj)=>jr(id,{content:[{type:"text",text:JSON.stringify(obj)}],structuredContent:obj,isError:false});
const toolError=(id,e)=>jr(id,{content:[{type:"text",text:e instanceof Error?e.message:String(e)}],isError:true});
const all=async(db,sql,vals=[])=>{const r=await db.prepare(sql).bind(...vals).all();return r.results||[]};
const one=async(db,sql,vals=[])=>(await all(db,sql,vals))[0]||null;
function checkArgs(a,allowed){if(!a||typeof a!=="object"||Array.isArray(a)||Object.keys(a).some(k=>!allowed.includes(k)))throw Error("Invalid tool arguments")}
const validId=n=>Number.isInteger(n)&&n>=1&&n<1000000000;
async function status(db){
 const [control,b,s]=await Promise.all([one(db,"SELECT * FROM control WHERE id=1"),one(db,"SELECT count(*) n FROM books"),one(db,"SELECT count(*) n,count(text_excerpt) extracted FROM sections")]);
 return {source_id:"aleman",kind:"native_source",title:"نداء الإيمان",source_url:ROOT,control,indexed_books:b?.n??0,located_sections:s?.n??0,extracted_sections:s?.extracted??0,coverage_complete:false,source_is_secondary:true,source_quote_verification_required:true,storage:"cloudflare-d1",mode:"read-only-preview",live_sync:false};
}
async function search(db,args){
 checkArgs(args,["query","limit"]);
 if(typeof args.query!=="string"||args.query.length>120)throw Error("Invalid query");
 if(args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>30))throw Error("Invalid limit");
 const q=norm(args.query||"").slice(0,120),lim=limitInt(args.limit,12,30);
 if(q.length<2)throw Error("Query too short");
 const pat="%"+q.replace(/[%_]/g," ")+"%";
 const [books,sections,c]=await Promise.all([
 all(db,"SELECT id AS book_id,title,author,category,url AS canonical_url FROM books WHERE normalized_title LIKE ? ORDER BY id LIMIT ?",[pat,lim]),
 all(db,"SELECT book_id,id AS section_id,title,url AS canonical_url,substr(normalized_excerpt,max(1,instr(normalized_excerpt,?)-160),550) AS normalized_match_context,length(normalized_excerpt) AS indexed_chars FROM sections WHERE normalized_excerpt LIKE ? ORDER BY book_id LIMIT ?",[q,pat,lim]),
 one(db,"SELECT next_page,ended FROM control WHERE id=1")
 ]);
 return {source_id:"aleman",query:q,books,sections,next_catalog_page:c?.next_page,local_text_coverage:"only chapters explicitly opened",corpus_exhaustion:false,search_is_native_local_index:true,mode:"read-only-preview",data_snapshot:true};
}
async function cached(db,args){
 checkArgs(args,["book_id","section_id","start_chars","max_chars"]);
 const bid=args.book_id,sid=args.section_id;
 if(!validId(bid)||!validId(sid))throw Error("Invalid ids");
 if(args.start_chars!==undefined&&(!Number.isInteger(args.start_chars)||args.start_chars<0||args.start_chars>160000))throw Error("Invalid start_chars");
 if(args.max_chars!==undefined&&(!Number.isInteger(args.max_chars)||args.max_chars<1||args.max_chars>14000))throw Error("Invalid max_chars");
 const row=await one(db,"SELECT title,url,sha256,seen_at,text_excerpt FROM sections WHERE book_id=? AND id=?",[bid,sid]);
 if(!row||typeof row.text_excerpt!=="string")throw Error("Text not in copied local index; use original service to retrieve and index it");
 const offset=Math.max(0,Math.min(160000,Math.floor(Number(args.start_chars)||0))),size=limitInt(args.max_chars,9000,14000),t=String(row.text_excerpt);
 return {source_id:"aleman",book_id:bid,section_id:sid,title:row.title,canonical_url:row.url,content_sha256:row.sha256,extracted_at:row.seen_at,extracted_chars:t.length,returned_start_chars:offset,next_start_chars:offset+size<t.length?offset+size:null,text:t.slice(offset,offset+size),offline_local_read:true,quote_verified:false,edition_verified:false,mode:"read-only-preview"};
}
export default {async fetch(req,env){
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEAD});
 if(req.method==="GET")return new Response(JSON.stringify({service:"aleman-native-mcp",status:"online",version:"0.1.0-cloudflare-preview",source:"al-eman.com",mcp:true,mode:"read-only-preview",tools:defs.length,no_sync:true}),{headers:HEAD});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"method not allowed"}),{status:405,headers:HEAD});
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return new Response(JSON.stringify({error:"application/json required"}),{status:415,headers:HEAD});
 if(Number(req.headers.get("content-length")||0)>10000)return new Response(JSON.stringify({error:"request too large"}),{status:413,headers:HEAD});
 let v;try{const s=await req.text();if(s.length>10000)return new Response(JSON.stringify({error:"request too large"}),{status:413,headers:HEAD});v=JSON.parse(s)}catch{return fail(null,-32700,"Parse error")}
 if(!v||typeof v!=="object"||Array.isArray(v)||v.jsonrpc!=="2.0"||typeof v.method!=="string")return fail(null,-32600,"Invalid Request");
 const id=v.id??null;
 if(v.method==="initialize")return jr(id,{protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"bahith-aleman-cloudflare-preview",version:"0.1.0"}});
 if(v.method==="notifications/initialized")return new Response(null,{status:202,headers:HEAD});
 if(v.method==="tools/list")return jr(id,{tools:defs});
 if(v.method==="ping")return jr(id,{});
 if(v.method!=="tools/call")return fail(id,-32601,"Unknown method");
 const a=v.params?.arguments??{};
 try {
  if(v.params?.name==="aleman_status"){checkArgs(a,[]);return toolOk(id,await status(env.DB))}
  if(v.params?.name==="aleman_search")return toolOk(id,await search(env.DB,a));
  if(v.params?.name==="aleman_read_cached_section")return toolOk(id,await cached(env.DB,a));
  throw Error("Unknown or disabled tool on read-only preview");
 }catch(e){return toolError(id,e)}
}};
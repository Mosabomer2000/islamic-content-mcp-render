
import * as cheerio from "cheerio";
const ORIGIN = "https://quranonlinelibrary.com";
const UA = "BahithQuranLibraryAdapter/1.0 (non-commercial scholarly metadata; bounded queries)";
const strip = (s:unknown, max=1000) => String(s??"").replace(/\s+/g," ").trim().slice(0,max);
const domainError = (m:string) => Object.assign(new Error(m), {kind:"invalid_request"});
function safeBookUrl(input:string):string {
  let u:URL; try{u=new URL(input,ORIGIN)} catch {throw domainError("Invalid book URL")};
  if(u.protocol!=="https:"||u.hostname!=="quranonlinelibrary.com"||!u.pathname.startsWith("/kutub-library/")) throw domainError("Only canonical Quran Online Library book detail URLs are allowed");
  return u.toString();
}
async function html(url:string):Promise<string> {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12500);
  try {
    const r=await fetch(url,{headers:{"User-Agent":UA,"Accept":"text/html"},signal:controller.signal,redirect:"follow"});
    if(!r.ok) throw new Error("Source HTTP "+r.status);
    if(!(r.headers.get("content-type")||"").includes("text/html")) throw new Error("Source did not return HTML");
    return (await r.text()).slice(0,1_000_000);
  } finally { clearTimeout(timer); }
}
function formatSearch($:cheerio.CheerioAPI,url:string, page:number,limit:number){
  const head=strip($(".allMain h3").first().text(),100);
  const m=head.match(/(?:جميع الكتب|جميع المؤلفين)\s*([0-9٠-٩]+)/);
  const records:any[]=[];
  $(".serachList > li").each((_,el)=>{
    if(records.length>=limit) return false;
    const node=$(el), a=node.find(".listingMain h4 a").first();
    const href=a.attr("href");
    if(!href) return;
    let bookUrl:string;try{bookUrl=safeBookUrl(href)}catch{return}
    const id=strip(node.find(".numberRight span").last().text()).replace(/^#/,"");
    const author=strip(node.find(".listingTop h3 a").first().text(),200);
    const publisher=strip(node.find(".listPublisher a").first().text(),200);
    const pages=strip(node.find(".listingImgCont").text(),100).match(/صفحات\s*:\s*(\d+)/);
    records.push({record_id:id||null,title:strip(a.text(),350),author:author||null,publisher:publisher||null,page_count:pages?Number(pages[1]):null,detail_url:bookUrl,categories:node.find(".listCat a").map((_,a)=>strip($(a).text(),100)).get(),evidence_level:"bibliographic_candidate"});
  });
  return {source_id:"quranonlinelibrary",original_search_url:url,matched_total: m?Number(m[1].replace(/[٠-٩]/g,(c)=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))):null,page,returned:records.length,books:records,access_semantics:"catalog_search_only; source website descriptions are not verified book text; scanned PDFs require separate inspection",exhausted:false};
}
async function searchBooks({query,field="title",page=1,limit=10}:any) {
  if(!["title","author","publisher","number"].includes(field))throw domainError("field must be title, author, publisher, or number");
  if(typeof query!=="string"||query.trim().length<1||query.length>120) throw domainError("query length must be 1–120 characters");
  if(!Number.isInteger(page)||page<1||page>20) throw domainError("page must be 1–20");
  if(!Number.isInteger(limit)||limit<1||limit>30) throw domainError("limit must be 1–30");
  const route:any={title:["get-searched-book","searchword"],author:["get-searched-mussanif","m"],publisher:["get-searched-nashir","n"],number:["get-searched-book-by-number","searchword"]};
  const [path,param]=route[field], u=new URL(path,ORIGIN);u.searchParams.set(param,query.trim());if(page>1)u.searchParams.set("page",String(page));
  return formatSearch(cheerio.load(await html(u.toString())),u.toString(),page,limit);
}
async function openBook({url}:any) {
  if(typeof url!=="string")throw domainError("url is required");
  const loc=safeBookUrl(url),$=cheerio.load(await html(loc));
  const title=strip($(".bookName h1,.bookName h2,.bookName h3,.bookName h4,.bookMain h4,.body_container h4").first().text(),350) || strip($("title").text().split("|")[0],350);
  const body=strip($(".body_container").text(),8000);
  const pageMatch=body.match(/عدد الصفحات\s*:\s*([0-9]+)/);
  const dl=$("a[href]").map((_,a)=>({text:strip($(a).text(),80),href:$(a).attr("href")})).get().filter((x)=>x.href&&/^(تحميل\s*[12]|download)/i.test(x.text)).slice(0,3).map((x)=>({label:x.text,url:new URL(x.href!,ORIGIN).toString()}));
  const pdf=dl.filter(x=>x.url.startsWith("https:"));
  const authors=$('a[href*="/musannifeen/"]').map((_,a)=>strip($(a).text(),200)).get().filter(Boolean).slice(0,2);
  const publisher=$('a[href*="/nashreen/"]').map((_,a)=>strip($(a).text(),200)).get().filter(Boolean).slice(0,1);
  return {source_id:"quranonlinelibrary",detail_url:loc,title,authors,publisher,page_count:pageMatch?Number(pageMatch[1]):null,download_links:pdf,site_description_unverified:strip($(".body_container p").first().text(),1800),access_level:"book_detail_opened; linked original PDF not read; edition and page references not verified",citation_ceiling:"bibliographic_metadata"};
}
const docs={name:"Quran Online Library bibliographic bridge",version:"1.0.0",source:"quranonlinelibrary.com",capabilities:["native title/author/publisher/number search","book bibliographic detail and download links"],limitations:["not fulltext","not an edition authentication authority","no PDF extraction","bounded first 20 result pages"]};
const tools=[
 {name:"qol_search_books",description:"Search Quran Online Library's native book/author/publisher/number index; returns bibliographic candidates only, not verified quotes.",inputSchema:{type:"object",properties:{query:{type:"string",minLength:1,maxLength:120},field:{type:"string",enum:["title","author","publisher","number"],default:"title"},page:{type:"integer",minimum:1,maximum:20,default:1},limit:{type:"integer",minimum:1,maximum:30,default:10}},required:["query"]}},
 {name:"qol_open_book",description:"Read a Quran Online Library book catalog page and return original source metadata and PDF download links; does not open PDFs.",inputSchema:{type:"object",properties:{url:{type:"string",description:"Exact https://quranonlinelibrary.com/kutub-library/... book URL"}},required:["url"]}},
 {name:"qol_capabilities",description:"Return source route capabilities and evidence ceilings.",inputSchema:{type:"object",properties:{}}}
];
async function action(name:string,args:any):Promise<any> {
 if(name==="qol_capabilities") return docs;
 if(name==="qol_search_books")return await searchBooks(args??{});
 if(name==="qol_open_book")return await openBook(args??{});
 throw domainError("Unknown tool");
}
const rpc=(id:unknown,result:any)=>({jsonrpc:"2.0",id,result});
const err=(id:unknown,code:number,msg:string)=>({jsonrpc:"2.0",id,error:{code,message:msg}});
export default async function(req:Request):Promise<Response> {
 const u=new URL(req.url);
 try {
  if(req.method==="GET") {
   if(u.pathname.endsWith("/mcp"))return Response.json({error:"MCP uses POST"},{status:405});
   const mode=u.searchParams.get("action");
   if(mode==="search")return Response.json(await searchBooks({query:u.searchParams.get("q")??"",field:u.searchParams.get("field")??"title",page:Number(u.searchParams.get("page")??"1"),limit:Number(u.searchParams.get("limit")??"10")}),{headers:{"Cache-Control":"public, max-age=1800"}});
   if(mode==="open")return Response.json(await openBook({url:u.searchParams.get("url")??""}),{headers:{"Cache-Control":"public, max-age=1800"}});
   return Response.json({ok:true,adapter:docs,tools:tools.map(x=>x.name),mcp:"POST /mcp"},{headers:{"Cache-Control":"public, max-age=3600"}});
  }
  if(req.method!=="POST")return Response.json({error:"method not allowed"},{status:405});
  const ct=req.headers.get("content-type")??"";
  if(!ct.includes("application/json"))return Response.json({error:"Expected JSON"},{status:415});
  const raw=await req.text();if(raw.length>12000)return Response.json({error:"request too large"},{status:413});
  const body=JSON.parse(raw);
  if(body.jsonrpc!=="2.0"||typeof body.method!=="string")return Response.json(err(body.id??null,-32600,"Invalid JSON-RPC"),{status:400});
  if(body.method==="notifications/initialized")return new Response(null,{status:202});
  if(body.method==="initialize")return Response.json(rpc(body.id,{protocolVersion:"2025-03-26",serverInfo:{name:"quranonlinelibrary-bridge",version:"1.0.0"},capabilities:{tools:{listChanged:false}}}));
  if(body.method==="ping")return Response.json(rpc(body.id,{}));
  if(body.method==="tools/list")return Response.json(rpc(body.id,{tools}));
  if(body.method==="tools/call") {
    const n=body.params?.name??"", result=await action(n,body.params?.arguments);
    return Response.json(rpc(body.id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result,isError:false}));
  }
  return Response.json(err(body.id??null,-32601,"Method not found"),{status:200});
 }catch(e) {
  const message=String((e as Error).message||"error").slice(0,300);
  if(req.method==="POST")return Response.json(err(null,(e as any)?.kind==="invalid_request"?-32602:-32000,message));
  return Response.json({error:message},{status:(e as any)?.kind==="invalid_request"?400:502});
 }
}

/* Open in Val Town: https://www.val.town/x/mosabomer/bahith-bulk-domain-research/code/core.ts */
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import * as cheerio from "npm:cheerio@1.0.0";

export async function setup() {
  await sqlite.batch([
    "CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, query TEXT NOT NULL UNIQUE, domain TEXT NOT NULL, phrase TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, found INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, job_id INTEGER NOT NULL, title TEXT, domain TEXT, excerpt TEXT, chars INTEGER DEFAULT 0, http_status INTEGER, fetch_status TEXT NOT NULL, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status,id)",
    "CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain)"
  ]);
}

export function allowedUrl(raw: string, domain: string): string | null {
  try {
    const u=new URL(raw);
    if(u.protocol!=="https:" && u.protocol!=="http:") return null;
    const h=u.hostname.toLowerCase();
    const d=domain.toLowerCase();
    if(h!==d && !h.endsWith("."+d)) return null;
    u.hash="";
    return u.href;
  } catch { return null; }
}

function decodedLink(raw:string):string {
  try {
    const u=new URL(raw,"https://html.duckduckgo.com");
    if(u.hostname==="duckduckgo.com" || u.hostname==="www.duckduckgo.com" || u.hostname==="html.duckduckgo.com") {
      const v=u.searchParams.get("uddg");
      return v || raw;
    }
    return u.href;
  } catch { return raw; }
}
function simplify(s:string):string {
  return s.replace(/\s+/g," ").replace(/\u200f|\u200e/g,"").trim();
}
async function load(url:string,ms=10500):Promise<{ok:boolean;status:number;body:string;reason:string}> {
  try {
    const res=await fetch(url,{signal:AbortSignal.timeout(ms),headers:{"user-agent":"Mozilla/5.0 (compatible; BahithDomainResearch/0.1; non-commercial research)","accept-language":"ar,en;q=0.8","accept-encoding":"identity"}});
    const ct=res.headers.get("content-type")||"";
    if(!res.ok) return {ok:false,status:res.status,body:"",reason:"HTTP "+res.status};
    if(!/text\/html|application\/xhtml\+xml|text\/plain/i.test(ct)) return {ok:false,status:res.status,body:"",reason:"unsupported content-type "+ct.slice(0,55)};
    const size=Number(res.headers.get("content-length")||0);
    if(size>1800000) return {ok:false,status:res.status,body:"",reason:"page above safe size"};
    const body=(await res.text()).slice(0,1800000);
    return {ok:true,status:res.status,body,reason:""};
  } catch(e){return {ok:false,status:0,body:"",reason:String(e).slice(0,180)};}
}
function pickExcerpts(body:string,phrase:string):string {
  const terms=Array.from(new Set([phrase, ...phrase.split(/\s+/).filter(x=>x.length>=4)])).filter(x=>x.length>=3);
  const all:string[]=[];
  let total=0;
  for(const t of terms){
    let pos=0, count=0;
    while(count<4 && total<6) {
      const at=body.indexOf(t,pos);
      if(at<0) break;
      const left=Math.max(0,at-220), right=Math.min(body.length,at+470);
      let text=simplify(body.slice(left,right));
      if(text.length>80 && !all.some(x=>x.includes(text.slice(0,90)))){all.push(text);total++;}
      pos=at+t.length;count++;
    }
  }
  return all.join("\n---\n").slice(0,2900);
}
export async function pageText(url:string,phrase:string):Promise<{status:number;title:string;excerpt:string;chars:number;state:string}> {
  const response=await load(url);
  if(!response.ok) return {status:response.status,title:"",excerpt:response.reason,chars:0,state:"fetch_error"};
  const $=cheerio.load(response.body);
  $("script,style,svg,noscript,form,footer,nav,header,aside").remove();
  const title=simplify($("title").first().text()).slice(0,250);
  const main=$("article,.entry-content,.post-content,main,#content").filter((_,el)=>simplify($(el).text()).length>400).first();
  const body=simplify((main.length?main:$("body")).text()).slice(0,90000);
  if(body.length<130) return {status:response.status,title,excerpt:"",chars:body.length,state:"empty"};
  const excerpt=pickExcerpts(body,phrase);
  return {status:response.status,title,excerpt,chars:body.length,state:excerpt?"extracted":"no_literal_match"};
}
async function search(query:string,domain:string):Promise<{urls:{url:string;title:string}[];failure:string}> {
  const response=await load("https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),13000);
  if(!response.ok) return {urls:[],failure:response.reason};
  const $=cheerio.load(response.body);
  const rows:{url:string;title:string}[]=[];
  $(".result__a").each((_,el)=>{
    const link=decodedLink($(el).attr("href")||"");
    const url=allowedUrl(link,domain);
    if(url && !rows.some(p=>p.url===url)) rows.push({url,title:simplify($(el).text()).slice(0,250)});
  });
  if(rows.length===0 && /anomaly|captcha|unusual traffic/i.test(response.body)) return {urls:[],failure:"blocked by search engine"};
  return {urls:rows.slice(0,7),failure:""};
}
export async function cycle(){
  await setup();
  const total=await sqlite.execute("SELECT count(*) n FROM pages");
  if(Number((total.rows[0] as any)?.n || 0)>=1600) return {state:"paused_storage_safety_cap",note:"10MB free plan: limit to 1600 stored URL records"};
  const q=await sqlite.execute("SELECT * FROM jobs WHERE status='pending' ORDER BY id LIMIT 1");
  const j=q.rows[0] as any;
  if(!j)return {state:"idle",message:"No pending queries"};
  await sqlite.execute({sql:"UPDATE jobs SET status='running',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",args:[j.id]});
  const sr=await search(String(j.query),String(j.domain));
  if(sr.failure){
    await sqlite.execute({sql:"UPDATE jobs SET status='error',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",args:[sr.failure,j.id]});
    if(Number(j.attempts)<2 && !/blocked|HTTP 403|HTTP 429/i.test(sr.failure)) await sqlite.execute({sql:"UPDATE jobs SET status='pending' WHERE id=?",args:[j.id]});
    return {state:"error",query:j.query,reason:sr.failure};
  }
  let added=0, extracted=0, failed=0;
  for(const hit of sr.urls.slice(0,4)){
    const prev=await sqlite.execute({sql:"SELECT 1 FROM pages WHERE url=? LIMIT 1",args:[hit.url]});
    if(prev.rows.length)continue;
    const p=await pageText(hit.url,String(j.phrase));
    await sqlite.execute({
      sql:"INSERT OR IGNORE INTO pages(url,job_id,title,domain,excerpt,chars,http_status,fetch_status) VALUES(?,?,?,?,?,?,?,?)",
      args:[hit.url,j.id,p.title||hit.title,j.domain,p.excerpt.slice(0,2900),p.chars,p.status,p.state]
    });
    added++;if(p.state==="extracted") extracted++;if(p.state==="fetch_error")failed++;
  }
  await sqlite.execute({sql:"UPDATE jobs SET status='done',found=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",args:[sr.urls.length,j.id]});
  return {state:"done",query:j.query,found:sr.urls.length,newPages:added,withExcerpts:extracted,fetchErrors:failed};
}

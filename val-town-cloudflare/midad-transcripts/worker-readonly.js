
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","access-control-allow-origin":"*"};
const HTML_HEADERS={"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const page="<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>مِداد — معاينة Cloudflare</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:35px auto;padding:0 16px;color:#18212b;line-height:1.8}h1{margin-bottom:0}small{color:#697586}form{display:flex;gap:8px;margin:24px 0}input{flex:1;padding:13px;border:1px solid #adb5bd;border-radius:9px;font-size:17px}button{border:0;border-radius:9px;background:#152c50;color:#fff;padding:8px 20px;font-size:16px;cursor:pointer}article{border:1px solid #dde2e6;border-radius:9px;padding:14px;margin:12px 0}a{color:#164e9e}pre{white-space:pre-wrap}#status{font-size:14px;color:#536273}</style></head><body><h1>مِداد — محرك البحث في التفريغات</h1><small>نسخة معاينة للقراءة فقط على Cloudflare. لا تستبدل النظام الأصلي حتى اكتمال اختبارات الهجرة.</small><form id=\"f\"><input id=\"q\" name=\"q\" aria-label=\"بحث\" placeholder=\"ابحث في تفريغات المحاضرات\" minlength=\"2\" maxlength=\"160\" required><button>بحث</button></form><div id=\"status\"></div><div id=\"results\"></div><script>document.getElementById(\"f\").addEventListener(\"submit\",async e=>{e.preventDefault();const q=document.getElementById(\"q\").value.trim();if(q.length<2)return;const out=document.getElementById(\"results\");out.replaceChildren();document.getElementById(\"status\").textContent=\"جار البحث...\";try{const r=await fetch(\"/api/search?q=\"+encodeURIComponent(q));const d=await r.json();document.getElementById(\"status\").textContent=\"نتائج: \"+(d.returned||0)+(d.truncated?\" (عرض أول 250 فقط)\":\"\");for(const x of d.items||[]){const card=document.createElement(\"article\"),title=document.createElement(\"a\"),p=document.createElement(\"p\");title.href=x.url||\"#\";title.target=\"_blank\";title.rel=\"noopener noreferrer\";title.textContent=x.title+\" — \"+Math.floor((x.start||0)/60)+\":\"+String(Math.floor((x.start||0)%60)).padStart(2,\"0\");p.textContent=x.text||\"\";card.append(title,p);out.append(card)}}catch(err){document.getElementById(\"status\").textContent=\"فشل الاستعلام: \"+String(err)}});</script></body></html>";
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:JSON_HEADERS});
const norm=v=>String(v??"").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[آأإٱ]/g,"ا").replace(/ى/g,"ي").replace(/ؤ/g,"و").replace(/ئ/g,"ي").replace(/ة/g,"ه").replace(/\s+/g," ").trim().toLowerCase();
const posInt=(v,d,max)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(0,Math.trunc(n))):d};
async function rows(db,sql,args=[]){const x=await db.prepare(sql).bind(...args).all();return x.results||[]}
export default {async fetch(req,env){
 const url=new URL(req.url),p=url.pathname;
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET, OPTIONS","access-control-allow-headers":"content-type"}});
 if(req.method!=="GET")return reply({error:"Read-only Cloudflare preview; mutations disabled"},405);
 if(p==="/"||p==="/index.html")return new Response(page,{headers:HTML_HEADERS});
 try {
  if(p==="/api/health")return reply({ok:true,app:"midad",mode:"read-only-preview",source:"cloudflare-d1",schema:2,write_enabled:false});
  if(p==="/api/stats"){
   const x=(await rows(env.DB,"SELECT (SELECT COUNT(*) FROM channels) AS channels,(SELECT COUNT(*) FROM videos) AS videos,(SELECT COUNT(*) FROM segments) AS segments,(SELECT COUNT(*) FROM segment_editions) AS polishedSegments,(SELECT COUNT(DISTINCT video_id) FROM segments) AS transcribedVideos,(SELECT COUNT(*) FROM videos WHERE id NOT IN (SELECT DISTINCT video_id FROM segments)) AS pendingVideos,(SELECT COALESCE(SUM(duration),0) FROM videos) AS totalSeconds,(SELECT COALESCE(SUM(duration),0) FROM videos WHERE id IN (SELECT DISTINCT video_id FROM segments)) AS transcribedSeconds"))[0]||{};
   return reply({channels:Number(x.channels||0),videos:Number(x.videos||0),segments:Number(x.segments||0),hours:Math.round(Number(x.totalSeconds||0)/3600),transcribedVideos:Number(x.transcribedVideos||0),pendingVideos:Number(x.pendingVideos||0),transcribedHours:Math.round(Number(x.transcribedSeconds||0)/3600*10)/10,polishedSegments:Number(x.polishedSegments||0)})
  }
  if(p==="/api/channels"){
   return reply({items:await rows(env.DB,"SELECT c.id,c.name,c.url,COUNT(v.id) AS videos FROM channels c LEFT JOIN videos v ON v.channel_id=c.id GROUP BY c.id ORDER BY c.name")})
  }
  if(p==="/api/videos"){
   const ch=(url.searchParams.get("channel")||"").slice(0,160),limit=Math.min(500,Math.max(1,posInt(url.searchParams.get("limit"),500,500))),off=posInt(url.searchParams.get("offset"),0,1000000);
   const a=await rows(env.DB,"SELECT v.id,v.title,v.url,v.series,v.source,v.duration,v.channel_id,c.name AS channel,COUNT(s.id) AS segments,COUNT(e.segment_id) AS edited FROM videos v JOIN channels c ON c.id=v.channel_id LEFT JOIN segments s ON s.video_id=v.id LEFT JOIN segment_editions e ON e.segment_id=s.id WHERE (?='' OR v.channel_id=?) GROUP BY v.id ORDER BY v.created_at DESC,v.title LIMIT ? OFFSET ?",[ch,ch,limit,off]);
   return reply({items:a})
  }
  if(p==="/api/search"){
   const q=norm((url.searchParams.get("q")||"").slice(0,160)),ch=(url.searchParams.get("channel")||"").slice(0,160);
   if(q.length<2)return reply({items:[],total:0});
   const words=q.split(" ").filter(Boolean).slice(0,8),exact=url.searchParams.get("exact")==="1",tests=exact?[q]:words,filter=tests.map(()=> "COALESCE(e.normalized,s.normalized) LIKE ?").join(" AND ");
   const sql="SELECT s.id,s.video_id,s.start,COALESCE(e.text,s.text) AS text,v.title,v.url,v.series,v.source,c.name AS channel,c.id AS channel_id,COALESCE(e.stage,'raw') AS stage FROM segments s LEFT JOIN segment_editions e ON e.segment_id=s.id JOIN videos v ON v.id=s.video_id JOIN channels c ON c.id=v.channel_id WHERE (?='' OR c.id=?) AND "+filter+" ORDER BY v.created_at DESC,s.start ASC LIMIT 250";
   const r=await rows(env.DB,sql,[ch,ch,...tests.map(x=>"%"+x+"%")]);return reply({items:r.map(x=>({...x,snippet:x.text})),returned:r.length,truncated:r.length===250})
  }
  if(p==="/api/transcript"){
   const id=(url.searchParams.get("id")||"").slice(0,100);
   if(!/^[\w-]{11}$/.test(id))return reply({error:"معرف فيديو غير صالح"},400);
   const v=await rows(env.DB,"SELECT v.id,v.title,v.url,v.series,v.source,v.duration,c.name AS channel FROM videos v JOIN channels c ON c.id=v.channel_id WHERE v.id=?",[id]);if(!v.length)return reply({error:"الفيديو غير موجود"},404);
   const s=await rows(env.DB,"SELECT s.id,s.start,COALESCE(e.text,s.text) AS text,s.text AS raw_text,COALESCE(e.stage,'raw') AS stage FROM segments s LEFT JOIN segment_editions e ON e.segment_id=s.id WHERE s.video_id=? ORDER BY s.start,s.id LIMIT 20000",[id]);
   return reply({video:v[0],segments:s})
  }
  return reply({error:"غير موجود"},404);
 }catch(e){return reply({error:"Database query failed",kind:"read-only-preview"},500)}
}};
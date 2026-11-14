import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { setup } from "./core.ts";

const escapeHtml=(s:unknown)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
async function count(sql:string):Promise<number>{try{const r=await sqlite.execute(sql);return Number((r.rows[0] as any)?.n||0);}catch{return 0;}}
export default async function(request:Request){
 await setup();
 const u=new URL(request.url);
 const term=(u.searchParams.get("q")||"").trim().slice(0,90);
 const fmt=u.searchParams.get("format")||"html";
 const sql=term?
   "SELECT title,url,domain,excerpt,chars,fetch_status,recorded_at FROM pages WHERE title LIKE ? OR excerpt LIKE ? ORDER BY id DESC LIMIT 40":
   "SELECT title,url,domain,excerpt,chars,fetch_status,recorded_at FROM pages ORDER BY id DESC LIMIT 40";
 const args=term?["%"+term+"%","%"+term+"%"]:[];
 const r=await sqlite.execute({sql,args});
 const records=r.rows as any[];
 const stats={
  queuedSearchQueries:await count("SELECT COUNT(*) n FROM jobs WHERE status='pending'"),
  completedSearchQueries:await count("SELECT COUNT(*) n FROM jobs WHERE status='done'"),
  searchErrors:await count("SELECT COUNT(*) n FROM jobs WHERE status='error'"),
  categoryPagesReviewed:await count("SELECT COUNT(*) n FROM native_categories WHERE status='done'"),
  sourceLinksDiscovered:await count("SELECT COUNT(*) n FROM native_articles"),
  sourcePagesRead:await count("SELECT COUNT(*) n FROM pages WHERE chars>=130 AND fetch_status IN ('extracted','no_literal_match')"),
  excerptsSaved:await count("SELECT COUNT(*) n FROM pages WHERE fetch_status='extracted'")
 };
 if(fmt==="json")return Response.json({project:"Bahith — domain research",testTopic:"صلاة الجماعة",stats,records},{headers:{"access-control-allow-origin":"*","cache-control":"no-store"}});
 if(fmt==="csv"){
   const cells=(x:any)=>'"'+String(x??"").replace(/"/g,'""')+'"';
   const lines=[["title","url","domain","excerpt","chars","fetch_status","recorded_at"].map(cells).join(",")];
   for(const row of records)lines.push(["title","url","domain","excerpt","chars","fetch_status","recorded_at"].map(k=>cells(row[k])).join(","));
   return new Response("\ufeff"+lines.join("\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=bahith-results.csv"}});
 }
 const box=(n:number,label:string)=>"<section class='metric'><strong>"+n.toLocaleString("ar-SA")+"</strong><span>"+label+"</span></section>";
 const statusCards=box(stats.queuedSearchQueries,"استعلامًا مجهزًا غير منفذ")+box(stats.completedSearchQueries,"استعلامًا مكتملًا")+box(stats.sourceLinksDiscovered,"رابطَ مصدر مكتشفًا")+box(stats.sourcePagesRead,"صفحة مصدر قُرئت")+box(stats.excerptsSaved,"صفحة تحتوي مقتطفات")+box(stats.categoryPagesReviewed,"صفحة تصنيف مُراجَعة");
 const rows=records.map(row=>{
  const url=escapeHtml(row.url),title=escapeHtml(row.title||row.url);
  const snippet=escapeHtml(String(row.excerpt||"").slice(0,1250));
  return "<article class='hit'><h3><a target='_blank' rel='noopener noreferrer' href='"+url+"'>"+title+"</a></h3><div class='meta'>"+escapeHtml(row.domain)+" | "+escapeHtml(row.fetch_status)+" | "+Number(row.chars||0).toLocaleString("ar-SA")+" حرفًا</div><p>"+(snippet||"لم يُستخرج تطابق لفظي من النص المقروء.")+"</p></article>";
 }).join("");
 const html=[
 "<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
 "<title>الباحث — محرك البحث الجماعي بالنطاقات</title>",
 "<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f7f8;color:#1d2932;line-height:1.9}header{background:#13283a;color:#fff;padding:30px 20px}main{max-width:1050px;margin:auto;padding:20px}h1{font-size:1.65rem;margin:0}header p{color:#d2e0e8;margin:4px 0 0}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}.metric,.hit,.note{background:white;border:1px solid #d9e0e5;border-radius:12px;padding:15px}.metric strong{font-size:1.7rem;display:block;line-height:1.4}.metric span{color:#566674;font-size:.85rem}.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:20px 0}input{flex:1;min-width:170px;padding:12px;border:1px solid #abc0cc;border-radius:9px;font-size:1rem}button,a.export{padding:11px 15px;background:#155b70;border:0;border-radius:9px;color:white;cursor:pointer;text-decoration:none}.hit{margin:12px 0}.hit h3{margin:0 0 5px;font-size:1.02rem}.hit a{color:#14596f;text-decoration:none}.meta{font-size:.78rem;color:#667580;direction:ltr;text-align:right}.hit p{white-space:pre-wrap;margin:10px 0 0;font-size:.93rem}.note{border-right:4px solid #7b9da8;background:#fff}.tiny{color:#566674;font-size:.85rem}footer{padding:25px 20px;text-align:center;color:#788896}a:hover{text-decoration:underline}</style></head>",
 "<body><header><main><h1>الباحث — الاستقصاء الجماعي بالنطاقات</h1><p>تجربة تشغيلية مجانية | الموضوع الأول: صلاة الجماعة</p></main></header>",
 "<main><div class='note'><b>بيان منهجي:</b> الاستعلامات المجهّزة لا تعني أنها نُفذت. وعدّاد الصفحات المقروءة يعكس جلب النص آليًا، لا الحكم العلمي على صحته أو استنفاد فوائده. استخراج المقتطفات في هذه المرحلة لفظي، وليس تحليلًا فقهيًا أو حديثيًا آليًا.</div>",
 "<div class='metrics'>"+statusCards+"</div>",
 "<div class='tiny'>إخفاقات محرك البحث: "+stats.searchErrors.toLocaleString("ar-SA")+" | تاريخ العرض: "+escapeHtml(new Date().toISOString())+" | الخطة المجانية محدودة الموارد</div>",
 "<form class='actions' method='get'><input name='q' value='"+escapeHtml(term)+"' placeholder='ابحث في العناوين والمقتطفات' aria-label='البحث'><button>بحث في المواد المحفوظة</button><a class='export' href='?format=csv'>تصدير أحدث المواد CSV</a><a class='export' href='?format=json'>JSON</a></form>",
 "<h2>المواد المقروءة والمقتطفات</h2>"+(rows||"<p>لم تحفظ مواد مطابقة بعد.</p>"),
 "<p class='tiny'>كل مقتطف مرتبط بصفحة أصلية. لا تُستخدم هذه المخرجات في النشر العلمي دون مقابلة النصوص والتحقق من نسبتها وسياقها.</p></main><footer>نموذج أولي مستقل عن مشروعات الباحث الشرعي القائمة</footer></body></html>"
 ].join("");
 return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"}});
}
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const UPSTREAM = "https://almusannif.com/mcp";
const SOURCES = {
  "bukhari:6953": {
    url: "https://almusannif.com/books/صحيح-البخاري-ط-السلطانيه/read?p=10382&l=1",
    note: "أبو النعمان في هذا الموضع محمد بن الفضل السدوسي المعروف بعارم [6226] وليس أبا النعمان عن أبي وقاص [8416].",
    verified: "6226"
  },
  "ibn_majah:4227": {
    url: "https://almusannif.com/books/سنن-ابن-ماجه-ت-عبد-الباقي/read?p=5784&l=1",
    note: "أبو بكر بن أبي شيبة هو عبد الله بن محمد بن أبي شيبة [3575]، والإسناد يشتمل على طريقين يلتقيان في يحيى بن سعيد.",
    verified: "3575"
  },
  "nasai:75": {
    url: "https://almusannif.com/books/سنن-النسايي-ط-المصريه/read?p=140&l=1",
    note: "ثلاثة مداخل متوازية: يحيى بن حبيب عن حماد، والحارث عن ابن القاسم عن مالك، وسليمان بن منصور عن ابن المبارك، ثم يحيى بن سعيد.",
    verified: "three_parallel_routes"
  }
} as const;
type Narrator = { surface: string; person_id?: number | null; confidence?: number | null };
type Route = { narrators: Narrator[] };
const ar = (s: unknown) => String(s ?? "").normalize("NFKC")
  .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
  .replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .replace(/\s+/g, " ").trim();
const words = (s: unknown) => ar(s).replace(/[،.؛:()«»]/g, " ");
type Alert = { code: string; severity: "blocker" | "warning"; message: string; route?: number };
function audit(args: {collection: string; number: string; source_text?: string; analysis_text?: string; routes?: Route[]}) {
  const collection = args.collection.toLowerCase().trim().replace(/[\s-]/g,"_");
  const number = args.number.replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).trim();
  const key = collection + ":" + number;
  const evidence = (SOURCES as Record<string, {url:string;note:string;verified:string}>)[key] || null;
  const source = words(args.source_text);
  const analysis = ar(args.analysis_text);
  const routes = args.routes || [];
  const alerts: Alert[] = [];
  const add = (code:string,message:string,severity: "blocker"|"warning"="blocker",route?:number) => alerts.push({code,message,severity,route});
  if (!source) add("NO_SOURCE_TEXT", "لا يوجد إسناد من صفحة المصدر الأصلية. امتنع عن قبول أحكام العلل.");
  if (routes.length) {
    for (let i=0;i<routes.length;i++) {
      const n = routes[i]?.narrators || [];
      if (!n.length) add("EMPTY_ROUTE","إسناد خال من الرواة", "blocker",i);
      for (const item of n) {
        const surface = words(item.surface);
        if (!surface || !source.includes(surface)) add("SURFACE_NOT_IN_SOURCE", "الاسم غير ظاهر في نص المصدر: " + item.surface, "blocker", i);
        if (item.confidence != null && item.confidence < 0.85) add("UNCERTAIN_IDENTITY", "تعيين الراوي ظني ولا يصلح أساسًا لحكم مستقل", "blocker", i);
      }
    }
  }
  const switchFound = /(?:\(\s*ح\s*\)|(?:^|\s)ح\s*و(?:حدثنا|اخبرنا))/i.test(source);
  const dual = /\bقالا\b/.test(source);
  if (routes.length && switchFound && routes.length < 2) add("UNSPLIT_TAHWIL","صيغة تحويل لم تفصل إلى طريقين.");
  if (routes.length && dual && routes.length < 2) add("UNSPLIT_DUAL","«قالا» مع تعدد شيوخ ولم تُحفَظ الفروع.");
  if (key === "bukhari:6953") {
    if (analysis.includes(ar("أبو النعمان عن أبي وقاص")) || analysis.includes("[8416]") || analysis.includes("رقم ٨٤١٦")) add("WRONG_NARRATOR", "تعيين أبي النعمان بالراوي المجهول خطأ؛ الصحيح محمد بن الفضل السدوسي [6226].");
    for(let i=0;i<routes.length;i++) for(const n of routes[i].narrators||[]) if(ar(n.surface)===ar("أبو النعمان") && n.person_id!=null && n.person_id!==6226) add("WRONG_NARRATOR_ID","هوية أبي النعمان في البخاري 6953 يجب أن تكون 6226.", "blocker",i);
  }
  if(key === "ibn_majah:4227") {
    if (analysis.includes(ar("أبو بكر الحكمي")) || analysis.includes("رقم ٨٤١٦")) add("FABRICATED_NARRATOR", "تحويل أبي بكر بن أبي شيبة إلى أبي بكر الحكمي ليس من نص الرواية.");
    for(let i=0;i<routes.length;i++) for(const n of routes[i].narrators||[]) if(ar(n.surface)===ar("أبو بكر بن أبي شيبة") && n.person_id != null && n.person_id!==3575) add("WRONG_NARRATOR_ID","أبو بكر بن أبي شيبة في هذا الإسناد [3575].", "blocker",i);
    if (routes.length && routes.length<2) add("PARALLEL_ROUTES_COLLAPSED", "ابن ماجه 4227 فيه طريقان متوازيان.");
  }
  if(key==="nasai:75") {
    if (routes.length && routes.length<3) add("THREE_ROUTES_COLLAPSED","هذه الرواية تحتوي ثلاثة مداخل إلى يحيى بن سعيد.");
    if (analysis.includes(ar("حماد بن زيد بن درهم الأزدي")) && analysis.includes(ar("عبد الرحمن بن القاسم بن خالد")) && /10\/10|١٠\/١٠|سلسلة واحدة|النسائي ٧٥.*انقطاع محتمل/.test(args.analysis_text||"")) add("COMBINED_BRANCHES","مخرجات المحلّل تضمنت دمج حماد وابن القاسم في مسار واحد؛ تنبيهات الانقطاع التابعة غير معتبرة.");
    for(let i=0;i<routes.length;i++) {
      const names=(routes[i].narrators||[]).map(x=>ar(x.surface)).join("|");
      if((names.includes(ar("حماد")) && names.includes(ar("ابن القاسم"))) || (names.includes(ar("ابن القاسم")) && names.includes(ar("عبد الله بن المبارك")))) add("CHAIN_CONCATENATION","جمع رواةً من مسارين متوازيين في إسناد واحد.", "blocker",i);
    }
  }
  if(!routes.length && !analysis) add("NO_ANALYSIS", "لم تصل أي بيانات لتحليل بنية الإسناد؛ أعد تمرير الطرق بصيغة JSON.");
  if(!routes.length && analysis) add("RAW_ANALYSIS_ONLY","النص الحر لا يكفي وحده لإثبات بنية الإسناد أو صحة التعريف؛ يلزم JSON تفصيلي للطرق.", "warning");
  const blockers=alerts.filter(x=>x.severity==="blocker");
  return {status: blockers.length?"blocked_review_required":"candidate_requires_manual_verification", collection,number,
    source_verified: Boolean(source), routes_supplied: routes.length, may_issue_definitive_illa:false,
    may_issue_automatic_illa: blockers.length===0 && routes.length>0 && Boolean(source),
    evidence, findings:alerts,
    note:"هذه بوابة سلامة للبنية ولا تصحح أصل الخادم ولا تستقل بالحكم على صحة الحديث أو ضعفِه. إذا وجدت مشكلة، احجب نتائج ilal_check وgrade_as المتأثرة حتى تُراجع الأسانيد."};
}
function toolResult(value:unknown) { return {content:[{type:"text" as const,text:JSON.stringify(value)}]}; }
async function upstreamProbe() {
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(), 7000);
  try {
    const r=await fetch(UPSTREAM,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"musannif-personal-guard",version:"0.1.0"}}}),signal:controller.signal});
    const text=(await r.text()).slice(0,2500);
    return {ok:r.ok,status:r.status,content_type:r.headers.get("content-type"),response_sample:text, upstream:UPSTREAM};
  }catch(e){return {ok:false,error:String(e),upstream:UPSTREAM};}
  finally{clearTimeout(timer);}
}
async function callMusannif(tool:string,args:Record<string,unknown>): Promise<{ok:boolean;text:string;error?:string}> {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetch(UPSTREAM,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:tool,arguments:args}}),signal:controller.signal});
    const raw=await response.text();
    const jsonText=raw.includes("data: ")?raw.split("\n").filter(x=>x.startsWith("data: ")).map(x=>x.slice(6)).join("\n"):raw;
    const payload=JSON.parse(jsonText);
    const result=payload.result;
    if(!response.ok || payload.error || result?.isError) return {ok:false,text:"",error:JSON.stringify(payload.error||result).slice(0,1800)};
    const text=(result?.content||[]).filter((x:any)=>x.type==="text").map((x:any)=>x.text).join("\n");
    return {ok:true,text:text.slice(0,35000)};
  }catch(e){return {ok:false,text:"",error:String(e)}}
  finally{clearTimeout(timer);}
}
async function safeCritical(book: "bukhari"|"ibn_majah"|"nasai", number: string) {
  const dict:{[key:string]:{book:string|number,page:number,label:string}}={
    "bukhari:6953":{book:1681,page:10382,label:"البخاري ٦٩٥٣"},
    "ibn_majah:4227":{book:"سنن-ابن-ماجه-ت-عبد-الباقي",page:5784,label:"ابن ماجه ٤٢٢٧"},
    "nasai:75":{book:"سنن-النسايي-ط-المصريه",page:140,label:"النسائي ٧٥"}
  };
  const lookup=book+":"+number;
  const target=dict[lookup];
  if(!target) return {status:"unsupported_case",message:"الفحص الآلي من الأصل مفعّل حاليًا لهذه الحالات الثلاث الموثقة فقط؛ استخدم audit_isnad لبقية الأحاديث."};
  const [original,parsed]=await Promise.all([
    callMusannif("read_pages",{book:target.book,page:target.page,context:0}),
    callMusannif("parse_isnad",{book:book==="ibn_majah"?1198:book==="nasai"?829:target.book,number})
  ]);
  if(!original.ok || !parsed.ok) return {status:"upstream_unavailable",source_error:original.error||null,analysis_error:parsed.error||null};
  // Restrict the precomputed parse (which unexpectedly returns *all* paths of a grouped hadith)
  // to the requested collection and hadith number; never treat whole-hadith trees as one sanad.
  let section=parsed.text.split(/(?=###\s+)/).find(x=>ar(x.split("\n")[0]).includes(ar(target.label)))||"";
  const missingRequestedPath = !section;
  if (missingRequestedPath && lookup==="ibn_majah:4227") {
    const fallback=await callMusannif("ilal_check",{id:1});
    if(fallback.ok) section=fallback.text;
  }
  const result=audit({collection:book,number,source_text:original.text,analysis_text:section});
  if(missingRequestedPath){result.status="blocked_review_required";result.findings.unshift({code:"REQUESTED_PATH_NOT_RETURNED",severity:"blocker",message:"parse_isnad أعاد مجموعة طرق مقطوعة ولم يشتمل الرد على الموضع المطلوب؛ لا يُقبل الصمت على أنه سلامة."});}
  return {...result,read_from_upstream:true,original_page_excerpt:original.text.slice(0,4900),
    parsed_selected_path:section.slice(0,7000),scope_limitation:"النتيجة تنتقي المقطع الموافق للكتاب والرقم من تقرير المسارات العام، وتكشف الأخطاء المعروفة فقط. لا تعتبر دليلًا على استيفاء نقد الحديث."};
}

const handler=createMcpHandler(()=>{
  const server=new McpServer({name:"musannif-personal-critical-guard",version:"0.1.0"});
  server.registerTool("audit_isnad",{description:"تحقّق بنيويًا من أسانيد المصنِّف: يقارن الرواة بالنص الأصلي، يمنع خلط طرق التحويل، ويكشف أخطاء البخاري 6953 وابن ماجه 4227 والنسائي 75. لا يصدر حكم صحة.",inputSchema:z.object({
    collection:z.string(),number:z.string(),source_text:z.string(),analysis_text:z.string().optional(),routes:z.array(z.object({narrators:z.array(z.object({surface:z.string(),person_id:z.number().nullable().optional(),confidence:z.number().nullable().optional()}))})).optional()
  })},(args)=>toolResult(audit(args)));
  server.registerTool("diagnose_known_misparse",{description:"فحص فوري لمخرجات نصية من المصنف في الحالات الموثقة، حتى لو لم تتوفر JSON مهيكلة. يجب توفير نص الإسناد المصدر.",inputSchema:z.object({
    collection:z.enum(["bukhari","ibn_majah","nasai"]),number:z.string(),source_text:z.string(),analysis_text:z.string()
  })},(args)=>toolResult(audit(args)));
  server.registerTool("probe_musannif_connection",{description:"قراءة تشخيصية لحالة الوصول الخارجي إلى MCP المصنِّف، لا تُغير بياناته.",inputSchema:z.object({})},async()=>toolResult(await upstreamProbe()));
  server.registerTool("safe_critical_from_source",{description:"يجلب الإسناد الأصلي وتحليل المصنّف مباشرة ثم يحجب أخطاء التعيين والخلط المثبتة في البخاري 6953 وابن ماجه 4227 والنسائي 75. لا يصحح قاعدة بيانات المصدر ولا يصدر حكم صحة.",inputSchema:z.object({collection:z.enum(["bukhari","ibn_majah","nasai"]),number:z.string()})},async args=>toolResult(await safeCritical(args.collection,args.number)));
  return server;
});
export default handler.fetch;
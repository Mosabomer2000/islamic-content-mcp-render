import { auditHiddenCorpus } from "./hidden_corpus_audit.ts";
const errors: string[] = [];
let passed = 0;
const test = (name: string, ok: boolean) => { if (ok) passed++; else errors.push(name); };
const sample=(work_id:string,url:string,readable_attested=true)=>({work_id,url,readable_attested});
const a=sample("a","https://arabic-keyboard.info/books/ar/read-book/a");
const b=sample("b","https://www.arabic-keyboard.info/books/ar/read-book/b");
const base={
 domain:"arabic-keyboard.info",site_identity_label:"Arabic Keyboard",
 identity_mismatch_attested:true, collection_index_examined:true,
 substantial_collection_attested:true,claimed_items:7216,
 origin_relation:"unknown" as const,samples:[a,b]
};
const get=(v:any)=>auditHiddenCorpus(v) as any;
test("two-items-support-identity",get(base).status==="identity_mismatch_supported_by_submitted_evidence");
test("no-independent-proof",get(base).independent_verification===false);
test("one-item-incomplete",get({...base,samples:[a]}).status==="candidate_needs_independent_review");
test("collection-unchecked-incomplete",get({...base,collection_index_examined:false}).status==="candidate_needs_independent_review");
test("weak-identity-unverified",get({...base,identity_mismatch_attested:false}).status==="unverified_or_not_identity_mismatch");
test("mirrors-access-only",get({...base,origin_relation:"known_mirror"}).research_utility==="access_or_discovery_path_not_independent_text");
test("catalog-access-only",get({...base,origin_relation:"catalog_only"}).research_utility==="access_or_discovery_path_not_independent_text");
test("original-still-potential",get({...base,origin_relation:"primary_holder"}).research_utility==="potentially_original_material_needs_comparison");
test("same-work-not-duplicated",get({...base,samples:[a,{...b,work_id:"a"}]}).work_count_attested_distinct===1);
test("wrong-host-rejected",get({...base,samples:[a,sample("x","https://bad-domain.example/x")]}).rejected_samples===1);
test("lookalike-host-rejected",get({...base,samples:[a,sample("x","https://notarabic-keyboard.info/x")]}).rejected_samples===1);
test("http-rejected",get({...base,samples:[a,sample("x","http://arabic-keyboard.info/x")]}).rejected_samples===1);
test("query-param-rejected",get({...base,samples:[a,sample("x","https://arabic-keyboard.info/x?key=secret")]}).rejected_samples===1);
test("unreadable-no-count",get({...base,samples:[a,sample("x","https://arabic-keyboard.info/x",false)]}).work_count_attested_distinct===1);
test("bad-domain-errors",get({...base,domain:"localhost"}).status==="invalid_domain");
test("no-sample-count-proof",get({...base,samples:[],claimed_items:999999}).status==="unverified_or_not_identity_mismatch");
console.log(JSON.stringify({suite:"hidden_corpus",passed,total:16,errors,success:errors.length===0}));
if (errors.length) throw Error("Selftest failed: "+errors.join(","));

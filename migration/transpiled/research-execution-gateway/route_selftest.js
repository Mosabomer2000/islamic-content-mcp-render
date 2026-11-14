import { chooseAutoRoute } from "./main.js";
const cases = [
    ["app-en", "android offline GPX track recorder", "deep", "auto", "github"],
    ["app-ar", "تطبيق أندرويد مفتوح المصدر لتسجيل GPS", "deep", "auto", "github"],
    ["app-source", "open source kotlin app repository", "focused", "auto", "github"],
    ["pubmed-en", "randomized kangaroo mother care neonatal mortality trial", "deep", "auto", "europepmc"],
    ["medical-ar", "تجربة عشوائية لعلاج وفيات الرضع", "deep", "auto", "europepmc"],
    ["medical-med", "PubMed medical treatment randomized trial", "deep", "auto", "europepmc"],
    ["dataset-en", "historical Arabic manuscript OCR dataset", "deep", "auto", "openalex"],
    ["dataset-ar", "مجموعة بيانات لتدريب OCR على المخطوطات العربية", "deep", "auto", "openalex"],
    ["dataset-other", "Hausa Ajami manuscript OCR corpus", "deep", "auto", "openalex"],
    ["scholar", "academic study historical manuscripts", "deep", "auto", "openalex"],
    ["hadith", "تخريج حديث ذهب الناس وبقي النسناس", "exhaustive", "auto", "abstain"],
    ["hadith-en", "Hadith isnad of transmission", "deep", "auto", "abstain"],
    ["quran-ar", "تفسير القرآن الكريم عند ابن كثير", "deep", "auto", "abstain"],
    ["archive-original", "digitized manuscript page high resolution original archive", "deep", "auto", "abstain"],
    ["reg-original", "Saudi official regulation text", "deep", "auto", "abstain"],
    ["password", "Research with my password and private key", "deep", "auto", "blocked"],
    ["medical-record", "Look at my private patient record", "deep", "auto", "blocked"],
    ["email", "Read files from test@example.org", "deep", "auto", "blocked"],
    ["generic", "Where is Japan?", "focused", "auto", "abstain"],
    ["other", "make a tasty cake recipe", "focused", "auto", "abstain"],
    ["explicit-dataset", "historical research", "deep", "dataset", "openalex"],
    ["explicit-rct", "skin to skin infants", "deep", "primary_randomized_trial", "europepmc"],
    ["explicit-android", "offline map on mobile", "deep", "android_app", "github"],
    ["multi-provider", "GitHub repository for Arabic manuscript OCR", "deep", "auto", "github"],
    ["no-web-en", "Do not browse the internet. Tell me about Android apps", "deep", "auto", "abstain"],
    ["no-web-ar", "لا تستخدم الإنترنت في البحث عن تطبيق أندرويد", "deep", "auto", "abstain"],
];
let passed = 0;
for (const [id, q, mode, artifact, expected] of cases) {
    const plan = chooseAutoRoute(q, mode, artifact);
    const observed = plan.status === "routed" ? plan.provider : plan.status;
    const ok = observed === expected;
    console.log(JSON.stringify({ id, observed, expected, ok, reason: ok ? undefined : plan.reason }));
    if (ok)
        passed++;
}
console.log(JSON.stringify({ passed, total: cases.length }));
if (passed !== cases.length)
    throw new Error("Routing regression: " + passed + "/" + cases.length);

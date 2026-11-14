import { inspectPublicQuery, readBoundedResponse, chooseAutoRoute } from "./main.js";
let ok = 0, total = 0;
function check(label, actual) { total++; if (!actual)
    throw new Error("FAIL " + label); ok++; }
function permitted(q) { try {
    inspectPublicQuery(q);
    return true;
}
catch {
    return false;
} }
check("public medical topic", permitted("clinical randomized trial on maternal mortality"));
check("public software topic", permitted("android offline GPS recorder"));
check("Arabic manuscript", permitted("مخطوطات عربية قديمة"));
check("public cybersecurity info", permitted("password manager open source Android"));
check("email protected", !permitted("please search for editor@example.org"));
check("personal patient records blocked", !permitted("my private patient records"));
check("Arabic personal health records blocked", !permitted("اريد سجلاتي الطبية"));
check("simple stem false positive avoided", permitted("medical-record software comparison"));
const enc = new TextEncoder();
function mockChunks(data, step = 3) {
    const encoded = enc.encode(data);
    let p = 0;
    const stream = new ReadableStream({ pull(controller) {
            if (p >= encoded.byteLength) {
                controller.close();
                return;
            }
            controller.enqueue(encoded.slice(p, p + step));
            p += step;
        } });
    return new Response(stream);
}
const text = "مخطوط Arabic 123";
check("UTF8 multichunk matches", await readBoundedResponse(mockChunks(text, 2), 500) === text);
check("exact-size accepted", await readBoundedResponse(mockChunks("123456", 2), 6) === "123456");
let overflow = false;
try {
    await readBoundedResponse(mockChunks("1234567", 2), 6);
}
catch {
    overflow = true;
}
check("oversize streamed rejected", overflow);
let empty = false;
try {
    await readBoundedResponse(new Response(null), 6);
}
catch {
    empty = true;
}
check("missing body refused", empty);
check("routed android", chooseAutoRoute("Android GPS app source code", "deep", "auto").provider === "github");
check("original hadith abstains", chooseAutoRoute("تخريج حديث عبد الله بن مسعود", "deep", "auto").status === "abstain");
check("no web instruction abstains", chooseAutoRoute("Do not browse the internet for Android apps", "deep", "auto").status === "abstain");
check("explicit GitHub wins", chooseAutoRoute("GitHub repository for Arabic manuscript OCR", "deep", "auto").provider === "github");
console.log(JSON.stringify({ passed: ok, total }));

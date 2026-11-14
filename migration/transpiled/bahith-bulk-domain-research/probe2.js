const queries = [
    '"صلاة الجماعة" site:al-eman.com',
    'صلاة الجماعة site:al-eman.com',
    'site:al-eman.com "صلاة الجماعة"'
];
for (const q of queries) {
    const u = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q);
    for (const head of [{ "User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity" }, { "user-agent": "Mozilla/5.0 (compatible; BahithDomainResearch/0.1; non-commercial research)", "accept-language": "ar,en;q=0.8", "accept-encoding": "identity" }]) {
        try {
            const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: head });
            const s = await r.text();
            console.log(JSON.stringify({ q, ua: head["User-Agent"] || "bot", status: r.status, size: s.length, found: s.includes("result__a") }));
        }
        catch (e) {
            console.log(JSON.stringify({ q, ua: head["User-Agent"] || "bot", error: String(e) }));
        }
    }
}

const u = 'https://quranonlinelibrary.com/';
const r = await fetch(u, { headers: { 'user-agent': 'BahithResearch/1.0 (+catalog-only)' } });
const x = await r.text();
console.log(JSON.stringify({ status: r.status, size: x.length, forms: [...x.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map(z => z[0].slice(0, 1800)), links: [...x.matchAll(/href=["']([^"']+)["']/gi)].slice(0, 35).map(z => z[1]) }).slice(0, 6500));

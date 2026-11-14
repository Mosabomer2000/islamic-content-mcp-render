const targets=[
 "https://html.duckduckgo.com/html/?q=%D8%B5%D9%84%D8%A7%D8%A9+%D8%A7%D9%84%D8%AC%D9%85%D8%A7%D8%B9%D8%A9+site%3Aal-eman.com",
 "https://www.bing.com/search?format=rss&q=%D8%B5%D9%84%D8%A7%D8%A9%20%D8%A7%D9%84%D8%AC%D9%85%D8%A7%D8%B9%D8%A9%20site%3Aal-eman.com",
 "https://r.jina.ai/https://html.duckduckgo.com/html/?q=%D8%B5%D9%84%D8%A7%D8%A9+%D8%A7%D9%84%D8%AC%D9%85%D8%A7%D8%B9%D8%A9+site%3Aal-eman.com",
 "https://www.al-eman.com/"
];
for(const url of targets) {
 try {const r=await fetch(url,{signal:AbortSignal.timeout(9500),headers:{"User-Agent":"Mozilla/5.0","Accept-Encoding":"identity"}});const content=await r.text();console.log(JSON.stringify({url:url.slice(0,70),status:r.status,bytes:content.length,head:content.slice(0,110)}));}
 catch(e){console.log(JSON.stringify({url:url.slice(0,70),error:String(e)}));}
}
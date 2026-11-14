import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { setup } from "./core.ts";

const domains=[
  "al-eman.com","aljam3.com","shamela.ws","app.turath.io",
  "thahabi.org","islamicbook.ws","islamport.com","al-maktaba.org",
  "almeshkat.net","al-maktaba.org","al-eman.com","islamspirit.com",
  "al-fatawa.com","binbaz.org.sa","binothaimeen.net","alfawzan.org.sa",
  "alukah.net","saaid.net","ahlalhdeeth.com","islamancient.com",
  "feqhweb.com","tafsir.net","masaha.org","al-majalis.org",
  "sunna.alifta.gov.sa","hadith.dev","islamarchive.cc"
];
const phrases=[
  "صلاة الجماعة","حكم صلاة الجماعة","وجوب صلاة الجماعة",
  "التخلف عن الجماعة","لا صلاة لجار المسجد","من سمع النداء فلم يأته",
  "صلاة الرجل في بيته","ترك الجماعة","الجماعة في المسجد",
  "صلاة الجماعة واجبة","صلاة الجماعة سنة","أعمى ليس له قائد"
];
async function seed(){
  await setup();
  const unique=[...new Set(domains)];
  const ops:any[]=[];
  for(const d of unique) for(const p of phrases) {
    ops.push({sql:"INSERT OR IGNORE INTO jobs(query,domain,phrase) VALUES(?,?,?)",args:['"'+p+'" site:'+d,d,p]});
  }
  const chunkSize=70;
  for(let i=0;i<ops.length;i+=chunkSize) await sqlite.batch(ops.slice(i,i+chunkSize));
  const r=await sqlite.execute("SELECT status, count(*) AS n FROM jobs GROUP BY status");
  console.log(JSON.stringify({domains:unique.length,phrases:phrases.length,planned:ops.length,stats:r.rows}));
  return {domains:unique.length,phrases:phrases.length,planned:ops.length,stats:r.rows};
}
await seed();
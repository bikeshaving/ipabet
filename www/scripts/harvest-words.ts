// Regenerates www/src/harvest-words.json — the /learn word bank.
//
// Sources (all free/copyleft):
//   • Word→IPA:  wikipron (CUNY-CL/wikipron), Wiktionary-derived, CC-BY-SA.
//   • Frequency: google-10000-english + hermitdave/FrequencyWords (CC).
// Each word's IPA is converted to IPAbet keystrokes and ROUND-TRIP VERIFIED
// against the real engine (typeKeys) — only exact matches are kept, so every
// word is provably typeable. Common words only (freq-filtered), es/fr/de/it/ar.
// ENGLISH is NOT harvested here: wikipron mixes dialects, so the en slice
// comes from CMUdict via harvest-en-cmu.ts (General American throughout).
// Download the wikipron TSVs + frequency lists into $DIR, adjust DIR, then:
// bun www/scripts/harvest-words.ts && bun www/scripts/harvest-en-cmu.ts
import {typeKeys} from "../../js/src/index.ts";
import fs from "fs";
import {STAGES} from "../src/stages.ts";
import {convert, label, baseGlyphs, normalize} from "./harvest-lib.ts";
const progression=new Set<string>(); for(const s of STAGES) for(const g of s.glyphs) progression.add(g);
const DIR = "./_harvest_data";
function loadFreq(file:string){ const m=new Map<string,number>(); const lines=fs.readFileSync(`${DIR}/${file}`,"utf8").split("\n"); lines.forEach((ln,i)=>{ const w=ln.trim().split(/\s+/)[0]; if(w && !m.has(w.toLowerCase())) m.set(w.toLowerCase(), i); }); return m; }
function process(lang:string, cap:number, rank:Map<string,number>, arabic=false){
  const re = arabic ? /^[ء-ي]{2,9}$/ : /^\p{L}{2,9}$/u;
  const lines = fs.readFileSync(`${DIR}/${lang}.tsv`,"utf8").split("\n");
  const seen=new Set<string>(); const out:any[]=[];
  for(const line of lines){
    const t=line.indexOf("\t"); if(t<0) continue;
    const word=line.slice(0,t), ipa=line.slice(t+1);
    if(seen.has(word) || !re.test(word)) continue;
    const r = rank.get(word.toLowerCase()); if(r===undefined) continue;
    const norm=normalize(ipa); const ks=convert(norm); if(!ks) continue;
    const got=typeKeys(ks).normalize("NFC"); if(got!==norm.normalize("NFC")) continue;
    seen.add(word);
    out.push({target:got, labels:ks.map(label), word, lang, glyphs:baseGlyphs(got), r});
  }
  out.sort((a,b)=>a.r-b.r);
  return out.slice(0,cap).map(({r,...w})=>w);
}
const all=[
  ...process("es",400,loadFreq("freq-es.txt")),
  ...process("fr",400,loadFreq("freq-fr.txt")),
  ...process("de",400,loadFreq("freq-de.txt")),
  ...process("it",400,loadFreq("freq-it.txt")),
  ...process("ar",300,loadFreq("freq-ar.txt"),true),
];
const filtered=all.filter(w=>w.glyphs.every((g:string)=>progression.has(g)));
fs.writeFileSync(new URL("../src/gen/harvest-words.json", import.meta.url).pathname, JSON.stringify(filtered));
console.log("TOTAL", filtered.length, "(dropped", all.length-filtered.length, "needing an off-progression sound)");
const all2=filtered; 
for(const l of ["en","es","fr","de","it","ar"]) console.log("  "+l, all2.filter(w=>w.lang===l).length, "·", all.filter(w=>w.lang===l).slice(0,5).map(w=>w.word).join(" "));
console.log("fr real:", all2.filter(w=>w.lang==="fr").slice(5,11).map(w=>`${w.word} /${w.target}/`).join("  "));
console.log("de real:", all2.filter(w=>w.lang==="de").slice(3,8).map(w=>`${w.word} /${w.target}/`).join("  "));
console.log("ar real:", all2.filter(w=>w.lang==="ar").slice(0,5).map(w=>`${w.word} /${w.target}/`).join("  "));
console.log("KB:", Math.round(fs.statSync(new URL("../src/gen/harvest-words.json", import.meta.url).pathname).size/1024));

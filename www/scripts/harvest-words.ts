// Regenerates www/src/harvest-words.json — the /learn word bank.
//
// Sources (all free/copyleft):
//   • Word→IPA:  wikipron (CUNY-CL/wikipron), Wiktionary-derived, CC-BY-SA.
//   • Frequency: google-10000-english + hermitdave/FrequencyWords (CC).
// Each word's IPA is converted to IPAbet keystrokes and ROUND-TRIP VERIFIED
// against the real engine (typeKeys) — only exact matches are kept, so every
// word is provably correct + typeable. Common words only (freq-filtered),
// English + es/fr/de/it/ar. Download the wikipron TSVs + frequency lists into
// $DIR, adjust DIR, then: bun www/scripts/harvest-words.ts
import spec from "../../spec/ipabet.json";
import {typeKeys} from "../../js/src/index.ts";
import fs from "fs";
import {STAGES} from "../src/stages.ts";
const progression=new Set<string>(); for(const s of STAGES) for(const g of s.glyphs) progression.add(g);
const DIR = "./_harvest_data";
type K = {key:string;shift:boolean;option:boolean};
// A digit is a BARE base now (5H → ɜ, 5Y → ə), typed unshifted; only letters shift.
const keysFor = (k:string):K[] => [...k].map(c => /[A-Z]/.test(c)?{key:c.toLowerCase(),shift:true,option:false}:{key:c,shift:false,option:false});
const label = (k:K) => (k.option?"⌥":"")+(k.shift?"⇧":"")+(k.shift&&/[a-z]/.test(k.key)?k.key.toUpperCase():k.key);
const glyphKeys = new Map<string,K[]>(); for (const e of spec.letters as any[]) if(!glyphKeys.has(e.glyph)) glyphKeys.set(e.glyph, keysFor(e.key));
// Combining marks: primary on ⌥key, secondary (the `double`) on ⌥⇧key.
// Spacing marks (ː ˈ) are postfix and keyed the same way.
const markKeys = new Map<string,K[]>(); const spacingKeys = new Map<string,K[]>();
for (const m of spec.marks as any[]) {
  const into = m.type === "combining" ? markKeys : spacingKeys;
  if(!into.has(m.mark)) into.set(m.mark, [{key:m.opt,shift:false,option:true}]);
  if(m.double && !into.has(m.double)) into.set(m.double, [{key:m.opt,shift:true,option:true}]);
}
function normalize(ipa:string){ return ipa.replace(/\s+/g,"").replace(/ɡ/g,"g").replace(/[ˈˌ]/g,"").replace(/[͜͡‿.|‖]/g,"").normalize("NFD"); }
// Combining diacritics are PREFIX (dead-key): ⌥mark comes before its base.
// Emitting them in string order would type the mark onto the *previous* glyph.
function convert(ipa:string):K[]|null{
  const ks:K[]=[]; const chars=[...ipa]; let i=0;
  while(i<chars.length){
    const base=chars[i++];
    if(!glyphKeys.has(base)) return null;
    const pre:K[]=[]; const post:K[]=[];
    while(i<chars.length && (markKeys.has(chars[i]) || spacingKeys.has(chars[i]))){
      const ch=chars[i++];
      if(markKeys.has(ch)) pre.push(...markKeys.get(ch)!); else post.push(...spacingKeys.get(ch)!);
    }
    ks.push(...pre, ...glyphKeys.get(base)!, ...post);
  }
  return ks;
}
const isComb=(cp:number)=>(cp>=0x0300&&cp<=0x036f)||(cp>=0x1dc0&&cp<=0x1dff)||(cp>=0x02b0&&cp<=0x02ff&&cp!==0x02bc);
const baseGlyphs=(s:string)=>[...new Set([...s.normalize("NFD")].filter(ch=>!isComb(ch.codePointAt(0)!)))];
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
  ...process("en",1200,loadFreq("freq-en.txt")),
  ...process("es",400,loadFreq("freq-es.txt")),
  ...process("fr",400,loadFreq("freq-fr.txt")),
  ...process("de",400,loadFreq("freq-de.txt")),
  ...process("it",400,loadFreq("freq-it.txt")),
  ...process("ar",300,loadFreq("freq-ar.txt"),true),
];
const filtered=all.filter(w=>w.glyphs.every((g:string)=>progression.has(g)));
fs.writeFileSync(new URL("../src/harvest-words.json", import.meta.url).pathname, JSON.stringify(filtered));
console.log("TOTAL", filtered.length, "(dropped", all.length-filtered.length, "needing an off-progression sound)");
const all2=filtered; 
for(const l of ["en","es","fr","de","it","ar"]) console.log("  "+l, all2.filter(w=>w.lang===l).length, "·", all.filter(w=>w.lang===l).slice(0,5).map(w=>w.word).join(" "));
console.log("fr real:", all2.filter(w=>w.lang==="fr").slice(5,11).map(w=>`${w.word} /${w.target}/`).join("  "));
console.log("de real:", all2.filter(w=>w.lang==="de").slice(3,8).map(w=>`${w.word} /${w.target}/`).join("  "));
console.log("ar real:", all2.filter(w=>w.lang==="ar").slice(0,5).map(w=>`${w.word} /${w.target}/`).join("  "));
console.log("KB:", Math.round(fs.statSync(new URL("../src/harvest-words.json", import.meta.url).pathname).size/1024));

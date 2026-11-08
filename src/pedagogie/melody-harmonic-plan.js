// Recherche locale d'un parcours proposé, sans grille prédéfinie ni référence
// à un enregistrement. Les notes originales ne sont jamais modifiées.
import {notePairs} from './take-edit.js';
import {melodyBeatMap} from './melody-progression.js';
const pc=n=>(n%12+12)%12;
const intervals=key=>key.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];

function transition(previous,next,scale){
 if(!previous)return 0;
 const distance=pc(scale[next-1]-scale[previous-1]);
 // Destinations fonctionnelles, pas une boucle de degrés imposée à la prise.
 return distance===5?-.7:distance===7?-.35:[2,10].includes(distance)?.15:.45;
}

function segmentEvidence(line,start,end,degree,scale,key){
 const root=pc(key.rootPc+scale[degree-1]);
 const chord=new Set([0,2,4,6].map(i=>pc(key.rootPc+scale[(degree-1+i)%7])));
 const triad=new Set([0,2,4].map(i=>pc(key.rootPc+scale[(degree-1+i)%7])));
 const first=line[start],lastTime=end<line.length?line[end].event.time:line.at(-1).end;
 const weight=[];let cost=0,total=0,foreign=0;
 for(let i=start;i<end;i++){
  const p=line[i],duration=Math.max(.03,Math.min(p.end,lastTime)-p.event.time),tone=pc(p.event.note);
  const passing=i>start&&i+1<end&&Math.abs(p.event.note-line[i-1].event.note)<=2&&Math.abs(line[i+1].event.note-p.event.note)<=2;
  const w=duration*(i===start?1.5:1);total+=w;
  const outside=!chord.has(tone);
  // Une courte note de passage n'impose pas un nouveau voicing. Une note
  // longue étrangère pèse davantage que son nombre d'apparitions.
  cost+=w*(triad.has(tone)?0:chord.has(tone)?.35:passing&&duration<.6?.7:2.8);
  if(outside)foreign+=w;
  weight.push({sourceOn:p.on,weight:w});
 }
 if(!chord.has(pc(first.event.note)))return null;
 // Un parcours tonal n'explique pas honnêtement une mélodie majoritairement
 // chromatique en lui inventant des accords à chaque note.
 if(foreign/total>.6)return null;
 return {cost:cost/total*2.5,degree,rootPc:root,at:first.event.time,sourceOn:first.on,melody:first.event.note,
  evidence:{sustainedTones:weight.filter(w=>w.weight>=.5).map(w=>w.sourceOn),noteCount:end-start}};
}

/** Cherche simultanément les changements et les degrés sur la phrase entière.
 * La pulsation sert à espacer les accords ; leurs attaques restent celles du
 * pianiste. Les chiffres de classement sont internes, pas une confiance en %. */
export function melodyHarmonicPlans(take,{key,profile=null,exclude=[],limit=12}={}){
 if(!key||!Number.isInteger(key.rootPc)||key.rootPc<0||key.rootPc>11)return [];
 const pairs=notePairs(take?.events||[]).sort((a,b)=>a.event.time-b.event.time);
 if(pairs.length<8||pairs.length>512)return [];
 const map=melodyBeatMap(pairs);if(!map)return [];
 const level=p=>p.event.velocity>1?p.event.velocity/127:p.event.velocity;
 const line=map.points.map(point=>pairs.filter(p=>Math.abs(p.event.time-point.time)<.000001)
  .sort((a,b)=>Number(b.end-b.event.time>=.12)-Number(a.end-a.event.time>=.12)||level(b)-level(a))[0]);
 if(line.some(p=>!p))return [];
 const scale=intervals(key),inKey=new Set(scale.map(n=>pc(n+key.rootPc)));
 const length=pairs.reduce((s,p)=>s+p.end-p.event.time,0);
 if(pairs.filter(p=>inKey.has(pc(p.event.note))).reduce((s,p)=>s+p.end-p.event.time,0)<length*.85)return [];
 const states=Array.from({length:line.length+1},()=>[]);states[0]=[{anchors:[],cost:0}];
 for(let start=0;start<line.length;start++){
  // Garder des chemins par dernier degré : éviter qu'une préférence locale
  // élimine toutes les autres destinations avant d'entendre la phrase entière.
  const sorted=states[start].sort((a,b)=>a.cost-b.cost),counts=new Map();
  const paths=sorted.filter(p=>{const d=p.anchors.at(-1)?.degree||0,n=counts.get(d)||0;counts.set(d,n+1);return n<3;}).slice(0,21);
  states[start]=[];
  if(!paths.length)continue;
  const ends=[];
  for(let end=start+1;end<=line.length;end++){
   const beats=end===line.length?(line.at(-1).end-line[start].event.time)/map.pulse:map.points[end].beat-map.points[start].beat;
   if(beats>8.5&&end>start+1)break;
   if(beats<1.5&&end<line.length)continue;
   // Une fin de note longue ou une respiration peut justifier un appui entre
   // les temps réguliers, sans recaler la prise sur une grille artificielle.
   const gap=end<line.length?line[end].event.time-line[end-1].end:0;
   const onBeat=end===line.length||Math.abs(map.points[end].beat-Math.round(map.points[end].beat))<.15;
   if(!onBeat&&gap<map.pulse*.3)continue;
   ends.push({end,beats,gap});
  }
  for(const {end,beats,gap} of ends)for(let degree=1;degree<=7;degree++){
   const evidence=segmentEvidence(line,start,end,degree,scale,key);if(!evidence)continue;
   const unstable=degree===(key.minor?2:7);
   const firstTone=pc(line[start].event.note-evidence.rootPc);
   const character=(unstable?(profile==='ccm'?1.4:.7):0)+(start===0&&unstable?1.2:0)
    -(start===0&&firstTone===0?.45:0);
   const rhythm=Math.pow(beats-4,2)*.16+1.1-(gap>map.pulse*.4?.25:0);
   for(const path of paths){
    if(path.anchors.length>=64||path.anchors.at(-1)?.degree===degree)continue;
    const previous=path.anchors.at(-1)?.degree;
    const closing=end===line.length&&(degree===1||key.minor&&degree===3)?-.45:0;
    const anchor={...evidence,beat:map.points[start].beat};
    states[end].push({anchors:[...path.anchors,anchor],cost:path.cost+evidence.cost+rhythm+character+transition(previous,degree,scale)+closing});
   }
   // Borne de mémoire indépendante de la longueur ou des noms de la session.
   if(states[end].length>600)states[end]=states[end].sort((a,b)=>a.cost-b.cost).slice(0,160);
  }
 }
 const seen=new Set();
 return states.at(-1).filter(p=>p.anchors.length>=3&&!exclude.includes(p.anchors.slice(0,8).map(a=>a.degree).join('-'))).sort((a,b)=>a.cost-b.cost).filter(p=>{
  const signature=p.anchors.map(a=>`${a.sourceOn}:${a.degree}`).join('|');if(seen.has(signature))return false;seen.add(signature);return true;
 }).slice(0,Math.max(1,Math.min(24,limit))).map(p=>({
  degrees:p.anchors.slice(0,8).map(a=>a.degree),
  arrivals:p.anchors.map(({at,sourceOn,degree,melody})=>({at,sourceOn,degree,melody})),cost:p.cost,
  analysis:{method:'melody-phrase-search-v1',noteCount:pairs.length,pulse:map.pulse,
   evidence:p.anchors.map(({at,degree,evidence})=>({at,degree,...evidence}))},
 }));
}

/** Le rendu doit aussi être évalué : une grille compatible sur le papier peut
 * encore produire des frottements tenus ou de grands sauts entre les voix. */
export function accompanimentPlanCost(variant,take){
 const pairs=notePairs(take.events);let cost=0;
 for(const h of variant.harmony){
  const inner=h.notes.filter(n=>n!==h.topMidi);
  for(const p of pairs){
   const overlap=Math.min(h.end,p.end)-Math.max(h.at,p.event.time);if(overlap<=0)continue;
   cost+=inner.filter(n=>[1,13].includes(p.event.note-n)).length*overlap*3;
  }
 }
 for(let i=1;i<variant.harmony.length;i++){
  const a=variant.harmony[i-1].notes,b=variant.harmony[i].notes;
  cost+=a.reduce((s,n)=>s+Math.min(...b.map(m=>Math.abs(m-n))),0)*.035;
 }
 return cost;
}

// Une progression demandée devient un accompagnement de la vraie mélodie,
// et non un exemple indépendant joué à un tempo arbitraire.
import {reviewTake} from '../recorder/take-review.js';
import {extractKey} from './intent-classifier.js';
import {harmonyVoicings} from './fixed-harmony.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {voiceLeadingCost,chordToneIntervals} from '../practice-exercise.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {phrasePedal} from './proposal-pedal.js';
import {comparedTakeExample} from './playing-diff.js';
const pc=n=>(n%12+12)%12;
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const normalVelocity=p=>p.event.velocity>1?p.event.velocity/127:p.event.velocity;

export function requestedDegreeProgression(message){
 const match=/\b\d+(?:\s*[-–—→]\s*\d+){1,7}\b/.exec(message||'');
 if(!match||/^\s*(?:secondes?|sec|s)\b/i.test(String(message).slice(match.index+match[0].length)))return null;
 const degrees=match[0].split(/\s*[-–—→]\s*/).map(Number);
 if(degrees.length<3&&!/progression|grille|degr[eé]|harmonis/i.test(message))return null;
 return {degrees,valid:degrees.every(d=>d>=1&&d<=7)};
}

/** Pulsation locale : les notes source restent exactes. Interpoler seulement
 * les temps sans attaque, en suivant les accélérations du pianiste. */
export function melodyBeatMap(pairs){
 const groups=[];
 for(const p of pairs){
  if(!groups.length||p.event.time-groups.at(-1)[0].event.time>.075)groups.push([]);
  groups.at(-1).push(p);
 }
 // Une petite note d'approche ne prend pas la place de l'appui principal.
 const attacks=groups.map(group=>[...group].sort((a,b)=>Number(b.end-b.event.time>=.12)-Number(a.end-a.event.time>=.12)
  ||normalVelocity(b)-normalVelocity(a))[0]);
 const intervals=attacks.slice(1).map((p,i)=>p.event.time-attacks[i].event.time);
 const typical=intervals.filter(g=>g>=.28&&g<=.9);
 if(attacks.length<8||typical.length<5)return null;
 const global=median(typical),points=[{beat:0,time:attacks[0].event.time}];
 let beat=0;
 for(let i=0;i<intervals.length;i++){
  const nearby=intervals.slice(Math.max(0,i-4),i+5).filter(g=>g>global*.7&&g<global*1.4);
  const pulse=median(nearby)||global,gap=intervals[i];
  const steps=Math.max(.5,Math.round(gap/pulse*2)/2);
  if(Math.abs(gap/steps-pulse)>pulse*.27)return null;
  beat+=steps;points.push({beat,time:attacks[i+1].event.time});
 }
 const at=value=>{
  const right=points.find(p=>p.beat>=value);
  if(!right){const last=points.at(-1);return last.time+(value-last.beat)*median(typical.slice(-8));}
  const left=points.filter(p=>p.beat<=value).at(-1)||points[0];
  return left===right?left.time:left.time+(right.time-left.time)*(value-left.beat)/(right.beat-left.beat);
 };
 return {points,at,pulse:global};
}

function candidates(take,pairs,w,specs){
 const sounding=pairs.filter(p=>p.event.time<w.end&&p.end>w.at);
 const checks=[w.at,...sounding.flatMap(p=>[p.event.time,p.end]).filter(t=>t>w.at&&t<w.end)];
 const topAt=t=>Math.max(...sounding.filter(p=>p.event.time<=t+.000001&&p.end>t+.000001).map(p=>p.event.note));
 const tops=checks.map(topAt).filter(Number.isFinite);
 const ceiling=Math.min(...tops)-1;
 if(!Number.isFinite(ceiling)||ceiling<48)return [];
 const allMelody=new Set(sounding.map(p=>p.event.note)),out=[],seen=new Set();
 for(const [rank,spec] of specs.entries()){
  const tones=chordToneIntervals(spec.quality);
  // Une longue note étrangère peut être une tension, mais pas une raison de
  // plaquer aveuglément une dominante contenant la tierce qui la heurte.
  const foreign=sounding.filter(p=>!tones.has(pc(p.event.note-spec.rootPc)));
  const foreignCost=foreign.reduce((cost,p)=>cost+Math.min(p.end,w.end)-Math.max(p.event.time,w.at),0);
  if(w.kind==='dominant'&&foreign.some(p=>Math.min(p.end,w.end)-Math.max(p.event.time,w.at)>.3))continue;
  const bass=48+pc(spec.rootPc),frame={bassMidi:bass,notes:[bass,ceiling],topMidi:ceiling};
  for(let top=ceiling;top>=Math.max(48,ceiling-12);top--){
   for(const v of harmonyVoicings({...frame,topMidi:top},{...spec,chromatic:true},{palette:null})){
    if(v.notes.length>5||v.notes.some(n=>allMelody.has(n))||voicedQuality(v.notes,spec.rootPc,spec.quality)!==spec.quality)continue;
    if(!checks.every(t=>handDistribution([...v.notes,...sounding.filter(p=>p.event.time<=t+.000001&&p.end>t+.000001).map(p=>p.event.note)])))continue;
    const id=v.notes.join(',');if(seen.has(id))continue;seen.add(id);
    const close=checks.reduce((cost,t)=>cost+v.notes.filter(n=>[1,13].includes(topAt(t)-n)).length,0);
    const lowCluster=v.notes.filter((n,i)=>i&&n-v.notes[i-1]===1&&n<60).length;
    out.push({...v,cost:rank*2+foreignCost*3+close*6+lowCluster*4+Math.abs(v.notes[0]-48)*.2+Math.max(0,v.notes.length-4)*1.5});
   }
  }
 }
 return out.sort((a,b)=>a.cost-b.cost).slice(0,20);
}

/** Recherche d'une chaîne liée, avec vérification des résolutions réelles. */
function chooseChain(pools,windows){
 let beam=[{chosen:[],cost:0}];
 for(let i=0;i<pools.length;i++){
  const next=[];
  for(const path of beam)for(const v of pools[i]){
   const previous=path.chosen.at(-1);
   if(previous?.function&&!resolvingVoices(previous,v))continue;
   next.push({chosen:[...path.chosen,v],cost:path.cost+v.cost+(previous?voiceLeadingCost(previous.notes,v.notes)*.6:0)});
  }
  beam=next.sort((a,b)=>a.cost-b.cost).slice(0,16);
  if(!beam.length)return null;
 }
 return beam[0].chosen.map((v,i)=>({...windows[i],...v}));
}

export function buildDegreeAccompaniment(take,{message='',request=requestedDegreeProgression(message)}={}){
 if(!request?.valid)return null;
 const pairs=notePairs(take.events).sort((a,b)=>a.event.time-b.event.time),map=melodyBeatMap(pairs);
 if(!map)return null;
 const review=reviewTake(take.events),key=extractKey(message)||extractKey(`en ${take.key||''}`)
  ||(review?.key?.confidence>=.7?{rootPc:review.key.pc,minor:review.key.mode==='minor'}:null);
 if(!key)return null;
 const scale=key.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
 const qualities=key.minor?['m9','m7b5','maj9','m9','m9','maj9','13']:['maj9','m9','m7','maj9','13','m9','m7b5'];
 const duration=take.duration||Math.max(...pairs.map(p=>p.end));
 let windows=[];
 for(let beat=0,i=0;map.at(beat)<duration-.2&&i<64;beat+=4,i++){
  const degree=request.degrees[i%request.degrees.length],rootPc=pc(key.rootPc+scale[degree-1]);
  windows.push({at:map.at(beat),end:Math.min(map.at(beat+4)-.025,duration),beat,degree,rootPc,quality:qualities[degree-1],kind:'accompaniment'});
 }
 if(windows.length<2)return null;
 const ownSpecs=w=>[...new Set([w.quality,...(w.quality==='maj9'?['6/9','maj7','6']:w.quality==='m7'?['m9','m11','m7']:w.quality==='m9'?['m9','m11','m7']:w.quality==='13'?['13','9','7sus4']:[])])].map(quality=>({rootPc:w.rootPc,quality}));
 let pools=windows.map(w=>candidates(take,pairs,w,ownSpecs(w)));
 if(pools.some(p=>!p.length))return null;
 // Les passages restent sur les temps du geste et ne volent pas l'arrivée.
 // Une mesure sur deux au maximum, et jamais deux passages consécutifs.
 const fixed=/sans (?:accords? de )?passages?|sans mouvement|accords? fixes/.test(plain(message));
 let passages=0;
 if(!fixed)for(let i=windows.length-2;i>=0&&passages<4;i--){
  const base=windows[i],target=windows[i+1];
  if(target.kind!=='accompaniment'||base.kind!=='accompaniment'||(i+1)%2!==1)continue;
  const start=map.at(target.beat-1),end=target.at-.025;
  if(start-base.at<map.pulse*2||end-start<.25)continue;
  const w={at:start,end,beat:target.beat-1,kind:'dominant',targetAt:target.at};
  const rootPc=pc(target.rootPc+7);
  const pass=candidates(take,pairs,w,['7b9b13','13','9','7b9','7'].map(quality=>({rootPc,quality})));
  const valid=pass.filter(v=>pools[i+1].some(to=>resolvingVoices({...v,function:{kind:'dominant',targetRootPc:target.rootPc}},to)));
  if(!valid.length)continue;
  const short={...base,end:start-.025},before=candidates(take,pairs,short,ownSpecs(short));
  if(!before.length)continue;
  windows.splice(i,1,short,w);pools.splice(i,1,before,valid.map(v=>({...v,function:{kind:'dominant',targetRootPc:target.rootPc}})));passages++;
 }
 let segments=chooseChain(pools,windows);
 if(!segments)return null;
 const notes=[],ornaments=[];
 for(const [i,s] of segments.entries()){
  const line=pairs.filter(p=>p.event.time<s.end&&p.end>s.at);
  const level=Math.min(.62,median(line.map(normalVelocity))*.72);
  for(const note of s.notes)notes.push({note,time:s.at,end:s.end,velocity:note===s.notes[0]?level*1.08:level});
  // Appoggiature chromatique inférieure d'une voix intérieure : la mélodie
  // reste intacte. Au plus deux dans la prise, résolution immédiate et mains vérifiées.
  if(fixed||/sans appoggiatures?|sans ornements?/.test(plain(message))||s.kind!=='accompaniment'||segments[i-1]?.kind!=='dominant'||ornaments.length>=2)continue;
  const length=Math.min(.16,(map.at(s.beat+.25)-s.at));
  if(length<.08)continue;
  for(const anchor of [...s.notes].reverse().filter(n=>[3,4,7].includes(pc(n-s.rootPc)))){
   const approach=anchor-1;
   if(s.notes.some(n=>n!==anchor&&Math.abs(n-approach)<=1)||line.some(p=>Math.abs(p.event.note-approach)<=1))continue;
   const startNotes=s.notes.map(n=>n===anchor?approach:n);
   if(!handDistribution([...startNotes,...line.filter(p=>p.event.time<=s.at+length&&p.end>s.at).map(p=>p.event.note)]))continue;
   const original=notes.find(n=>n.note===anchor&&n.time===s.at);original.time=s.at+length;
   notes.push({note:approach,time:s.at,end:s.at+length,velocity:level*.9});
   ornaments.push({at:s.at,end:s.at+length,note:approach,target:anchor,resolveAt:s.at+length,kind:'appoggiatura'});break;
  }
 }
 const text=plain(message),keepPedal=/garde.*pedale|conserv.*pedale/.test(text),dry=/sans pedale|sans sustain/.test(text);
 const ornamentPairs=ornaments.map(o=>({event:{note:o.note,time:o.at},end:o.end}));
 const edit={type:'arrangement',remove:[],keep:pairs.map(p=>p.on),notes,replacePedal:!keepPedal,
  pedal:keepPedal||dry?[]:phrasePedal(segments,[...pairs,...ornamentPairs],duration)};
 const changed=applyTakeEdit(take,edit);if(!changed)return null;
 const harmony=segments.map(s=>({at:s.at,end:s.end,chord:s.label,notes:s.notes,rootPc:s.rootPc,quality:s.quality,technique:s.technique,beat:s.beat,degree:s.degree,
  kind:s.kind,goal:s.kind==='dominant'?'passing':'accompany',targetAt:s.targetAt,function:s.function}));
 const description=`La progression ${request.degrees.join('–')}, une mesure par accord, avec des voix liées${passages?', des accords de passage':''}${ornaments.length?' et de courtes appoggiatures':''}. Ta mélodie reste intacte.`;
 const advice={version:8,id:'melody-progression',goal:'accompany',take,edit,changes:harmony,text:description};
 const example=comparedTakeExample(take,changed);if(!example)return null;
 return {id:'melody-progression',title:'Ta mélodie harmonisée',description,advice,harmony,ornaments,
  rhythm:{beatsPerBar:4,points:map.points,assumedFirstDownbeat:map.points[0].time},progression:{degrees:request.degrees,key,assumedBeatsPerChord:4},example:{...example,title:'Ta mélodie harmonisée',subtitle:description}};
}

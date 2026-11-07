// Harmonisation accord-mélodie : une arrivée harmonique appartient à une
// attaque réelle, pas à une division arbitraire du temps en mesures égales.
import {chordToneIntervals,voiceLeadingCost} from '../practice-exercise.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {phrasePedal} from './proposal-pedal.js';
import {comparedTakeExample} from './playing-diff.js';
import {resolvingVoices} from './harmonic-intentions.js';
const pc=n=>(n%12+12)%12;
const text=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
const velocity=p=>p.event.velocity>1?p.event.velocity/127:p.event.velocity;
const minor=q=>/^m(?!aj)/.test(q);
function notePc(token){
 const match=/^(sol|do|re|mi|fa|la|si|[a-g])\s*([#♯b♭]?)/i.exec(text(token));
 if(!match)return null;
 const roots={do:0,re:2,mi:4,fa:5,sol:7,la:9,si:11,c:0,d:2,e:4,f:5,g:7,a:9,b:11};
 return pc(roots[match[1]]+(/[#♯]/.test(match[2])?1:/[b♭]/.test(match[2])?-1:0));
}
function mapping(section){
 return [...section.matchAll(/([1-7])\s*(?:sur|=)\s*(sol|do|r[eé]|mi|fa|la|si|[A-G])(?:\s*([#♯b♭]))?(\s+aigu[eë]?)?/gi)]
  .map(m=>({degree:Number(m[1]),pc:notePc(m[2]+(m[3]||'')),high:Boolean(m[4])}));
}
export function melodyArrivalPlan(pairs,request,key,message){
 const scale=key.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
 const qualities=key.minor?['m7','m7b5','maj7','m7','m7','maj7','7']:['maj7','m7','m7','maj7','7','m7','m7b5'];
 const groups=[];
 for(const p of pairs){if(!groups.length||p.event.time-groups.at(-1)[0].event.time>.075)groups.push([]);groups.at(-1).push(p);}
 const line=groups.map(g=>[...g].sort((a,b)=>Number(b.end-b.event.time>=.12)-Number(a.end-a.event.time>=.12)||velocity(b)-velocity(a))[0]);
 const explicit=mapping(/(?:arrivees|reperes)\s*:\s*([^\n.]+)/i.exec(text(message))?.[1]||'');
 const variantMatch=/variante\s+([1-7](?:\s*[-–→]\s*[1-7])+)[\s:]+([^\n.]+)/i.exec(text(message));
 const variant=variantMatch?{degrees:variantMatch[1].split(/\s*[-–→]\s*/).map(Number),anchors:mapping(variantMatch[2])}:null;
 const spec=degree=>{const rootPc=pc(key.rootPc+scale[degree-1]),quality=qualities[degree-1];
  const own=explicit.find(a=>a.degree===degree);
  // Heuristique seulement en l'absence de repères : fondamentale, tierce de V,
  // ou tierce du relatif mineur. Les repères exprimés par l'utilisateur priment.
  const preferred=own?.pc??pc(rootPc+(!key.minor&&degree===5?4:!key.minor&&degree===6?3:0));
  return {degree,rootPc,quality,preferred,high:Boolean(own?.high)};};
 const matches=(p,a)=>pc(p.event.note)===a.pc&&(!a.high||p.event.note>=Math.min(...line.filter(q=>pc(q.event.note)===a.pc).map(q=>q.event.note))+12);
 const anchors=[];let cursor=0,step=0;
 while(cursor<line.length&&anchors.length<64){
  const wanted=spec(request.degrees[step]),index=line.findIndex((p,i)=>i>=cursor&&matches(p,{pc:wanted.preferred,high:wanted.high}));
  let alternative=null;
  if(variant&&step===variant.degrees.length-1&&variant.degrees.slice(0,-1).every((d,i)=>request.degrees[i]===d)){
   const degree=variant.degrees.at(-1),hint=variant.anchors.find(a=>a.degree===degree);
   if(hint){const at=line.findIndex((p,i)=>i>=cursor&&matches(p,hint));if(at>=0&&(index<0||at<=index))alternative={...spec(degree),index:at,variant:true};}
  }
  const chosen=alternative||index>=0&&{...wanted,index};if(!chosen)break;
  const p=line[chosen.index];anchors.push({...chosen,at:p.event.time,sourceOn:p.on,melody:p.event.note});
  cursor=chosen.index+1;step=alternative?0:(step+1)%request.degrees.length;
 }
 const last=anchors.at(-1),final=line.at(-1);
 if(last&&final.event.time>last.at+.4&&pc(final.event.note)===last.rootPc)
  anchors.push({...last,at:final.event.time,sourceOn:final.on,melody:final.event.note,index:line.length-1,closure:true});
 return {anchors,line,variant,explicit};
}

function positions(w,spec,pairs){
 const top=w.source.event.note,tones=chordToneIntervals(spec.quality);if(!tones.has(pc(top-spec.rootPc)))return [];
 const result=[],seen=new Set();
 const sounding=pairs.filter(p=>p.event.time<w.end&&p.end>w.at);
 const checks=[w.at,...sounding.flatMap(p=>[p.event.time,p.end]).filter(t=>t>w.at&&t<w.end)];
 const accept=(input,technique)=>{
  let notes=[...new Set(input)].sort((a,b)=>a-b);
  if(notes.length>4||notes.at(-1)!==top||notes[0]<36||notes[0]>=top)return;
  if(w.kind==='arrival'&&pc(notes[0])!==spec.rootPc)return;
  // La mélodie joue elle-même le sommet. Une cinquième déjà tenue au doigt
  // peut être omise de l'accompagnement ; jamais réattaquée après son relâchement.
  const collision=notes.filter(n=>n!==top&&sounding.some(p=>p.event.note===n));
  if(collision.some(n=>pc(n-spec.rootPc)!==7))return;
  if(collision.length){notes=notes.filter(n=>!collision.includes(n));if(technique==='drop2')technique='drop2-shell';}
  if(notes.length<3||voicedQuality(notes,spec.rootPc,spec.quality)!==spec.quality)return;
  if(!checks.every(t=>handDistribution([...notes.filter(n=>n!==top),...sounding.filter(p=>p.event.time<=t+.000001&&p.end>t+.000001).map(p=>p.event.note)])))return;
  if(notes.some(n=>n!==top&&sounding.some(p=>p.event.note===n)))return;
  const id=notes.join(',');if(seen.has(id))return;seen.add(id);
  const bass=pc(notes[0])===spec.rootPc?'':` / ${names[pc(notes[0])]}`;
  const label=`${names[spec.rootPc]}${spec.quality==='m'?' mineur':spec.quality==='m7'?' mineur 7':spec.quality==='maj7'?' majeur 7':spec.quality==='dim7'?' diminué 7':' '+spec.quality}${bass}`;
  const low=notes.filter((n,i)=>i&&n-notes[i-1]<=2&&n<60).length;
  const close=notes.filter(n=>[1,13].includes(top-n)).length;
  result.push({...spec,notes,technique,label,cost:(spec.rank||0)*2+low*3+close*4+Math.abs(notes[0]-Math.min(57,top-12))*.15+(notes.length===3?.6:0)});
 };
 // Le drop 2 est construit à partir d'un accord serré de quatre sons réel.
 if(tones.size===4){const close=[...tones].map(t=>{let n=top;while(pc(n-spec.rootPc)!==t)n--;return n;}).sort((a,b)=>a-b);
  accept([close[0],close[1],close[2]-12,close[3]],'drop2');}
 const third=minor(spec.quality)||spec.quality==='dim7'?3:4,guide=spec.quality==='m'?7:/dim7|^6$/.test(spec.quality)?9:/maj/.test(spec.quality)?11:10;
 const essential=[third,guide,...(/13/.test(spec.quality)?[9]:[]),...(/b9/.test(spec.quality)?[1]:[])];
 // Coquilles de trois/quatre voix : basse, guides et sommet mélodique. Les
 // octaves sont recherchées, pas imposées loin des deux mains.
 for(let bass=36;bass<=Math.min(60,top-3);bass++)if(pc(bass)===spec.rootPc){
  const missing=[...new Set(essential)].filter(t=>pc(top-spec.rootPc)!==t);
  const expand=(i,notes)=>{if(i===missing.length){accept([bass,...notes,top],'guide-tone-shell');return;}
   for(let n=bass+3;n<top;n++)if(pc(n-spec.rootPc)===missing[i])expand(i+1,[...notes,n]);};
  if(missing.length<=2)expand(0,[]);
 }
 return result.sort((a,b)=>a.cost-b.cost).slice(0,16);
}

export function buildArrivalAccompaniment(take,{pairs,key,map,request,message}){
 const plan=melodyArrivalPlan(pairs,request,key,message),{anchors,line}=plan;if(anchors.length<3)return null;
 const fixed=/sans (?:accords? de )?passages?|sans mouvement|accords? fixes/.test(text(message));
 const events=new Map(anchors.map(a=>[a.sourceOn,{source:pairs.find(p=>p.on===a.sourceOn),anchor:a,kind:'arrival'}]));
 for(let i=0;i<anchors.length;i++){
  const a=anchors[i],next=anchors[i+1],inside=line.filter(p=>p.event.time>a.at&&p.event.time<(next?.at??take.duration));
  // L'ouverture reste mélodique. Les liaisons descendantes peuvent recevoir
  // des drop 2 ; le Sol devant la variante aiguë reste libre.
  if(!fixed&&![4,3].includes(a.degree))for(const p of inside){
   const j=line.indexOf(p),future=line[j+1],previous=line[j-1];
   if(future&&future.event.note-p.event.note>=7)continue;
   if(previous?.event.note===p.event.note)continue;
   events.set(p.on,{source:p,anchor:a,next,kind:'connection'});
  }
  if(!fixed&&next&&!next.variant){
   const before=inside.at(-1);
   if(before&&next.at-before.event.time>=.18&&[5,6].includes(next.degree))
    events.set(before.on,{source:before,anchor:a,next,kind:'dominant'});
  }
 }
 const windows=[...events.values()].sort((a,b)=>a.source.event.time-b.source.event.time).map((w,i,ws)=>{
  const at=w.source.event.time;return {...w,at,end:Math.min(ws[i+1]?ws[i+1].source.event.time-.015:take.duration,take.duration),beat:map.points.find(p=>Math.abs(p.time-at)<.001)?.beat};});
 const diatonic=key.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],qs=key.minor?['m7','m7b5','maj7','m7','m7','maj7','7']:['maj7','m7','m7','maj7','7','m7','m7b5'];
 const pools=windows.map(w=>{
  let specs;
  if(w.kind==='arrival'){
   const a=w.anchor,qualities=a.degree===4&&!key.minor?['6','maj7']:a.degree===5&&!key.minor?['13','7']:a.quality==='m7'?['m7','m']: [a.quality];
   specs=qualities.map((quality,rank)=>({rootPc:a.rootPc,quality,rank}));
  }else if(w.kind==='dominant'){
   const rootPc=pc(w.next.rootPc+7);specs=['13','7','7b9'].map((quality,rank)=>({rootPc,quality,rank,function:{kind:'dominant',targetRootPc:w.next.rootPc}}));
  }else{
   specs=diatonic.map((d,i)=>({rootPc:pc(key.rootPc+d),quality:qs[i],rank:0}));
   for(let r=0;r<12;r++)specs.push({rootPc:r,quality:'dim7',rank:1.5});
  }
  let pool=specs.flatMap(s=>positions(w,s,pairs));
  if(!pool.length&&w.kind==='dominant'){
   w.kind='connection';
   // Si l'altération ne tient pas sous le sommet, rester dans les couleurs
   // diatoniques, sans afficher une dominante qui n'est pas jouée.
   pool=diatonic.flatMap((d,i)=>positions(w,{rootPc:pc(key.rootPc+d),quality:qs[i],rank:1},pairs));
  }
  return pool.sort((a,b)=>a.cost-b.cost).slice(0,28);
 });
 if(pools.some(p=>!p.length))return null;
 // Une dominante est retenue seulement si une note-guide rejoint réellement
 // la fondamentale ou la tierce de l'arrivée, à un ou deux demi-tons.
 for(let i=0;i<pools.length-1;i++)if(windows[i].kind==='dominant'){
  const resolving=pools[i].filter(v=>pools[i+1].some(to=>resolvingVoices(v,to)));
  if(resolving.length)pools[i]=resolving;
  else{windows[i].kind='connection';pools[i]=pools[i].map(v=>({...v,function:undefined}));}
 }
 let beam=[{chosen:[],cost:0}];
 for(let i=0;i<pools.length;i++){
  const next=[];for(const path of beam)for(const v of pools[i]){
   const before=path.chosen.at(-1);
   if(before?.function&&!resolvingVoices(before,v))continue;
   const cost=path.cost+v.cost+(before?voiceLeadingCost(before.notes,v.notes)*.7+Math.abs(before.notes[0]-v.notes[0])*.15:0);
   next.push({chosen:[...path.chosen,v],cost});
  }
  beam=next.sort((a,b)=>a.cost-b.cost).slice(0,24);
  if(!beam.length)return null;
 }
 const segments=beam[0].chosen.map((v,i)=>({...windows[i],...v})),notes=[];
 for(const s of segments){
  const level=Math.min(.65,velocity(s.source)*.82);
  for(const note of s.notes.filter(n=>n!==s.source.event.note))notes.push({note,time:s.at,end:s.end,velocity:level*(note===s.notes[0]?1:.94)});
 }
 const keepPedal=/garde.*pedale|conserv.*pedale/.test(text(message)),dry=/sans pedale|sans sustain/.test(text(message));
 const edit={type:'arrangement',remove:[],keep:pairs.map(p=>p.on),notes,replacePedal:!keepPedal,pedal:keepPedal||dry?[]:phrasePedal(segments,pairs,take.duration)};
 const changed=applyTakeEdit(take,edit);if(!changed)return null;
 const harmony=segments.map(s=>({at:s.at,end:s.end,chord:s.label,notes:s.notes,rootPc:s.rootPc,quality:s.quality,technique:s.technique,beat:s.beat,
  degree:s.kind==='arrival'?s.anchor.degree:undefined,kind:s.kind,goal:s.kind==='arrival'?'accompany':'passing',topMidi:s.source.event.note,sourceOn:s.source.on,
  function:s.function,targetAt:s.kind==='dominant'?s.next?.at:undefined}));
 const description='Les voicings arrivent sur les notes de ta mélodie.'+(harmony.some(h=>h.kind!=='arrival')?' Des accords légers relient les arrivées.':'')+(harmony.some(h=>h.technique==='drop2')?' Les drop 2 gardent ta mélodie au sommet.':'');
 const advice={version:8,id:'melody-progression',goal:'accompany',take,edit,changes:harmony,text:description};
 const example=comparedTakeExample(take,changed);if(!example)return null;
 return {id:'melody-progression',title:'Ta mélodie en accords',description,advice,harmony,ornaments:[],arrivals:anchors,
  rhythm:{placement:'melody-arrivals',points:map.points},progression:{degrees:request.degrees,key,variant:plan.variant?.degrees||null,alignment:'melody-arrivals'},example:{...example,title:'Ta mélodie en accords',subtitle:description}};
}

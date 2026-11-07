// Accompagnement tenu : une arrivée harmonique appartient à une
// attaque réelle, pas à une division arbitraire du temps en mesures égales.
import {chordToneIntervals,voiceLeadingCost} from '../practice-exercise.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {phrasePedal} from './proposal-pedal.js';
import {comparedTakeExample} from './playing-diff.js';
import {resolvingVoices} from './harmonic-intentions.js';
import {melodyTouchNotes,melodyAppoggiatura} from './melody-touch.js';
import {melodyColorProfile} from './melody-color-profile.js';
const pc=n=>(n%12+12)%12;
const text=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
const velocity=p=>p.event.velocity>1?p.event.velocity/127:p.event.velocity;
const minor=q=>/^m(?!aj)/.test(q);
function notePc(token){
 const match=/^(sol|do|re|mi|fa|la|si|[a-g])\s*([#♯b♭]?)$/i.exec(text(token).trim());
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
 // Le premier retour à la fondamentale après la dernière arrivée marque la
 // fermeture, sans attendre sa répétition finale ni réattaquer chaque répétition.
 const ending=/(?:finale|fin)\s*:\s*([^\n.]+)/i.exec(text(message))?.[1];
 if(ending){
  if(!anchors.length)return {anchors:[],line,variant,explicit};
  let from=anchors.at(-1).index+1;
  for(const part of ending.split(';')){
   const hint=mapping(part)[0];if(!hint)return {anchors:[],line,variant,explicit};
   const pattern=/apres\s+([a-z#♯b♭]+(?:[-–→][a-z#♯b♭]+)+)/i.exec(part)?.[1]?.split(/[-–→]/).map(notePc);
   if(pattern?.some(p=>p==null))return {anchors:[],line,variant,explicit};
   let found=-1;
   for(let i=from;i<line.length;i++){
    if(pc(line[i].event.note)!==hint.pc)continue;
    if(pattern&&!pattern.every((p,j)=>i-pattern.length+1+j>=from&&pc(line[i-pattern.length+1+j].event.note)===p))continue;
    found=i;break;
   }
   if(found<0)return {anchors:[],line,variant,explicit};
   const p=line[found];anchors.push({...spec(hint.degree),at:p.event.time,sourceOn:p.on,melody:p.event.note,index:found,
    closure:true,offbeat:/contre[- ]?temps|avant (?:la note|le .+?) suivant/.test(part),anticipation:/avant (?:la note|le .+?) suivant/.test(part)});from=found+1;
  }
  return {anchors,line,variant,explicit};
 }
 const last=anchors.at(-1),final=last&&line.find(p=>p.event.time>last.at+.4&&pc(p.event.note)===last.rootPc);
 if(final)anchors.push({...last,at:final.event.time,sourceOn:final.on,melody:final.event.note,index:line.indexOf(final),variant:false,closure:true});
 return {anchors,line,variant,explicit};
}

function positions(w,spec,pairs,register){
 const top=w.source.event.note,tones=chordToneIntervals(spec.quality);if(!tones.has(pc(top-spec.rootPc)))return [];
 const result=[],seen=new Set();
 const sounding=pairs.filter(p=>p.event.time<w.end&&p.end>w.at);
 const checks=[w.at,...sounding.flatMap(p=>[p.event.time,p.end]).filter(t=>t>w.at&&t<w.end)];
 const accept=(input,technique)=>{
  let notes=[...new Set(input)].sort((a,b)=>a-b);
  if(notes.length>(w.kind==='dominant'?6:4)||notes.at(-1)!==top||notes[0]>=top)return;
  if(spec.rootBass&&pc(notes[0])!==spec.rootPc)return;
  // Deux octaves au maximum. Le registre se déduit de la mélodie et de sa
  // tonique, indépendamment du numéro d'octave affiché par le piano utilisé.
  if(top-notes[0]>24||notes[0]<register.floor-5)return;
  if(notes[0]<register.floor&&![7,9,11].includes(pc(notes[0]-register.tonic)))return;
  // La mélodie joue elle-même le sommet. Une cinquième déjà tenue au doigt
  // peut être omise de l'accompagnement ; jamais réattaquée après son relâchement.
  const collision=notes.filter(n=>n!==top&&sounding.some(p=>p.event.note===n));
  if(collision.some(n=>pc(n-spec.rootPc)!==7))return;
  if(collision.length){notes=notes.filter(n=>!collision.includes(n));if(technique==='drop2')technique='drop2-shell';}
  if(notes.length<3||voicedQuality(notes,spec.rootPc,spec.quality)!==spec.quality)return;
  if(notes.some((n,i)=>i&&n-notes[i-1]>12))return;
  const accompaniment=notes.filter(n=>n!==top);
  // La position reste sous la mélodie durant toute la tenue, pas seulement à
  // l'attaque. Un passage descendant ne doit ni couper ni doubler une voix tenue.
  if(!checks.every(t=>{
   const melody=sounding.filter(p=>p.event.time<=t+.000001&&p.end>t+.000001).map(p=>p.event.note);
   return (!melody.length||accompaniment.every(n=>n<Math.max(...melody)))&&handDistribution([...accompaniment,...melody]);
  }))return;
  if(notes.some(n=>n!==top&&sounding.some(p=>p.event.note===n)))return;
  const id=notes.join(',');if(seen.has(id))return;seen.add(id);
  const bass=pc(notes[0])===spec.rootPc?'':` / ${names[pc(notes[0])]}`;
  const label=`${spec.rootName||names[spec.rootPc]}${spec.quality==='m'?' mineur':spec.quality==='m7'?' mineur 7':spec.quality==='maj7'?' majeur 7':spec.quality==='dim7'?' diminué 7':' '+spec.quality}${bass}`;
  const low=notes.filter((n,i)=>i&&n-notes[i-1]<=2&&n<60).length;
  const tight=spec.warm?notes.filter((n,i)=>i&&n-notes[i-1]===1).length:0;
  const close=notes.filter(n=>[1,13].includes(top-n)).length;
  result.push({...spec,notes,technique,label,cost:(spec.rank||0)*(w.kind==='dominant'?10:4)+low*3+close*4+(top-notes[0])*.2
   +tight*6+(notes[0]<register.floor?6:0)+(pc(notes[0])===spec.rootPc?0:1)+(notes.length===3?.6:0)});
 };
 // Le drop 2 est construit à partir d'un accord serré de quatre sons réel.
 if(tones.size===4){const close=[...tones].map(t=>{let n=top;while(pc(n-spec.rootPc)!==t)n--;return n;}).sort((a,b)=>a-b);
  accept([close[0],close[1],close[2]-12,close[3]],'drop2');}
 const q=spec.quality,third=minor(q)||q==='dim7'?3:4,guide=q==='m'||q==='add9'?7:/dim7|^6$/.test(q)?9:/maj/.test(q)?11:10;
 const essential=/sus[24]/.test(q)?[0,/sus2/.test(q)?2:5,7,...(/[79]/.test(q)?[10]:[]),...(/9/.test(q)?[2]:[])]:
  [0,third,guide,...(q==='dim7'?[6]:[]),...(/13/.test(q)?[/b13/.test(q)?8:9]:[]),...(/9/.test(q)?[/b9/.test(q)?1:2]:[])];
 // Coquilles de trois/quatre voix : basse, guides et sommet mélodique. Les
 // octaves sont recherchées, pas imposées loin des deux mains.
 const missing=[...new Set(essential)].filter(t=>pc(top-spec.rootPc)!==t);
 const expand=(i,notes)=>{if(i===missing.length){
   accept([...notes,top],'guide-tone-shell');
   // Une quinte ou le redoublement intérieur du sommet peut combler un trou
   // de registre. Le sommet source, lui, n'est jamais rejoué ou déplacé.
   if(notes.length+1<(w.kind==='dominant'?6:4))
    for(let inner=Math.max(register.floor-5,top-24);inner<top;inner++)
     if((tones.has(7)&&pc(inner-spec.rootPc)===7||pc(inner)===pc(top))&&!notes.includes(inner))accept([...notes,inner,top],'guide-tone-shell');
   return;}
  for(let n=Math.max(register.floor-5,top-24);n<top;n++)if(pc(n-spec.rootPc)===missing[i])expand(i+1,[...notes,n]);};
 if(missing.length<=(w.kind==='dominant'?5:3))expand(0,[]);
 return result.sort((a,b)=>a.cost-b.cost).slice(0,16);
}

function chooseSegments(windows,pairs,key,profile){
 const lowest=Math.min(...windows.map(w=>w.source.event.note));
 const register={tonic:key.rootPc,floor:lowest-pc(lowest-key.rootPc)-12};
 const pools=windows.map(w=>{
  const a=w.anchor;
  const qualities=w.kind==='dominant'?(profile==='ccm'&&!minor(w.target.quality)?['m7']:minor(w.target.quality)?['7b9b13','13','7b9','7']:['13','7b9b13','7']):a.leadingTone?['dim7']:a.color?[a.color]:
   profile==='ccm'&&!key.minor&&[1,4].includes(a.degree)?['sus2','add9','maj7']:profile==='ccm'&&!key.minor&&a.degree===5?['add9','7sus4','7']:
   !key.minor&&[1,4].includes(a.degree)?['6','maj7','maj9']:a.degree===5&&!key.minor?['13','9','7']:a.quality==='m7'?['m7','m']:[a.quality];
  const rootPc=w.kind==='dominant'?pc(w.target.rootPc+7):a.leadingTone?pc(a.rootPc+1):a.rootPc;
  const targetRootPc=w.kind==='dominant'?pc(w.target.rootPc+(w.target.leadingTone?1:0)):a.leadingTone?a.targetRootPc:null;
  return qualities.flatMap((quality,rank)=>positions(w,{rootPc,quality,rank,warm:profile==='ccm',
   ...(a.leadingTone&&w.kind==='arrival'?{rootBass:true,rootName:['Si','Si♯','Do♯','Ré','Ré♯','Mi','Mi♯','Fa♯','Sol','Sol♯','La','La♯'][targetRootPc]}:{}),
   ...(profile==='ccm'&&w.kind==='arrival'&&a.closure&&a.degree===1&&quality==='sus2'?{rootBass:true}:{}),
   ...(profile==='ccm'&&w.kind==='arrival'&&a.closure&&a.degree===5&&quality==='add9'?{rootBass:true}:{}),
   ...(w.kind==='dominant'?{function:{kind:quality==='m7'?'predominant':'dominant',targetRootPc}}:a.leadingTone?{function:{kind:'leading-tone',targetRootPc}}:{})},pairs,register)).sort((a,b)=>a.cost-b.cost).slice(0,32);
 });
 if(pools.some(p=>!p.length))return null;
 let beam=[{chosen:[],cost:0}];
 for(let i=0;i<pools.length;i++){
  const next=[];for(const path of beam)for(const v of pools[i]){
   const before=path.chosen.at(-1);if(before?.function&&!resolvingVoices(before,v))continue;
   next.push({chosen:[...path.chosen,v],cost:path.cost+v.cost+(before?voiceLeadingCost(before.notes,v.notes)*.7+Math.abs(before.notes[0]-v.notes[0])*.15:0)});
  }
  beam=next.sort((a,b)=>a.cost-b.cost).slice(0,24);if(!beam.length)return null;
 }
 return beam[0].chosen.map((v,i)=>({...windows[i],...v}));
}

export function buildArrivalAccompaniment(take,{pairs,key,map,request,message}){
 const plan=melodyArrivalPlan(pairs,request,key,message),{anchors,line}=plan;if(anchors.length<3)return null;
 const profile=melodyColorProfile(message);
 // V suivi du relatif mineur : une sensible diminuée prépare ce mineur,
 // plutôt qu'une dominante de la tonique maquillée par une neuvième bémol.
 if(profile==='ccm'&&!key.minor)for(let i=0;i<anchors.length-1;i++)
  if(anchors[i].degree===5&&anchors[i+1].degree===6){anchors[i].leadingTone=true;anchors[i].targetRootPc=anchors[i+1].rootPc;}
 // Couleurs exprimées par fonction : transposables, sans horaire ni session
 // inscrits dans le moteur. Une couleur impossible n'est pas annoncée à tort.
 const colors=/couleurs\s*:\s*([^\n.]+)/i.exec(text(message))?.[1]||'';
 for(const m of colors.matchAll(/([1-7])\s+(avant la variante|de finale)\s*=\s*(maj9|maj7|m7|7b9b13|7b9|7sus[24]|sus[24]|add9|13|9|7|6)\b/g)){
  const variantAt=anchors.findIndex(a=>a.variant),degree=Number(m[1]);
  const a=m[2]==='de finale'?anchors.find(a=>a.closure&&a.degree===degree):anchors.slice(0,Math.max(0,variantAt)).filter(a=>a.degree===degree).at(-1);
  if(a){a.color=m[3];delete a.leadingTone;delete a.targetRootPc;}
 }
 for(const a of anchors)if(a.offbeat){
  const source=pairs.find(p=>p.on===a.sourceOn),point=map.points.find(p=>Math.abs(p.time-a.at)<.001);if(!point)return null;
  a.melodyAt=a.at;a.beat=point.beat+.5;
  if(a.anticipation){const next=line.find(p=>p.event.time>a.at+.075&&p.event.note===a.melody);if(!next)return null;
   const nextPoint=map.points.find(p=>Math.abs(p.time-next.event.time)<.001);if(!nextPoint)return null;
   a.nextMelodyAt=next.event.time;a.beat=nextPoint.beat-.5;}
  a.at=map.at(a.beat);if(a.at<=a.melodyAt||source.end<a.at+.08)return null;
 }
 let windows=anchors.map((a,i)=>({source:pairs.find(p=>p.on===a.sourceOn),anchor:a,kind:'arrival',at:a.at,
  end:anchors[i+1]?.at??take.duration,beat:a.beat??map.points.find(p=>Math.abs(p.time-a.at)<.001)?.beat}));
 let segments=chooseSegments(windows,pairs,key,profile);if(!segments)return null;
 const t=text(message),lastIndex=re=>[...t.matchAll(re)].at(-1)?.index??-1;
 const passages=lastIndex(/(?:avec|ajout\w*|remet\w*|reintrodu\w*|quelques).*?accords? de passage/g)>lastIndex(/sans (?:accords? de )?passage|sans mouvement|accords? fixes/g);
 if(passages){
  const options=anchors.slice(1).map((target,i)=>({target,base:anchors[i]})).filter(({target,base})=>!target.variant&&[5,6].includes(target.degree)&&target.at-base.at>map.pulse*2)
   .sort((a,b)=>Number(b.target.degree===6)-Number(a.target.degree===6)||b.target.at-a.target.at);
  let count=0;
  for(const {target,base} of options){
   if(count>=4)break;
   const source=line.filter(p=>p.event.time>=base.at+map.pulse*1.5&&p.event.time<target.at-.18).at(-1);if(!source)continue;
   const index=windows.findIndex(w=>w.kind==='arrival'&&w.at===base.at);if(index<0)continue;
   const trial=[...windows];trial.splice(index,1,{...windows[index],end:source.event.time},
    {source,anchor:base,target,kind:'dominant',at:source.event.time,end:target.at,beat:map.points.find(p=>Math.abs(p.time-source.event.time)<.001)?.beat});
   const chosen=chooseSegments(trial,pairs,key,profile);if(!chosen)continue;windows=trial;segments=chosen;count++;
  }
 }
 let notes=melodyTouchNotes(segments,pairs,map.pulse),ornaments=[];
 if(lastIndex(/(?:avec|ajout\w*|une).*?appoggiature/g)>lastIndex(/sans appoggiature|sans ornement|sans.*grace note/g))
  ({notes,ornaments}=melodyAppoggiatura(take,segments,pairs,notes,map.pulse));
 const keepPedal=/garde.*pedale|conserv.*pedale/.test(t),dry=/sans pedale|sans sustain/.test(t);
 const ornamentPairs=ornaments.map(o=>({event:{note:o.note,time:o.at},end:o.end}));
 const edit={type:'arrangement',remove:[],keep:pairs.map(p=>p.on),notes,replacePedal:!keepPedal,
  pedal:keepPedal||dry?[]:phrasePedal(segments,[...pairs,...ornamentPairs],take.duration,{clearMelodyReleases:true})};
 const changed=applyTakeEdit(take,edit);if(!changed)return null;
 const harmony=segments.map(s=>({at:s.at,end:s.end,chord:s.label,notes:s.notes,rootPc:s.rootPc,quality:s.quality,technique:s.technique,beat:s.beat,
  degree:s.kind==='arrival'?s.anchor.degree:undefined,kind:s.kind,goal:s.kind==='arrival'?'accompany':'passing',topMidi:s.source.event.note,sourceOn:s.source.on,
  offbeat:s.anchor.offbeat&&s.kind==='arrival',anticipation:s.anchor.anticipation&&s.kind==='arrival',melodyAt:s.anchor.melodyAt,nextMelodyAt:s.anchor.nextMelodyAt,function:s.function,targetAt:s.kind==='dominant'?s.target.at:s.anchor.leadingTone?anchors[anchors.indexOf(s.anchor)+1]?.at:undefined}));
 const description='Des voicings resserrés soutiennent tes notes principales.'+(anchors.some(a=>a.anticipation)?' Le dernier accord se place entre les deux notes répétées.':anchors.some(a=>a.offbeat)?' Le dernier accord arrive en contretemps.':'')
  +(harmony.some(h=>h.kind==='dominant')?' Quelques accords de passage préparent les arrivées.':'')+(ornaments.length?' Une courte appoggiature colore une arrivée.':'');
 const advice={version:8,id:'melody-progression',goal:'accompany',take,edit,changes:harmony,text:description};
 const example=comparedTakeExample(take,changed);if(!example)return null;
 return {id:'melody-progression',title:'Ta mélodie accompagnée',description,advice,harmony,ornaments,arrivals:anchors,
  rhythm:{placement:'melody-arrivals',accompaniment:'held',touch:'gentle',points:map.points},colorProfile:profile,progression:{degrees:request.degrees,key,variant:plan.variant?.degrees||null,alignment:'melody-arrivals'},example:{...example,title:'Ta mélodie accompagnée',subtitle:description}};
}

import {voiceLeadingCost} from '../practice-exercise.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {resolvingVoices} from './harmonic-intentions.js';
const pc=n=>(n%12+12)%12;

/** Développer une base déjà calculée, sans relancer toute sa réharmonisation.
 * Un 7–3, un retour diatonique et une couleur intérieure : chaque essai garde une cible,
 * un placement rythmique vérifiable et les notes communes au doigt. */
export function developMelodySegments(base,pairs,map,candidates){
 let segments=[...base];const development=[];
 const returns=segments.filter(s=>s.kind==='arrival'&&s.anchor.degree===4&&!s.anchor.closure&&['sus2','add9','maj7'].includes(s.quality));
 const repeated=returns[1]&&segments.indexOf(returns[1])<segments.length-1?returns[1]:null;
 if(repeated){
  const index=segments.indexOf(repeated),before=segments[index-1],after=segments[index+1];
  const pool=candidates(repeated,{rootPc:pc(repeated.rootPc-3),quality:'m7',rootBass:true,warm:true});
  pool.sort((a,b)=>a.cost+voiceLeadingCost(before.notes,a.notes)+voiceLeadingCost(a.notes,after.notes)
   -b.cost-voiceLeadingCost(before.notes,b.notes)-voiceLeadingCost(b.notes,after.notes));
  if(pool.length){
   segments[index]={...repeated,...pool[0],degreeOverride:2,technique:'diatonic-relative-minor'};
   development.push({kind:'diatonic-color',at:repeated.at,end:repeated.end,chords:[repeated.label,pool[0].label],fromDegree:4,toDegree:2});
  }
 }
 for(let i=0;i<segments.length-1;i++){
  const s=segments[i],target=segments[i+1];
  if(s.kind!=='dominant'||s.function?.kind!=='dominant'||target.quality!=='m7'
    ||s.end-s.at<map.pulse*.8||s.end-s.at>map.pulse*1.6||s.source.end<s.end)continue;
  const nextBeat=map.points.find(p=>Math.abs(p.time-s.end)<1e-6)?.beat;
  if(nextBeat==null)continue;
  const beat=(s.beat+nextBeat)/2,at=map.at(beat);
  if(at-s.at<.18||s.end-at<.18)continue;
  const before={...s,end:at,target:{at,rootPc:s.rootPc},relays:[]};
  const spec={rootPc:pc(s.rootPc+7),quality:'m11b5',rootBass:true,warm:true,
   function:{kind:'predominant',targetRootPc:s.rootPc}};
  const pool=candidates(before,spec).filter(v=>resolvingVoices(v,s));
  pool.sort((a,b)=>a.cost+voiceLeadingCost(a.notes,s.notes)-b.cost-voiceLeadingCost(b.notes,s.notes));
  if(!pool.length)continue;
  const first={...before,...pool[0]},second={...s,at,beat,relays:[]};
  if(!resolvingVoices(second,target))continue;
  segments.splice(i,1,first,second);
  development.push({kind:'seven-three',at:s.at,via:at,end:target.at,chords:[first.label,second.label,target.label]});
  break;
 }
 // Une neuvième haute sous une note répétée : ne pas la laisser frotter sous
 // la descente suivante. Le silence de cette voix ne vide jamais l'accord.
 for(let i=0;i<segments.length;i++){
  const s=segments[i];if(s.kind!=='arrival'||s.quality!=='m7'||s.function||s.end-s.at<map.pulse*4)continue;
  const repeated=pairs.filter(p=>p.event.note===s.source.event.note&&p.event.time>s.at+map.pulse&&p.event.time<s.end-map.pulse*.5);
  let inserted=false;
  for(const p of repeated){
   const next=pairs.find(q=>q.event.time>p.event.time+.075),end=Math.min(next?.event.time??s.end,p.end,s.end);
   if(end-p.event.time<.2)continue;
   const sounding=pairs.filter(q=>q.event.time<end&&q.end>p.event.time);
   for(let n=p.event.note-3;n>=Math.max(60,s.notes[0]+1);n--){
    if(pc(n-s.rootPc)!==2||s.notes.includes(n)||sounding.some(q=>q.event.note===n||n>=q.event.note||[1,13].includes(q.event.note-n)))continue;
    const notes=[...s.notes,n].sort((a,b)=>a-b);
    if(voicedQuality(notes,s.rootPc,'m9')!=='m9')continue;
    const times=[p.event.time,...sounding.flatMap(q=>[q.event.time,q.end]).filter(t=>t>p.event.time&&t<end)];
    if(!times.every(t=>handDistribution([...notes.filter(v=>v!==s.source.event.note),...sounding.filter(q=>q.event.time<=t&&q.end>t).map(q=>q.event.note)])))continue;
    const holdGroup='inner:'+s.at;
    const inner={...s,source:p,at:p.event.time,end,notes,quality:'m9',label:s.label.replace('mineur 7','mineur 9'),kind:'inner',technique:'held-inner-ninth',relays:[],holdGroup};
    const after={...s,at:end,kind:'inner',technique:'held-inner-return',relays:[],holdGroup};
    segments.splice(i,1,{...s,end:p.event.time,holdGroup},inner,after);
    development.push({kind:'inner-color',at:p.event.time,end,note:n,chords:[s.label,inner.label,s.label]});
    inserted=true;break;
   }
   if(inserted)break;
  }
  if(inserted)break;
 }
 return {segments,development:development.sort((a,b)=>a.at-b.at)};
}

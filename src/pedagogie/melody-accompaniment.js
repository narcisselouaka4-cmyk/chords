import {notePairs,applyTakeEdit} from './take-edit.js';
import {reviewTake} from '../recorder/take-review.js';
import {harmonyVoicings} from './fixed-harmony.js';
import {arrangementFrames} from './phrase-arrangement.js';
import {extractKey} from './intent-classifier.js';
import {parseChordName} from './note-roles.js';
import {handDistribution,voicedQuality} from './piano-voicing.js';
import {phrasePedal} from './proposal-pedal.js';
import {comparedTakeExample} from './playing-diff.js';
import {requestedDegreeProgression,buildDegreeAccompaniment} from './melody-progression.js';
import {voiceLeadingCost,chordToneIntervals} from '../practice-exercise.js';
const pc=n=>(n%12+12)%12;
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];

/** Une ligne avec legato n'est pas une grille : ne pas transformer ses chevauchements en accords joués. */
export function melodySource(take){
 if(!take?.events?.length)return null;
 const pairs=notePairs(take.events).sort((a,b)=>a.event.time-b.event.time);
 if(pairs.length<8||pairs.length>512||arrangementFrames(take).length>=3)return null;
 const attacks=pairs.filter((p,i)=>!i||p.event.time-pairs[i-1].event.time>.075);
 const mostlySingle=attacks.filter(p=>pairs.filter(q=>Math.abs(q.event.time-p.event.time)<.075).length===1).length/attacks.length;
 return mostlySingle>=.8?{pairs,attacks}:null;
}

/** Drop 2 réel d'un accord de quatre sons : la deuxième voix depuis le haut descend d'une octave. */
function dropTwoCandidates(rootPc,quality,ceiling){
 const tones=chordToneIntervals(quality);if(tones.size!==4)return [];
 const out=[];
 for(let top=ceiling;top>=ceiling-11;top--){
  if(!tones.has(pc(top-rootPc)))continue;
  const close=[...tones].map(t=>{let n=top;while(pc(n-rootPc)!==t)n--;return n;}).sort((a,b)=>a-b);
  const notes=[close[0],close[1],close[2]-12,close[3]].sort((a,b)=>a-b);
  if(notes[0]<28||voicedQuality(notes,rootPc,quality)!==quality)continue;
  const names=['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  out.push({rootPc,quality,notes,technique:'drop2',label:`${names[rootPc]}${quality}${pc(notes[0])===rootPc?'':`/${names[pc(notes[0])]}`}`});
 }
 return out;
}

export function melodyTechniqueAnswer({message,context}){
 const take=context?.playing?.passage;
 if(requestedDegreeProgression(message)||/accord.melodie|arrivees?/.test(plain(message)))return null;
 if(!take||!melodySource(take)||!/(?:ecout|entendre|joue|demonstration)/.test(plain(message))||!/drop\s*2/.test(plain(message)))return null;
 const token=/\b([A-G][#b]?(?:add9|maj9|maj7|m11|m9|m7|9|7))\b/i.exec(message)?.[1];
 const target=token&&parseChordName(token[0].toUpperCase()+token.slice(1));
 const variant=target&&buildMelodyAccompaniment(take,{message,target,technique:'drop2'});
 const base={played:[],ignored:0,suggestions:[],voicing:null,originalTake:take};
 if(!variant)return {ok:true,content:'J’ai bien ta session. Je n’ai pas trouvé de drop 2 vérifiable pour cet accord qui conserve tes notes à cet endroit. Je peux te proposer un accompagnement sous la mélodie.',toolResult:{...base,example:null},suggestedActions:[{label:'Accompagner ma mélodie',message:'Fais-moi entendre un accompagnement sous ma mélodie.'}],autoplay:false};
 return {ok:true,content:'J’ai ajouté un vrai drop 2 sous ce passage : une voix de l’accord descend d’une octave. Tes notes restent intactes ; compare ce qui change à partir de 0:'+String(Math.floor(variant.harmony[0].at)).padStart(2,'0')+'.',
 toolResult:{...base,example:variant.example,playingAdvice:variant.advice,variants:[variant]},suggestedActions:[],autoplay:true};
}

/** Ajouter un accompagnement proposé ; aucun événement mélodique supprimé ou déplacé. */
export function buildMelodyAccompaniment(take,{message='',target=null,technique=null}={}){
 const source=melodySource(take);if(!source)return null;
 const {pairs,attacks}=source,text=plain(message),review=reviewTake(take.events);
 if(/hasard|n'importe quoi|aleatoire|sans intention|test des touches|basses?\s*:|bassiste|sans ajouter de basse|(?:garde|conserv).*basse|(?:basse|cycle|parcours).*quartes/.test(text))return null;
 const progression=requestedDegreeProgression(message);
 if(progression&&!target)return buildDegreeAccompaniment(take,{message,request:progression});
 const key=extractKey(message)||extractKey(`en ${take.key||''}`)||
   (review.key?.confidence>=.7?{rootPc:review.key.pc,minor:review.key.mode==='minor'}:null);
 if(!key)return null;
 const palette=pc(key.rootPc+(key.minor?3:0)),scale=[0,2,4,5,7,9,11].map(n=>pc(palette+n));
 if(pairs.filter(p=>scale.includes(pc(p.event.note))).length/pairs.length<.92)return null;
 const gaps=attacks.slice(1).map((p,i)=>p.event.time-attacks[i].event.time).filter(t=>t>=.2&&t<=1.5);
 const spacing=Math.max(.8,Math.min(1.6,(median(gaps)||.5)*2));
 let windows=[];
 if(target){
  for(const c of review.chords.filter(c=>c.matched&&pc(c.rootPc)===target.rootPc)){
   const tones=chordToneIntervals(target.quality);
   const firstForeign=pairs.find(p=>p.event.time>c.at+.08&&p.event.time<c.end&&!tones.has(pc(p.event.note-target.rootPc)));
   windows.push({at:c.at,end:Math.min(c.end,firstForeign?.event.time??c.end)-.025});
  }
 }else{
  let last=-Infinity;
  for(const p of attacks){
   if(p.event.time-last<spacing-.08)continue;
   windows.push({at:p.event.time});last=p.event.time;
  }
  windows=windows.map((w,i)=>({...w,end:Math.min(windows[i+1]?.at??take.duration,
   Math.max(...pairs.filter(p=>p.event.time>=w.at&&p.event.time<(windows[i+1]?.at??take.duration)).map(p=>p.end)))-.03}));
 }
 if(!windows.length)return null;
 const specs=target?[target]:[
  [0,'maj9'],[2,'m9'],[4,'m7'],[5,'maj9'],[7,'13'],[9,'m9'],[7,'9sus4'],
 ].map(([degree,quality])=>({rootPc:pc(palette+degree),quality}));
 const cache=new Map(),segments=[];let previous=null;
 for(const w of windows){
  const sounding=pairs.filter(p=>p.event.time<w.end&&p.end>w.at);
  if(!sounding.length||w.end-w.at<.2)continue;
  const ceiling=Math.min(...sounding.map(p=>p.event.note))-1;
  if(ceiling<48)continue;
  const checkpoints=[w.at,...sounding.flatMap(p=>[p.event.time,p.end]).filter(t=>t>w.at&&t<w.end)];
  const candidates=[];
  for(const spec of specs){
   const tones=chordToneIntervals(spec.quality);
   // Une couleur soutient la phrase locale ; pas une gamme plaquée sur les notes de passage.
   const foreign=sounding.filter(p=>!tones.has(pc(p.event.note-spec.rootPc)));
   if(foreign.some(p=>p.end-p.event.time>.7)||foreign.length/sounding.length>.4)continue;
   const bass=48-((48-spec.rootPc+12)%12);
   for(let top=ceiling;top>=ceiling-7;top--){
    if(!tones.has(pc(top-spec.rootPc)))continue;
    const id=`${spec.rootPc}:${spec.quality}:${top}:${technique}`;
    if(!cache.has(id))cache.set(id,technique==='drop2'?dropTwoCandidates(spec.rootPc,spec.quality,top):harmonyVoicings({topMidi:top,bassMidi:bass,notes:[bass,top]},
      {...spec,preserveBass:false,...(technique?{technique}:{}),chromatic:false},{palette}));
    for(const v of cache.get(id)){
     if(!checkpoints.every(t=>handDistribution([...v.notes,...sounding.filter(p=>p.event.time<=t&&p.end>t).map(p=>p.event.note)])))continue;
     const first=sounding.filter(p=>p.event.time<=w.at+.08&&p.end>w.at).sort((a,b)=>b.event.note-a.event.note)[0];
     const cost=foreign.length*12+(first&&pc(first.event.note)===spec.rootPc?-6:0)+(first&&!tones.has(pc(first.event.note-spec.rootPc))?20:0)
       +(previous?voiceLeadingCost(previous.notes,v.notes):Math.abs(v.notes[0]-48))
       +Math.max(0,v.notes.length-4)*2+(previous?.rootPc===v.rootPc?8:0);
     candidates.push({...v,cost});
    }
   }
  }
  const chosen=candidates.sort((a,b)=>a.cost-b.cost)[0];if(!chosen)continue;
  segments.push({...w,...chosen,topMidi:Math.max(...sounding.map(p=>p.event.note))});previous=chosen;
 }
 if(!segments.length||!target&&segments.length<Math.ceil(windows.length*.6))return null;
 const notes=segments.flatMap(s=>s.notes.map(note=>({note,time:s.at,end:s.end,velocity:.3})));
 const keepPedal=/garde.*pedale|conserv.*pedale/.test(text),dry=/sans pedale|sans sustain/.test(text);
 const edit={type:'arrangement',remove:[],keep:pairs.map(p=>p.on),notes,replacePedal:!keepPedal,pedal:keepPedal||dry?[]:phrasePedal(segments,pairs,take.duration)};
 const changed=applyTakeEdit(take,edit);if(!changed)return null;
 const title=target?'Ton passage, autrement disposé':'Ta mélodie accompagnée';
 const description=target?'Une disposition ajoutée sous les notes du passage, qui restent intactes.':'Des accords proposés sous ta mélodie. Tes notes et ton rythme sont conservés.';
 const changes=segments.map(s=>({at:s.at,end:s.end,chord:s.label,notes:s.notes,rootPc:s.rootPc,quality:s.quality,technique:s.technique,topMidi:s.topMidi,goal:'accompany',kind:'accompaniment'}));
 const advice={version:8,id:'melody-accompaniment',goal:'accompany',take,edit,changes,text:description};
 const example=comparedTakeExample(take,changed);if(!example)return null;
 return {id:'melody-accompaniment',title,description,advice,harmony:changes,example:{...example,title,subtitle:description}};
}

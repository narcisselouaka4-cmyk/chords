// Construction de phrase, sans copier une session ni ajouter de ligne scalaire.
import {reviewTake} from '../recorder/take-review.js';
import {parseChordName} from './note-roles.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {harmonyVoicings} from './fixed-harmony.js';
import {resolvingVoices,pitchClass as pc} from './harmonic-intentions.js';
import {voiceLeadingCost} from '../practice-exercise.js';
import {comparedTakeExample} from './playing-diff.js';
import {extractKey} from './intent-classifier.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const minor=q=>/^m(?!aj)/.test(q);
const velocity=p=>Math.min(.8,p.event.velocity>1?p.event.velocity/127:p.event.velocity);

export function arrangementFrames(take) {
  const review=reviewTake(take.events),pairs=notePairs(take.events),frames=[];
  if(!review)return [];
  for(const c of review.chords){
    const chord=parseChordName(c.name);if(!chord)continue;
    const cluster=pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<=c.at+.36);
    const held=cluster.filter(p=>p.end-p.event.time>=.22);
    if(held.length<3)continue;
    const top=held.reduce((a,b)=>a.event.note>b.event.note?a:b);
    const bass=held.reduce((a,b)=>a.event.note<b.event.note?a:b);
    if(top.event.note-bass.event.note<9)continue;
    // Une étiquette incertaine n'est admise qu'avec fondamentale et tierce/5te
    // réellement jouées après retrait des petites notes d'approche.
    const pcs=new Set(held.map(p=>pc(p.event.note-chord.rootPc)));
    if(!c.matched&&!(pcs.has(0)&&pcs.has(minor(chord.quality)?3:4)&&pcs.has(7)))continue;
    const start=Math.max(c.at,bass.event.time);
    const accompaniment=held.filter(p=>p!==top&&p.event.note<top.event.note);
    if(!accompaniment.length)continue;
    frames.push({at:start,end:c.end,chord,source:held,notes:held.map(p=>p.event.note).sort((a,b)=>a-b),
      topMidi:top.event.note,bassMidi:bass.event.note,top,accompaniment});
  }
  return frames;
}

function qualityChoices(f){
  const q=f.chord.quality;
  if(/sus/.test(q))return ['9sus4','7sus4'];
  if(minor(q))return ['m9','m11','m7'];
  if(/^(7|9|13)/.test(q))return ['13','9','7b9','7'];
  return ['maj9','6/9','maj7'];
}

function choose(f,rootPc,qualities,previous,melody,start,end,{preserveBass=false,target=null,palette=null}={}){
  const sounding=melody.filter(p=>p.event.time<end&&p.end>start);
  const checkpoints=[start,...sounding.flatMap(p=>[p.event.time,p.end]).filter(t=>t>start&&t<end)];
  const tops=checkpoints.map(t=>sounding.filter(p=>p.event.time<=t+.00001&&p.end>t+.00001)
    .map(p=>p.event.note).filter(n=>n>f.bassMidi+5)).filter(ns=>ns.length).map(ns=>Math.max(...ns));
  const ceiling=Math.min(f.topMidi,...tops);
  const candidates=[];
  // Un dessus joué pendant la fenêtre reste la limite réelle du voicing.
  for(let topMidi=ceiling;topMidi>=Math.max(48,ceiling-12);topMidi--){
    for(const quality of qualities){
      for(const v of harmonyVoicings({...f,topMidi},{rootPc,quality,preserveBass,chromatic:palette==null},{palette})){
        const fun=target?{kind:'dominant',targetRootPc:target.rootPc}:null;
        if(target&&!resolvingVoices({...v,function:fun},target))continue;
        candidates.push({...v,function:fun,cost:voiceLeadingCost(previous||f.notes,v.notes)
          +qualities.indexOf(quality)*4+(target?2*voiceLeadingCost(v.notes,target.notes):0)+Math.abs(v.notes[0]-f.bassMidi)*.4});
      }
    }
    if(candidates.length>24)break;
  }
  return candidates.sort((a,b)=>a.cost-b.cost)[0]||null;
}

/** Une version construite sur la phrase ; les autres cartes restent disponibles. */
export function buildPhraseArrangement(take,{message='',latin=false}={}){
  const text=plain(message);
  if(latin||/sans (?:aucun )?mouvement|pas de mouvements|(?:uniquement|seulement).*accords? (?:fixes|enrichis)|basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text))return null;
  const frames=arrangementFrames(take);if(frames.length<3||frames.length>48)return null;
  const pairs=notePairs(take.events);
  const remove=new Set(frames.flatMap(f=>f.accompaniment.map(p=>p.on)));
  const keepBass=/garde.*basse|conserv.*basse|ne change pas.*basse|bassiste|sans ajouter de basse|basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text);
  if(keepBass)for(const f of frames){const bass=f.source.find(p=>p.event.note===f.bassMidi);if(bass)remove.delete(bass.on);}
  const melody=pairs.filter(p=>!remove.has(p.on));
  const noPassing=keepBass||/sans reharmonis|garde.*accords|conserv.*accords/.test(text)||/sans (?:accords? de )?passages?|pas d['’]accords? de passage|sans mouvement/.test(text);
  // Les CC de l'utilisateur restent sa référence : pas de remplacement arbitraire.
  const hasPedal=take.events.some(e=>e.type==='control'&&e.controller===64);
  const statedKey=extractKey(message)||extractKey(`en ${take.key||''}`);
  const tones=new Set(pairs.map(p=>pc(p.event.note)));
  const compatible=Array.from({length:12},(_,r)=>r).filter(r=>[...tones].every(n=>[0,2,4,5,7,9,11].some(i=>pc(r+i)===n)));
  // Une collection diatonique peut borner les notes sans inventer sa tonique.
  const palette=statedKey?pc(statedKey.rootPc+(statedKey.minor?3:0)):compatible.length===1?compatible[0]:null;
  const segments=[];let previous=null;
  for(let i=0;i<frames.length;i++){
    const f=frames[i],end=Math.min(f.end,frames[i+1]?.at??take.duration)-.025;
    const v=choose(f,f.chord.rootPc,((palette!=null&&pc(f.chord.rootPc-palette)===7&&!minor(f.chord.quality))?['13','9','7']:qualityChoices(f)),previous?.notes,melody,f.at,end,{preserveBass:true,palette});
    if(!v||(keepBass&&v.notes[0]!==f.bassMidi)){
      // Une position non résolue ne fait pas disparaître toute la phrase :
      // garder exactement cet accord et travailler les autres destinations.
      for(const p of f.accompaniment)if(remove.delete(p.on))melody.push(p);
      segments.push({at:f.at,end,frame:f,rootPc:f.chord.rootPc,quality:f.chord.quality,notes:f.notes,label:f.chord.name,kind:'original',unchanged:true});
      previous={notes:f.notes};continue;
    }
    segments.push({at:f.at,end,frame:f,...v,kind:'enrich'});previous=v;
  }
  // Destinations choisies avant les positions. Une cadence ne remplit pas chaque
  // interstice : d'abord les longues phrases, puis au plus trois préparations.
  const targets=frames.map((f,i)=>({f,i,span:i?f.at-frames[i-1].at:0}))
    .filter(x=>x.i&&x.span>=1.5&&x.span<=6&&!/sus|dim|aug/.test(x.f.chord.quality))
    .sort((a,b)=>Number(minor(b.f.chord.quality))-Number(minor(a.f.chord.quality))||b.span-a.span);
  let count=0;
  if(!noPassing&&!hasPedal)for(const {f,i,span} of targets){
    if(count>=3)break;
    const base=segments.find(s=>s.frame===frames[i-1]&&s.kind==='enrich');
    const target=segments.find(s=>s.frame===f&&['enrich','original'].includes(s.kind));
    if(!base||base.unchanged||!target||base.end-base.at<.8)continue;
    const end=f.at-.045,start=f.at-Math.min(.88,span*.36);
    if(start-base.at<.6)continue;
    const tritone=!minor(f.chord.quality)&&minor(base.frame.chord.quality)&&pc(base.rootPc-f.chord.rootPc)===7;
    const dominant=choose(base.frame,pc(f.chord.rootPc+(tritone?1:7)),tritone?['13#11','9','7b9']:['7b9','7#5','9','13','7'],base.notes,melody,start,end,{target});
    if(!dominant)continue;
    let lead=null;
    if(minor(f.chord.quality)&&span>=2.1){
      const leadStart=start-Math.min(.55,span*.22),leadEnd=start-.045;
      if(leadStart-base.at>=.45)lead=choose(base.frame,pc(f.chord.rootPc+2),['m7b5'],base.notes,melody,leadStart,leadEnd);
      if(lead){segments.push({...lead,at:leadStart,end:leadEnd,frame:base.frame,kind:'iiø'});base.end=Math.min(base.end,leadStart-.035);}
    }
    base.end=Math.min(base.end,start-.035);
    segments.push({...dominant,at:start,end,frame:base.frame,kind:'dominant',targetAt:f.at});count++;
  }
  // Une arrivée tonique n'est ajoutée en fin de phrase que si la tonalité est
  // explicite et que la note finale tenue appartient réellement à cette couleur.
  const key=statedKey,last=segments.filter(s=>s.kind==='enrich').at(-1);
  if(!noPassing&&!hasPedal&&key&&!key.minor&&last&&minor(last.quality)&&pc(last.rootPc-key.rootPc)===4){
    const finalTop=melody.filter(p=>p.event.time>=last.at&&p.end>=take.duration-.12).sort((a,b)=>b.event.note-a.event.note)[0];
    if(finalTop&&take.duration-last.at>=1.7){
      const arrival=last.at+(take.duration-last.at)*.55;
      const tonic=choose({...last.frame,topMidi:finalTop.event.note},key.rootPc,['maj9','6/9','maj7'],last.notes,melody,arrival,take.duration);
      const dom=tonic&&choose(last.frame,pc(key.rootPc+7),['7b9','7#5','9'],last.notes,melody,last.at,arrival-.045,{target:tonic});
      if(dom){Object.assign(last,dom,{end:arrival-.045,kind:'dominant',targetAt:arrival});segments.push({...tonic,at:arrival,end:take.duration,frame:last.frame,kind:'tonic'});count++;}
    }
  }
  if(segments.filter(s=>!s.unchanged).length<2)return null;
  segments.sort((a,b)=>a.at-b.at);
  const notes=[];
  for(const s of segments){
    if(s.unchanged)continue;
    const v=Math.max(.18,Math.min(.48,velocity(s.frame.top)*.65));
    for(const n of s.notes){
      if(keepBass&&n===s.frame.bassMidi)continue;
      const overlap=melody.filter(p=>p.event.note===n&&p.event.time<s.end&&p.end>s.at);
      let cursor=s.at;
      // Une note originale de même hauteur est prioritaire ; aucun doublon MIDI.
      for(const p of overlap.sort((a,b)=>a.event.time-b.event.time)){
        if(p.event.time-cursor>.12)notes.push({note:n,time:cursor,end:p.event.time-.025,velocity:v});
        cursor=Math.max(cursor,p.end+.025);
      }
      if(s.end-cursor>=.12)notes.push({note:n,time:cursor,end:s.end,velocity:v*(n===s.notes[0] ? .85 : 1)});
    }
  }
  const pedal=[];
  const noPedal=/sans pedale|sans sustain|sec\b/.test(text);
  if(!hasPedal&&!noPedal){
    for(let i=0;i<segments.length;i++){
      const s=segments[i],next=segments[i+1]?.at??take.duration+.32;
      const on=s.at+.035,off=Math.min(next-.045,take.duration+.32);
      if(off-on>=.12)pedal.push({time:on,value:127},{time:off,value:0});
    }
  }
  const edit={type:'arrangement',remove:[...remove],keep:melody.map(p=>p.on),notes,pedal};
  const changed=applyTakeEdit(take,edit);if(!changed)return null;
  const example=comparedTakeExample(take,changed);if(!example)return null;
  const title='Une progression construite';
  const description=count?'Des accords enrichis et des tensions qui préparent les arrivées, sous ta mélodie.'
    :'Des accords enrichis sur la phrase, en gardant tes notes mélodiques.';
  const changes=segments.map(s=>({at:s.at,end:s.end,chord:s.label,notes:s.notes,goal:s.kind==='original'?'preserved':s.kind==='enrich'?'enrich':'passing',kind:s.kind,targetAt:s.targetAt}));
  const advice={version:6,id:'phrase:arrangement',goal:'develop',take,edit,changes,text:description};
  return {id:'arrangement',title,description,advice,harmony:changes,example:{...example,title,subtitle:description}};
}

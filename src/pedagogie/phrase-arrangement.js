import {handDistribution,voicedQuality} from './piano-voicing.js';
import {phrasePedal} from './proposal-pedal.js';
import {sourceKeyConflict} from './playing-harmony-facts.js';
import {referenceVoicing,referenceFinalDominant} from './reference-voicings.js';
// Construction de phrase, sans copier une session ni ajouter de ligne scalaire.
import {reviewTake} from '../recorder/take-review.js';
import {parseChordName} from './note-roles.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {harmonyVoicings} from './fixed-harmony.js';
import {resolvingVoices,pitchClass as pc} from './harmonic-intentions.js';
import {voiceLeadingCost} from '../practice-exercise.js';
import {comparedTakeExample} from './playing-diff.js';
import {extractKey} from './intent-classifier.js';
import {accompanimentPerformance} from './arrangement-performance.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const minor=q=>/^m(?!aj)/.test(q);
const velocity=p=>Math.min(.8,p.event.velocity>1?p.event.velocity/127:p.event.velocity);

export function arrangementFrames(take) {
  const review=reviewTake(take.events),pairs=notePairs(take.events),frames=[];
  if(!review)return [];
  for(const c of review.chords){
    const chord=parseChordName(c.name);if(!chord)continue;
    let cluster=pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<=Math.min(c.end,c.at+.36));
    let held=cluster.filter(p=>p.end-p.event.time>=.22),rolledSource=false;
    // Basse et dessus peuvent précéder les voix intérieures d'un accord roulé.
    // Compléter seulement sous ce dessus déjà établi, dans la même harmonie,
    // avec des notes réellement tenues ensemble ; jamais avaler la suite de
    // la mélodie pour fabriquer artificiellement un accord à trois notes.
    if(held.length===2&&held.every(p=>Math.abs(p.event.time-c.at)<=.09)){
      const ceiling=Math.max(...held.map(p=>p.event.note));
      const floor=Math.min(...held.map(p=>p.event.note));
      const tones=new Set(c.notes.map(pc));
      const extra=pairs.filter(p=>p.event.time>c.at+.36&&p.event.time<Math.min(c.end,c.at+.75)
        &&p.event.note>floor&&p.event.note<ceiling&&tones.has(pc(p.event.note))
        &&p.end-p.event.time>=.22);
      const extended=[...held,...extra],last=Math.max(...extended.map(p=>p.event.time));
      if(extra.length&&extended.every(p=>p.end>=last+.08)){
        held=extended;cluster=[...cluster,...extra];rolledSource=true;
      }
    }
    if(held.length<3)continue;
    const top=held.reduce((a,b)=>a.event.note>b.event.note?a:b);
    const bass=held.reduce((a,b)=>a.event.note<b.event.note?a:b);
    if(top.event.note-bass.event.note<9)continue;
    // Une étiquette incertaine n'est admise qu'avec fondamentale et tierce/5te
    // réellement jouées après retrait des petites notes d'approche.
    const pcs=new Set(held.map(p=>pc(p.event.note-chord.rootPc)));
    if(!c.matched&&!(pcs.has(0)&&pcs.has(minor(chord.quality)?3:4)&&pcs.has(7)))continue;
    const innerStart=Math.min(...held.filter(p=>p!==bass&&p!==top).map(p=>p.event.time));
    const start=Math.max(c.at,bass.event.time,innerStart-bass.event.time<.075?innerStart:bass.event.time);
    const accompaniment=cluster.filter(p=>p!==top&&p.event.note<top.event.note
      &&(p.end-p.event.time>=.22||p.event.note<top.event.note-4));
    if(!accompaniment.length)continue;
    frames.push({at:start,end:c.end,chord,source:held,notes:held.map(p=>p.event.note).sort((a,b)=>a-b),
      topMidi:top.event.note,bassMidi:bass.event.note,top,accompaniment,rolledSource});
  }
  return frames;
}

function qualityChoices(f){
  const q=f.chord.quality;
  if(/dim|°/.test(q))return ['dim7'];
  if(/sus/.test(q))return ['9sus4','7sus4'];
  if(minor(q))return ['m9','m11','m7'];
  // Une altération déjà jouée fait partie de la phrase, en particulier après
  // une suspension. L'enrichissement ne doit pas effacer cette résolution.
  if(/b9/.test(q))return ['7b9b13','7b9'];
  if(/#9/.test(q))return ['7#9'];
  if(q==='maj9')return ['maj9','6/9'];
  if(/^(7|9|13)/.test(q))return ['13','9','7b9','7'];
  return ['maj9','6/9','maj7'];
}

function choose(f,rootPc,qualities,previous,melody,start,end,{preserveBass=false,target=null,palette=null,reference=true}={}){
  const sounding=melody.filter(p=>p.event.time<end&&p.end>start);
  const checkpoints=[start,...sounding.flatMap(p=>[p.event.time,p.end]).filter(t=>t>start&&t<end)];
  const tops=checkpoints.map(t=>sounding.filter(p=>p.event.time<=t+.00001&&p.end>t+.00001)
    .map(p=>p.event.note).filter(n=>n>f.bassMidi+5)).filter(ns=>ns.length).map(ns=>Math.max(...ns));
  const ceiling=Math.min(f.topMidi,...tops);
  const playable=notes=>checkpoints.every(t=>handDistribution([...notes,...sounding.filter(p=>p.event.time<=t+.00001&&p.end>t+.00001).map(p=>p.event.note)]));
  let preferred=reference&&referenceVoicing(f,rootPc,qualities,ceiling,target);
  if(preferred){
    // Une basse isolée trop grave ne doit pas imposer six notes à l'autre main.
    const original=preferred.notes;
    const options=[original,[...new Set([original[0]+12,...original.slice(1)])].sort((a,b)=>a-b)];
    const notes=options.find(ns=>ns.at(-1)<=ceiling&&playable(ns));
    const quality=notes&&voicedQuality([...notes,f.topMidi],rootPc,preferred.quality);
    preferred=quality===preferred.quality&&qualities.includes(preferred.quality)?{...preferred,notes}:null;
  }
  if(preferred&&(!preserveBass||pc(preferred.notes[0])===pc(f.bassMidi))
    &&(palette==null||preferred.notes.every(n=>[0,2,4,5,7,9,11].some(i=>pc(palette+i)===pc(n))))) {
    const fun=target?{kind:'dominant',targetRootPc:target.rootPc}:null;
    if(!target||resolvingVoices({...preferred,function:fun},target))return {...preferred,function:fun};
  }
  const candidates=[];
  // Un dessus joué pendant la fenêtre reste la limite réelle du voicing.
  for(let topMidi=ceiling;topMidi>=Math.max(48,ceiling-12);topMidi--){
    for(const quality of qualities){
      for(const v of harmonyVoicings({...f,topMidi},{rootPc,quality,preserveBass,chromatic:palette==null},{palette})){
        if(!playable(v.notes)||voicedQuality(v.notes,rootPc,v.quality)!==v.quality)continue;
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

/** Une version construite sur la phrase ; les autres cartes restent disponibles.
 * useReferenceVoicings=false isole la grammaire de référence pour l'évaluation.
 * La grammaire de référence reste activée par défaut. */
export function buildPhraseArrangement(take,{message='',latin=false,voicingMode='open',useReferenceVoicings=true}={}){
  const reference=useReferenceVoicings;
  const text=plain(message);
  if(latin||/basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text))return null;
  const fixedOnly=/sans (?:aucun )?(?:mouvement|passage|ajout rythmique)|(?:uniquement|seulement).*accords? (?:fixes|enrichis)|pas de mouvements?/.test(text);
  const frames=arrangementFrames(take);if(frames.length<3||frames.length>48)return null;
  const pairs=notePairs(take.events);
  const remove=new Set(frames.flatMap(f=>f.accompaniment.map(p=>p.on)));
  const keepBass=/garde.*basse|conserv.*basse|ne change pas.*basse|bassiste|sans ajouter de basse|basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text);
  if(keepBass)for(const f of frames){const bass=f.source.find(p=>p.event.note===f.bassMidi);if(bass)remove.delete(bass.on);}
  const melody=pairs.filter(p=>!remove.has(p.on));
  const noPassing=fixedOnly||keepBass||/sans reharmonis|garde.*accords|conserv.*accords/.test(text)||/sans (?:accords? de )?passages?|pas d['’]accords? de passage|sans mouvement/.test(text);
  // Les CC de l'utilisateur restent sa référence : pas de remplacement arbitraire.
  const hasPedal=take.events.some(e=>e.type==='control'&&e.controller===64);
  const explicitKey=extractKey(message);
  let statedKey=explicitKey||extractKey(`en ${take.key||''}`);
  // Une étiquette de session n'est pas une contrainte demandée par le pianiste.
  // Si les accords de tonique joués contredisent son mode, ne forcer ni leur
  // tierce ni toute la phrase dans cette gamme. La source reste inchangée.
  if(!explicitKey&&sourceKeyConflict(statedKey,frames.map(f=>f.chord)))statedKey=null;
  const tones=new Set(pairs.map(p=>pc(p.event.note)));
  const compatible=Array.from({length:12},(_,r)=>r).filter(r=>[...tones].every(n=>[0,2,4,5,7,9,11].some(i=>pc(r+i)===n)));
  // Une collection diatonique peut borner les notes sans inventer sa tonique.
  const palette=statedKey?pc(statedKey.rootPc+(statedKey.minor?3:0)):compatible.length===1?compatible[0]:null;
  // Une note empruntée peut empêcher toute palette strictement diatonique.
  // Une cadence V-I réellement jouée fournit néanmoins une preuve de la
  // dominante. Ne pas dépendre ici d'une estimation globale de tonalité, ni
  // remplacer une septième majeure explicitement jouée par une dominante.
  const sourceReview=reviewTake(take.events);
  const dominantRoots=new Set((sourceReview?.cadences||[]).filter(c=>c.type==='v-i').flatMap(c=>{
    const from=parseChordName(c.chords[0]),to=parseChordName(c.chords[1]);
    return from&&to&&/^(7|9|13)/.test(from.quality)&&pc(from.rootPc-to.rootPc)===7?[from.rootPc]:[];
  }));
  const segments=[];let previous=null;
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    // La fin de la mélodie n'est pas celle de l'accompagnement : les basses et
    // voix intérieures peuvent rester tenues sous plusieurs notes du dessus.
    // Respecter aussi les vrais silences et toute nouvelle harmonie source.
    const end=Math.min(f.end,frames[i+1]?.at??take.duration,
      Math.max(...f.accompaniment.map(p=>p.end)))-.025;
    const later=melody.filter(p=>p.event.time>f.at+.45&&p.event.time<end&&p.end-p.event.time>=.22).sort((a,b)=>a.event.time-b.event.time);
    const triad=minor(f.chord.quality)?[0,3,7]:[0,4,7];
    const arp=later.length>=3&&later.slice(0,3).every((p,j)=>triad.includes(pc(p.event.note-f.chord.rootPc))
      &&(!j||p.event.note>later[j-1].event.note))?later[0]:null;
    if(!arp){
      const accompanimentPitches=new Set(f.accompaniment.map(p=>p.event.note));
      for(const p of later)if(accompanimentPitches.has(p.event.note)&&p.event.note<f.topMidi-4
        &&p.event.time<f.top.end&&velocity(p)<=velocity(f.top)*.9){
        remove.add(p.on);const index=melody.indexOf(p);if(index>=0)melody.splice(index,1);
      }
    }
    const qualities=(palette!=null&&pc(f.chord.rootPc-palette)===7||dominantRoots.has(f.chord.rootPc))
      &&!minor(f.chord.quality)&&!/maj|sus|dim|aug|[b#](?:5|9|11|13)/.test(f.chord.quality)
      ?['13','9','7']:qualityChoices(f);
    // Si l'attaque ne fournit même pas trois classes de hauteur, le nom dépend
    // des notes déjà tenues : garder sa basse de renversement pendant l'arpège,
    // plutôt que d'imposer une nouvelle fondamentale sur cette preuve partielle.
    const inversion=f.chord.bassPc!=null&&f.chord.bassPc!==f.chord.rootPc
      &&pc(f.bassMidi)===f.chord.bassPc&&new Set(f.source.map(p=>pc(p.event.note))).size<3;
    const v=choose(f,f.chord.rootPc,qualities,previous?.notes,melody,f.at,end,{preserveBass:keepBass||inversion||f.rolledSource,palette,reference:reference&&voicingMode!=='linked'});
    if(!v||(keepBass&&v.notes[0]!==f.bassMidi)){
      // Une position non résolue ne fait pas disparaître toute la phrase :
      // garder exactement cet accord et travailler les autres destinations.
      for(const p of f.accompaniment)if(remove.delete(p.on))melody.push(p);
      segments.push({at:f.at,end,frame:f,rootPc:f.chord.rootPc,quality:f.chord.quality,notes:f.notes,label:f.chord.name,kind:'original',unchanged:true});
      previous={notes:f.notes};continue;
    }
    segments.push({at:f.at,end,frame:f,...v,kind:'enrich'});
    previous=v;
  }
  // Destinations choisies avant les positions. Une cadence ne remplit pas chaque
  // interstice : d'abord les longues phrases, puis au plus trois préparations.
  const targets=frames.map((f,i)=>({f,i,span:i?f.at-frames[i-1].at:0}))
    .filter(x=>x.i&&x.span>=1.5&&x.span<=6&&!/sus|dim|aug/.test(x.f.chord.quality))
    .sort((a,b)=>Number(minor(b.f.chord.quality))-Number(minor(a.f.chord.quality))||b.span-a.span);
  const pulse=sourceReview?.rhythm;
  const beat=pulse?.steadiness<.18&&pulse.every>=.3&&pulse.every<=1?pulse.every:null;
  let count=0;
  if(!noPassing&&!hasPedal)for(const {f,i,span} of targets){
    if(count>=3)break;
    const base=segments.find(s=>s.frame===frames[i-1]&&s.kind==='enrich');
    const target=segments.find(s=>s.frame===f&&['enrich','original'].includes(s.kind));
    if(!base||base.unchanged||!target||base.end-base.at<.8)continue;
    // Ces accords nouvellement reconnus restent un geste étagé, pas une case
    // vide où couper l'arpège pour insérer une autre attaque de passage.
    if(base.frame.rolledSource||f.rolledSource)continue;
    const tritone=!minor(f.chord.quality)&&minor(base.frame.chord.quality)&&pc(base.rootPc-f.chord.rootPc)===7;
    const relativeMinor=minor(f.chord.quality)&&statedKey&&!statedKey.minor&&pc(f.chord.rootPc-statedKey.rootPc)===9;
    const length=beat?(tritone?2:relativeMinor?1.5:1.25)*beat:Math.min(.88,span*.36);
    const end=f.at-.045,start=f.at-Math.min(length,span*.48);
    if(start-base.at<.6)continue;
    // Un accord arpeggié peut être reconnu sans former une frame. Ne jamais
    // plaquer notre préparation par-dessus cette harmonie originale oubliée.
    const occupied=(a,b)=>sourceReview.chords.some(c=>c.at>base.frame.at+.36&&c.at<f.at-.1
      &&c.end-c.at>=.3&&c.at<b&&c.end>a);
    if(occupied(start,end))continue;
    const dominant=choose(base.frame,pc(f.chord.rootPc+(tritone?1:7)),tritone?['13#11','9','7b9']:['7b9b13','7b9','7#5','9','13','7'],base.notes,melody,start,end,{target,reference});
    if(!dominant)continue;
    let lead=null;
    if(relativeMinor&&span>=2.1){
      const leadStart=start-(beat?beat*.9:Math.min(.55,span*.22)),leadEnd=start-.045;
      if(leadStart-base.at>=.45&&!occupied(leadStart,leadEnd))lead=choose(base.frame,pc(f.chord.rootPc+2),['m7b5'],base.notes,melody,leadStart,leadEnd,{reference});
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
      const tonic=choose({...last.frame,topMidi:finalTop.event.note},key.rootPc,['maj9','6/9','maj7'],last.notes,melody,arrival,take.duration,{reference});
      const dom=tonic&&((reference&&referenceFinalDominant(tonic,Math.min(last.frame.topMidi,...melody.filter(p=>p.event.time<arrival&&p.end>last.at).map(p=>p.event.note))))||choose(last.frame,pc(key.rootPc+7),['7b9','7#5','9'],last.notes,melody,last.at,arrival-.045,{target:tonic,reference}));
      if(dom){Object.assign(last,dom,{end:arrival-.045,kind:'dominant',targetAt:arrival});segments.push({...tonic,at:arrival,end:take.duration,frame:last.frame,kind:'tonic'});count++;}
    }
  }
  if(segments.filter(s=>!s.unchanged).length<2)return null;
  segments.sort((a,b)=>a.at-b.at);
  const notes=[];
  for(const s of segments){
    if(s.unchanged)continue;
    const performance=accompanimentPerformance(s,segments);
    for(const n of s.notes){
      if(keepBass&&n===s.frame.bassMidi)continue;
      const {at,velocity:attack}=performance.get(n);
      const overlap=melody.filter(p=>p.event.note===n&&p.event.time<s.end&&p.end>at);
      if(overlap.length){
        // La note source prend le relais. Son relâchement n'est pas une nouvelle
        // attaque musicale : ne pas réintroduire automatiquement cette voix
        // juste après, hors du geste joué (la pédale conserve sa résonance).
        const end=Math.min(s.end,...overlap.map(p=>p.event.time-.025));
        if(end-at>=.12)notes.push({note:n,time:at,end,velocity:attack});
        continue;
      }
      if(s.end-at>=.12)notes.push({note:n,time:at,end:s.end,velocity:attack});
    }
  }
  const noPedal=/sans pedale|sans sustain|sec\b/.test(text);
  const keepPedal=/garde.*pedale|conserv.*pedale/.test(text);
  const pedal=noPedal||keepPedal?[]:phrasePedal(segments,melody,take.duration);
  const edit={type:'arrangement',remove:[...remove],keep:melody.map(p=>p.on),notes,pedal,replacePedal:!keepPedal};
  const changed=applyTakeEdit(take,edit);if(!changed)return null;
  const example=comparedTakeExample(take,changed);if(!example)return null;
  const id=voicingMode==='linked'?'arrangement-linked':'arrangement';
  const title=voicingMode==='linked'?'Voix intérieures liées':'Une progression reconstruite';
  const description=voicingMode==='linked'?'Une autre disposition des accords sous ta mélodie, avec des tensions vers les arrivées.':count?'L’accompagnement est reconstruit sous ta mélodie, avec des tensions vers les arrivées.'
    :'Des accords enrichis sur la phrase, en gardant tes notes mélodiques.';
  const changes=segments.map(s=>({at:s.at,end:s.end,chord:s.label,notes:s.notes,goal:s.kind==='original'?'preserved':['enrich','arp-support'].includes(s.kind)?'enrich':'passing',kind:s.kind,targetAt:s.targetAt,source:s.frame.chord.name,technique:s.technique,topMidi:s.frame.topMidi}));
  const advice={version:8,id:`phrase:${id}`,goal:'develop',take,edit,changes,text:description};
  return {id,title,description,advice,harmony:changes,example:{...example,title,subtitle:description}};
}

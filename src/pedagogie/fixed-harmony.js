// Harmonisation verticale : dessus exact, basse choisie, puis voix intérieures.
// Les voicings d'Exercices sont consultés sans modifier son moteur partagé.
import { reviewTake } from '../recorder/take-review.js';
import { parseChordName } from './note-roles.js';
import { notePairs, applyTakeEdit } from './take-edit.js';
import { findVoicingsByTopNote, chordToneIntervals, realizesChord, voiceLeadingCost } from '../practice-exercise.js';
import { respectsLowIntervalLimits } from '../voicing-engine/textbook-voicings.js';
import { comparedTakeExample } from './playing-diff.js';
import { extractKey } from './intent-classifier.js';
const pc = n => (n % 12 + 12) % 12;
const MAJOR = [0,2,4,5,7,9,11];
const NAMES = ['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
const QUALITIES = {maj7:'majeur 7',maj9:'majeur 9','6/9':'6/9',m7:'mineur 7',m9:'mineur 9',m11:'mineur 11',9:'9',13:'13', '7b9':'7♭9', '7#5':'7♯5',sus4:'sus4','7sus4':'7sus4','9sus4':'9sus4'};
const label = (root,q) => `${NAMES[pc(root)]} ${QUALITIES[q]||q}`;

export function fixedFrames(take) {
  const review=reviewTake(take.events), pairs=notePairs(take.events), used=new Set();
  if(!review)return {frames:[],review:null};
  const frames=[];
  for(const c of review.chords) {
    const chord=parseChordName(c.name);if(!c.matched||!chord)continue;
    const source=pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<Math.min(c.end,c.at+.4)&&c.notes.includes(p.event.note)&&p.end-p.event.time>=.12);
    if(source.length<3||source.some(p=>used.has(p.on)))continue;
    const last=Math.max(...source.map(p=>p.event.time));
    if(source.some(p=>p.end<last+.08)||new Set(source.map(p=>p.event.note)).size!==source.length)continue;
    const notes=source.map(p=>p.event.note).sort((a,b)=>a-b);
    const foundation=/^m(?!aj)/.test(chord.quality)?'m':/sus/.test(chord.quality)?chord.quality.replace(/^[79]/,''):/^(7|9|13)/.test(chord.quality)?'7':'';
    if(notes.at(-1)!==Math.max(...c.notes)||(!realizesChord(notes,chord.rootPc,chord.quality)&&!realizesChord(notes,chord.rootPc,foundation)))continue;
    frames.push({at:c.at,end:c.end,chord,source,notes,topMidi:notes.at(-1),bassMidi:notes[0]});
    source.forEach(p=>used.add(p.on));
  }
  return {frames,review};
}

function paletteOf(review,message) {
  const stated=/\b(?:en|tonalite|ton)\b/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g,''))?extractKey(message):null;
  if(stated)return pc(stated.rootPc+(stated.minor?3:0));
  const tones=new Set(review.chords.flatMap(c=>c.notes.map(pc)));
  const possible=Array.from({length:12},(_,root)=>root).filter(root=>[...tones].every(n=>MAJOR.some(i=>pc(root+i)===n)));
  return possible.length===1?possible[0]:null;
}

function ownSpecs(frame,palette,soft=false) {
  const {rootPc,quality:q}=frame.chord;
  const minor=/^m(?!aj)/.test(q), dominant=/^(7|9|13)/.test(q)||(q===''||q==='add9')&&palette!=null&&pc(rootPc-palette)===7;
  const qualities=/sus/.test(q)?['9sus4','7sus4']:minor?(soft?['m7','m9','m11']:['m9','m11','m7']):dominant?['9','13']:soft?['maj7','6/9','maj9']:['maj9','maj7','6/9'];
  return qualities.map((quality,rank)=>({rootPc,quality,preserveBass:true,rank}));
}

/** Accords candidats après le choix de la basse ; le cycle autorisé n'est pas forcé dans une seule gamme. */
export function harmonyVoicings(frame,spec,{palette=null}={}) {
  const {topMidi,bassMidi}=frame, root=spec.rootPc, quality=spec.quality;
  const tones=chordToneIntervals(quality);
  if(!tones.has(pc(topMidi-root)))return [];
  const out=[], seen=new Set();
  const accept=(notes,technique)=>{
    if(spec.resolveLeading) {
      let target=topMidi-1;while(pc(target)!==root)target--;
      if(target<Math.min(...notes))return;
      notes=[...notes,target];
    }
    notes=[...new Set(notes)].sort((a,b)=>a-b);
    if(notes.length<3||notes.length>7||notes.at(-1)!==topMidi||notes[0]<28||notes[0]>topMidi-5)return;
    if(spec.preserveBass&&(pc(notes[0])!==pc(bassMidi)||Math.abs(notes[0]-bassMidi)>12))return;
    if(spec.preserveBass&&new Set(notes.map(pc)).size<new Set(frame.notes.map(pc)).size)return;
    if(!realizesChord(notes,root,quality)||!respectsLowIntervalLimits(notes))return;
    if(palette!=null&&!spec.chromatic&&notes.some(n=>!MAJOR.some(d=>pc(palette+d)===pc(n))))return;
    // Une main droite de plus d'une octave n'est pas une position fixe proposée ici.
    if(notes.length>2&&topMidi-notes[1]>12)return;
    const key=notes.join(',');if(seen.has(key))return;seen.add(key);
    const bassLabel=pc(notes[0])!==root?` / ${NAMES[pc(notes[0])]}`:'';
    const outside=palette!=null&&spec.chromatic?notes.filter(n=>!MAJOR.some(d=>pc(palette+d)===pc(n))).length:0;
    out.push({...spec,rank:(spec.rank||0)+outside*2,notes,technique,label:spec.label||label(root,quality)+bassLabel});
  };
  const wantedBass=spec.bassPc??(spec.preserveBass?pc(bassMidi):root);
  const basses=Array.from({length:Math.max(0,Math.min(60,topMidi-5)-27)},(_,i)=>i+28)
    .filter(n=>pc(n)===wantedBass&&(!spec.preserveBass||Math.abs(n-bassMidi)<=12))
    .sort((a,b)=>Math.abs(a-bassMidi)-Math.abs(b-bassMidi)).slice(0,2);
  const catalogue=findVoicingsByTopNote(spec.catalogRoot??root,spec.catalogQuality??quality,pc(topMidi),{technique:spec.technique||'all'});
  for(const v of catalogue) {
    const shift=topMidi-v.topMidi, moved=[...v.lh,...v.rh].map(n=>n+shift);
    if(spec.rootless)accept(moved,v.technique);
    else for(const bass of basses)accept([bass,...moved.filter(n=>n>bass)],v.technique);
  }
  if(!spec.rootless)for(const bass of basses)for(const omitFifth of [false,true])for(const omitNinth of /11|13/.test(quality)?[false,true]:[false]) {
    const notes=[bass,topMidi];let possible=true;
    for(const interval of tones) {
      if(pc(bass-root)===interval||pc(topMidi-root)===interval||omitFifth&&interval===7||omitNinth&&interval===2||interval===5&&/^(13|maj13)$/.test(quality))continue;
      let note=topMidi-1;while(pc(note-root)!==interval)note--;
      if(note<=bass+2){possible=false;break;}notes.push(note);
    }
    if(possible)accept(notes,'position');
  }
  return out.sort((a,b)=>voiceLeadingCost(frame.notes,a.notes)-voiceLeadingCost(frame.notes,b.notes)).slice(0,12);
}

function frameEdit(frame,v) {
  return {source:frame.source.map(p=>p.on),topOn:frame.source.find(p=>p.event.note===frame.topMidi).on,
    notes:v.notes,rootPc:v.rootPc,quality:v.quality,preserveBass:v.preserveBass};
}

/** Recherche sur la suite entière : le coût inclut le lien avec la voix précédente. */
function chooseChain(take,frames,pools) {
  let beam=[{chosen:[],cost:0,previous:null}];
  for(let i=0;i<frames.length;i++) {
    const frame=frames[i];
    const pool=pools[i].filter(v=>applyTakeEdit(take,{type:'fixed-harmony',frames:[frameEdit(frame,v)]}));
    if(!pool.length)pool.push({notes:frame.notes,unchanged:true,label:frame.chord.name});
    const next=[];
    for(const path of beam)for(const v of pool) {
      const sourceCost=voiceLeadingCost(frame.notes,v.notes)*.3+Math.abs(frame.bassMidi-v.notes[0])*.3;
      next.push({chosen:[...path.chosen,v],previous:v.notes,cost:path.cost+sourceCost+(v.rank||0)*4
        +(path.previous?voiceLeadingCost(path.previous,v.notes):0)});
    }
    beam=next.sort((a,b)=>a.cost-b.cost).slice(0,16);
  }
  return beam[0]?.chosen||[];
}

function bassRequest(message,frames) {
  const plain=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/(?:basse|cycle|parcours).*quartes/.test(plain))return frames.map((f,i)=>pc(frames[0].bassMidi+5*i));
  const list=/basses?\s*:\s*([^.!?\n]+)/i.exec(plain)?.[1];if(!list)return null;
  const names={do:0,re:2,mi:4,fa:5,sol:7,la:9,si:11,c:0,d:2,e:4,f:5,g:7,a:9,b:11};
  return [...list.matchAll(/\b(sol|do|re|mi|fa|la|si|[a-g])\s*(b(?![a-z])|#|♭|♯|bemol|diese)?(?![a-z])/g)]
    .map(m=>pc(names[m[1]]+(/b|♭/.test(m[2]||'')?-1:m[2]?1:0)));
}

export function buildFixedHarmonyVariants(take,{message=''}={}) {
  const {frames,review}=fixedFrames(take);if(!frames.length)return [];
  const palette=paletteOf(review,message), requestedBasses=bassRequest(message,frames);
  if(requestedBasses&&requestedBasses.length!==frames.length)return [];
  const broadQualities=['maj9','maj7','m9','m11','9','13','7sus4','9sus4','7b9','7#5'];
  let profiles;
  if(requestedBasses)profiles=[{id:'bass',title:'Tes basses, ta mélodie',description:'Les voix intérieures relient les basses et les notes du dessus.',specs:frames.map((f,i)=>[...new Set([f.chord.rootPc,requestedBasses[i],pc(requestedBasses[i]-4),pc(requestedBasses[i]-3),pc(requestedBasses[i]-7)])]
    .flatMap((rootPc,rootRank)=>broadQualities.map((quality,rank)=>({rootPc,bassPc:requestedBasses[i],quality,preserveBass:false,chromatic:true,rank:rank*.2+rootRank*.3}))))}];
  else {
    profiles=[{id:'enrich',title:'Accords enrichis',description:'Ta mélodie et ton parcours de basse, avec de nouvelles couleurs.',specs:frames.map(f=>ownSpecs(f,palette))},
      {id:'soft',title:'Autres voicings',description:'Tes notes du dessus et tes basses, avec d’autres voicings.',specs:frames.map(f=>ownSpecs(f,palette,true))}];
    if(palette!=null) {
      const alternative=frames.map(f=>{
        const degree=pc(f.chord.rootPc-palette);
        const roots=degree===0?[pc(palette+9)]:degree===4||degree===9?[palette]:degree===2?[pc(palette+5)]:degree===5?[pc(palette+2)]:[];
        return roots.flatMap(rootPc=>([2,9].includes(pc(rootPc-palette))?['m11','m9']:['maj9','maj7']).map((quality,rank)=>({rootPc,quality,preserveBass:false,rank}))).concat(ownSpecs(f,palette).map(s=>({...s,rank:s.rank+8})));
      });
      profiles.push({id:'relative',title:'Autres accords, même mélodie',description:'D’autres accords sous ta mélodie, avec un nouveau parcours de basse.',specs:alternative});
      // Dominante de La mineur (ou transposition) SANS ajouter de case rythmique.
      for(let i=0;i<frames.length-1;i++) {
        const target=pc(palette+9);
        if(pc(frames[i].topMidi-target)!==8||![0,4,9].includes(pc(frames[i+1].chord.rootPc-palette)))continue;
        const cadence=frames.map(f=>ownSpecs(f,palette));
        cadence[i]=[{rootPc:pc(target+7),quality:'7b9',catalogRoot:pc(target+2),catalogQuality:'dim7',technique:'drop2',rootless:true,preserveBass:false,chromatic:true,label:`${NAMES[pc(target+7)]}7♭9 sans fondamentale`}];
        cadence[i+1]=[{rootPc:target,quality:'m9',preserveBass:false,resolveLeading:true,rank:0}];
        profiles.push({id:'resolution',title:'Tension et résolution',description:'Les accords changent sous ta mélodie, aux mêmes instants.',specs:cadence,require:[i,i+1]});break;
      }
    }
  }
  const variants=[],seen=new Set();
  for(const profile of profiles) {
    const pools=frames.map((f,i)=>profile.specs[i].flatMap(s=>harmonyVoicings(f,s,{palette})).slice(0,24));
    if(requestedBasses&&pools.some(p=>!p.length))continue;
    const chain=chooseChain(take,frames,pools), selected=[];
    if(requestedBasses&&chain.some((v,i)=>pc(v.notes[0])!==requestedBasses[i]))continue;
    if(profile.require?.some(i=>chain[i]?.unchanged||chain[i]?.rootPc!==profile.specs[i][0].rootPc||chain[i]?.quality!==profile.specs[i][0].quality))continue;
    chain.forEach((v,i)=>{if(!v.unchanged&&v.notes.join(',')!==frames[i].notes.join(','))selected.push({frame:frames[i],v});});
    if(!selected.length)continue;
    if(profile.id==='resolution'&&!selected.some(s=>s.v.rootless))continue;
    if(profile.require) {
      const [from,to]=profile.require, leading=pc(chain[to].rootPc-1);
      if(chain[from].notes.filter(n=>pc(n)===leading).some(n=>!chain[to].notes.includes(n+1)))continue;
    }
    const edit={type:'fixed-harmony',frames:selected.map(({frame,v})=>frameEdit(frame,v))};
    const changed=applyTakeEdit(take,edit);if(!changed)continue;
    const example=comparedTakeExample(take,changed), signature=JSON.stringify(example?.events);
    if(!example||seen.has(signature))continue;seen.add(signature);
    const changes=selected.map(({frame,v})=>({at:frame.at,goal:'enrich',technique:v.technique,source:frame.chord.name,chord:v.label,topMidi:frame.topMidi,bassMidi:v.notes[0],notes:v.notes}));
    const progression=chain.slice(0,4).map(v=>v.label).join(' → ')+(chain.length>4?' …':'');
    const advice={version:4,id:`fixed:${profile.id}`,goal:'enrich',take,changes,edit,text:profile.description};
    variants.push({id:profile.id,title:profile.title,description:profile.description,advice,
      example:{...example,title:profile.title,subtitle:`${profile.description} ${progression}`} ,harmony:changes});
  }
  return variants;
}

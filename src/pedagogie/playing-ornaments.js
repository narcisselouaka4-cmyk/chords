// Gestes courts sur le passage source, sans réécrire la basse ni les notes
// principales. Une approche avant une attaque n'est pas appelée appoggiature.
import {notePairs,applyTakeEdit} from './take-edit.js';
import {parseChordName} from './note-roles.js';
import {chordToneIntervals} from '../practice-exercise.js';
const pc=(n)=>(n%12+12)%12;

export function playingOrnaments(take,review,{latin=false}={}) {
 const pairs=notePairs(take.events), out=[];
 for (const c of review.chords) {
  const chord=parseChordName(c.name);
  if(!c.matched||!chord||c.end-c.at<.7)continue;
  const notes=[...c.notes].sort((a,b)=>a-b), top=notes.at(-1);
  const actual=new Set(notes.map(n=>pc(n-chord.rootPc)));
  if([...chordToneIntervals(chord.quality)].some(n=>!actual.has(n)))continue;
  const played=pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<c.end&&notes.includes(p.event.note));
  const anchors=played.filter(p=>p.event.note===top&&p.end-p.event.time>=.4);
  const anchor=anchors[0];if(!anchor)continue;
  const meta={version:3,at:c.at,end:c.end,region:`${c.at}:${c.name}`,goal:'enrich',chord:c.name};
  // Une famille latine conserve les attaques du motif : aucun nouveau débit
  // chromatique ou groove gospel plaqué sur son montuno.
  if(latin)continue;
  // Les anciennes montées régulières (+0,2 s puis pas de 0,22 s) ont été
  // rejetées à l'écoute. Pas d'arpège automatique sans motif de phrasé.
  // Une note chromatique courte juste avant un appui principal, avec une
  // résolution explicite. Les notes source gardent leurs vrais instants.
  for(const p of anchors) {
   const end=p.event.time-.012,start=end-.11;
   if(start<0)continue;
   for(const delta of [1,-1,2,-2]) {
    const edit={type:'ornament',on:p.on,approach:true,notes:[{note:p.event.note+delta,time:start,end}]};
    if(applyTakeEdit(take,edit)) {
     out.push({...meta,at:start,id:`approach-${p.on}`,technique:'approach',edit,summary:`approche vers ${c.name}`});
     break;
    }
   }
  }
 }
 return out;
}

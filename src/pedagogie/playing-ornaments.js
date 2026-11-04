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
  const notes=[...c.notes].sort((a,b)=>a-b), top=notes.at(-1), floor=Math.max(48,notes[0]+3);
  const actual=new Set(notes.map(n=>pc(n-chord.rootPc)));
  if([...chordToneIntervals(chord.quality)].some(n=>!actual.has(n)))continue;
  const played=pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<c.end&&notes.includes(p.event.note));
  const anchors=played.filter(p=>p.event.note===top&&p.end-p.event.time>=.4);
  const anchor=anchors[0];if(!anchor)continue;
  const meta={version:3,at:c.at,end:c.end,region:`${c.at}:${c.name}`,goal:'enrich',chord:c.name};
  // Une famille latine conserve les attaques du motif : aucun nouveau débit
  // chromatique ou groove gospel plaqué sur son montuno.
  if(latin)continue;
  const minor=/^m(?!aj)/.test(chord.quality);
  const tones=new Set([...chordToneIntervals(chord.quality),2,...(minor?[5,10]:[9,11])]);
  const start=anchor.event.time+.2, end=Math.min(anchor.end-.1,c.end-.15);
  const step=Math.min(.22,(end-start)/3);
  const candidates=Array.from({length:Math.max(0,top-floor)},(_,i)=>floor+i)
    .filter(n=>tones.has(pc(n-chord.rootPc)));
  if(step>=.1) {
   const run=[];
   for(const note of candidates) {
    if(run.length&&note-run.at(-1).note<3)continue;
    const time=start+run.length*step, finish=time+step*.8;
    const edit={type:'ornament',on:anchor.on,notes:[...run,{note,time,end:finish}]};
    if(applyTakeEdit(take,edit))run.push({note,time,end:finish});
    if(run.length===3)break;
   }
   if(run.length>=2)out.push({...meta,id:`flow-${anchor.on}`,technique:'arpeggio',
    edit:{type:'ornament',on:anchor.on,notes:run},summary:`petit arpège dans ${c.name}`});
  }
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

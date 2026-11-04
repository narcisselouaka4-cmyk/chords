// Cadence courte dans la dernière partie d'un accord tenu. Cette subdivision
// harmonique relative n'est pas présentée comme une détection de contretemps.
import {parseChordName} from './note-roles.js';
import {chordToneIntervals} from '../practice-exercise.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {planPassingEdit} from './playing-passage.js';
const pc=n=>(n%12+12)%12;
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];

export function heldPassingProposals(take,review) {
 const pairs=notePairs(take.events),out=[];
 const chords=review.chords;
 const spans=chords.slice(1).map((c,i)=>c.at-chords[i].at).filter(s=>s>=1.5&&s<=4);
 if(spans.length<3)return out;
 const pulse=median(spans);
 if(spans.filter(s=>Math.abs(s/pulse-1)<.2).length/spans.length<.7)return out;
 for(let i=1;i<chords.length;i++) {
  const target=chords[i],previous=chords[i-1],c=parseChordName(target.name);
  const span=target.at-previous.at;
  if(!target.matched||!previous.matched||!c||/sus|dim|aug/.test(c.quality)||span<1.5||span>4||Math.abs(span/pulse-1)>.2)continue;
  const actual=new Set(target.notes.map(n=>pc(n-c.rootPc)));
  if([...chordToneIntervals(c.quality)].some(n=>!actual.has(n)))continue;
  const anchor=pairs.find(p=>p.event.time>=target.at-.025&&p.event.time<target.at+.2&&p.event.note===Math.min(...target.notes));
  if(!anchor)continue;
  const dominant=pc(c.rootPc+7),bass=Math.min(...previous.notes);
  let root=bass-6;while(pc(root)!==dominant)root++;
  if(root<28||root>60)continue;
  const notes=[root,root+10,root+16];
  const width=Math.min(.65,span/4),start=anchor.event.time-width,end=anchor.event.time-.025;
  const step=width/3,attacks=[start,start+step,start+2*step];
  const edit=planPassingEdit(take,review,pairs,target,previous,notes,anchor,{start,end,step,attacks,arrival:anchor.event.time});
  if(!edit||!applyTakeEdit(take,edit))continue;
  edit.placement='held-cadence';
  out.push({version:3,id:`held-${anchor.on}`,goal:'passing',technique:'cadence',at:start,end,
   region:`passing:${target.at}`,edit,summary:`dominante de passage avant ${target.name}`});
 }
 return out;
}

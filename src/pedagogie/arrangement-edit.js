import {applyProposalPedal} from './proposal-pedal.js';
import {playableTimeline} from './piano-voicing.js';
import {notePairs} from './take-edit.js';

/** Plan rejouable : retrait de l'accompagnement désigné, mélodie immuable. */
export function applyArrangement(take, edit) {
  const pairs=notePairs(take.events), duration=Math.max(take.duration||0,...take.events.map(e=>e.time));
  if(!Array.isArray(edit.remove)||!Array.isArray(edit.keep)||!Array.isArray(edit.notes)
    ||!edit.keep.length||edit.notes.length>pairs.length*6+32)return null;
  const removed=new Set(),keep=new Set(edit.keep);
  for(const on of edit.keep)if(!pairs.some(p=>p.on===on))return null;
  for(const on of edit.remove){const p=pairs.find(p=>p.on===on);if(!p||keep.has(on)||removed.has(p.on))return null;removed.add(p.on);removed.add(p.off);}
  const added=[],newAttacks=new Set();
  for(const n of edit.notes){
    if(!Number.isInteger(n.note)||n.note<28||n.note>96||!Number.isFinite(n.time)||!Number.isFinite(n.end)
      ||n.time<0||n.end>duration+.001||n.end-n.time<.08||!Number.isFinite(n.velocity)||n.velocity<=0||n.velocity>1)return null;
    if(pairs.some(p=>!removed.has(p.on)&&p.event.note===n.note&&p.event.time<n.end&&p.end>n.time)
      ||added.some(p=>p.note===n.note&&p.time<n.end&&p.end>n.time))return null;
    added.push(n);
  }
  let events=take.events.filter((e,i)=>!removed.has(i)).map(e=>({...e}));
  for(const n of added){const on={type:'note_on',note:n.note,time:n.time,velocity:n.velocity,channel:0};newAttacks.add(on);events.push(on,{type:'note_off',note:n.note,time:n.end,velocity:0,channel:0});}
  events=applyProposalPedal(events,edit,duration);if(!events)return null;
  if(!playableTimeline(events,e=>newAttacks.has(e)))return null;
  return {...take,events:events.sort((a,b)=>a.time-b.time)};
}

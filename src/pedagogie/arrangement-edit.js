import {notePairs} from './take-edit.js';

/** Plan rejouable : retrait de l'accompagnement désigné, mélodie immuable. */
export function applyArrangement(take, edit) {
  const pairs=notePairs(take.events), duration=Math.max(take.duration||0,...take.events.map(e=>e.time));
  if(!Array.isArray(edit.remove)||!Array.isArray(edit.keep)||!Array.isArray(edit.notes)
    ||!edit.keep.length||edit.notes.length>pairs.length*6+32)return null;
  const removed=new Set(),keep=new Set(edit.keep);
  for(const on of edit.keep)if(!pairs.some(p=>p.on===on))return null;
  for(const on of edit.remove){const p=pairs.find(p=>p.on===on);if(!p||keep.has(on)||removed.has(p.on))return null;removed.add(p.on);removed.add(p.off);}
  const added=[];
  for(const n of edit.notes){
    if(!Number.isInteger(n.note)||n.note<28||n.note>96||!Number.isFinite(n.time)||!Number.isFinite(n.end)
      ||n.time<0||n.end>duration+.001||n.end-n.time<.08||!Number.isFinite(n.velocity)||n.velocity<=0||n.velocity>1)return null;
    if(pairs.some(p=>!removed.has(p.on)&&p.event.note===n.note&&p.event.time<n.end&&p.end>n.time)
      ||added.some(p=>p.note===n.note&&p.time<n.end&&p.end>n.time))return null;
    added.push(n);
  }
  const events=take.events.filter((_,i)=>!removed.has(i)).map(e=>({...e}));
  for(const n of added)events.push({type:'note_on',note:n.note,time:n.time,velocity:n.velocity,channel:0},{type:'note_off',note:n.note,time:n.end,velocity:0,channel:0});
  if(edit.pedal?.length){
    if(take.events.some(e=>e.type==='control'&&e.controller===64)||edit.pedal.length>256)return null;
    let down=false,last=-1;
    for(const e of edit.pedal){
      if(!Number.isFinite(e.time)||e.time<0||e.time<last||e.time>duration+.4||![0,127].includes(e.value)||down===(e.value===127))return null;
      down=e.value===127;last=e.time;events.push({type:'control',controller:64,value:e.value,time:e.time,channel:0});
    }
    if(down)return null;
  }
  return {...take,events:events.sort((a,b)=>a.time-b.time)};
}

import {realizesHarmony} from './harmonic-identity.js';
const pc=n=>(n%12+12)%12;
/** Faisabilité statique prudente, sans prétendre connaître les mains réelles. */
export function handDistribution(pitches){
  const notes=[...new Set(pitches)].sort((a,b)=>a-b);
  if(!notes.length)return null;
  for(let split=1;split<=notes.length;split++){
    const left=notes.slice(0,split),right=notes.slice(split);
    if(left.length<=5&&right.length<=5&&left.at(-1)-left[0]<=12
      &&(!right.length||right.at(-1)-right[0]<=12))return {left,right};
  }
  return null;
}
/** Une extension annoncée doit exister, même si un catalogue autorise son omission. */
export function voicedQuality(notes,root,quality){
  const tones=new Set(notes.map(n=>pc(n-root)));
  let q=quality;
  if(/13/.test(q)&&!tones.has(/b13/.test(q)?8:9))q=q.replace(/b13/,'').replace(/13/,tones.has(2)?'9':'7');
  if(/11/.test(q)&&!tones.has(/#11/.test(q)?6:5))q=q.replace(/#11/,'').replace(/11/,tones.has(2)?'9':'7');
  if(/9/.test(q)&&!tones.has(/b9/.test(q)?1:/#9/.test(q)?3:2))q=q.replace(/[b#]9/g,'').replace(/9/,'7');
  return realizesHarmony(notes,root,q)?q:null;
}

/** Vérifier aussi les chevauchements réels, pas seulement les positions isolées.
 * Une position originale intacte n'est pas refusée à cause de cette correction. */
export function playableTimeline(events,isNewAttack){
  const active=new Map();
  for(const e of [...events].sort((a,b)=>a.time-b.time||Number(a.type==='note_on'&&a.velocity>0)-Number(b.type==='note_on'&&b.velocity>0))){
    const key=`${e.channel||0}:${e.note}`;
    if(e.type==='note_on'&&e.velocity>0)active.set(key,{note:e.note,added:isNewAttack(e)});
    else if(e.type==='note_off'||e.type==='note_on'&&e.velocity===0)active.delete(key);
    else continue;
    if([...active.values()].some(n=>n.added)&&!handDistribution([...active.values()].map(n=>n.note)))return false;
  }
  return true;
}

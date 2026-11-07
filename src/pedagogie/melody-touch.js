import {applyTakeEdit} from './take-edit.js';
const pc=n=>(n%12+12)%12;
const vel=p=>p.event.velocity>1?p.event.velocity/127:p.event.velocity;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

/** Toucher MIDI : un geste bref, basse sur l'appui, voix intérieures moins
 * percussives. Les nuances des passages viennent des appuis voisins. Ce n'est
 * pas une commande ADSR de synthétiseur ni une atténuation du fichier audio. */
export function melodyTouchNotes(segments,pairs,pulse){
 const main=segments.filter(s=>s.kind==='arrival');
 const levels=new Map(main.map(s=>{
  const nearby=pairs.filter(p=>Math.abs(p.event.time-s.at)<=pulse*2);
  return [s,Math.max(.42,Math.min(.54,(median(nearby.map(vel))||vel(s.source))*.72))];
 }));
 const levelAt=s=>{
  if(levels.has(s))return levels.get(s);
  const before=main.filter(a=>a.at<s.at).at(-1)||main[0],after=main.find(a=>a.at>s.at)||before;
  const fraction=after===before?0:(s.at-before.at)/(after.at-before.at);
  return levels.get(before)+(levels.get(after)-levels.get(before))*fraction;
 };
 return segments.flatMap(s=>{
  const pitches=s.notes.filter(n=>n!==s.source.event.note),density=Math.min(1,Math.pow(3/pitches.length,.4));
  const spread=Math.min(.014,pulse*.027);
  return pitches.map((note,i)=>({note,time:s.at+(pitches.length>1?i/(pitches.length-1)*spread:0),end:s.end,
   velocity:levelAt(s)*density*(i===0?.88:i===pitches.length-1?1:.94)}));
 });
}

/** Une seule appoggiature intérieure, prise dans la dominante précédente et
 * résolue dans l'accord d'arrivée. Basse et mélodie ne sont jamais retardées. */
export function melodyAppoggiatura(take,segments,pairs,notes,pulse){
 for(let i=1;i<segments.length;i++){
  const s=segments[i],previous=segments[i-1];if(s.kind!=='arrival'||previous.kind!=='dominant')continue;
  // La voix la plus haute disponible porte l'ornement : le placer par défaut
  // dans le grave le masquait derrière les accords et la mélodie.
  for(const n of notes.filter(n=>n.time>=s.at&&n.time<s.at+.02&&n.note!==s.notes[0]&&s.source.event.note-n.note<=16&&[3,4,7].includes(pc(n.note-s.rootPc))).sort((a,b)=>b.note-a.note)){
   const length=Math.max(.085,Math.min(.095,pulse*.17)),resolveAt=n.time+length;if(n.end-resolveAt<.2)continue;
   for(const delta of [1,-1]){
    const approach=n.note+delta;
    if(approach>=s.source.event.note||!previous.notes.some(p=>pc(p)===pc(approach)))continue;
    if(s.notes.some(p=>p!==n.note&&Math.abs(p-approach)<=1)||pairs.some(p=>p.event.time<resolveAt&&p.end>n.time&&p.event.note===approach))continue;
    const edited=notes.map(x=>x===n?{...n,time:resolveAt}:x);
    edited.push({note:approach,time:n.time,end:resolveAt,velocity:n.velocity});
    if(!applyTakeEdit(take,{type:'arrangement',keep:pairs.map(p=>p.on),remove:[],notes:edited}))continue;
    return {notes:edited,ornaments:[{at:n.time,end:resolveAt,note:approach,target:n.note,resolveAt,kind:'appoggiatura'}]};
   }
  }
 }
 return {notes,ornaments:[]};
}

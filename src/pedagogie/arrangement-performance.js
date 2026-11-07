const velocity=p=>Math.max(0,Math.min(1,p.event.velocity>1?p.event.velocity/127:p.event.velocity));
const median=values=>{
  const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;
};

function dynamics(frame){
  const bass=frame.accompaniment.find(p=>p.event.note===frame.bassMidi);
  const inner=frame.accompaniment.filter(p=>p!==bass);
  return {bass:velocity(bass||frame.top),inner:median((inner.length?inner:[bass||frame.top]).map(velocity))};
}

/** Les nuances suivent l'accompagnement source, pas une réduction globale de
 * volume. Un passage prend le relais entre les nuances des accords voisins. */
export function accompanimentPerformance(segment,segments){
  const frame=segment.frame,own=dynamics(frame);
  let levels=own;
  if(!['enrich','original'].includes(segment.kind)){
    const frames=[...new Set(segments.map(s=>s.frame))].sort((a,b)=>a.at-b.at);
    const left=frames.filter(f=>f.at<=segment.at).at(-1)||frames[0];
    const right=frames.find(f=>f.at>segment.at);
    const a=dynamics(left),b=right?dynamics(right):a;
    const fraction=right?Math.max(0,Math.min(1,(segment.at-left.at)/(right.at-left.at))):0;
    levels={bass:a.bass+(b.bass-a.bass)*fraction,inner:a.inner+(b.inner-a.inner)*fraction};
  }
  const sourceInner=frame.accompaniment.filter(p=>p.event.note!==frame.bassMidi)
    .sort((a,b)=>a.event.note-b.event.note);
  const spread=Math.max(...frame.accompaniment.map(p=>p.event.time))
    -Math.min(...frame.accompaniment.map(p=>p.event.time));
  const rolled=segment.kind==='enrich'&&spread>.09;
  const newVoices=segment.notes.slice(1).filter(n=>!sourceInner.some(p=>p.event.note===n));
  const slots=[...new Set([segment.at,...sourceInner.map(p=>Math.max(segment.at,p.event.time))])].sort((a,b)=>a-b);
  return new Map(segment.notes.map((note,i)=>{
    // Une voix conservée garde son attaque. Les nouvelles voix se répartissent
    // sur le geste entier, basse comprise : ne pas faire attendre tout un
    // nouvel accord jusqu'à l'unique note intérieure tardive de la source.
    const retained=sourceInner.find(p=>p.event.note===note);
    const slot=slots[Math.round(Math.max(0,newVoices.indexOf(note))/Math.max(1,newVoices.length-1)*(slots.length-1))];
    const at=rolled&&i?(retained?Math.max(segment.at,retained.event.time):slot):segment.at;
    return [note,{at,velocity:i?levels.inner:levels.bass}];
  }));
}

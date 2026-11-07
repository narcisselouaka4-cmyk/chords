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
  const innerNotes=segment.notes.slice(1);
  return new Map(segment.notes.map((note,i)=>{
    // Reprendre les vrais instants du geste source, sans inventer un arpège
    // régulier ni avancer toutes les voix sur une basse jouée seule.
    const slot=sourceInner[Math.round(Math.max(0,i-1)/Math.max(1,innerNotes.length-1)*(sourceInner.length-1))];
    const at=rolled&&i&&slot?Math.max(segment.at,slot.event.time):segment.at;
    return [note,{at,velocity:i?levels.inner:levels.bass}];
  }));
}

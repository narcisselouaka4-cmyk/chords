const pc=n=>(n%12+12)%12;
/** Pédale de la proposition : pas de pont à travers un silence d'accompagnement,
 * et nettoyage après les petites notes étrangères à l'accord. */
export function phrasePedal(segments,melody,duration){
  const windows=[];
  for(let i=0;i<segments.length;i++){
    const s=segments[i],next=segments[i+1]?.at??duration;
    const start=s.at+.035,end=Math.min(s.end+.015,next-.025,duration);
    if(end-start<.12)continue;
    const harmony=new Set(s.notes.map(pc));
    const releases=[...new Set(melody.filter(p=>p.end-p.event.time<.22&&!harmony.has(pc(p.event.note))
      &&p.end>start&&p.end<end).map(p=>p.end))].sort((a,b)=>a-b);
    let on=start;
    for(const off of releases){
      if(off-on>=.06)windows.push({on,off});
      on=off+.035;
    }
    if(end-on>=.12)windows.push({on,off:end});
  }
  // Même si deux fenêtres se chevauchent, aucune double pédale enfoncée.
  const events=[];let end=-1;
  for(const w of windows.sort((a,b)=>a.on-b.on)){
    const on=Math.max(w.on,end+.015);if(w.off-on<.06)continue;
    events.push({time:on,value:127},{time:w.off,value:0});end=w.off;
  }
  return events;
}

/** Appliquer seulement à la copie de démonstration, jamais à la prise originale. */
export function applyProposalPedal(events,edit,duration){
  if(!edit.pedal?.length)return edit.replacePedal?events.filter(e=>!(e.type==='control'&&e.controller===64)):events;
  if(!edit.replacePedal&&events.some(e=>e.type==='control'&&e.controller===64)||edit.pedal.length>512)return null;
  const out=edit.replacePedal?events.filter(e=>!(e.type==='control'&&e.controller===64)):[...events];
  let down=false,last=-1;
  for(const e of edit.pedal){
    if(!Number.isFinite(e.time)||e.time<0||e.time<last||e.time>duration+.4||![0,127].includes(e.value)||down===(e.value===127))return null;
    down=e.value===127;last=e.time;out.push({type:'control',controller:64,value:e.value,time:e.time,channel:0});
  }
  return down?null:out;
}

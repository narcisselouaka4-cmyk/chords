// Grammaire de disposition déduite de la référence écoutée : basse distincte,
// espace entre les mains, mélodie qui peut fournir une note de l'accord.
// Aucun identifiant de session, instant ou numéro MIDI absolu de la référence.
const pc=n=>(n%12+12)%12;
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
const below=(pitch,ceiling)=>{let n=ceiling;while(pc(n)!==pitch)n--;return n;};
export function referenceVoicing(frame,rootPc,qualities,ceiling,target=null){
  const q=qualities[0],role=pc(frame.topMidi-rootPc);
  const bass=below(rootPc,Math.min(frame.bassMidi,50));
  if(bass<28)return null;
  let notes,quality,label;
  if(target){
    if(pc(rootPc-target.rootPc)===1){
      notes=[0,10,14,16,18].map(i=>bass+i);quality='13#11';
    }else{
      const candidates=[...target.notes,target.frame?.topMidi].filter(Number.isFinite);
      const thirdPc=pc(target.rootPc+(/^m(?!aj)/.test(target.quality)?3:4));
      const third=candidates.filter(n=>pc(n)===thirdPc&&n>=Math.min(...target.notes)+7).sort((a,b)=>a-b)[0];
      const tonic=candidates.filter(n=>pc(n)===target.rootPc&&n>Math.min(...target.notes)+5).sort((a,b)=>b-a)[0];
      const fifth=candidates.filter(n=>pc(n)===pc(target.rootPc+7)).sort((a,b)=>b-a)[0];
      if(third==null||tonic==null||fifth==null)return null;
      const seventh=third+2,leading=tonic-1;
      const ninth=below(pc(rootPc+1),Math.min(ceiling,fifth+1));
      const alteredFifth=below(pc(rootPc+8),Math.min(ceiling,third+12));
      notes=[bass,seventh,leading,ninth,alteredFifth];quality='7b9b13';
    }
  }else if(q==='m7b5'){
    notes=[0,6,10,15].map(i=>bass+i);quality='m7b5';
  }else if(/^m(?!aj)/.test(q)){
    const offsets=frame.topMidi-bass>=27?[0,15,19,22,24]:role===3?[0,7,10,14]:role===7?[0,10,12,14,15]:[0,7,10,15];
    notes=offsets.map(i=>bass+i);quality=frame.topMidi-bass>=27?'m11':'m9';
  }else if(/^(7|9|13)/.test(q)){
    notes=(role===4?[0,10,16,21]:[0,10,16,19]).map(i=>bass+i);quality=role===4?'13':'7';
  }else if(/maj|6\/9/.test(q)){
    const offsets=role===4&&frame.topMidi-bass>=27?[0,12,19,23,26]:role===0?[0,12,16,19,23]:role===7?[0,4,7,11,14,16]:[0,7,11,14];
    notes=offsets.map(i=>bass+i);quality=role===0?'maj7':'maj9';
  }else return null;
  notes=[...new Set(notes)].sort((a,b)=>a-b);
  if(notes.length<3||notes.some(n=>n>ceiling||n<28))return null;
  label=`${names[rootPc]} ${quality}`;
  return {rootPc,quality,notes,label,technique:'spread-reference',rank:0};
}

export function referenceFinalDominant(tonic,ceiling){
  const bass=Math.min(...tonic.notes);
  const notes=[-1,5,8,10,15].map(i=>bass+i);
  if(notes.some(n=>n<28||n>ceiling))return null;
  return {rootPc:pc(tonic.rootPc+7),quality:'7b9#9b13',notes,
    label:`${names[pc(tonic.rootPc+7)]} 7 altéré / ${names[pc(bass-1)]}`,technique:'spread-reference'};
}

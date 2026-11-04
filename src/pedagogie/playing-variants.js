import {personalPlayingAnswer,playingProposals} from './playing-advice.js';
import {applyTakeEdit} from './take-edit.js';
import {comparedTakeExample} from './playing-diff.js';
import {analyzePlayingStyle} from './playing-style.js';
import {playingOrnaments} from './playing-ornaments.js';
import {heldPassingProposals} from './playing-held-passages.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();
const attacks=t=>t.events.filter(e=>e.type==='note_on'&&e.velocity>0);

export function playingNeighbourhood(take,message='') {
 const stated=plain(message);
 const latin=analyzePlayingStyle(take).hypothesis==='latin-montuno'||/je (?:joue|fais).*(?:salsa|montuno|merengue)/.test(stated);
 const jazz=/je (?:joue|fais).*jazz/.test(stated);
 // Une famille non identifiée reste neutre : pas de faux verdict de genre.
 return {family:latin?'latin':jazz?'jazz':'unclassified',latin};
}

/** Score d'affinité interne, pas une probabilité de genre ni un jugement artistique. */
export function variationAffinity(source,changed,review,sourceFamily,candidateFamily) {
 if(sourceFamily!==candidateFamily)return null;
 const original=attacks(source),actual=attacks(changed);
 const preserved=(n)=>actual.some(e=>e.note===n.note&&e.time===n.time);
 const retention=original.filter(preserved).length/Math.max(1,original.length);
 const structural=review.chords.flatMap(c=>{
  const low=Math.min(...c.notes),top=Math.max(...c.notes);
  return original.filter(e=>e.time>=c.at-.025&&e.time<c.end&&(e.note===low||e.note===top));
 });
 const structure=structural.filter(preserved).length/Math.max(1,structural.length);
 const onsets=new Set(original.map(e=>e.time));
 const added=actual.filter(e=>!original.some(o=>o.note===e.note&&o.time===e.time));
 const density=added.length/Math.max(1,original.length);
 const newTimes=added.filter(e=>!onsets.has(e.time)).length/Math.max(1,original.length);
 if(retention<.95||structure<1||density>.55)return null;
 return .4*retention+.3*structure+.15*(1-Math.min(1,newTimes))+.15*(1-Math.min(1,density));
}

export function buildPlayingVariants(take,{message=''}={}) {
 const found=playingProposals(take);if(!found.review)return [];
 const vicinity=playingNeighbourhood(take,message);
 const source={playing:{passage:take}};
 const base=personalPlayingAnswer({message:'Enrichis mes accords et fais-moi une demonstration',context:source});
 const baseAdvice=base?.toolResult?.playingAdvice;
 if(!baseAdvice)return [];
 const baseChanges=baseAdvice.changes||[baseAdvice];
 const ornaments=playingOrnaments(take,found.review,{latin:vicinity.latin});
 const title=vicinity.latin?['Montuno coloré','Voix en réponse','Son plus ouvert']:vicinity.family==='jazz'
  ?['Jazz lié','Jazz en mouvement','Jazz ornementé']:['Harmonie liée','Arpèges et mouvement','Approches et liaisons'];
 const profiles=[
  {id:'linked',title:title[0],description:'Des accords enrichis, avec tes appuis et ton phrasé.',candidates:baseChanges},
  {id:'flow',title:title[1],description:vicinity.latin?'Une autre couleur sur les attaques de ton motif.':'De petits arpèges dans les espaces de ta prise.',candidates:vicinity.latin?
   found.proposals.filter(p=>p.goal==='enrich'&&!baseChanges.some(q=>q.id===p.id)&&!['drop2','upper'].includes(p.technique)):
   ornaments.filter(p=>p.technique==='arpeggio')},
  {id:'connect',title:title[2],description:vicinity.latin?'Des accords plus aérés, sans changer le motif.':'Des notes pour relier tes accords.',candidates:vicinity.latin?
   found.proposals.filter(p=>p.goal==='lighten'||p.technique==='drop2'):
   [...found.proposals.filter(p=>p.goal==='passing'),...heldPassingProposals(take,found.review),...ornaments.filter(p=>p.technique==='approach')]},
 ];
 const variants=[],signatures=new Set();
 for(const profile of profiles) {
  const selected=[];let changed=null;
  // Un seul arpège par zone, mais une liaison et un accord de passage peuvent
  // coexister si l'édition composée vérifie leurs événements ensemble.
  const regions=new Set();
  for(const p of profile.candidates) {
   if(regions.has(p.region)||selected.length>=6)continue;
   const next=applyTakeEdit(take,{type:'plan',edits:[...selected,p].map(p=>p.edit)});
   if(!next||variationAffinity(take,next,found.review,vicinity.family,vicinity.family)==null)continue;
   selected.push(p);regions.add(p.region);changed=next;
  }
  if(!selected.length)continue;
  const example=comparedTakeExample(take,changed);if(!example?.comparison.changes.length)continue;
  const signature=JSON.stringify(example.events);if(signatures.has(signature))continue;
  signatures.add(signature);
  const advice={version:3,id:`variant:${profile.id}`,goal:'develop',take,changes:selected,
   edit:{type:'plan',edits:selected.map(p=>p.edit)},text:profile.description};
  variants.push({id:profile.id,title:profile.title,description:profile.description,family:vicinity.family,
   affinity:variationAffinity(take,changed,found.review,vicinity.family,vicinity.family),advice,
   example:{...example,title:profile.title,subtitle:profile.description}});
 }
 return variants.sort((a,b)=>b.affinity-a.affinity);
}

export function personalVariantsAnswer({message,messages=[],context}) {
 const text=plain(message),take=context?.playing?.passage;if(!take?.events?.length)return null;
 if(/drop\s*2|upper.?structure|alle?g|supprim|rejoue ma|re.e?coute ma|un accord precis/.test(text))return null;
 const boundary=messages.findLastIndex(m=>m.role==='user'&&m.take?.events?.length);
 const relevant=messages.slice(Math.max(0,boundary));
 const previous=[...relevant].reverse().find(m=>m.role==='assistant'&&m.toolResult?.variants?.length);
 const hear=/entendre|ecout|demonstration|\bdemo\b|montre.moi|joue.moi/.test(text);
 const broad=/plusieurs (?:propositions|versions|variantes)|interpretations?|ameliore.*(?:jeu|progression)|developpe|transforme.*(?:jeu|progression)|enrichis.*(?:mes accords|progression)|rends.*(?:accords|jeu).*(?:beau|riche)|(?:rajoute|ajoute|ajouter).*(?:mouvements|accords enrichis)/.test(text);
 if(!broad&&!(hear&&previous))return null;
 const variants=!broad&&previous?previous.toolResult.variants:buildPlayingVariants(take,{message});
 if(!variants.length)return null;
 const first=variants[0];
 return {ok:true,content:`${variants.length>1?`Voici ${variants.length===3?'trois':'deux'} propositions différentes sur ta prise.`:'Voici une proposition sur ta prise.'} Tes appuis de basse, tes notes principales et leurs attaques restent le fil conducteur. Tu peux écouter chaque version librement.`,
  toolResult:{played:[],ignored:0,suggestions:[],voicing:null,originalTake:take,example:first.example,playingAdvice:first.advice,variants},
  suggestedActions:[],autoplay:hear};
}

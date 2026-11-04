import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalPlayingAnswer,playingProposals,applyTakeEdit} from './playing-advice.js';
import {notePairs} from './take-edit.js';
import {sendCopilotMessage} from './copilot-client.js';
const simple=JSON.parse(readFileSync(new URL('./fixtures/copilot-development-take.json',import.meta.url)));
const real=JSON.parse(readFileSync(new URL('./fixtures/copilot-arpeggiated-take.json',import.meta.url)));
let count=0;
async function check(title,fn){await fn();count++;console.log(`✓ ${title}`);}
const run=(message,take=simple,messages=[])=>personalPlayingAnswer({message,context:{playing:{passage:take}},messages});
const ons=(t)=>t.events.filter(e=>e.type==='note_on'&&e.velocity>0);
await check('Améliorer le jeu simple développe plusieurs voicings et plusieurs attaques, pas une seule note',()=>{
 const r=run('Peut tu améliorer mon jeu et fais-moi une démonstration ?');
 assert(r.autoplay);assert(r.toolResult.playingAdvice.changes.length>=3);
 assert(r.toolResult.example.comparison.changes.filter(s=>s.kind==='added').length>=6);
 assert(r.toolResult.playingAdvice.changes.every(p=>p.edit.type==='voicing'));
});
await check('L’enrichissement garde intégralement les voix originales, leurs attaques et nuances, donc basse et voice leading',()=>{
 const before=JSON.stringify(simple);
 const r=run('Améliore mon jeu avec une démonstration');
 const changed=applyTakeEdit(simple,r.toolResult.playingAdvice.edit);
 for(const event of simple.events)assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(event)));
 assert.equal(JSON.stringify(simple),before);
 const diff=r.toolResult.example.comparison.changes;assert(diff.every(s=>s.kind==='added'));
 assert(ons(changed).length-ons(simple).length<=Math.floor(ons(simple).length*.3));
});
await check('Une prise de plus de 100 attaques reçoit un développement borné réparti sur le motif',()=>{
 const events=[];for(let i=0;i<24;i++)for(const [j,n]of [48,55,60,64,72].entries()) {
 const time=i*.7+j*.06;events.push({type:'note_on',note:n,time,velocity:.6},{type:'note_off',note:n,time:time+.3});}
 const t={duration:18,events:events.sort((a,b)=>a.time-b.time)};
 const r=run('Développe mon jeu et fais-moi une démonstration',t);assert(r.toolResult.example);
 const added=r.toolResult.example.comparison.changes.filter(s=>s.kind==='added');
 assert(added.length>=4);assert(added.length<=36);assert(added.at(-1).start-added[0].start>5);
});
await check('Drop 2 explicite : deuxième voix du haut abaissée de douze demi-tons, basse et dessus conservés',()=>{
 const r=run('Montre-moi la même progression en drop 2');
 const advice=r.toolResult.playingAdvice;assert(advice);
 const changes=advice.changes||[advice];assert(changes.every(p=>p.technique==='drop2'));
 for(const c of changes)for(const move of c.edit.replacements)assert.equal(simple.events[move.on].note-move.note,12);
 const changed=applyTakeEdit(simple,advice.edit);
 for(const p of playingProposals(simple).review.chords){
  const pitches=[...p.notes].sort((a,b)=>a-b);
  for(const n of [pitches[0],pitches.at(-1)]) for(const e of simple.events.filter(e=>e.note===n&&e.time>=p.at&&e.time<p.end))assert(changed.events.some(c=>JSON.stringify(c)===JSON.stringify(e)));
 }
});
const dominant={duration:4,events:[48,52,58,67,76].flatMap((n,i)=>[{type:'note_on',note:n,time:i*.035,velocity:.7},{type:'note_off',note:n,time:2}]).sort((a,b)=>a.time-b.time)};
await check('Upper structure explicite : triade Ré majeure sur Do7, avec tierce, septième et dessus conservés',()=>{
 const r=run('Montre-moi une upper structure sur mon jeu',dominant);
 const p=r.toolResult.playingAdvice;assert(p);assert.equal(p.technique,'upper');
 assert.deepEqual(p.edit.additions.map(a=>a.note),[62,66,69]);
 const changed=applyTakeEdit(dominant,p.edit);
 for(const n of [48,52,58,76])for(const e of dominant.events.filter(e=>e.note===n))assert(changed.events.some(c=>JSON.stringify(c)===JSON.stringify(e)));
 assert(!changed.events.some(e=>e.note===67));
});
await check('Les techniques structurelles ne sont jamais introduites implicitement dans une demande générale',()=>{
 const r=run('Développe mon jeu avec une démonstration',dominant);
 const a=r.toolResult.playingAdvice;if(a)assert(!(a.changes||[a]).some(p=>['drop2','upper'].includes(p.technique)));
});
await check('Une technique indisponible n’est pas remplacée par une simple couleur rebaptisée',()=>{
 const triad={duration:2,events:[48,60,64,67].flatMap(n=>[{type:'note_on',note:n,time:0,velocity:.7},{type:'note_off',note:n,time:1}])};
 const r=run('Montre-moi un drop 2',triad);assert(!r.toolResult.example);assert.match(r.content,/pas trouvé de disposition/);
});
await check('Une édition composée refuse les doublons, voisins et modifications contradictoires',()=>{
 const p=notePairs(dominant.events).find(p=>p.event.note===67);
 assert.equal(applyTakeEdit(dominant,{type:'voicing',additions:[{on:p.on,note:76}]}),null);
 assert.equal(applyTakeEdit(dominant,{type:'voicing',additions:[{on:p.on,note:75}]}),null);
 assert.equal(applyTakeEdit(dominant,{type:'voicing',replacements:[{on:p.on,note:65},{on:p.on,note:69}]}),null);
});
await check('La variante combinée garde les indices source et la comparaison, sans symbole dans le MIDI final',()=>{
 const r=run('Ajoute des mouvements et enrichis ma progression avec une démonstration',real);
 const advice=r.toolResult.playingAdvice;assert(advice.changes.some(p=>p.goal==='passing'));assert(advice.changes.some(p=>p.edit.type==='voicing'));
 const changed=applyTakeEdit(real,advice.edit);assert(changed);
 for(const e of changed.events)assert.equal(Object.getOwnPropertySymbols(e).length,0);
 assert(r.toolResult.example.comparison.changes.length>6);
});
await check('La demande de même progression gospel et le reproche réel gardent la prise au lieu du générateur générique',async()=>{
 for(const message of ['Montre‑moi la même progression en style gospel','tu joue pas du tout comme je joue moi là']){
 const r=await sendCopilotMessage({message,messages:[],context:{playing:{passage:simple}}});
 assert(r.autoplay,message);assert.deepEqual(r.toolResult.originalTake,simple);assert(r.toolResult.example.comparison.changes.length>=6);
 }
});
console.log(`${count}/${count} vérifications réussies`);

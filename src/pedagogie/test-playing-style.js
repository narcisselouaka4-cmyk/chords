import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzePlayingStyle, playingStyleAnswer } from './playing-style.js';
import { sendCopilotMessage } from './copilot-client.js';
const { takes } = JSON.parse(readFileSync(new URL('./fixtures/copilot-latin-takes.json', import.meta.url)));
let count = 0;
async function check(name, test) { await test(); count++; console.log(`✓ ${name}`); }
const run = (message, take = takes[1], messages = []) => playingStyleAnswer({ message, context: { playing: { passage: take } }, messages });
await check('La prise réelle en octaves donne une piste montuno, sans certitude de genre ni de clave', () => {
  const r = run("c'est quoi comme style de musique ?");
  assert.equal(r.toolResult.playingStyle.hypothesis, 'latin-montuno');
  assert.match(r.content,/montuno de salsa/); assert.match(r.content,/pas une identification certaine/);
  assert.doesNotMatch(r.content,/bpm|196|ballad|rootless|2-3|3-2/);
  assert(!r.autoplay); assert(!r.toolResult.example);
});
await check('La prise réelle suivante est analysée à nouveau, sans reprendre le faux verdict jazz', () => {
  const r = run('Et maintenant, c’est quoi comme style de jeu ?',takes[2]);
  assert.equal(r.toolResult.playingStyle.hypothesis,'latin-montuno');
});
await check('La première prise répétitive mais ambiguë ne devient pas une fausse identification pop ou salsa', () => {
  const r=run('Quel style je joue ?',takes[0]);
  assert.equal(r.toolResult.playingStyle.hypothesis,'undetermined');
  assert.match(r.content,/plusieurs styles/);
});
await check('Et maintenant après une question de style reste une question de style, même avec une nouvelle prise', async () => {
  const r=await sendCopilotMessage({message:'et maintenant ?',context:{playing:{passage:takes[2]}},messages:[
    {role:'user',content:'c’est quoi comme style de jeu ?',take:takes[1]},
    {role:'assistant',content:'jazz ballad'},
    {role:'user',content:'et maintenant ?',take:takes[2]},
  ]});
  assert.equal(r.toolResult.playingStyle.hypothesis,'latin-montuno');
  assert(!r.toolResult.playingAdvice);
});
await check('Une demande ultérieure d’enrichissement ne reprend pas le sujet style', () => {
  assert.equal(run('Enrichis mes accords'),null);
  assert.equal(run('et maintenant ?',takes[1],[{role:'user',content:'Enrichis mes accords'}]),null);
});
await check('Des relances successives restent dans le sujet style enregistré', () => {
  const first=run('Quel style je joue ?');
  const next=run('et maintenant ?',takes[2],[{role:'user',content:'et maintenant ?'},{role:'assistant',...first},{role:'user',content:'et maintenant ?'}]);
  assert.equal(next.toolResult.playingStyle.hypothesis,'latin-montuno');
});
await check('Un tutoriel, le catalogue, une explication ou un style de voicing ne désignent pas la prise', () => {
  for(const q of ['Quel style joue le prof dans la vidéo ?', 'Quels styles sont disponibles ?', 'Explique le style salsa', 'Quel style de voicing choisir ?', 'Comment jouer un montuno ?', "c'est quoi la salsa ?"]) assert.equal(run(q),null,q);
});
await check('La transposition et un changement de vitesse conservent les indices', () => {
  for(const [transpose,scale] of [[12,1],[-5,1],[0,.5],[0,1.5]]) {
    const take={duration:takes[1].duration*scale,events:takes[1].events.map(e=>({...e,time:e.time*scale,...(e.note!=null?{note:e.note+transpose}:{})}))};
    assert.equal(analyzePlayingStyle(take).hypothesis,'latin-montuno',`${transpose},${scale}`);
  }
});
function pattern(positions, notesAt) {
  const events=[];
  for(let loop=0;loop<4;loop++) for(const [i,p] of positions.entries()) for(const n of notesAt(i)) {
    const time=(loop*16+p)*.16;
    events.push({type:'note_on',note:n,time,velocity:.7},{type:'note_off',note:n,time:time+.1});
  }
  return {duration:10.4,events};
}
await check('Des octaves régulières, des triades rapides ou un arpège égal ne suffisent pas à dire salsa', () => {
  for(const take of [pattern([0,2,4,6,8,10,12,14],()=>[48,67,79]),pattern(Array.from({length:16},(_,i)=>i),()=>[48,60,64,67]),pattern(Array.from({length:16},(_,i)=>i),i=>[[60,64,67,72][i%4]])]) assert.equal(analyzePlayingStyle(take).hypothesis,'undetermined');
});
await check('Un geste répétitif décalé en octaves fournit des indices compatibles, sans nommer une clave', () => {
  const t=pattern([0,1,2,3,5,7,9,11,13,15],i=>[48,[67,67,72,75,68,72,67,71,68,72][i],[79,79,72,75,80,72,79,71,80,72][i]]);
  assert.equal(analyzePlayingStyle(t).hypothesis,'latin-montuno');
});
await check('Une prise vide ou minuscule reste insuffisante', () => {
  assert.equal(analyzePlayingStyle({events:[]}).enough,false);
  const r=run('Quel style de musique ?',pattern([0],()=>[60,64,67]));
  assert.equal(r.toolResult.playingStyle.hypothesis,'undetermined');
  assert.match(r.content,/trop courte|peu répétée/);
});
await check('Les trois formulations réelles passent localement avant le fournisseur et ne modifient pas le MIDI', async () => {
  const before=JSON.stringify(takes);
  for(const [i,q] of ["Ok, donc là, j 'ai joué et je veux que tu me dises c 'est quoi comme style de musique ?", "Et maintenant, ce que je viens de jouer, dis -moi, c 'est quoi comme style de jeu ?", "c'est quoi comme style de musique ?"].entries()) {
    const r=await sendCopilotMessage({message:q,messages:[],context:{playing:{passage:takes[i]}}});
    assert(r.toolResult.playingStyle); assert(r.ok);
  }
  assert.equal(JSON.stringify(takes),before);
});
console.log(`${count}/${count} vérifications réussies`);

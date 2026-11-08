import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPhraseArrangement,arrangementFrames} from './phrase-arrangement.js';
import {applyTakeEdit,notePairs} from './take-edit.js';
import {handDistribution} from './piano-voicing.js';
import {reviewTake} from '../recorder/take-review.js';
import {sendCopilotMessage} from './copilot-client.js';
import {answerActions} from './copilot-tab.js';
import {PROPOSAL_POLICY} from './proposal-policy.js';
import {requestedPersonalStyle} from './style-capabilities.js';

const read=name=>{const data=JSON.parse(fs.readFileSync(new URL(`./fixtures/copilot-${name}.json`,import.meta.url)));return data.take||data;};
const active=(take,at)=>notePairs(take.events).filter(p=>p.event.time<=at&&p.end>at);
const lowSupport=(take,at,ceiling)=>active(take,at).filter(p=>p.event.note<ceiling);
for(const [name,at,ceiling] of [
  ['session016',5.9,70],['session016',9.3,70],['session016',13.4,70],
  ['session016',27.3,70],['session016',31.8,72],
  ['development-take',3.2,70],['approved-links',10.8,72],
]){
  const take=read(name),before=JSON.stringify(take),plan=buildPhraseArrangement(take);
  assert(plan,name);const changed=applyTakeEdit(take,plan.advice.edit);assert(changed);
  assert(lowSupport(take,at,ceiling).length>=2,'Le témoin contient un accompagnement tenu');
  assert(lowSupport(changed,at,ceiling).length>=2,`${name} : accompagnement présent à ${at}, pas seulement la mélodie`);
  for(const on of plan.advice.edit.keep){
    const p=notePairs(take.events).find(p=>p.on===on);
    for(const index of [p.on,p.off])assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(take.events[index])));
  }
  assert.equal(JSON.stringify(take),before);
}
console.log('✓ Tenues sous la mélodie : Session_016, développement et liaisons ; événements mélodiques exacts, sources intactes.');

// Même mélodie répétée avec de vrais silences entre les accords : ni coupure
// à sa première fin, ni remplissage des silences par une pédale prolongée.
const events=[];
for(const [at,notes,top] of [[0,[48,52,55],64],[4,[41,53,57,60],65],[8,[43,53,59,62],67]]){
  for(const note of notes)events.push({type:'note_on',time:at,note,velocity:note===notes[0]?.14:.4},{type:'note_off',time:at+2,note});
  for(const time of [at,at+1])events.push({type:'note_on',time,note:top,velocity:.75},{type:'note_off',time:time+.5,note:top});
}
const simple={duration:11,events:events.sort((a,b)=>a.time-b.time)};
const simplePlan=buildPhraseArrangement(simple,{message:'Sans accords de passage'});assert(simplePlan);
const simpleChanged=applyTakeEdit(simple,simplePlan.advice.edit);assert(simpleChanged);
assert(lowSupport(simpleChanged,1.6,64).length>=2);
assert(!active(simpleChanged,3).length,'Silence réel respecté');
assert.equal(simpleChanged.events.filter(e=>e.controller===64&&e.time<=3).at(-1)?.value,0);
for(const h of simplePlan.harmony.filter(h=>h.kind==='enrich')){
  const added=simplePlan.advice.edit.notes.filter(n=>n.time===h.at);
  assert(added.length);assert(added.every(n=>n.velocity<=.4),'Les voix ajoutées suivent l’accompagnement, pas le dessus plus fort');
  assert.equal(added.find(n=>n.note===h.notes[0]).velocity,.14,'Conserver la basse douce, sans l’atténuer davantage');
}

const original=read('arpeggiated-take'),originalText=JSON.stringify(original);
for(const shift of [0,1,5,7,11]){
  const take={...original,events:original.events.map(e=>({...e,...(e.note!=null?{note:e.note+shift}:{})}))};
  const plan=buildPhraseArrangement(take);assert(plan);
  const changed=applyTakeEdit(take,plan.advice.edit);assert(changed);
  const source=reviewTake(take.events).chords;
  const suspended=source.find(c=>/9sus4/.test(c.name));
  const altered=source.find(c=>/7b9/.test(c.name));
  assert(suspended&&altered);
  const suspension=plan.harmony.find(h=>Math.abs(h.at-suspended.at)<.1);
  const tension=plan.harmony.find(h=>Math.abs(h.at-altered.at)<.1);
  assert.match(suspension.chord,/sus4/,'Ne pas remplacer la suspension par un 7 ordinaire');
  assert.match(tension.chord,/b9/,'La neuvième bémol ne doit pas disparaître');
  const tones=h=>new Set(h.notes.map(n=>(n%12+12)%12));
  assert(tones(suspension).has((7+shift+5)%12),'Quarte suspendue réellement jouée');
  assert(!tones(suspension).has((7+shift+4)%12),'Pas de tierce majeure contre la suspension');
  assert(tones(tension).has((7+shift+1)%12),'Neuvième bémol réellement jouée');
  const omitted=source.find(c=>/m7$/.test(c.name)&&c.at>10&&c.at<12);
  assert(omitted);assert(arrangementFrames(take).some(f=>Math.abs(f.at-omitted.at)<.1&&f.rolledSource),
    'L’accord arpeggié est reconnu grâce aux voix intérieures retardées');
  assert(!plan.harmony.some(h=>h.goal==='passing'&&h.at<omitted.end&&h.end>omitted.at),
    'Un accord source hors frames ne doit pas recevoir une dominante superposée');
  const originalTop=notePairs(take.events).find(p=>Math.abs(p.event.time-omitted.at)<.01);
  assert(changed.events.some(e=>JSON.stringify(e)===JSON.stringify(originalTop.event)),'La mélodie de l’accord roulé reste exacte');
  for(const at of new Set(changed.events.filter(e=>e.note!=null).map(e=>e.time+.00001))){
    const pitches=active(changed,at).map(p=>p.event.note);
    assert(!pitches.length||handDistribution(pitches),'Positions tenues et chevauchements jouables');
  }
}
assert.equal(JSON.stringify(original),originalText);
console.log('✓ Suspension, dominante altérée et accord arpeggié préservés dans cinq transpositions ; mains vérifiées sur toute la lecture.');

// Les anciennes cartes restent consultables ; une demande d'écoute les recalcule.
const take=read('session016'),oldPlan=buildPhraseArrangement(take);
const old={role:'assistant',content:'Ancienne proposition',toolResult:{originalTake:take,phraseHarmony:true,
  proposalPolicy:8,proposalDiversity:1,variants:[oldPlan],example:oldPlan.example,playingAdvice:oldPlan.advice}};
assert(answerActions(old,{last:true}).some(a=>a.label==='Écouter les nouvelles propositions'));
const saved=JSON.stringify(old);
const reply=await sendCopilotMessage({message:'Fais-moi entendre un exemple',messages:[old],context:{type:'session',playing:{session:take}}});
assert.equal(reply.toolResult.proposalPolicy,PROPOSAL_POLICY);assert.equal(PROPOSAL_POLICY,20);
assert(lowSupport(applyTakeEdit(take,reply.toolResult.playingAdvice.edit),5.9,70).length>=2);
assert.equal(JSON.stringify(old),saved);
assert.equal(requestedPersonalStyle('Propose une autre version de mon jeu.'),null);
assert.equal(requestedPersonalStyle('Une autre version de ma session'),null);
assert.equal(requestedPersonalStyle('Joue ma session en version salsa'),'salsa');
console.log('✓ Parcours Copilot normal : nouvelle génération sur demande, anciennes cartes et session conservées.');

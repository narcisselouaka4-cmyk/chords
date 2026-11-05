import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareProposals,selectDistinctProposals,PROPOSAL_DIVERSITY} from './proposal-diversity.js';
import {buildPhraseArrangement} from './phrase-arrangement.js';
import {sendCopilotMessage} from './copilot-client.js';
import {buildPlayingVariants} from './playing-variants.js';
import {answerActions} from './copilot-tab.js';

const events = blocks => blocks.flatMap((notes,i) => notes.flatMap(note => [
  {type:'noteOn',note,time:i*2,velocity:.6}, {type:'noteOff',note,time:i*2+1.8},
])).sort((a,b) => a.time-b.time);
const base=events([[48,55,60,64,67],[50,57,60,65,69],[52,59,62,67,71]]);
const voicing=events([[48,60,64,67,79],[50,60,65,69,81],[52,62,67,71,83]]);
const changed=events([[45,52,59,62,67],[47,54,61,64,69],[48,55,62,65,71]]);
const variant=(id,notes)=>({id,title:id,description:'ancienne description',advice:{edit:{},text:''},example:{events:notes}});
assert(!compareProposals(base,base.map(e=>({...e,velocity:.4,time:e.time+.015}))).distinct);
assert(!compareProposals(base,voicing).distinct,'Une autre disposition des mêmes couleurs ne suffit pas');
assert(compareProposals(base,changed).distinct);
const colors=events([[48,54,58,63,67],[50,56,59,63,69],[52,58,61,65,71]]);
assert(compareProposals(base,colors).distinct);
assert.match(selectDistinctProposals([variant('base',base),variant('couleur',colors)],base)[1].description,/d’autres accords changent la couleur/);
const sustain=notes=>[{type:'sustain',value:true,time:0},...notes,{type:'sustain',value:false,time:6}].sort((a,b)=>a.time-b.time);
const raw=base.map(e=>({...e,type:e.type==='noteOn'?'note_on':'note_off'}));
assert(!compareProposals(raw,base).distinct,'Les deux formats MIDI sont équivalents');
assert(!compareProposals(sustain(base),sustain(base)).distinct,'La pédale ne crée pas une fausse différence');
const tiny=[...base,{type:'noteOn',note:61,velocity:.4,time:.3},{type:'noteOff',note:61,time:.35}].sort((a,b)=>a.time-b.time);
assert(!compareProposals(base,tiny).distinct);
const oneMoment=events([[45,52,59,62,67],[50,57,60,65,69],[52,59,62,67,71]]);
assert(!compareProposals(base,oneMoment).distinct,'Une seule retouche sur une progression ne justifie pas une nouvelle carte');
const candidates=[variant('première',base),variant('copie',voicing),variant('autre basse',changed)];
const before=JSON.stringify(candidates);
const selected=selectDistinctProposals(candidates,base);
assert.equal(JSON.stringify(candidates),before);
assert.deepEqual(selected.map(v=>v.id),['première','autre basse']);
assert.match(selected[1].description,/Par rapport à la première.*basse.*0:00/);
assert.equal(selected[1].example.subtitle,selected[1].description);
assert.equal(selectDistinctProposals(candidates.slice(0,2),base).length,1);
assert.equal(selectDistinctProposals(candidates,base,{exclude:[JSON.stringify(base)]}).length,1);
assert.equal(selectDistinctProposals([],base).length,0);
console.log('✓ Sélection sonore : quasi-doublons, octaves, nuances, micro-décalages et retouches isolées écartés ; vraies alternatives conservées et expliquées sans mutation');

const read=file=>JSON.parse(fs.readFileSync(new URL('./fixtures/'+file,import.meta.url)));
for(const file of ['copilot-session017.json','copilot-development-take.json','copilot-approved-links.json','copilot-arpeggiated-take.json']){
  const data=read(file),take=data.take||data;
  const r=await sendCopilotMessage({message:'Fais-moi des propositions',messages:[],context:{type:'session',playing:{session:take}}});
  assert.equal(r.toolResult.variants.length,1,file);
  assert.match(r.content,/une seule version/);
  assert.equal(r.toolResult.proposalDiversity,PROPOSAL_DIVERSITY);
  assert.match(r.toolResult.variants[0].description,/mélodie/);
  assert.match(r.toolResult.variants[0].description,/accord/);
  assert(!/vélocité|\bms\b|voice.leading|score|ratio|%/.test(r.toolResult.variants[0].description));
  assert(r.toolResult.variants[0].harmony.length);
}
const take=read('copilot-session017.json');
const open=buildPhraseArrangement(take),linked=buildPhraseArrangement(take,{voicingMode:'linked'});
assert(!compareProposals(open.example.events,linked.example.events).distinct);
const old={role:'assistant',content:'Voici deux propositions',toolResult:{proposalPolicy:8,phraseHarmony:true,originalTake:take,variants:[open,linked],example:open.example,playingAdvice:open.advice}};
assert(answerActions(old,{last:false}).some(a=>a.label==='Écouter les nouvelles propositions'));
const updated=await sendCopilotMessage({message:'Fais-moi entendre un exemple',messages:[old],context:{type:'session',playing:{session:take}}});
assert.equal(updated.toolResult.variants.length,1,'Une ancienne paire en cache doit être recalculée');
const repeated=await sendCopilotMessage({message:'Fais-moi entendre un exemple',messages:[{role:'assistant',...updated}],context:{type:'session',playing:{session:take}}});
assert.deepEqual(repeated.toolResult.variants,updated.toolResult.variants);
const follow=await sendCopilotMessage({message:'Propose une autre version de mon jeu.',messages:[{role:'assistant',...updated}],context:{type:'session',playing:{session:take}}});
assert(!follow.toolResult.variants?.length,'Une demande répétée ne doit pas recycler une variante proche');
assert.match(follow.content,/pas trouvé d’autre version assez différente/);
console.log('✓ Quatre prises réelles : une proposition ; anciens caches renouvelés, réécoute stable, autre version refusée si trop proche');

const fixed={duration:6,events:events([[48,55,60,64],[50,57,60,65],[52,59,62,67]]).map(e=>({...e,type:e.type==='noteOn'?'note_on':'note_off'}))};
const multiple=buildPlayingVariants(fixed,{message:'En do majeur, enrichis mes accords, uniquement des accords fixes'});
assert(multiple.length>=2);
for(let i=0;i<multiple.length;i++)for(let j=0;j<i;j++)assert(compareProposals(multiple[i].example.events,multiple[j].example.events).distinct);
assert(multiple.slice(1).every(v=>/Par rapport à la première/.test(v.description)));
console.log('✓ Progression fixe : plusieurs propositions restent possibles quand les accords ou les basses se distinguent réellement');

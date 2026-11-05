import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gridChordName,proposalChordGrid,gridMoment} from './proposal-chord-grid.js';
import {buildPhraseVariants} from './phrase-variants.js';
import {sendCopilotMessage} from './copilot-client.js';

for(const [input,english,latin] of [
  ['Fadd9','Fadd9','Faadd9'],['Fadd9/A','Fadd9/A','Faadd9/La'],
  ['Fa majeur 9 / La','Fmaj9/A','Famaj9/La'],['Ré♭ mineur 11','D♭m11','Ré♭m11'],
  ['Mi 7♭9 sans fondamentale','E7♭9 (sans fond.)','Mi7♭9 (sans fond.)'],
  ['Mi7♭9 sans fondamentale','E7♭9 (sans fond.)','Mi7♭9 (sans fond.)'],
  ['Sol 7 altéré / Si','G7alt/B','Sol7alt/Si'],['Do 6/9','C6/9','Do6/9'],
]){
  assert.equal(gridChordName(input),english,input);
  assert.equal(gridChordName(input,'latin'),latin,input);
}
const take=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
assert.equal(gridMoment(9.0674,true),'0:09,0');assert.equal(gridMoment(9.5975,true),'0:09,5');assert.equal(gridMoment(61.4),'1:01');
const response=await sendCopilotMessage({message:'Fais-moi des propositions',context:{type:'session',playing:{session:take}},messages:[]});
const result=response.toolResult,before=JSON.stringify(result),grid=proposalChordGrid(result);
assert.equal(grid.rows.length,2);assert.equal(grid.columns.length,16);
assert.equal(grid.columns[0].cells[0].name,'Fadd9');assert.equal(grid.columns[0].cells[1].name,'Fmaj9');
for(const p of result.variants[0].harmony)assert(grid.columns.some(c=>Math.abs(c.at-p.at)<=.18&&c.cells[1]?.fullName===p.chord),p.chord);
assert(grid.columns.some(c=>c.cells[1].name==='Bm7b5'&&c.cells[0].name==='Em'));
assert(grid.columns.some(c=>c.cells[1].name==='E7b9b13'&&c.cells[0].name==='Em'));
assert.equal(grid.columns.at(-1).cells[1].name,'Cmaj9');
assert.deepEqual(proposalChordGrid(JSON.parse(JSON.stringify(result))),grid);
assert.equal(JSON.stringify(result),before);
assert(proposalChordGrid(result,{notation:'latin'}).columns[0].cells[0].name.startsWith('Fa'));
assert.equal(proposalChordGrid({}),null);
assert.equal(proposalChordGrid({originalTake:take,variants:[{advice:{changes:[]}}]}),null);
assert.equal(proposalChordGrid({originalTake:take,variants:result.variants.map(v=>({...v,advice:{...v.advice,version:6}}))}),null);
const small={originalTake:take,variants:[{title:'Passages rapprochés',advice:{changes:[
  {at:4,chord:'Do maj7',notes:[48,64,67]}, {at:4.1,chord:'Ré m7',notes:[50,65,69]},
]}}]};
const close=proposalChordGrid(small);
assert(close.columns.some(c=>c.at===4&&c.cells[1].name==='Cmaj7'));
assert(close.columns.some(c=>c.at===4.1&&c.cells[1].name==='Dm7'),'Deux passages proches ne doivent pas être fusionnés');
assert(close.columns.some(c=>c.at===10.459&&c.cells[1].name==='Am'),'Un accord non modifié reste visible');
const blocks=[[48,55,60,64],[50,57,60,65],[52,59,62,67]];
const fixed={duration:6,events:blocks.flatMap((notes,i)=>notes.flatMap(note=>[
  {type:'note_on',note,time:i*2,velocity:.7},{type:'note_off',note,time:i*2+1.8},
])).sort((a,b)=>a.time-b.time)};
const variants=buildPhraseVariants(fixed,{message:'En do majeur, enrichis mes accords, uniquement des accords fixes'});
const multi=proposalChordGrid({originalTake:fixed,variants});
assert.equal(multi.rows.length,variants.length+1);
assert(multi.columns.every(c=>c.cells.length===multi.rows.length));
console.log('✓ Grilles : noms anglais/latins et basses, 16 positions réelles dont 7–3, comparaison alignée, passages rapprochés, accords conservés, plusieurs versions, persistance sans mutation et absence de grille inventée');

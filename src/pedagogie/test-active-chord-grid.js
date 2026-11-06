import assert from 'node:assert/strict';
import {proposalChordGrid,activeChordColumn} from './proposal-chord-grid.js';
const notes=[[50,57,60,65],[53,60,64,69]];
const take={duration:6,events:notes.flatMap((ns,i)=>ns.flatMap(note=>[
 {type:'note_on',note,time:4+i,velocity:.65},{type:'note_off',note,time:4.8+i,velocity:0},
])).sort((a,b)=>a.time-b.time)};
const result={originalTake:take,variants:[{id:'test',title:'Proposition',advice:{version:4,changes:[
 {at:4,chord:'Dm7',notes:notes[0]},{at:5,chord:'Fmaj7',notes:notes[1]},
]}}]};
const grid=proposalChordGrid(result);assert(grid);
assert.equal(activeChordColumn(grid,1,3.99,6),-1);
const dm=activeChordColumn(grid,1,4,6);assert.equal(grid.columns[dm].cells[1].name,'Dm7');
assert.equal(activeChordColumn(grid,1,4.99,6),dm);
const f=activeChordColumn(grid,1,5,6);assert.equal(grid.columns[f].cells[1].name,'Fmaj7');assert.notEqual(dm,f);
assert.equal(activeChordColumn(grid,1,4.2,6),dm,'Un seek arrière retrouve Ré mineur');
assert.equal(activeChordColumn(grid,1,6,6),-1,'Fin du lecteur sans case active');
assert.equal(activeChordColumn(grid,1,NaN,6),-1);
const delayed=proposalChordGrid({...result,variants:[{...result.variants[0],advice:{version:4,changes:[
 {at:4.12,chord:'Dm9',notes:notes[0]},{at:5,chord:'Fmaj9',notes:notes[1]},
]}}]});
assert.equal(delayed.columns[0].at,4,'Les deux lignes sont visuellement regroupées');
assert.equal(activeChordColumn(delayed,0,4.05,6),0);
assert.equal(activeChordColumn(delayed,1,4.05,6),-1,'Pas d’illumination avant l’attaque réelle de la proposition');
assert.equal(activeChordColumn(delayed,1,4.12,6),0);
console.log('✓ Grille active : Ré mineur à 4 s, Fa à 5 s, seek arrière, avant l’entrée, fin et attaques regroupées sans anticipation.');

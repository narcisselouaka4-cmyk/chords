import assert from 'node:assert/strict';
import {createDemoPlayer} from '../exercise-demo-player.js';
import {bindPlaybackDrums} from './playback-drums.js';
import {initGlobalMetronome} from '../ui/global-metronome.js';
let rhythm,enabled=false,running=false;
const starts=[];
const drums={start:async args=>{starts.push(args);return true;},stop:()=>{},setVolume:()=>{},lastError:()=>null};
const metro={isRunning:()=>running,stop:()=>{running=false;}};
const player=createDemoPlayer({send:()=>{},onEnd:()=>rhythm.end(),setTimer:()=>1,clearTimer:()=>{},now:()=>0});
rhythm=bindPlaybackDrums({player,drumLoop:drums,metronome:()=>metro,enabled:()=>enabled});
const example={events:[{type:'noteOn',time:0,note:60,velocity:.8},{type:'noteOff',time:10,note:60}],beats:10};
player.play(example);rhythm.setKit('salsa',90);assert.equal(starts.length,0);
enabled=true;rhythm.sync();assert.equal(starts.length,1);
player.pause();player.resume();assert.equal(starts.length,2);assert.equal(starts.at(-1).kit,'salsa');
player.stop();player.play(example);player.seek(2);player.setRate(.5);player.pause();player.resume();assert.equal(starts.length,2,'Copilot ne reprend pas le kit de la démo précédente');
running=true;player.stop();assert(running,'fin du piano : le métronome démarré explicitement reste à la main du pianiste');
player.play(example);assert.equal(running,false,'une nouvelle écoute coupe le métronome, sans reprise implicite');
console.log('✓ Vrai lecteur : batterie désactivée, activation explicite, pause/reprise, kit oublié au changement de lecture, aucun redémarrage du métronome');

// La pulsation à la blanche transforme aussi la position de phase, pas
// seulement le BPM affiché : pause/recherche/vitesse gardent le même point.
player.play({...example,beats:20},{tempo:216,rate:1});
rhythm.setKit('salsa',216,2);
assert.equal(starts.at(-1).tempo,108);
assert.equal(starts.at(-1).getSyncPoint().beat,player.syncPoint().beat/2);
assert.equal(starts.at(-1).getSyncPoint().delayMs,player.syncPoint().delayMs);
player.seek(6);assert.equal(starts.at(-1).getBeat(),3);
assert.equal(starts.at(-1).getSyncPoint().beat,player.syncPoint().beat/2);
player.setRate(.5);assert.equal(starts.at(-1).tempo*starts.at(-1).rate,54);
player.pause();player.resume();assert.equal(starts.at(-1).getBeat(),3);
player.stop();
console.log('✓ Pulsation latine : 108 BPM, phase divisée par deux, recherche, vitesse et pause/reprise synchronisées');

class Node {
 constructor(){this.attrs={};this.handlers={};this.children=[];this.classList={toggle(){},remove(){}};this.hidden=true;}
 setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,f){this.handlers[k]=f;} contains(){return false;}
}
const nodes=new Map(['global-metronome','global-metronome-btn','global-metronome-panel','global-metronome-play','global-metronome-styles','global-metronome-beats'].map(k=>[k,new Node()]));
globalThis.document={getElementById:id=>nodes.get(id),addEventListener:()=>{}};
globalThis.window={localStorage:{getItem:()=>'{"running":true}',setItem(){}},addEventListener:()=>{}};
let frames=0,releaseAudio,releaseStart;
globalThis.requestAnimationFrame=()=>++frames;globalThis.cancelAnimationFrame=()=>{};
const before=starts.length;
const control=initGlobalMetronome({drumLoop:drums,styles:()=>[],resumeAudio:()=>new Promise(r=>{releaseAudio=r;})});
assert.equal(control.isRunning(),false);assert.equal(starts.length,before);
nodes.get('global-metronome-play').handlers.click();assert(control.isRunning());
control.stop();releaseAudio();await Promise.resolve();await Promise.resolve();assert.equal(starts.length,before);assert.equal(frames,0);
// Deuxième attente : arrêt pendant le décodage, sans résurrection des témoins.
drums.start=()=>new Promise(r=>{releaseStart=r;});
nodes.get('global-metronome-play').handlers.click();releaseAudio();await Promise.resolve();await Promise.resolve();assert(releaseStart);
control.stop();releaseStart(true);await Promise.resolve();await Promise.resolve();assert.equal(frames,0);assert.equal(control.isRunning(),false);
console.log('✓ Métronome réel : aucun démarrage restauré, arrêt prioritaire pendant le réveil audio et le décodage');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sendCopilotMessage,HEAR_IT_ACTION} from './copilot-client.js';
import {isPersonalExample,demoScope} from './personal-demo.js';

// Réglages et fournisseur simulés : aucun appel réseau réel.
// Les réglages d'IA ne se lisent que dans un environnement « navigateur » (openai-config.js) :
// sans `window`, la clé de test posée par connect() n'était jamais vue.
globalThis.window ??= {};
const store={};
Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k];}}});
const connect=()=>{store['piano-jazz-ai-config']=JSON.stringify({apiKey:'fake-key',baseUrl:'https://api.example.test/v1',model:'test-model',monthlyCap:50});};
const disconnect=()=>{delete store['piano-jazz-ai-config'];};
let calls=0;
const model=(content,tool_calls)=>{calls=0;globalThis.fetch=async()=>{calls+=1;return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content,...(tool_calls?{tool_calls}:{})}}]})};};};
const offline=()=>{calls=0;globalThis.fetch=async()=>{calls+=1;throw new Error('aucun appel attendu');};};
const quiet=console.log;console.log=(...a)=>{if(!String(a[0]).startsWith('[Copilot'))quiet(...a);};

const fixture=JSON.parse(readFileSync(new URL('./fixtures/copilot-approved-links.json',import.meta.url)));
const take=fixture.take||fixture;
const request={message:'Fais-moi entendre un exemple.',messages:[],context:null};
const named=r=>r.toolResult?.example?.source?.kind==='exemple nommé';

// ── Cas A : le jeu du pianiste (règle du 05/11, inchangée) ─────────────────────────────
offline();disconnect();
// Adapté le 11/11 : la règle « enregistre ton jeu » vaut quand la demande porte sur son jeu
// (0d93a04 l'appliquait à toute demande d'écoute, même sans prise ni référence à son jeu).
const missing=await sendCopilotMessage({...request,message:'Fais-moi entendre un exemple à partir de mon jeu.'});
assert(missing.ok);assert.equal(missing.toolResult.example,null);assert.match(missing.content,/Enregistre/);assert.equal(calls,0);
const made=await sendCopilotMessage({...request,messages:[{role:'user',take,content:'Améliore mon jeu'}]});
assert(made.toolResult.variants.length);assert(made.autoplay);assert(isPersonalExample(made.toolResult));assert.equal(calls,0);
const repeated=await sendCopilotMessage({...request,messages:[{role:'user',take},{role:'assistant',...made}]});
assert.deepEqual(repeated.toolResult.variants,made.toolResult.variants);
const fresh=await sendCopilotMessage({...request,messages:[{role:'user',take},{role:'assistant',...made},{role:'user',take:{duration:1,events:[{type:'note_on',note:60,time:0,velocity:.7},{type:'note_off',note:60,time:.5,velocity:0}]}}]});
assert(!fresh.toolResult.variants);assert.notEqual(fresh.toolResult.example,made.toolResult.example);
assert(!isPersonalExample({example:{kind:'chords',events:[]}}));
// Le modèle propose un voicing de bibliothèque pour une demande sur sa prise : jamais publié.
connect();
model('Voici une démonstration.',[{id:'w',type:'function',function:{name:'play_progression',arguments:JSON.stringify({chords:['G7','Cadd9']})}}]);
const personalHistory=[{role:'user',take,content:'Améliore mon jeu'},{role:'assistant',content:made.content,toolResult:made.toolResult}];
const generic=await sendCopilotMessage({message:'Montre-moi une démonstration.',messages:personalHistory,context:null,generationMode:'local'});
assert(!named(generic),'aucun exemple de bibliothèque à la place de sa prise');
assert(!generic.toolResult.example||isPersonalExample(generic.toolResult));
console.log('6/6 cas A : sans prise, prise historique, rejeu exact, nouvelle prise, ancien exemple générique, voicing de bibliothèque refusé.');

// ── Cas B : objet musical nommé, demandé à l'écoute, aucune prise ──────────────────────
// Le modèle répond sans appeler d'outil : l'application calcule l'exemple de l'accord nommé.
model('Voici un Do majeur 7.');
const chord=await sendCopilotMessage({message:'Fais-moi entendre un Do majeur 7',messages:[],context:null});
assert.equal(calls,1,'le modèle est consulté');assert.doesNotMatch(chord.content,/Enregistre|envoie ta prise/);
assert.equal(chord.toolResult.example?.title,'Cmaj7');assert(named(chord));assert.equal(chord.autoplay,true);assert(!isPersonalExample(chord.toolResult));
assert.deepEqual(chord.toolResult.example.source,{kind:'exemple nommé',object:'voicing',label:'Cmaj7'});
// Les contrôles déterministes s'appliquent de nouveau : nom annoncé contre notes jouées.
model('Voici un **Cmaj7**.',[65,68,72].map((midi,i)=>({function:{name:'play_note',arguments:JSON.stringify({midi,impliedChordName:'Cmaj7',startOffsetMs:i*80,durationMs:500})}})));
const wrong=await sendCopilotMessage({message:'Joue-moi un Cmaj7',messages:[],context:null});
assert.equal(calls,2,'nom annoncé ≠ notes jouées : une relance de correction');assert(named(wrong));
// Une source déjà posée n'est jamais écrasée (rejeu de sa prise).
offline();disconnect();
const replay=await sendCopilotMessage({message:'Rejoue mon jeu',messages:[],context:{type:'autonomous',playing:{passage:take}}});
assert.equal(typeof replay.toolResult.example?.source,'string');assert(isPersonalExample(replay.toolResult));
// Demande libre, sans prise ni objet nommé : le modèle la reçoit (plus de « enregistre ton jeu »).
connect();model('Que veux-tu entendre : un accord, une progression ?');
const open=await sendCopilotMessage({message:'Fais-moi entendre un exemple.',messages:[],context:null});
assert(calls>=1);assert.doesNotMatch(open.content,/Enregistre/);
console.log('5/5 cas B : accord nommé en français sans prise, provenance, contrôle nom/notes, source conservée, demande libre.');

// ── Cas C : explication seule, puis « Fais-le-moi entendre » ────────────────────────────
model('Un Do majeur 7 contient Do, Mi, Sol et Si.',[{id:'a',type:'function',function:{name:'play_voicing',arguments:JSON.stringify({chordSymbol:'Cmaj7'})}}]);
const explained=await sendCopilotMessage({message:'C’est quoi un Do majeur 7 ?',messages:[],context:null});
assert.equal(explained.toolResult.example,null,'aucun exemple imposé');assert.equal(explained.autoplay,false);assert.equal(explained.toolResult.played.length,0);
assert.equal(explained.suggestedActions[0]?.message,HEAR_IT_ACTION);
model('Écoute la septième majeure, tout en haut.');
const turns=[{role:'user',content:'C’est quoi un Do majeur 7 ?'},{role:'assistant',content:explained.content,toolResult:explained.toolResult}];
const heard=await sendCopilotMessage({message:HEAR_IT_ACTION,messages:turns,context:null});
assert.equal(heard.toolResult.example?.title,'Cmaj7');assert(named(heard));assert.equal(heard.autoplay,true);
console.log('2/2 cas C : explication sans son, puis exemple d’un clic.');

// ── Prise présente + accord nommé sans lien avec le jeu ────────────────────────────────
// Comportement retenu : la demande ne dit RIEN d'autre que « fais entendre <objet> » → cas B,
// exemple marqué « exemple nommé » ; la prise et ses propositions restent intactes.
model('Voici un Cmaj7.');
const beside=await sendCopilotMessage({message:'Fais-moi entendre un Cmaj7',messages:personalHistory,context:null});
assert.equal(calls,1);assert.equal(beside.toolResult.example?.title,'Cmaj7');assert(named(beside));
assert(!beside.toolResult.variants&&!beside.toolResult.originalTake,'pas présenté comme une proposition sur sa prise');
// Le moindre doute (« à la place du dernier accord ») : cas A, jamais un exemple de bibliothèque.
model('Voici un Cmaj9.',[{id:'a',type:'function',function:{name:'play_voicing',arguments:JSON.stringify({chordSymbol:'Cmaj9'})}}]);
const doubt=await sendCopilotMessage({message:'Fais-moi entendre un Cmaj9 à la place du dernier accord',messages:personalHistory,context:null,generationMode:'local'});
assert(!named(doubt));assert(!doubt.toolResult.example||isPersonalExample(doubt.toolResult));
// Relance « un exemple » dans un échange centré sur sa prise : ses propositions, sans modèle.
offline();
const again=await sendCopilotMessage({message:HEAR_IT_ACTION,messages:personalHistory,context:null,generationMode:'local'});
assert.equal(calls,0);assert.deepEqual(again.toolResult.variants,made.toolResult.variants);
// Une explication d'un accord nommé au milieu du même échange garde SON objet au clic suivant.
model('Écoute la quarte suspendue.');
const mixed=[...personalHistory,{role:'user',content:'C’est quoi un Csus4 ?'},{role:'assistant',content:'La quarte remplace la tierce.',toolResult:{played:[],ignored:0,suggestions:[{label:HEAR_IT_ACTION,message:HEAR_IT_ACTION}],example:null,voicing:null}}];
const inherited=await sendCopilotMessage({message:HEAR_IT_ACTION,messages:mixed,context:null});
assert.equal(inherited.toolResult.example?.title,'Csus4');assert(named(inherited));
console.log('4/4 prise présente : accord nommé seul (B), doute (A), relance sur la prise (A), objet expliqué puis écouté (B).');

// ── Portée lue seule ───────────────────────────────────────────────────────────────
const scope=(message,messages=[],context=null)=>demoScope({message,messages,context}).kind;
const withTake={type:'autonomous',playing:{passage:take}};
assert.equal(scope('Fais-moi entendre un exemple'),'open');
assert.equal(scope('joue un II–V–I en Do'),'named');
assert.equal(scope('fais-moi entendre une quinte juste',[],withTake),'named');
assert.equal(scope('Fais-moi entendre mes accords'),'personal');
assert.equal(scope('Fais-moi entendre une version enrichie'),'personal');
assert.equal(scope('Fais-moi entendre un exemple',[],withTake),'personal');
assert.equal(scope('ajoute un G7 avant le dernier accord',[],withTake),'personal');
assert.equal(scope('rejoue avec un G13 à la place du G7',[],withTake),'personal');
assert.equal(scope('Fais-moi entendre un exemple',[],{type:'tutorial',playing:{passage:take}}),'open','vidéo : son jeu seulement s’il le nomme');
console.log('9/9 portées : libre, nommé, personnel, doute, vidéo.');
process.exit(0);

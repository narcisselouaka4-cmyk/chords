import assert from 'node:assert/strict';
import fs from 'node:fs';
import {answerActions} from './copilot-tab.js';
import {personalVariantsAnswer} from './playing-variants.js';
const t=JSON.parse(fs.readFileSync(new URL('./fixtures/copilot-session017.json',import.meta.url)));
const context={playing:{passage:t}};
const first=personalVariantsAnswer({message:'Enrichis mes accords',context});assert(first.toolResult.variants.length);
const actions=answerActions({role:'assistant',...first},{last:true,asked:'Enrichis mes accords'});
assert.equal(actions[0].label,'Rejouer mon jeu');assert(actions.some(a=>a.label==='Détails'));const other=actions.find(a=>a.label==='Une autre proposition');assert(other);
const next=personalVariantsAnswer({message:other.message,messages:[{role:'assistant',...first}],context});assert(next);
const seen=new Set(first.toolResult.variants.map(v=>JSON.stringify(v.example.events)));
assert((next.toolResult.variants||[]).every(v=>!seen.has(JSON.stringify(v.example.events))));
assert(!answerActions({role:'assistant',content:'Voici comment lire cet accord.'},{last:true}).some(a=>a.label==='Une autre proposition'));
assert.equal(answerActions({role:'assistant',content:'Erreur',isError:true},{last:true}).length,0);
assert(!answerActions({role:'assistant',content:'Voici le détail.'},{last:true,asked:'Détails'}).some(a=>a.label==='Détails'));
const video=answerActions({role:'assistant',content:'Voici le passage relevé.',toolResult:{example:{source:{kind:'passage vidéo'}}}},{last:true});assert(video.some(a=>a.chooser==='key'));
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert(!html.includes('id="copilot-quick-actions"'));
const code=fs.readFileSync(new URL('./copilot-tab.js',import.meta.url),'utf8');assert(!code.includes('Un accord à explorer'));assert(!code.includes('Prenons le temps de l’écouter ensemble'));
console.log('✓ Actions adaptées à une proposition, relance distincte, détails sans boucle, passage vidéo, absence du bloc Continuer et du sous-titre');

const critique={role:'assistant',content:`Pour aller plus loin :
- à 0:15 (Gadd9/A) essaie d’écarter légèrement la seconde La2–Si2 pour aérer le registre grave ;
- à 0:20 déplace la note ;
- aux débuts 0:03, 0:05 et 0:08 plaque les accords en un seul geste pour rendre les accords plus nets.`};
const sessionActions=answerActions(critique,{last:true,source:'session'});
assert(sessionActions.length>=6);
assert.equal(sessionActions[0].message,'Rejoue ma session.');
assert(sessionActions.some(a=>a.message==='Plaquer les accords ensemble (moments 0:03, 0:05, 0:08)'));
assert(sessionActions.some(a=>a.message==='Aérer le grave à 0:15'));
assert(!sessionActions.some(a=>a.message.includes('0:20')));
assert(sessionActions.some(a=>a.label==='Écouter la main gauche'));
assert(sessionActions.some(a=>a.label==='Écouter la main droite'));
assert(!answerActions(critique,{last:true}).some(a=>a.message.includes('ma session')));
assert.equal(answerActions({...critique,isError:true},{last:true,source:'session'}).length,0);
const {sendCopilotMessage,wantsToHear}=await import('./copilot-client.js');
for(const action of sessionActions.filter(a=>/^(Rejoue|Plaquer|Aérer)/.test(a.message))){
 const r=await sendCopilotMessage({message:action.message,messages:[],context:{type:'session',playing:{session:t}}});
 assert(r.ok&&r.toolResult.example,action.message);
 if(action.message.startsWith('Rejoue'))assert(wantsToHear(action.message)&&r.autoplay);
}
console.log('✓ Session confiée sans toolResult : rejeu direct, corrections aux seuls moments cités et mains séparées exécutables sans modèle');

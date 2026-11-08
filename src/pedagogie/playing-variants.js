import {personalInterpretationRequest} from './proposal-explanation.js';
import {samePlayingSource} from './personal-source.js';
// Intentions harmoniques et mouvements calculés sur la prise personnelle.
import { buildPhraseVariants } from './phrase-variants.js';
import {PROPOSAL_DIVERSITY} from './proposal-diversity.js';
import {PROPOSAL_POLICY} from './proposal-policy.js';
import {requestedDegreeProgression} from './melody-progression.js';
import {melodyColorProfile} from './melody-color-profile.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();

export const buildPlayingVariants = buildPhraseVariants;

function continuedRequest(previous, message) {
 let inherited=previous||'';
 const key=/\b(?:en|tonalit[eé](?: de)?|ton(?: de)?)\s+(?:do|r[eé]|mi|fa|sol|la|si|[A-G])(?:[#♯♭b]| b[eé]mol| di[eè]se)?(?:\s+(?:majeur|mineur|major|minor))?(?=\s|[,.!?]|$)/giu;
 if([...message.matchAll(key)].length)inherited=inherited.replace(key,'');
 if(/basses?\s*:|basses?\s+par\s+quartes/i.test(message))inherited=inherited
  .replace(/basses?\s*:[^.!?\n]+/gi,'').replace(/(?:des\s+)?basses?\s+par\s+quartes/gi,'');
 if(/(?:arriv[eé]es|rep[eè]res)\s*:/i.test(message))inherited=inherited.replace(/(?:arriv[eé]es|rep[eè]res)\s*:[^\n.]+/gi,'');
 if(/(?:arriv[eé]es|rep[eè]res|appuis(?: valid[eé]s)?|finale|fin)\s*:|variante\s+[1-7]/i.test(message))inherited=inherited.replace(/appuis(?: valid[eé]s)?\s*:[^\n.]+/gi,'');
 if(/variante\s+[1-7](?:\s*[-–→]\s*[1-7])+/i.test(message))inherited=inherited.replace(/variante\s+[1-7](?:\s*[-–→]\s*[1-7])+[\s:]+[^\n.]+/gi,'');
 if(/(?:finale|fin)\s*:/i.test(message))inherited=inherited.replace(/(?:finale|fin)\s*:[^\n.]+/gi,'');
 if(/couleurs\s*:/i.test(message)||melodyColorProfile(message))inherited=inherited.replace(/couleurs\s*:[^\n.]+/gi,'');
 if(requestedDegreeProgression(message))inherited=inherited.replace(/\b\d+(?:\s*[-–—→]\s*\d+){1,7}\b/g,'');
 return `${inherited}\n${message}`;
}

export function personalVariantsAnswer({message,messages=[],context,preferences=[]}) {
 const text=plain(message),take=context?.playing?.passage;if(!take?.events?.length)return null;
 if(/hasard|n'importe quoi|aleatoire|sans intention|test des touches/.test(text))return null;
 if(/rejoue ma|re.e?coute ma|explique|quel.*style|upper.?structure|alle?g|supprim/.test(text)
  ||/drop\s*2/.test(text)&&!requestedDegreeProgression(message)&&!/accord.melodie|arrivees?/.test(text))return null;
 const boundary=messages.findLastIndex(m=>m.role==='user'&&m.take?.events?.length);
 const relevant=messages.slice(Math.max(0,boundary));
 const previous=[...relevant].reverse().find(m=>m.role==='assistant'&&!m.toolResult?.variants?.some(v=>v.advice?.version===6)&&samePlayingSource(m.toolResult?.originalTake,take)&&(m.toolResult?.phraseHarmony||m.toolResult?.fixedHarmony||m.toolResult?.variants?.length));
 const interpretation=personalInterpretationRequest(message);
 const hear=interpretation||/entendre|ecout|demonstration|\bdemo\b|montre.moi|joue.moi/.test(text);
 const broad=Boolean(requestedDegreeProgression(message))||interpretation||/^(?:fais|fait|faisons) comme (?:tu veux|vous voulez)|carte blanche/.test(text)||/(?:propose|fais|faire|donne).*(?:propositions?|versions?|variantes?)|transform.*(?:accord|progression|jeu|session)|accompagn.*(?:melodie|jeu)|enrich|reharmonis|voicings?|developp|mouvements?|liaisons?|accords? de passage|ameliore.*(?:jeu|progression|accord)|plusieurs (?:propositions|versions|variantes)|rends.*(?:accords|jeu).*(?:beau|riche)|(?:rajoute|ajoute|ajouter).*(?:mouvements|accords)|basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text);
 const follow=previous&&/une autre (?:version|proposition|variante)|encore|va plus loin|c'est tout|rien.*plus|ajout.*plus|autre chose|autre.*(?:couleur|accord)|(?:prefere|robot|catastroph|mieux).*(?:liaison|arpege)|(?:liaison|arpege).*(?:robot|catastroph|mieux)/.test(text);
 if(!broad&&!follow&&!(hear&&previous))return null;
 const inheritedDegrees=previous?.toolResult.harmonicRequest&&requestedDegreeProgression(previous.toolResult.harmonicRequest)
  &&!requestedDegreeProgression(message)&&!/oublie.*progression|sans progression|harmonie libre/.test(text);
 const baseRequest=(follow||inheritedDegrees)&&previous?.toolResult.harmonicRequest?continuedRequest(previous.toolResult.harmonicRequest,message):message;
 // Une consigne actuelle sur le même sujet remplace la préférence ancienne.
 const subjects=[/basse/i,/p[eé]dale|sustain/i,/mouvements?|passages?|accords? fixes/i,/tonalit[eé]/i,/appoggiatures?|grace notes?|ornements?/i];
 const activePreferences=preferences.filter(p=>!subjects.some(subject=>subject.test(message)&&subject.test(p)));
 const request=baseRequest
  +(activePreferences.length?`\nPréférences retenues :\n${activePreferences.join('\n')}`:'');
 const exclude=follow?relevant.filter(m=>samePlayingSource(m.toolResult?.originalTake,take)).flatMap(m=>m.toolResult?.variants||[]).map(v=>JSON.stringify(v.example?.events)):[];
 const variants=!broad&&!follow&&previous?.toolResult.proposalPolicy===PROPOSAL_POLICY&&previous.toolResult.proposalDiversity===PROPOSAL_DIVERSITY&&previous.toolResult.phraseHarmony&&previous.toolResult.variants?.length?previous.toolResult.variants:buildPhraseVariants(take,{message:request,exclude,constraints:context.harmonyConstraints});
 if(!variants.length)return {ok:true,content:follow?'Je n’ai pas trouvé d’autre version assez différente avec ces contraintes. Tu peux préciser la couleur ou l’arrivée que tu souhaites travailler.':'Je n’ai pas trouvé de proposition compatible avec cette prise. Précise les accords ou les basses que tu souhaites garder.',toolResult:{played:[],ignored:0,suggestions:[],voicing:null,proposalPolicy:PROPOSAL_POLICY,phraseHarmony:true,harmonicRequest:baseRequest,originalTake:take},suggestedActions:[]};
 const first=variants[0];
 const content=first.advice.goal==='accompany'?(first.colorProfile==='ccm'?'Je te propose des couleurs CCM sous ta mélodie : des suspendus et des tensions qui préparent leur arrivée. Je garde tes notes et ton rythme. Cette palette reste à juger à l’écoute ; ce n’est pas encore une conversion complète de style.':'J’ai ajouté un accompagnement sous ta mélodie, en gardant tes notes et ton rythme. Ce sont des accords proposés pour cette version, pas une grille que tu avais déjà jouée.'):variants.length>1?`Voici ${variants.length} propositions différentes. Sous chaque lecteur, je t’indique ce qui change. Ta mélodie reste en place.`
  :'Je te propose une seule version pour éviter des variantes trop proches. Sous le lecteur, je t’indique ce qui change. Ta mélodie reste en place.';
 return {ok:true,content,
  toolResult:{played:[],ignored:0,suggestions:[],voicing:null,proposalPolicy:PROPOSAL_POLICY,proposalDiversity:PROPOSAL_DIVERSITY,phraseHarmony:true,harmonicRequest:baseRequest,
   fixedHarmony:variants.every(v=>v.advice.edit.type==='fixed-harmony'),originalTake:take,example:first.example,playingAdvice:first.advice,variants},
  suggestedActions:[],autoplay:hear};
}

// Intentions harmoniques et mouvements calculés sur la prise personnelle.
import { buildPhraseVariants } from './phrase-variants.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();

export const buildPlayingVariants = buildPhraseVariants;

function continuedRequest(previous, message) {
 let inherited=previous||'';
 const key=/\b(?:en|tonalit[eé](?: de)?|ton(?: de)?)\s+(?:do|r[eé]|mi|fa|sol|la|si|[A-G])(?:[#♯♭b]| b[eé]mol| di[eè]se)?(?:\s+(?:majeur|mineur|major|minor))?(?=\s|[,.!?]|$)/giu;
 if([...message.matchAll(key)].length)inherited=inherited.replace(key,'');
 if(/basses?\s*:|basses?\s+par\s+quartes/i.test(message))inherited=inherited
  .replace(/basses?\s*:[^.!?\n]+/gi,'').replace(/(?:des\s+)?basses?\s+par\s+quartes/gi,'');
 return `${inherited}\n${message}`;
}

export function personalVariantsAnswer({message,messages=[],context}) {
 const text=plain(message),take=context?.playing?.passage;if(!take?.events?.length)return null;
 if(/rejoue ma|re.e?coute ma|explique|quel.*style|drop\s*2|upper.?structure|alle?g|supprim/.test(text))return null;
 const boundary=messages.findLastIndex(m=>m.role==='user'&&m.take?.events?.length);
 const relevant=messages.slice(Math.max(0,boundary));
 const previous=[...relevant].reverse().find(m=>m.role==='assistant'&&(m.toolResult?.phraseHarmony||m.toolResult?.fixedHarmony||m.toolResult?.variants?.length));
 const hear=/entendre|ecout|demonstration|\bdemo\b|montre.moi|joue.moi/.test(text);
 const broad=/enrich|reharmonis|voicings?|developp|mouvements?|liaisons?|accords? de passage|ameliore.*(?:jeu|progression|accord)|plusieurs (?:propositions|versions|variantes)|rends.*(?:accords|jeu).*(?:beau|riche)|(?:rajoute|ajoute|ajouter).*(?:mouvements|accords)|basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text);
 const follow=previous&&/encore|va plus loin|c'est tout|rien.*plus|ajout.*plus|autre chose|autre.*(?:couleur|accord)|(?:prefere|robot|catastroph|mieux).*(?:liaison|arpege)|(?:liaison|arpege).*(?:robot|catastroph|mieux)/.test(text);
 if(!broad&&!follow&&!(hear&&previous))return null;
 const request=follow&&previous.toolResult.harmonicRequest?continuedRequest(previous.toolResult.harmonicRequest,message):message;
 const exclude=follow?relevant.flatMap(m=>m.toolResult?.variants||[]).map(v=>JSON.stringify(v.example?.events)):[];
 const variants=!broad&&!follow&&previous?.toolResult.phraseHarmony&&previous.toolResult.variants?.length?previous.toolResult.variants:buildPhraseVariants(take,{message:request,exclude});
 if(!variants.length)return {ok:true,content:follow?'Je n’ai pas trouvé d’autre version assez différente avec ces contraintes. Tu peux préciser la couleur ou l’arrivée que tu souhaites travailler.':'Je n’ai pas trouvé de proposition compatible avec cette prise. Précise les accords ou les basses que tu souhaites garder.',toolResult:{played:[],ignored:0,suggestions:[],voicing:null,phraseHarmony:true,harmonicRequest:request,originalTake:take},suggestedActions:[]};
 const first=variants[0];
 const count=variants.length>1?`${variants.length} propositions`:'une proposition';
 return {ok:true,content:`Voici ${count}, avec des intentions différentes. Je conserve tes appuis mélodiques et leurs instants. Chaque version indique ce qu’elle change dans l’harmonie ou les liaisons.`,
  toolResult:{played:[],ignored:0,suggestions:[],voicing:null,phraseHarmony:true,harmonicRequest:request,
   fixedHarmony:variants.every(v=>v.advice.edit.type==='fixed-harmony'),originalTake:take,example:first.example,playingAdvice:first.advice,variants},
  suggestedActions:[],autoplay:hear};
}

// Chantier courant : accords et voicings fixes, guidés par le dessus et la basse.
import { buildFixedHarmonyVariants } from './fixed-harmony.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();

export const buildPlayingVariants = buildFixedHarmonyVariants;

export function personalVariantsAnswer({message,messages=[],context}) {
 const text=plain(message),take=context?.playing?.passage;if(!take?.events?.length)return null;
 if(/rejoue ma|re.e?coute ma|explique|quel.*style|drop\s*2|upper.?structure|alle?g|supprim/.test(text))return null;
 const boundary=messages.findLastIndex(m=>m.role==='user'&&m.take?.events?.length);
 const relevant=messages.slice(Math.max(0,boundary));
 const previous=[...relevant].reverse().find(m=>m.role==='assistant'&&(m.toolResult?.fixedHarmony||m.toolResult?.variants?.length));
 const hear=/entendre|ecout|demonstration|\bdemo\b|montre.moi|joue.moi/.test(text);
 const broad=/enrich|reharmonis|voicings?|ameliore.*(?:jeu|progression|accord)|plusieurs (?:propositions|versions|variantes)|rends.*(?:accords|jeu).*(?:beau|riche)|(?:rajoute|ajoute|ajouter).*(?:mouvements|accords)|basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text);
 const follow=previous&&/va plus loin|c'est tout|rien.*plus|ajout.*plus|autre chose|autre.*(?:couleur|accord)|(?:prefere|robot|catastroph|mieux).*(?:liaison|arpege)|(?:liaison|arpege).*(?:robot|catastroph|mieux)/.test(text);
 if(!broad&&!follow&&!(hear&&previous))return null;
 const variants=!broad&&!follow&&previous?.toolResult.fixedHarmony&&previous.toolResult.variants?.length?previous.toolResult.variants:buildFixedHarmonyVariants(take,{message});
 if(!variants.length)return {ok:true,content:'Je n’ai pas trouvé de voicing fixe compatible avec ces contraintes. Précise les basses ou joue les accords séparément en gardant la mélodie au-dessus.',toolResult:{played:[],ignored:0,suggestions:[],voicing:null,fixedHarmony:true,originalTake:take},suggestedActions:[]};
 const first=variants[0];
 const count=variants.length>1?`${variants.length} propositions de voicings fixes`:'une proposition de voicings fixes';
 return {ok:true,content:`Voici ${count}. Je garde tes notes du dessus et leurs vrais instants. Chaque version indique si elle conserve ton parcours de basse ou propose d’autres basses.`,
  toolResult:{played:[],ignored:0,suggestions:[],voicing:null,fixedHarmony:true,originalTake:take,example:first.example,playingAdvice:first.advice,variants},
  suggestedActions:[],autoplay:hear};
}

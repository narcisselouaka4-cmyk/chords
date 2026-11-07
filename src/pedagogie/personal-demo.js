import {samePlayingSource} from './personal-source.js';
import {personalVariantsAnswer} from './playing-variants.js';
import {PROPOSAL_DIVERSITY} from './proposal-diversity.js';
import {PROPOSAL_POLICY} from './proposal-policy.js';
import {requestedDegreeProgression} from './melody-progression.js';
import {melodyColorProfile} from './melody-color-profile.js';

// Une démonstration personnelle doit garder une prise comme source, même si
// le contexte live a disparu depuis le tour précédent.
export function personalDemoAnswer({message, messages = [], context, preferences = []}) {
  if (context?.type && !['autonomous','session'].includes(context.type)) return null;
  const hear = /entendre|écout|ecout|démonstration|demonstration|\bd[eé]mo\b|montre.moi|joue.moi/i.test(message || '');
  if (!hear) return null;
  const boundary = messages.findLastIndex(m => m.role === 'user' && m.take?.events?.length);
  const recent = messages.slice(Math.max(0, boundary));
  const previous = [...recent].reverse().find(m => m.role === 'assistant' && m.toolResult?.proposalPolicy===PROPOSAL_POLICY && m.toolResult?.proposalDiversity===PROPOSAL_DIVERSITY && m.toolResult?.variants?.length && m.toolResult.originalTake?.events?.length && !m.toolResult.variants.some(v=>v.advice?.version===6) && (!context?.playing?.passage?.events?.length || samePlayingSource(m.toolResult.originalTake, context.playing.passage)));
  const changedRequest=requestedDegreeProgression(message)||melodyColorProfile(message)||/\b(?:sans|garde|conserv|ajout|modif|change|transform|developp|arrivee|repere|variante|finale|fin\b|couleurs?\b|toucher|douceur|accord.melodie)/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  if (previous&&!changedRequest) return {ok:true, content:previous.toolResult.variants.length===1?'Voici la proposition préparée à partir de ta prise.':'Voici les propositions préparées à partir de ta prise.', toolResult:previous.toolResult, suggestedActions:[], autoplay:true};
  const take = context?.playing?.passage || (boundary >= 0 ? messages[boundary].take : null);
  if (take?.events?.length) {
    const answer = personalVariantsAnswer({message:`Améliore mon jeu avec plusieurs propositions.\n${message}`, messages:recent, context:{...context,playing:{...context?.playing,passage:take}},preferences});
    if (answer) return {...answer, autoplay:Boolean(answer.toolResult?.example)};
    return null; // La prise existe : laisser le chemin de technique répondre, sans demander de réenregistrer.
  }
  return {ok:true,content:'Enregistre ton jeu avec « Qu’en penses-tu ? », puis envoie la prise. Je pourrai te faire entendre des propositions à partir de ce que tu as joué.',toolResult:{played:[],ignored:0,suggestions:[],example:null,voicing:null},suggestedActions:[],autoplay:false};
}

export function isPersonalExample(result) {
  return Boolean((result?.example?.kind==='playing'&&['session','passage'].includes(result.example.source)) || result?.example?.comparison || result?.playingAdvice?.take?.events?.length);
}

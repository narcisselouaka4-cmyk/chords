import {samePlayingSource} from './personal-source.js';
import {personalVariantsAnswer} from './playing-variants.js';

// Une démonstration personnelle doit garder une prise comme source, même si
// le contexte live a disparu depuis le tour précédent.
export function personalDemoAnswer({message, messages = [], context}) {
  if (context?.type && !['autonomous','session'].includes(context.type)) return null;
  const hear = /entendre|écout|ecout|démonstration|demonstration|\bd[eé]mo\b|montre.moi|joue.moi/i.test(message || '');
  if (!hear) return null;
  const boundary = messages.findLastIndex(m => m.role === 'user' && m.take?.events?.length);
  const recent = messages.slice(Math.max(0, boundary));
  const previous = [...recent].reverse().find(m => m.role === 'assistant' && m.toolResult?.proposalPolicy===8 && m.toolResult?.variants?.length && m.toolResult.originalTake?.events?.length && !m.toolResult.variants.some(v=>v.advice?.version===6) && (!context?.playing?.passage?.events?.length || samePlayingSource(m.toolResult.originalTake, context.playing.passage)));
  if (previous) return {ok:true, content:'Voici les propositions préparées à partir de ta prise.', toolResult:previous.toolResult, suggestedActions:[], autoplay:true};
  const take = context?.playing?.passage || (boundary >= 0 ? messages[boundary].take : null);
  if (take?.events?.length) {
    const answer = personalVariantsAnswer({message:`Améliore mon jeu avec plusieurs propositions.\n${message}`, messages:recent, context:{...context,playing:{...context?.playing,passage:take}}});
    if (answer) return {...answer, autoplay:Boolean(answer.toolResult?.example)};
  }
  return {ok:true,content:'Enregistre ton jeu avec « Qu’en penses-tu ? », puis envoie la prise. Je pourrai te faire entendre des propositions à partir de ce que tu as joué.',toolResult:{played:[],ignored:0,suggestions:[],example:null,voicing:null},suggestedActions:[],autoplay:false};
}

export function isPersonalExample(result) {
  return Boolean((result?.example?.kind==='playing'&&['session','passage'].includes(result.example.source)) || result?.example?.comparison || result?.playingAdvice?.take?.events?.length);
}

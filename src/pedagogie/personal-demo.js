import {samePlayingSource} from './personal-source.js';
import {personalVariantsAnswer} from './playing-variants.js';
import {PROPOSAL_DIVERSITY} from './proposal-diversity.js';
import {PROPOSAL_POLICY} from './proposal-policy.js';
import {requestedDegreeProgression} from './melody-progression.js';
import {melodyColorProfile} from './melody-color-profile.js';
import {namedMusicalObject} from './intent-classifier.js';
import {isExplanationQuestion,explicitPlaybackRequest} from './proposal-explanation.js';

const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,' ').toLowerCase();

// [Claude] — 2026-11-11 — Portée d'une demande d'exemple. La règle du 05/11 (une démonstration
// part de la prise du pianiste, jamais d'un voicing de bibliothèque) reste entière pour son jeu,
// mais elle s'appliquait à tout : « fais-moi entendre un Do majeur 7 », sans aucune prise,
// recevait « enregistre ton jeu » sans que le modèle soit consulté.
//   'personal' : la demande porte sur son jeu (il le dit, ou l'échange contient une prise et
//                rien ne nomme autre chose) → une démonstration vient de sa prise, ou n'existe pas ;
//   'named'    : un objet musical est nommé (accord, progression, gamme, intervalle…) et la
//                demande ne dit rien d'autre → l'exemple de l'application est légitime ;
//   'open'     : ni prise ni objet nommé → le modèle reçoit la demande.
// Dans un échange qui contient une prise, le doute profite toujours à 'personal'.
const OWN_PLAYING=/\b(?:ma|mon|mes)\s+(?:prise|session|passage|jeu|melodie|main|mains|morceau|phrase|ligne|accords?|impro\w*|intro|version|voicings?|basse|dessus|top notes?|arpeges?|facon|enregistrement|progression|grille)\b|\bce que (?:j ai|je viens|je jouais|je joue)\b|\bj ai joue\b/;
// Les mots de l'application pour ce qu'elle prépare à partir d'une prise.
const PROPOSAL_WORDS=/\b(?:propositions?|variantes?|versions? (?:enrichie|developpee|amelioree|modifiee)s?)\b/;
// Ce qu'une demande contient en plus de l'objet nommé sans rien dire d'autre : les outils de la
// langue et les verbes d'écoute. Tout autre mot (« avec », « à la fin », « à la place »,
// « ajoute »…) laisse un doute sur le lien avec la prise.
const NEUTRAL_WORDS=new Set(`fais fait faire entendre ecouter ecoute reecouter joue joues jouez jouer montre montrer voir donne donner
 exemple exemples demo demonstration moi me m toi te t le l les un une des du de d en au aux a et ou y s il vous plait stp svp
 peux peut pourrais pourriez veux voudrais aimerais tu je j on est ce c que qu ca cela cet cette quoi ressemble sonne comment
 bonjour salut merci ok alors donc maintenant juste simplement bien oui`.split(/\s+/));

const personalResult=r=>Boolean(r&&(r.originalTake?.events?.length||r.variants?.length||r.playingAdvice||r.harmonyBrief||r.phraseHarmony||isPersonalExample(r)));

/** Portée de la demande, lue seule (sans regarder l'échange). */
/**
 * [Claude] — 2026-11-13 — L'objet musical que la phrase nomme, et rien d'autre (« fais-moi entendre
 * un Do majeur 7 ») : son étiquette (« Cmaj7 », « Dm7 → G7 → Cmaj7 »), sinon null. Tout mot qui
 * n'est pas une formule de politesse ou de demande (« lick », « puis », « à la place ») : null.
 */
export function onlyNamedObject(message){
  const object=namedMusicalObject(message);
  if(!object||!['chord','progression'].includes(object.kind))return null;
  return object.rest.every(word=>NEUTRAL_WORDS.has(word))?object.label:null;
}

function directScope(message,hasTake){
  const text=plain(message);
  if(OWN_PLAYING.test(text))return {kind:'personal',reason:'son jeu est nommé'};
  if(PROPOSAL_WORDS.test(text))return {kind:'personal',reason:'proposition sur une prise'};
  const object=namedMusicalObject(message);
  if(!object)return null;
  // Une question d'explication qui nomme son objet (« explique-moi l'harmonisation de Dm7 G7
  // Cmaj7 avec un exemple ») n'est pas une démonstration de son jeu : le doute ne joue pas.
  const explains=isExplanationQuestion(message)&&!explicitPlaybackRequest(message);
  if(hasTake&&!explains&&object.rest.some(word=>!NEUTRAL_WORDS.has(word)))return {kind:'personal',reason:'doute : la demande dit autre chose que l’objet nommé',object};
  return {kind:'named',object:{kind:object.kind,label:object.label}};
}

/**
 * @param {{message: string, messages?: object[], context?: object|null}} params
 * @returns {{kind: 'personal'|'named'|'open', reason?: string, object?: {kind: string, label: string}}}
 */
export function demoScope({message,messages=[],context}){
  // Vidéo, exercice : l'échange porte sur ce contenu ; son jeu seulement s'il le nomme.
  const ownSpace=!context?.type||['autonomous','session'].includes(context.type);
  const history=(messages||[]).filter(m=>m&&!m.isTyping&&!m.isError&&['user','assistant'].includes(m.role));
  const hasTake=ownSpace&&Boolean(context?.playing?.passage?.events?.length||context?.playing?.session?.events?.length
    ||(context?.type==='session'&&context.events?.length)||history.some(m=>m.take?.events?.length||personalResult(m.toolResult)));
  const direct=directScope(message,hasTake);
  if(direct)return direct;
  // Rien n'est nommé (« fais-le-moi entendre », « un exemple ») : le dernier objet discuté.
  // Une explication d'un objet nommé, sans lien avec son jeu, garde cet objet.
  const replyIndex=history.findLastIndex(m=>m.role==='assistant');
  if(replyIndex>=0&&!personalResult(history[replyIndex].toolResult)){
    for(let i=replyIndex-1;i>=0;i--){
      const m=history[i];
      if(m.role==='assistant'){if(personalResult(m.toolResult))break;continue;}
      if(m.take?.events?.length)break;
      const previous=directScope(m.content,hasTake);
      if(previous?.kind==='named')return {...previous,inherited:true};
      if(previous)break;
    }
  }
  return hasTake?{kind:'personal',reason:'l’échange contient une prise'}:{kind:'open'};
}

// Une démonstration personnelle doit garder une prise comme source, même si
// le contexte live a disparu depuis le tour précédent.
export function personalDemoAnswer({message, messages = [], context, preferences = []}) {
  if (context?.type && !['autonomous','session'].includes(context.type)) return null;
  const hear = /entendre|écout|ecout|démonstration|demonstration|\bd[eé]mo\b|montre.moi|joue.moi/i.test(message || '');
  if (!hear) return null;
  // Objet nommé, ou échange sans aucune prise : ce n'est pas une démonstration de son jeu.
  if (demoScope({message, messages, context}).kind !== 'personal') return null;
  const boundary = messages.findLastIndex(m => m.role === 'user' && m.take?.events?.length);
  const recent = messages.slice(Math.max(0, boundary));
  const previous = [...recent].reverse().find(m => m.role === 'assistant' && m.toolResult?.proposalPolicy===PROPOSAL_POLICY && m.toolResult?.proposalDiversity===PROPOSAL_DIVERSITY && m.toolResult?.variants?.length && m.toolResult.originalTake?.events?.length && !m.toolResult.variants.some(v=>v.advice?.version===6) && (!context?.playing?.passage?.events?.length || samePlayingSource(m.toolResult.originalTake, context.playing.passage)));
  const changedRequest=requestedDegreeProgression(message)||melodyColorProfile(message)||/\b(?:sans|garde|conserv|ajout|modif|change|transform|developp|arrivee|repere|appuis|variante|finale|fin\b|couleurs?\b|toucher|douceur|accord.melodie)/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
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

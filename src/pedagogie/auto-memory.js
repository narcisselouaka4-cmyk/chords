// [Claude] — 2026-11-11 — Mémoire automatique, maîtrisée (évolution de l'ADR-070, voir ADR-073).
//
// Narcisse (10/11) : « mémoriser automatiquement les éléments importants qui méritent de l'être ».
// Le modèle PROPOSE un souvenir pendant la conversation normale (outil `remember`, sans appel
// réseau de plus) ; l'application DÉCIDE, de façon déterministe, avant d'écrire quoi que ce soit :
//   - la citation doit se retrouver dans un message DU PIANISTE de cet échange — jamais une
//     phrase de l'assistant, jamais une théorie avancée par le modèle ;
//   - une circonstance du moment (« aujourd'hui », « pour cette fois ») n'est pas un souvenir durable ;
//   - rien qui ressemble à un secret ou à un chemin de fichier ;
//   - un souvenir oublié par le pianiste ne revient pas à partir de la même phrase ;
//   - pas de doublon ; une consigne plus récente REMPLACE l'ancienne, qui reste consultable.
// Chaque souvenir garde sa provenance (échange, message, citation, date) et peut être annulé,
// corrigé ou oublié dans Mémoire. Une « version approuvée » ne s'enregistre pas ici : elle reste
// un geste explicite du pianiste (bouton de Mémoire), faute de preuve suffisante dans un texte.

import { mutatePersonalMemories, memoryPrint, MEMORY_LIMIT } from './copilot-memory.js';

export const MEMORY_KINDS = ['preference', 'niveau', 'objectif', 'repertoire', 'materiel', 'pratique'];
const KIND_LABELS = { preference: 'préférence', niveau: 'niveau', objectif: 'objectif', repertoire: 'répertoire', materiel: 'matériel', pratique: 'habitude de travail' };

/** Outil proposé au modèle. L'application valide chaque appel avant d'enregistrer. */
export const REMEMBER_TOOL = {
  type: 'function',
  function: {
    name: 'remember',
    description: 'Propose de retenir, pour les prochaines conversations, une information durable que LE PIANISTE vient de dire sur lui-même : son niveau, son instrument, son objectif, son répertoire, une préférence stable. Jamais une circonstance du jour, jamais ta propre analyse, jamais une proposition que tu as faite. À utiliser rarement : seulement si cela aidera vraiment plus tard.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', description: 'Le souvenir, en une phrase courte à la troisième personne (« Joue sur un clavier 88 touches »).' },
        quote: { type: 'string', description: 'Les mots EXACTS du pianiste, recopiés de son message, qui le prouvent.' },
        kind: { type: 'string', enum: MEMORY_KINDS, description: 'Nature du souvenir.' },
        scope: { type: 'string', enum: ['durable', 'session'], description: '« durable » si cela vaut pour les prochaines conversations ; « session » si cela ne vaut que pour aujourd’hui.' },
        replaces: { type: 'string', description: 'Facultatif : le texte exact d’un souvenir déjà retenu que celui-ci contredit et remplace.' },
      },
      required: ['text', 'quote', 'kind', 'scope'],
    },
  },
};

/** Consigne courte ajoutée au contexte quand l'outil est disponible. */
export const REMEMBER_GUIDANCE = 'Mémoire : si le pianiste dit sur lui-même quelque chose de durable et utile pour plus tard (niveau, instrument, objectif, répertoire, préférence stable), appelle remember avec ses mots exacts. Ne retiens ni une circonstance du jour, ni tes propres suppositions, ni tes propositions. N’annonce pas toi-même que c’est retenu : l’application l’affiche.';

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’ʼ`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

// Une tournure qui borne la phrase à aujourd'hui : ce n'est pas une préférence durable.
const MOMENT = /\b(aujourd'hui|ce (?:soir|matin|midi)|cet(?:te)? (?:apres-midi|fois|semaine|seance|session)|pour (?:cette fois|l'instant|le moment|ce morceau|cette prise|ce passage|cet exercice)|la,? (?:maintenant|tout de suite)|en ce moment|juste (?:la|ici|pour)|exceptionnellement|pour une fois|tout a l'heure|demain)\b/;
// Ce qui ne doit jamais entrer dans la mémoire.
const SECRET = /\b(sk-[a-z0-9_-]{8,}|gsk_[a-z0-9]{8,}|api[_ -]?key|cle (?:api|secrete)|mot de passe|password|passwd|token|bearer\s+[a-z0-9._-]{8,}|iban|numero de carte)\b|[a-z0-9_-]{32,}|(?:\/home\/|\/users\/|[a-z]:\\)/i;

// Mots de reformulation permis dans le texte d'un souvenir sans figurer dans la phrase du pianiste
// (« Niveau intermédiaire », « Joue sur… », « Préfère… ») : ils disent la NATURE, pas le contenu.
const FRAMING = new Set(['pianiste', 'niveau', 'joue', 'jouer', 'prefere', 'preferer', 'aime', 'souhaite', 'veut', 'objectif',
  'prepare', 'travaille', 'travailler', 'utilise', 'possede', 'depuis', 'style', 'repertoire', 'clavier', 'piano', 'garder',
  'toujours', 'plutot', 'mieux', 'souvent', 'habitude', 'avec', 'pour', 'dans', 'sans', 'sous', 'plus', 'moins', 'apprend', 'debute']);
const contentWords = (value) => (plain(value).match(/[a-z0-9#]{4,}/g) || []).map((w) => w.replace(/s$/, ''));

/**
 * Le texte du souvenir reprend-il les mots du pianiste ? Au moins 70 % de ses mots de contenu
 * doivent se trouver dans son message, et au moins un. Sinon le modèle pourrait faire passer
 * n'importe quelle consigne pour une « déclaration du pianiste » en citant un bout de phrase réel.
 */
function textMatchesPianist(text, sourceText) {
  const said = new Set(contentWords(sourceText));
  const words = contentWords(text).filter((w) => !FRAMING.has(w));
  if (!words.length) return contentWords(text).some((w) => said.has(w));
  return words.filter((w) => said.has(w)).length / words.length >= 0.7;
}

/**
 * Valide un souvenir proposé par le modèle.
 * @param {object|string} candidate arguments de l'outil `remember`
 * @param {{messages: object[], conversationId?: string|null, existing?: object[], forgotten?: object[]}} context
 * @returns {{ok: true, entry: object, replacesId: string|null, duplicateOf: string|null} | {ok: false, reason: string, detail: string}}
 */
export function proposeAutoMemory(candidate, { messages = [], conversationId = null, existing = [], forgotten = [] } = {}) {
  const refuse = (reason, detail) => ({ ok: false, reason, detail });
  let input = candidate;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch (_) { return refuse('arguments', 'Arguments illisibles.'); } }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return refuse('arguments', 'Arguments attendus : un objet.');
  const unknown = Object.keys(input).filter((key) => !['text', 'quote', 'kind', 'scope', 'replaces'].includes(key));
  if (unknown.length) return refuse('arguments', `Argument inconnu : ${unknown.join(', ')}.`);
  const text = String(input.text ?? '').replace(/\s+/g, ' ').trim();
  const quote = String(input.quote ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 4 || text.length > 300) return refuse('texte', 'Le souvenir doit faire de 4 à 300 caractères.');
  if (quote.length < 6 || quote.length > 400) return refuse('citation', 'La citation doit faire de 6 à 400 caractères.');
  if (!MEMORY_KINDS.includes(input.kind)) return refuse('nature', 'Nature inconnue (une version approuvée se garde depuis Mémoire, par le pianiste).');
  if (!['durable', 'session'].includes(input.scope)) return refuse('portee', 'Portée inconnue.');
  if (SECRET.test(text) || SECRET.test(quote)) return refuse('secret', 'Un secret ou un chemin de fichier ne se mémorise pas.');

  // La preuve : la citation, dans un message du pianiste de CET échange.
  const wanted = plain(quote);
  const list = (Array.isArray(messages) ? messages : []).filter((m) => m && !m.isTyping);
  let number = 0;
  let source = null;
  list.forEach((m, index) => {
    if (m.role === 'user' && typeof m.content === 'string' && plain(m.content).includes(wanted)) { number = index + 1; source = m; }
  });
  if (!source) {
    const fromAssistant = list.some((m) => m.role === 'assistant' && typeof m.content === 'string' && plain(m.content).includes(wanted));
    return refuse(fromAssistant ? 'assistant' : 'citation', fromAssistant ? 'Cette phrase vient de l’assistant, pas du pianiste.' : 'Citation introuvable dans les messages du pianiste.');
  }
  // [Claude] — 2026-11-11 — Revue indépendante : la citation seule ne suffit pas, le TEXTE retenu doit
  // dire ce que le pianiste a dit (sinon une consigne injectée passerait pour une de ses déclarations).
  if (!textMatchesPianist(text, source.content)) return refuse('texte', 'Le souvenir ne reprend pas ce que le pianiste a dit.');
  // Une circonstance du moment n'est pas généralisée, quoi qu'en dise le modèle.
  if (input.scope === 'session' || MOMENT.test(wanted) || MOMENT.test(plain(text))) return refuse('ponctuel', 'Cela ne vaut que pour maintenant : rien n’est retenu durablement.');

  const print = memoryPrint(text);
  const quotePrint = memoryPrint(quote);
  // Oublié par le pianiste : la même phrase ne le recrée pas. S'il le redit plus tard, oui.
  const saidAt = Date.parse(source.timestamp || '') || 0;
  const blocked = (Array.isArray(forgotten) ? forgotten : []).find((f) => (f.print === print || (f.quotePrint && f.quotePrint === quotePrint))
    && (!saidAt || !Date.parse(f.forgottenAt || '') || saidAt <= Date.parse(f.forgottenAt)));
  if (blocked) return refuse('oublie', 'Le pianiste a demandé d’oublier ce souvenir.');

  const active = (Array.isArray(existing) ? existing : []).filter((e) => !e.supersededBy);
  const duplicate = active.find((e) => memoryPrint(e.text) === print || (e.quote && memoryPrint(e.quote) === quotePrint));
  let replacesId = null;
  if (input.replaces != null) {
    const target = active.find((e) => plain(e.text) === plain(input.replaces));
    if (target && (!duplicate || target.id !== duplicate.id)) replacesId = target.id;
  }
  if (!duplicate && existing.length >= MEMORY_LIMIT) return refuse('plein', 'La mémoire est pleine.');
  const now = new Date().toISOString();
  const entry = {
    id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    kind: input.kind,
    origin: 'auto',
    quote,
    source: { conversationId: conversationId || null, message: number, saidAt: source.timestamp || null },
    createdAt: now,
    updatedAt: now,
    ...(replacesId ? { supersedes: replacesId } : {}),
  };
  return { ok: true, entry, replacesId, duplicateOf: duplicate?.id || null };
}

/**
 * Enregistre un souvenir validé par proposeAutoMemory. Un doublon ne crée rien : sa date et sa
 * provenance sont mises à jour. Un souvenir contredit est marqué remplacé, pas supprimé.
 * @returns {Promise<{ok: boolean, entry?: object, created?: boolean, error?: string}>}
 */
export async function saveAutoMemory(proposal) {
  if (!proposal?.ok) return { ok: false, error: 'Souvenir non validé.' };
  let stored = null;
  let created = false;
  const result = await mutatePersonalMemories((data) => {
    const now = new Date().toISOString();
    const active = data.entries.filter((e) => !e.supersededBy);
    const same = active.find((e) => e.id === proposal.duplicateOf)
      || active.find((e) => memoryPrint(e.text) === memoryPrint(proposal.entry.text));
    if (same) {
      // Redit : même souvenir, provenance la plus récente ajoutée.
      stored = { ...same, updatedAt: now, sources: [...(same.sources || (same.source ? [same.source] : [])), proposal.entry.source].slice(-5) };
      created = false;
      return { data: { ...data, entries: data.entries.map((e) => (e.id === same.id ? stored : e)) } };
    }
    if (data.entries.length >= MEMORY_LIMIT) return { error: 'La mémoire est pleine.' };
    stored = proposal.entry;
    created = true;
    const entries = data.entries.map((e) => (proposal.replacesId && e.id === proposal.replacesId ? { ...e, supersededBy: stored.id, supersededAt: now } : e));
    return { data: { ...data, entries: [...entries, stored] } };
  }, { present: (data) => !stored || data.entries.some((e) => e.id === stored.id) });
  return result.ok ? { ok: true, entry: stored, created } : { ok: false, error: result.error };
}

/**
 * « Annuler » sous une réponse : le souvenir automatique qui vient d'être créé disparaît, laisse
 * une trace d'oubli (la même phrase ne le recréera pas) et le souvenir qu'il remplaçait revient.
 */
export async function undoAutoMemory(id) {
  let restored = null;
  const result = await mutatePersonalMemories((data) => {
    const gone = data.entries.find((e) => e.id === id);
    if (!gone) return {};
    const now = new Date().toISOString();
    const entries = data.entries.filter((e) => e.id !== id).map((e) => {
      if (e.supersededBy !== id) return e;
      const { supersededBy, supersededAt, ...back } = e;
      restored = back.id;
      return back;
    });
    const trace = { print: memoryPrint(gone.text), ...(gone.quote ? { quotePrint: memoryPrint(gone.quote) } : {}), kind: gone.kind || null, origin: gone.origin || 'auto', ...(gone.source ? { source: gone.source } : {}), forgottenAt: now };
    return { data: { ...data, entries, forgotten: [...data.forgotten, trace].slice(-MEMORY_LIMIT) } };
  }, { present: (data) => !data.entries.some((e) => e.id === id) });
  return result.ok ? { ok: true, restored } : { ok: false, error: result.error };
}

/** Ce que le pianiste lit sous la réponse quand un souvenir vient d'être retenu. */
export function memoryNoticeText(entry) {
  return `Retenu pour nos prochaines conversations (${KIND_LABELS[entry.kind] || 'souvenir'}) : « ${entry.text} »`;
}

/** D'où vient un souvenir, en clair, pour le panneau Mémoire. */
export function memoryProvenance(entry) {
  const date = (iso) => { const d = new Date(iso || ''); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const origin = entry.origin === 'auto' ? 'Retenu automatiquement' : 'Ajouté par toi';
  const when = date(entry.createdAt);
  const quote = entry.quote ? ` — tu as dit : « ${entry.quote.length > 140 ? `${entry.quote.slice(0, 140)}…` : entry.quote} »` : '';
  const edited = entry.corrections?.length ? ` · corrigé le ${date(entry.corrections.at(-1).at)}` : '';
  return `${origin}${when ? ` le ${when}` : ''}${edited}${quote}`;
}

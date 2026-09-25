// [Claude] — 2026-09-09 — Copilot IA : contrôleur du sous-onglet.
//
// Orchestration pure : écoute la sélection Pédagogie, charge l'historique,
// gère le chat, appelle copilot-client.js. Aucune décision musicale ici.

import {
  createConversation,
  loadHistory,
  saveHistory,
  deleteConversation,
  deleteEmptyConversations,
  listAllConversations,
  labelForConversationPath,
  AUTONOMOUS_HISTORY_KEY as HISTORY_AUTONOMOUS_KEY,
} from './copilot-history.js';
import { sendCopilotMessage } from './copilot-client.js';
import { hasAIKey } from '../ai/openai-config.js';
import { liveTake, passageShift, exampleToSessionEvents } from '../recorder/live-take.js';
import { reviewTake, takeMoment, passageToExample, momentText } from '../recorder/take-review.js';
import { readCopilotContext } from './copilot-context.js';

const els = {};
let currentTutorialPath = null;
let messages = [];
let currentConversationId = null;
// Exemple du Copilote en cours de lecture (identifiant du message), ou null.
let playingExampleId = null;
// [Claude] — 2026-09-25 — Portrait du dernier passage joué (« Qu'en penses-tu ? »),
// gardé pour les questions de suivi de la même conversation.
let lastTakeContext = null;
const DEFAULT_REVIEW_QUESTION = 'Qu\'en penses-tu de ce que je viens de jouer ?';

export const AUTONOMOUS_HISTORY_KEY = HISTORY_AUTONOMOUS_KEY;
let currentMode = 'autonomous';
let currentSessionId = null;
let currentSessionContext = null;
// [Claude] — 2026-09-25 — Mode exercice : le Copilote parle de l'exercice affiché
// (Narcisse : relier le Copilote et l'onglet Exercices).
let currentExerciseId = null;
let currentExerciseTitle = null;

/**
 * Nouveau mode à adopter quand la sélection de tutoriel ou de session change.
 * Le mode NE bascule JAMAIS automatiquement vers 'tutorial' ou 'session' (ça
 * reste une action explicite de l'utilisateur) — seule la DÉSÉLECTION pendant
 * qu'on est déjà en mode tutoriel ou session force un repli automatique vers
 * 'autonomous', puisque le prisme 2/3 ne peut pas exister sans contexte.
 */
export function nextModeOnSelectionChange(currentMode, newTutorialPath, newSessionId) {
  if (currentMode === 'tutorial' && !newTutorialPath) return 'autonomous';
  if (currentMode === 'session' && !newSessionId) return 'autonomous';
  return currentMode;
}

/** État du bouton de bascule (visibilité + libellé) selon mode + sélection. */
export function toggleButtonState(mode, tutorialPath) {
  if (mode === 'tutorial' || mode === 'session' || mode === 'exercise') {
    return { visible: true, label: 'Revenir au mode autonome' };
  }
  return { visible: Boolean(tutorialPath), label: 'Mode tutoriel' };
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'innerHTML') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds) % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Renvoie un résumé du tutoriel pour le contexte IA. */
// [Claude] — 2026-09-25 — Le contexte vient de l'écran Pédagogie (grille, parole,
// résumé, notes du professeur). Avant, il lisait window.__pedagogieAnalysis, que
// rien n'affectait : le Copilote ne recevait que le chemin du fichier.
function getTutorialContext() {
  if (currentMode !== 'tutorial' || !currentTutorialPath) return null;
  const context = readCopilotContext('tutorial');
  if (context && context.path === currentTutorialPath) return context;
  return {
    type: 'tutorial',
    path: currentTutorialPath,
    name: currentTutorialPath.split('/').pop(),
    notesUnavailable: 'le tutoriel n\'a pas encore été lu dans Pédagogie IA (bouton « Lire ce tutoriel »)',
  };
}

/** Renvoie un résumé de la session MIDI pour le contexte IA. */
function getSessionContext() {
  if (currentMode !== 'session' || !currentSessionContext) return null;
  return currentSessionContext;
}

/** Exercice affiché (relu à chaque question : étape, tonalité et essais à jour). */
function getExerciseContext() {
  if (currentMode !== 'exercise') return null;
  return readCopilotContext('exercise');
}

/** Clé de l'historique de la conversation selon le mode (tutoriel, session, exercice, autonome). */
function historyKeyForMode() {
  if (currentMode === 'tutorial' && currentTutorialPath) return currentTutorialPath;
  if (currentMode === 'session' && currentSessionId) return currentSessionId;
  if (currentMode === 'exercise' && currentExerciseTitle) return `exercice:${currentExerciseTitle}`;
  return AUTONOMOUS_HISTORY_KEY;
}

// Propositions du mode exercice (envoyées d'un clic, comme les autres).
const EXERCISE_QUICK_ACTIONS = [
  { label: 'Ce voicing', message: 'Explique-moi le voicing de la carte : le rôle de chaque note et pourquoi il marche.' },
  { label: 'Comment le jouer', message: 'Comment je joue l\'accord en cours à deux mains ?' },
  { label: 'Enchaînement', message: 'Comment enchaîner les accords de l\'exercice : quelles voix bougent ?' },
  { label: 'Fais-moi entendre', message: 'Fais-moi entendre les accords de la carte.' },
];
let defaultQuickActions = null;

/** Propositions sous la conversation : celles de l'exercice en mode exercice, sinon celles de la page. */
function renderQuickActionsForMode() {
  if (!els.quickActions) return;
  if (!defaultQuickActions) defaultQuickActions = [...els.quickActions.querySelectorAll('.copilot-chip')].map((b) => ({ label: b.textContent, message: b.dataset.message }));
  const list = currentMode === 'exercise' ? EXERCISE_QUICK_ACTIONS : defaultQuickActions;
  els.quickActions.querySelectorAll('.copilot-chip').forEach((b) => b.remove());
  // Juste après « Continuer : » (le sélecteur de style reste au bout de la rangée).
  const chips = list.map((a) => el('button', { type: 'button', className: 'copilot-chip', 'data-message': a.message, text: a.label }));
  const label = els.quickActions.querySelector('.copilot-quick-actions-label');
  if (label) label.after(...chips);
  else els.quickActions.prepend(...chips);
}

const STATIC_QUICK_ACTIONS = [
  { label: 'Voicing', message: 'Montre-moi un voicing intéressant pour cet accord.' },
  { label: 'Main gauche', message: 'Qu’est-ce que la main gauche peut jouer ici ?' },
  { label: 'Main droite', message: 'Qu’est-ce que la main droite peut jouer ici ?' },
  { label: 'Arpège', message: 'Fais-moi un arpège lent.' },
  { label: 'Démonstration', message: 'Fais-moi une démonstration au clavier.' },
  { label: 'Lick', message: 'Fais-moi un lick adapté.' },
];

/** [Astra round 4] Rangée de suggestions, dans la grammaire .tr-chat-demos de
 * la maquette : icône, libellé, et une petite mention de ce que fait le clic.
 * Ce sont de vraies actions (elles envoient la question au Copilot), pas des
 * boutons d'écoute décoratifs. */
function renderActionChips(actions) {
  if (!actions?.length) return null;
  const container = el('div', { className: 'tr-chat-demos copilot-message-actions' });
  for (const action of actions) {
    const btn = el('button', {
      className: 'copilot-chip',
      type: 'button',
      title: action.message,
      onClick: () => {
        if (!els.input) return;
        els.input.value = action.message;
        sendUserMessage();
      },
    });
    btn.innerHTML = ICON_SPARKLE;
    btn.appendChild(el('span', { text: action.label }));
    btn.appendChild(el('small', { text: 'Demander' }));
    container.appendChild(btn);
  }
  return container;
}

/** [Refonte 12/09 — détails] Accueil affiché quand la conversation est vide
 * mais que le Copilot est configuré (habillage repris d'Astra, classes déjà
 * stylées par astra-training.css : .tr-copilot-welcome / .tr-prompt-options).
 * Les suggestions utilisent les libellés exacts de la maquette Astra
 * (CopilotView.tsx, .tr-prompt-options). */
function renderCopilotWelcome() {
  const heading = el('h2', {}, [
    document.createTextNode('Une question.'),
    el('br'),
    el('span', { text: 'De nouvelles possibilités.' }),
  ]);

  // [Astra round 5] — L'objet IA en relief au-dessus du titre (trois plans
  // décalés + étincelle), déjà stylé par .tr-ai-object dans astra-training.css.
  const aiObject = el('div', { className: 'tr-ai-object' });
  aiObject.setAttribute('aria-hidden', 'true');
  aiObject.innerHTML = `<div></div><div></div><div></div>${ICON_SPARKLE_LG}`;

  const options = el('div', { className: 'tr-prompt-options' });
  const welcomeActions = [
    { label: 'Enrichir mes voicings', icon: ICON_PIANO_MD, message: 'Montre-moi un voicing intéressant pour cet accord.' },
    { label: 'Comprendre un 2-5-1', icon: ICON_MUSIC2, message: 'Explique-moi l\'harmonie d\'un 2-5-1.' },
    { label: 'Mieux accompagner', icon: ICON_SPARKLE_MD, message: 'Comment mieux accompagner une mélodie ?' },
  ];
  for (const action of welcomeActions) {
    // Icône à gauche, libellé, flèche à droite : c'est ce que la maquette
    // dessine, et .tr-prompt-options > button les cible dans cet ordre.
    const btn = el('button', {
      type: 'button',
      title: action.message,
      onClick: () => {
        if (!els.input) return;
        els.input.value = action.message;
        sendUserMessage();
      },
    });
    btn.innerHTML = action.icon;
    btn.appendChild(el('span', { text: action.label }));
    btn.insertAdjacentHTML('beforeend', ICON_ARROW_UP_RIGHT);
    options.appendChild(btn);
  }

  const intro = el('p', {}, [
    document.createTextNode('Un voicing à explorer, une progression à comprendre.'),
    el('br'),
    document.createTextNode('Prenons le temps de l’écouter ensemble.'),
  ]);

  return el('div', { className: 'tr-copilot-welcome' }, [
    aiObject,
    el('span', { className: 'tr-eyebrow', text: 'VOTRE PARTENAIRE D’HARMONIE' }),
    heading,
    intro,
    options,
  ]);
}

function autoGrowInput() {
  const field = els.input;
  if (!field || field.tagName !== 'TEXTAREA') return;
  field.style.height = 'auto';
  field.style.height = `${Math.min(110, field.scrollHeight)}px`;
}

const ICON_SPARKLE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.81 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.81a2 2 0 0 1 1.29-1.29L21 12l-5.81-1.9a2 2 0 0 1-1.29-1.29z"/></svg>';
const ICON_SPARKLE_LG = '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.81 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.81a2 2 0 0 1 1.29-1.29L21 12l-5.81-1.9a2 2 0 0 1-1.29-1.29z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/></svg>';
const ICON_SPARKLE_MD = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.81 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.81a2 2 0 0 1 1.29-1.29L21 12l-5.81-1.9a2 2 0 0 1-1.29-1.29z"/></svg>';
const ICON_PIANO_MD = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v10M11 4v10M15 4v10M19 4v10M2 14h20"/></svg>';
const ICON_MUSIC2 = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/></svg>';
const ICON_ARROW_UP_RIGHT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';
const ICON_PIANO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v10M11 4v10M15 4v10M19 4v10M2 14h20"/></svg>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** [Astra round 4] Le modèle répond en markdown léger : sans traitement, les
 * réponses affichaient « **ii-V-I** » avec ses astérisques, et tous les
 * paragraphes collés en un seul pavé. Astra découpe le texte sur les retours à
 * la ligne, un <p> par ligne ; on fait pareil, en rendant en plus le gras. */
// [Claude] — 2026-09-25 — Un moment écrit par le Copilote (« 0:12 », « 0:12,4 ») :
// un lien qui le rejoue et le montre au clavier (session, ou passage joué).
const MOMENT_PATTERN = /(^|[^\d:])(\d{1,2}):([0-5]\d)(?:,(\d))?(?![\d:])/g;

function renderMessageText(container, content, { momentLinks = false } = {}) {
  const lines = String(content || '').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const p = document.createElement('p');
    let html = escapeHtml(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (momentLinks) {
      html = html.replace(MOMENT_PATTERN, (all, before, m, sec, tenth) => {
        const time = Number(m) * 60 + Number(sec) + (tenth ? Number(tenth) / 10 : 0);
        return `${before}<button type="button" class="copilot-moment-link" data-moment="${time}" title="Réécouter ce moment et le voir au clavier">${m}:${sec}${tenth ? `,${tenth}` : ''}</button>`;
      });
    }
    p.innerHTML = html;
    container.appendChild(p);
  }
  if (!container.childElementCount) container.appendChild(el('p', { text: String(content || '') }));
}

const FRENCH_NOTES = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const frenchNote = (midi) => `${FRENCH_NOTES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const ICON_PLAY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_STOP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';

/** Identifiant stable de l'exemple d'un message (pour le bouton Écouter / Arrêter). */
function exampleIdOf(msg) {
  if (!msg.exampleId) msg.exampleId = `ex-${msg.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return msg.exampleId;
}

/**
 * Carte « Écouter l'exemple » : titre (accords), style, et ce que fait chaque
 * main pour chaque accord (quatre accords au plus), sous l'explication.
 */
function renderExampleCard(msg) {
  const example = msg.toolResult.example;
  const id = exampleIdOf(msg);
  const playing = playingExampleId === id;
  const card = el('div', { className: `tr-chat-demos copilot-example${playing ? ' is-playing' : ''}`, 'data-example-id': id });
  const button = el('button', {
    className: 'copilot-example-play',
    type: 'button',
    'aria-pressed': playing ? 'true' : 'false',
    onClick: () => toggleExample(msg),
  });
  button.innerHTML = playing ? ICON_STOP : ICON_PLAY;
  button.appendChild(el('span', { text: playing ? 'Arrêter' : 'Écouter l\'exemple' }));
  card.appendChild(el('div', { className: 'copilot-example-buttons' }, [button]));
  const text = el('div', { className: 'copilot-example-text' }, [
    el('strong', { text: example.title || 'Exemple' }),
    example.subtitle ? el('small', { text: example.subtitle }) : null,
  ]);
  const hands = (example.chords || []).slice(0, 4).filter((c) => c.leftHand?.length || c.rightHand?.length);
  if (hands.length) {
    const list = el('ul', { className: 'copilot-example-hands' });
    for (const c of hands) {
      const parts = [];
      if (c.leftHand?.length) parts.push(`main gauche ${c.leftHand.map(frenchNote).join(' ')}`);
      if (c.rightHand?.length) parts.push(`main droite ${c.rightHand.map(frenchNote).join(' ')}`);
      list.appendChild(el('li', {}, [el('b', { text: c.name }), document.createTextNode(` — ${parts.join(' · ')}`)]));
    }
    text.appendChild(list);
  }
  card.appendChild(text);
  return card;
}

/** Lecture / arrêt de l'exemple d'un message (même lecteur que les démos, voir main.js). */
function toggleExample(msg) {
  const id = exampleIdOf(msg);
  if (playingExampleId === id) {
    document.dispatchEvent(new CustomEvent('copilot-stop-example'));
    return;
  }
  const example = msg.toolResult.example;
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id, example } }));
}

/** Met à jour le bouton de la carte qui joue (ou vient de s'arrêter), sans tout redessiner. */
function refreshExampleCards() {
  if (!els.messages) return;
  els.messages.querySelectorAll('.copilot-example').forEach((card) => {
    const playing = card.dataset.exampleId === playingExampleId;
    card.classList.toggle('is-playing', playing);
    const button = card.querySelector('.copilot-example-play');
    if (!button) return;
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.innerHTML = playing ? ICON_STOP : ICON_PLAY;
    button.appendChild(el('span', { text: playing ? 'Arrêter' : card.dataset.playLabel || 'Écouter l\'exemple' }));
  });
}

/**
 * [Claude] — 2026-09-25 — Carte « Ton passage » sous la question d'un « Qu'en
 * penses-tu ? » : ce que l'application a reconnu (accords et mains, voicing,
 * lignes et gamme), Réécouter (touches allumées, rôles au clavier), et les
 * suggestions, qu'un clic montre au clavier (ton « assistant, pas coach »).
 */
function renderTakeCard(msg) {
  const take = msg.take;
  const id = exampleIdOf(msg);
  const playing = playingExampleId === id;
  const card = el('div', { className: `tr-chat-demos copilot-example copilot-take${playing ? ' is-playing' : ''}`, 'data-example-id': id, 'data-play-label': 'Réécouter' });
  const buttons = el('div', { className: 'copilot-example-buttons' });
  if (take.example) {
    const button = el('button', { className: 'copilot-example-play', type: 'button', 'aria-pressed': playing ? 'true' : 'false', onClick: () => toggleTakeReplay(msg) });
    button.innerHTML = playing ? ICON_STOP : ICON_PLAY;
    button.appendChild(el('span', { text: playing ? 'Arrêter' : 'Réécouter' }));
    buttons.appendChild(button);
  }
  // [Claude] — 2026-09-25 — Sessions = journal : le passage se garde d'un clic.
  if (take.example) {
    const saved = take.savedSessionId;
    buttons.appendChild(el('button', {
      className: 'copilot-example-steps copilot-take-keep', type: 'button',
      title: saved ? 'Ouvrir ce passage dans Sessions MIDI' : 'Garder ce passage dans Sessions MIDI (le journal de tes enregistrements)',
      disabled: take.saving ? 'disabled' : null,
      onClick: () => (saved ? openSavedSession(saved) : keepTakeInSessions(msg)),
      text: saved ? 'Gardé · Ouvrir' : take.saving ? 'Enregistrement…' : 'Garder dans mes sessions',
    }));
  }
  if (buttons.children.length) card.appendChild(buttons);
  const text = el('div', { className: 'copilot-example-text' }, [
    el('strong', { text: `Ton passage · ${takeMoment(take.duration)} · ${take.noteCount} note${take.noteCount > 1 ? 's' : ''}` }),
    el('small', { text: take.verdict }),
  ]);
  const rows = [
    ...(take.chords || []).slice(0, 5).map((c) => {
      const hands = c.oneHand ? `une main ${[...c.left, ...c.right].map(frenchNote).join(' ')}`
        : `main gauche ${c.left.map(frenchNote).join(' ')} · main droite ${c.right.map(frenchNote).join(' ')}`;
      return el('li', {}, [el('b', { text: `${takeMoment(c.at)} ${c.name}` }), document.createTextNode(` — ${hands} · ${c.voicing}`)]);
    }),
    ...(take.lines || []).slice(0, 3).map((l) => el('li', {}, [
      el('b', { text: `${takeMoment(l.start)} ligne` }),
      document.createTextNode(` — ${l.count} notes${l.scale ? ` · ${l.scale}` : ''}${l.over?.length ? ` · sur ${l.over.join(', ')}` : ''}`),
    ])),
  ];
  if (rows.length) text.appendChild(el('ul', { className: 'copilot-example-hands' }, rows));
  card.appendChild(text);
  return card;
}

/**
 * Moment cliqué dans une réponse : pour une session, l'onglet Session le rejoue en
 * boucle ; pour un passage joué, l'extrait autour de ce moment est rejoué (touches
 * en jaune).
 */
function onMomentLink(button) {
  const time = Number(button.dataset.moment);
  if (!Number.isFinite(time)) return;
  const takeFor = button.closest('[data-take-for]')?.dataset.takeFor;
  const takeMsg = takeFor ? messages.find((m) => m.take && m.exampleId === takeFor) : null;
  if (!takeMsg) {
    document.dispatchEvent(new CustomEvent('session-show-moment', { detail: { time } }));
    return;
  }
  const take = takeMsg.take;
  // Extrait du passage autour du moment (un peu avant, pour l'entendre arriver).
  const events = take.example?.events || [];
  const from = Math.max(0, time - 0.4);
  const to = time + 2.4;
  const excerpt = events.filter((e) => e.type !== 'step' && e.time >= from && e.time <= to).map((e) => ({ ...e, time: e.time - from }));
  const held = new Map();
  for (const e of events) {
    if (e.time >= from) break;
    if (e.type === 'noteOn') held.set(e.note, e);
    else if (e.type === 'noteOff') held.delete(e.note);
  }
  held.forEach((e) => excerpt.unshift({ ...e, time: 0 }));
  excerpt.push(...[...new Set(excerpt.filter((e) => e.type === 'noteOn').map((e) => e.note))].map((note) => ({ time: to - from, type: 'noteOff', note })));
  if (excerpt.some((e) => e.type === 'noteOn')) {
    document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id: `moment-${takeFor}`, example: { events: excerpt.sort((a, b) => a.time - b.time), beats: to - from, tempo: 60 } } }));
  }
}

/** Réécoute du passage joué (même lecteur que les exemples, touches en jaune). */
function toggleTakeReplay(msg) {
  const id = exampleIdOf(msg);
  if (playingExampleId === id) {
    document.dispatchEvent(new CustomEvent('copilot-stop-example'));
    return;
  }
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id, example: msg.take.example } }));
}

/** Pièce jointe d'une question « Qu'en penses-tu ? » (gardée dans l'historique). */
/** Garde le passage dans Sessions MIDI (recording-tab.js crée la session). */
function keepTakeInSessions(msg) {
  const take = msg.take;
  if (!take?.example || take.saving) return;
  take.saving = true;
  renderMessages();
  document.dispatchEvent(new CustomEvent('session-keep-passage', {
    detail: { id: exampleIdOf(msg), events: exampleToSessionEvents(take.example, take.shift || 0), verdict: take.verdict, question: msg.content || '' },
  }));
}

/** Ouvre une session gardée (vue Sessions MIDI). */
function openSavedSession(sessionId) {
  document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'midi-sessions' } }));
  document.dispatchEvent(new CustomEvent('session-open', { detail: { sessionId } }));
}

function takeAttachment(review, passage) {
  return {
    verdict: review.verdict,
    duration: review.duration,
    noteCount: review.noteCount,
    chords: review.chords.slice(0, 8).map((c) => ({
      at: c.at, name: c.readAs ? `${c.readAs} (rootless)` : c.name, left: c.hands.left, right: c.hands.right, oneHand: c.hands.oneHand,
      voicing: `${c.voicing.label}${c.voicing.detail ? ` (${c.voicing.detail})` : ''}`,
    })),
    lines: review.lines.slice(0, 4).map((l) => ({ start: l.start, count: l.notes.length, scale: l.scale?.label || null, over: l.over })),
    moments: review.moments.slice(0, 12).map((m) => ({
      at: m.at, chord: m.chord || null, notes: m.notes || [], problemNotes: m.problemNotes || [], missing: m.missing || [],
      text: momentText(m), title: m.title, issueId: m.issueId,
      ...(m.fixChord ? { fixChord: m.fixChord } : {}),
      ...(m.suggestions?.length ? { suggestions: m.suggestions } : {}),
    })),
    example: passageToExample(passage.events, review),
    // Note entendue − touche : « Garder dans mes sessions » retrouve les touches.
    shift: passageShift(passage.events),
  };
}

/**
 * [Claude] — 2026-09-25 — Message court dans la ligne d'état de la fenêtre
 * (main.js) : plus de légende sous le clavier.
 */
function showStatus(text) {
  document.dispatchEvent(new CustomEvent('app-status', { detail: { text: String(text || '') } }));
}

/** Avis de l'application sans IA : le verdict et la première suggestion, en une ligne. */
export function localReviewText(review) {
  const first = review?.moments?.[0];
  const idea = first ? ` — ${takeMoment(first.at)}${first.chord ? ` ${first.chord}` : ''} : ${momentText(first)}` : '';
  return `${review?.verdict || ''}${idea}`;
}

/**
 * « Qu'en penses-tu ? » : le dernier passage joué (depuis la dernière pause) est
 * analysé par l'application et joint à la question tapée (n'importe laquelle), ou
 * à « Qu'en penses-tu de ce que je viens de jouer ? ».
 * Sans clé d'IA, l'avis de l'application s'affiche dans la ligne d'état.
 */
export async function reviewLastPassage({ question = '', fromKeyboard = false, fromView = null } = {}) {
  const passage = liveTake.lastPassage();
  if (!passage) {
    showStatus('Rien à écouter : joue d\'abord au clavier (MIDI, virtuel ou clavier d\'ordinateur), puis clique sur « Qu\'en penses-tu ? ».');
    return null;
  }
  const asked = String(question || '').trim();
  // [Claude] — 2026-09-25 — Depuis Exercices (ou en mode exercice) : l'avis compare
  // le jeu aux accords de l'exercice en cours, sans qu'il faille les taper.
  const exercise = fromView === 'exercise' || currentMode === 'exercise' ? readCopilotContext('exercise') : null;
  const review = reviewTake(passage.events, { question: asked, expect: exercise ? { ...exercise.expect, label: exercise.title } : null });
  if (!review) return null;
  if (!hasAIKey() || !els.input) {
    showStatus(localReviewText(review));
    return review;
  }
  if (fromKeyboard) {
    document.dispatchEvent(new CustomEvent('app-switch-tab', { detail: { tab: 'practice' } }));
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
  }
  // La conversation de l'exercice (le Copilote reçoit aussi ses voicings et les essais).
  if (exercise && currentMode !== 'exercise') await switchToExerciseMode();
  els.input.value = '';
  autoGrowInput();
  const defaultQuestion = exercise ? `Qu'en penses-tu de ce que je viens de jouer sur l'exercice (${exercise.title}) ?` : DEFAULT_REVIEW_QUESTION;
  await runCopilotTurn(asked || defaultQuestion, { take: takeAttachment(review, passage), review: true, takeContext: review.contextLines });
  return review;
}

/** Rendu de la liste des messages, dans la structure d'Astra
 * (.tr-chat-message / .tr-message-avatar / .tr-message-content). */
function renderMessages() {
  els.messages.innerHTML = '';
  if (messages.length === 0) {
    els.messages.classList.add('is-empty');
    els.messages.appendChild(renderCopilotWelcome());
    return;
  }
  els.messages.classList.remove('is-empty');
  for (const msg of messages) {
    const isUser = msg.role === 'user';
    const row = el('div', { className: `tr-chat-message copilot-message is-${msg.role} ${msg.role}` });

    if (msg.role === 'system') {
      row.className += ' is-system';
      row.textContent = msg.content;
      els.messages.appendChild(row);
      continue;
    }

    const avatar = el('div', { className: 'tr-message-avatar' });
    if (isUser) avatar.textContent = 'V';
    else avatar.innerHTML = ICON_SPARKLE;
    row.appendChild(avatar);

    if (msg.isTyping) {
      row.className += ' is-typing';
      row.appendChild(el('div', {
        className: 'tr-thinking',
        innerHTML: '<i></i><i></i><i></i>',
      }));
      els.messages.appendChild(row);
      continue;
    }

    const content = el('div', { className: 'tr-message-content' });
    const author = el('div', { className: 'tr-message-author' }, [
      el('strong', { text: isUser ? 'Vous' : 'Copilot' }),
    ]);
    if (!isUser) author.appendChild(el('span', { text: 'ASSISTANT IA' }));
    content.appendChild(author);
    // Moments cliquables : réponse sur une session, ou sur un passage joué (question précédente).
    const index = messages.indexOf(msg);
    const takeBefore = !isUser ? [...messages.slice(0, index)].reverse().find((m) => m.role === 'user') : null;
    const momentLinks = !isUser && (currentMode === 'session' || Boolean(takeBefore?.take));
    renderMessageText(content, msg.content, { momentLinks });
    if (momentLinks && takeBefore?.take) content.dataset.takeFor = exampleIdOf(takeBefore);
    if (isUser && msg.take) content.appendChild(renderTakeCard(msg));

    // [Claude] — 2026-09-24 — L'exemple à écouter vient APRÈS l'explication
    // (Narcisse : « il va directement me le jouer au lieu d'expliquer d'abord »).
    if (msg.toolResult?.example) {
      content.appendChild(renderExampleCard(msg));
    } else if (msg.toolResult?.played?.length) {
      // Anciennes conversations : notes jouées à l'époque, pour mémoire.
      const played = el('div', { className: 'tr-chat-demos copilot-tool-note is-static' });
      const chip = el('span', { className: 'copilot-played-chip' });
      chip.innerHTML = ICON_PIANO;
      chip.appendChild(el('span', { text: 'Notes jouées' }));
      chip.appendChild(el('small', { text: msg.toolResult.played.map((p) => p.name).join(' · ') }));
      played.appendChild(chip);
      content.appendChild(played);
    }

    if (!isUser && msg.suggestedActions?.length) {
      const chips = renderActionChips(msg.suggestedActions);
      if (chips) content.appendChild(chips);
    }

    row.appendChild(content);
    els.messages.appendChild(row);
  }
  // Auto-scroll vers le bas
  els.messages.scrollTop = els.messages.scrollHeight;
}

function addTypingIndicator() {
  messages.push({ role: 'assistant', isTyping: true });
  renderMessages();
}

function removeTypingIndicator() {
  messages = messages.filter((m) => !m.isTyping);
}

/** Affiche l'état "pas de clé". */
function showNoKeyState() {
  els.chatArea.style.display = 'none';
  els.noKey.style.display = 'flex';
}

function showChatArea() {
  els.chatArea.style.display = 'flex';
  els.noKey.style.display = 'none';
}

async function startNewConversation(tutorialPath) {
  lastTakeContext = null;
  const id = await createConversation(tutorialPath || AUTONOMOUS_HISTORY_KEY);
  if (!id) return null;
  currentConversationId = id;
  messages = [];
  return id;
}

async function ensureCurrentConversation() {
  if (currentConversationId) return currentConversationId;
  return startNewConversation(historyKeyForMode());
}

function formatHistoryDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

async function renderHistoryList() {
  if (!els.historyList) return;
  const items = await listAllConversations();
  els.historyList.innerHTML = '';

  const countEl = document.getElementById('copilot-history-count');
  if (countEl) countEl.textContent = `${items.length} conversation${items.length > 1 ? 's' : ''}`;

  if (items.length === 0) {
    els.historyList.appendChild(el('div', {
      className: 'tr-empty',
      innerHTML: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><h3>Aucune conversation</h3><p>Lancez une nouvelle conversation : elle sera sauvegardée automatiquement.</p>',
    }));
    return;
  }
  for (const item of items) {
    const dateText = formatHistoryDate(item.updatedAt);
    const isActive = item.conversationId === currentConversationId;
    const primary = item.preview || 'Conversation vide';
    const secondary = `${labelForConversationPath(item.tutorialPath)} · ${dateText || 'sans date'}`;
    const row = el('div', { className: `tr-library-row copilot-history-row ${isActive ? 'is-selected' : ''}` }, [
      el('button', {
        className: 'tr-library-select',
        type: 'button',
        onClick: () => {
          loadHistoryItem(item.conversationId);
          document.getElementById('copilot-history-drawer')?.setAttribute('hidden', 'true');
          document.body.classList.remove('tr-dialog-open');
        },
      }, [
        el('span', { className: 'tr-file-icon' }, [
          el('svg', { width: '19', height: '19', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [
            el('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
          ]),
        ]),
        el('span', {}, [
          el('strong', { text: primary }),
          el('small', { text: secondary }),
        ]),
      ]),
      el('span', { className: 'tr-library-cell', text: dateText || '—' }),
      el('div', { className: 'tr-library-row-actions' }, [
        el('button', {
          className: 'tr-icon-button tr-delete copilot-history-delete',
          type: 'button',
          title: 'Supprimer cette conversation',
          'aria-label': `Supprimer la conversation ${primary}`,
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteHistoryItem(item.conversationId, primary, e.currentTarget);
          },
        }, [
          el('svg', { width: '15', height: '15', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [
            el('path', { d: 'M18 6 6 18' }),
            el('path', { d: 'M6 6l12 12' }),
          ]),
        ]),
      ]),
    ]);
    els.historyList.appendChild(row);
  }
}

async function deleteHistoryItem(conversationId, label, btn) {
  const displayLabel = label || 'cette conversation';
  if (!confirm(`Supprimer ${displayLabel} ? Cette action est irréversible.`)) return;
  if (btn) {
    btn.disabled = true;
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h5"/></svg>';
  }
  const ok = await deleteConversation(conversationId);
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
  }
  if (!ok) {
    console.warn('[Copilot] La suppression de la conversation a échoué :', conversationId);
    alert('La suppression a échoué. Vérifiez que le fichier n\'est pas ouvert ailleurs.');
    return;
  }
  if (conversationId === currentConversationId) {
    messages = [];
    currentConversationId = null;
    renderMessages();
  }
  await renderHistoryList();
}

async function onDeleteEmptyConversations() {
  const all = await listAllConversations();
  const emptyItems = [];
  for (const item of all) {
    const history = await loadHistory(item.conversationId);
    const messages = history?.messages;
    if (!messages || messages.length === 0) emptyItems.push(item);
  }
  if (emptyItems.length === 0) {
    alert('Aucune conversation vide à supprimer.');
    return;
  }
  const label = emptyItems.length === 1
    ? '1 conversation vide'
    : `${emptyItems.length} conversations vides`;
  if (!confirm(`Supprimer ${label} ? Cette action est irréversible.`)) return;

  // Si la conversation courante est vide, on la décharge avant suppression.
  const currentIsEmpty = emptyItems.some((item) => item.conversationId === currentConversationId);
  if (currentIsEmpty) {
    messages = [];
    currentConversationId = null;
    renderMessages();
  }

  const removed = await deleteEmptyConversations();
  await renderHistoryList();
  if (removed === 0) {
    alert('La suppression a échoué. Vérifiez que les fichiers ne sont pas ouverts ailleurs.');
  }
}

async function loadHistoryItem(conversationId) {
  const history = await loadHistory(conversationId);
  if (!history) return;
  currentConversationId = conversationId;
  messages = history.messages || [];
  currentMode = 'autonomous';
  currentSessionId = null;
  currentSessionContext = null;
  currentTutorialPath = null;
  currentExerciseId = null;
  currentExerciseTitle = null;
  updateHeaderForMode();
  updateModeToggle();
  showChatArea();
  renderMessages();
  await renderHistoryList();
}

function updateHeaderForMode() {
  if (currentMode === 'tutorial' && currentTutorialPath) {
    const name = currentTutorialPath.split('/').pop();
    if (els.selectedName) els.selectedName.textContent = `Copilot IA — ${name}`;
    // [Claude] — 2026-09-25 — Ce que le Copilote sait VRAIMENT de ce tutoriel.
    const context = getTutorialContext();
    let intro;
    if (!context?.chords) {
      intro = 'Lancez d\'abord « Lire ce tutoriel » dans Pédagogie IA : le Copilot connaîtra alors sa grille, la parole du professeur et les notes jouées.';
    } else if (context.noteEvents?.length) {
      intro = `Le Copilot connaît ce tutoriel : grille, parole du professeur${context.summary ? ', résumé du cours' : ''} et notes jouées (${context.sourceLabel}). Demandez-lui de rejouer un lick ou un voicing de la vidéo, ou de l'appliquer dans une autre tonalité.`;
    } else {
      intro = `Le Copilot connaît la grille et la parole du professeur ; les notes exactes ne sont pas disponibles (${context.notesUnavailable}).`;
    }
    if (els.introText) els.introText.textContent = intro;
  } else if (currentMode === 'session' && currentSessionContext) {
    const name = currentSessionContext.name || currentSessionId;
    if (els.selectedName) els.selectedName.textContent = `Copilot IA — Session : ${name}`;
    if (els.introText) els.introText.textContent = 'Mode session : le Copilot analyse la session MIDI sélectionnée.';
  } else if (currentMode === 'exercise' && currentExerciseTitle) {
    if (els.selectedName) els.selectedName.textContent = `Copilot IA — ${currentExerciseTitle}`;
    if (els.introText) els.introText.textContent = 'Le Copilot connaît l\'exercice affiché : accords et voicings de la carte, tonalité, étape et tes derniers essais. Demande-lui d\'expliquer un voicing ou de le faire entendre ; après avoir joué, « Qu\'en penses-tu ? » compare ton jeu à l\'exercice.';
  } else {
    if (els.selectedName) els.selectedName.textContent = 'Copilot IA';
    if (els.introText) els.introText.textContent = '';
  }
}

function updateModeToggle() {
  renderQuickActionsForMode();
  if (!els.modeToggleBtn) return;
  const state = toggleButtonState(currentMode, currentTutorialPath);
  els.modeToggleBtn.style.display = state.visible ? '' : 'none';
  els.modeToggleBtn.textContent = state.label;
}

async function switchToAutonomousMode() {
  currentMode = 'autonomous';
  currentSessionId = null;
  currentSessionContext = null;
  currentTutorialPath = null;
  currentExerciseId = null;
  currentExerciseTitle = null;
  updateHeaderForMode();
  updateModeToggle();
  if (!hasAIKey()) { showNoKeyState(); return; }
  showChatArea();
  await startNewConversation(AUTONOMOUS_HISTORY_KEY);
  renderMessages();
  await renderHistoryList();
}

async function switchToTutorialMode(path) {
  if (!path) return;
  currentMode = 'tutorial';
  currentSessionId = null;
  currentSessionContext = null;
  currentExerciseId = null;
  currentExerciseTitle = null;
  currentTutorialPath = path;
  updateHeaderForMode();
  updateModeToggle();
  if (!hasAIKey()) { showNoKeyState(); return; }
  showChatArea();
  await startNewConversation(path);
  renderMessages();
  await renderHistoryList();
}

export async function switchToSessionMode(sessionContext) {
  if (!sessionContext?.sessionId) return;
  currentMode = 'session';
  currentSessionId = sessionContext.sessionId;
  currentSessionContext = sessionContext;
  currentTutorialPath = null;
  currentExerciseId = null;
  currentExerciseTitle = null;
  updateHeaderForMode();
  updateModeToggle();
  if (!hasAIKey()) { showNoKeyState(); return; }
  showChatArea();
  await startNewConversation(currentSessionId);
  renderMessages();
  await renderHistoryList();
}

/**
 * [Claude] — 2026-09-25 — Mode exercice (« Demander au Copilote » dans Exercices,
 * ou « Qu'en penses-tu ? » lancé depuis Exercices). Même exercice : la
 * conversation continue ; autre exercice : une nouvelle conversation.
 * @returns {Promise<boolean>} faux si aucun exercice n'est affiché
 */
export async function switchToExerciseMode() {
  const ctx = readCopilotContext('exercise');
  if (!ctx) return false;
  const same = currentMode === 'exercise' && currentExerciseId === ctx.id && currentConversationId;
  currentMode = 'exercise';
  currentExerciseId = ctx.id;
  currentExerciseTitle = ctx.title;
  currentSessionId = null;
  currentSessionContext = null;
  currentTutorialPath = null;
  updateHeaderForMode();
  updateModeToggle();
  if (!hasAIKey()) { showNoKeyState(); return true; }
  showChatArea();
  if (!same) await startNewConversation(historyKeyForMode());
  renderMessages();
  await renderHistoryList();
  return true;
}

async function onModeToggleClick() {
  if (currentMode === 'tutorial' || currentMode === 'session' || currentMode === 'exercise') {
    await switchToAutonomousMode();
  } else if (currentTutorialPath) {
    await switchToTutorialMode(currentTutorialPath);
  }
}

/** Envoie un message utilisateur. */
async function sendUserMessage() {
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = '';
  autoGrowInput();
  await runCopilotTurn(text);
}

/**
 * Un tour de conversation : la question (et, pour « Qu'en penses-tu ? », le
 * passage joué), l'appel au modèle, la réponse.
 * @param {string} text
 * @param {{take?: object, review?: boolean, takeContext?: string[]}} [options]
 */
async function runCopilotTurn(text, { take = null, review = false, takeContext = null } = {}) {
  els.input.disabled = true;
  els.sendBtn.disabled = true;
  if (els.reviewBtn) els.reviewBtn.disabled = true;

  await ensureCurrentConversation();
  // Après la création éventuelle de la conversation (qui oublie l'ancien passage).
  if (takeContext) lastTakeContext = takeContext;
  const userMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
  if (take) userMessage.take = take;
  messages.push(userMessage);
  addTypingIndicator();

  const base = getTutorialContext() || getSessionContext() || getExerciseContext();
  // Le dernier passage joué reste connu pour les questions de suivi.
  const context = lastTakeContext ? { ...(base || { type: 'autonomous' }), take: lastTakeContext } : base;
  const copilotStyleId = els.styleSelect?.value || 'auto';
  const res = await sendCopilotMessage({ message: text, messages, context, copilotStyleId, review });

  removeTypingIndicator();
  let autoplayMessage = null;
  if (res.ok) {
    const reply = {
      role: 'assistant',
      content: res.content,
      toolResult: res.toolResult,
      suggestedActions: res.suggestedActions,
      timestamp: new Date().toISOString(),
    };
    if (res.toolResult?.example) exampleIdOf(reply);
    messages.push(reply);
    // Demande d'écoute (« joue-moi… ») : l'exemple démarre une fois la réponse affichée.
    if (res.autoplay && res.toolResult?.example) autoplayMessage = reply;
    await saveHistory(currentConversationId, historyKeyForMode(), messages);
  } else {
    const errorMsg = res.error === 'AI_API_KEY_INVALID'
      ? 'La clé API a été refusée. Vérifiez-la dans Réglages › Assistant IA.'
      : `Erreur : ${res.error}`;
    messages.push({ role: 'assistant', content: errorMsg, timestamp: new Date().toISOString() });
  }

  renderMessages();
  if (autoplayMessage) setTimeout(() => toggleExample(autoplayMessage), 700);
  await renderHistoryList();
  els.input.disabled = false;
  els.sendBtn.disabled = false;
  if (els.reviewBtn) els.reviewBtn.disabled = false;
  els.input.focus();
}

/** Reset de la conversation. */
async function onNewConversation() {
  await startNewConversation(historyKeyForMode());
  renderMessages();
  await renderHistoryList();
}

export async function initCopilotTab() {
  els.root = document.getElementById('practice-view-copilot');
  if (!els.root) return;

  els.chatArea = document.getElementById('copilot-chat-area');
  els.noKey = document.getElementById('copilot-no-key');
  els.messages = document.getElementById('copilot-messages');
  els.input = document.getElementById('copilot-input');
  els.sendBtn = document.getElementById('copilot-send-btn');
  els.reviewBtn = document.getElementById('copilot-review-btn');
  els.newConvBtn = document.getElementById('copilot-new-conv-btn');
  els.modeToggleBtn = document.getElementById('copilot-mode-toggle-btn');
  els.selectedName = document.getElementById('copilot-selected-name');
  els.introText = document.getElementById('copilot-intro');
  els.historyList = document.getElementById('copilot-history-list');
  els.newConvSidebarBtn = document.getElementById('copilot-new-conv-sidebar-btn');
  els.deleteEmptyBtn = document.getElementById('copilot-delete-empty-btn');

  els.sendBtn?.addEventListener('click', sendUserMessage);
  els.messages?.addEventListener('click', (e) => {
    const link = e.target.closest('.copilot-moment-link');
    if (link) onMomentLink(link);
  });
  // [Claude] — 2026-09-25 — « Qu'en penses-tu ? » : le passage joué + la question tapée.
  els.reviewBtn?.addEventListener('click', () => reviewLastPassage({ question: els.input?.value || '' }));
  document.addEventListener('copilot-review-take', (e) => reviewLastPassage({ question: e.detail?.question || '', fromKeyboard: true, fromView: e.detail?.fromView || null }));
  // « Demander au Copilote » depuis Exercices.
  document.addEventListener('copilot-open-exercise', () => switchToExerciseMode());
  // Passage gardé (ou non) par Sessions MIDI : la carte le dit, l'historique le garde.
  document.addEventListener('session-passage-saved', async (e) => {
    const { id, sessionId, error } = e.detail || {};
    const msg = messages.find((m) => m.take && exampleIdOf(m) === id);
    if (!msg) return;
    msg.take.saving = false;
    if (sessionId) msg.take.savedSessionId = sessionId;
    renderMessages();
    if (error) showStatus(`Passage non gardé : ${error}`);
    else if (currentConversationId) await saveHistory(currentConversationId, historyKeyForMode(), messages);
  });
  // [Astra round 4] — Le champ est un <textarea> qui grandit avec le texte,
  // comme dans la maquette (max ~110px, puis défilement interne).
  els.input?.addEventListener('input', autoGrowInput);
  els.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage();
    }
  });
  els.newConvBtn?.addEventListener('click', onNewConversation);
  els.newConvSidebarBtn?.addEventListener('click', onNewConversation);
  els.deleteEmptyBtn?.addEventListener('click', onDeleteEmptyConversations);
  els.modeToggleBtn?.addEventListener('click', onModeToggleClick);

  // Sélecteur de style pianistique.
  els.styleSelect = document.getElementById('copilot-style-select');

  // Chips statiques sous la zone de messages.
  els.quickActions = document.getElementById('copilot-quick-actions');
  if (els.quickActions) {
    els.quickActions.addEventListener('click', (e) => {
      const chip = e.target.closest('.copilot-chip');
      if (!chip || !els.input) return;
      const message = chip.dataset.message;
      if (!message) return;
      els.input.value = message;
      sendUserMessage();
    });
  }

  // Écoute le changement de tutoriel dans Pédagogie
  document.addEventListener('pedagogie-selection-change', async (e) => {
    const path = e.detail?.path || null;
    const newMode = nextModeOnSelectionChange(currentMode, path, currentSessionId);
    currentTutorialPath = path;
    if (currentMode === 'session' && path) {
      // Une session et un tutoriel ne coexistent pas : on repasse en mode autonome
      // pour éviter un conflit de contexte.
      await switchToAutonomousMode();
      currentTutorialPath = path;
      updateModeToggle();
      return;
    }
    if (newMode !== currentMode) {
      await switchToAutonomousMode(); // repli forcé (désélection en mode tutoriel)
    } else if (currentMode === 'tutorial') {
      await switchToTutorialMode(path); // même mode, mais nouveau tutoriel : nouvelle conversation
    } else {
      updateModeToggle(); // mode autonome inchangé : juste (dés)afficher le bouton bascule
    }
  });

  // [Claude] — 2026-09-25 — « Copilote IA » depuis Pédagogie : mode tutoriel, avec son contexte
  // (la conversation en cours est gardée si c'est déjà ce tutoriel).
  document.addEventListener('copilot-open-tutorial', async (e) => {
    const path = e.detail?.path;
    if (!path) return;
    if (currentMode === 'tutorial' && currentTutorialPath === path) {
      updateHeaderForMode();
      return;
    }
    await switchToTutorialMode(path);
  });

  document.addEventListener('copilot-switch-to-session', async (e) => {
    const sessionContext = e.detail;
    if (!sessionContext?.sessionId) return;
    await switchToSessionMode(sessionContext);
  });

  // Lecture d'un exemple commencée / finie (main.js).
  document.addEventListener('copilot-example-state', (e) => {
    const { id, playing } = e.detail || {};
    if (playing) playingExampleId = id;
    else if (playingExampleId === id) playingExampleId = null;
    refreshExampleCards();
  });

  document.addEventListener('copilot-send-message', async (e) => {
    const message = e.detail?.message;
    if (!message || !els.input) return;
    els.input.value = String(message);
    await sendUserMessage();
  });

  // Quand la clé API est configurée/enregistrée alors que l'onglet est déjà
  // affiché (mode sans clé), on réactive le chat sans recharger la page.
  document.addEventListener('app-ai-config-saved', async () => {
    if (!hasAIKey()) return;
    // Même oubli ici : sans showChatArea(), enregistrer une clé depuis l'écran
    // « Assistant IA non configuré » n'affichait jamais le chat.
    showChatArea();
    await startNewConversation(AUTONOMOUS_HISTORY_KEY);
    renderMessages();
    await renderHistoryList();
  });

  // Rafraîchit la liste d'historique quand une conversation est sauvegardée.
  document.addEventListener('copilot-history-saved', async () => {
    await renderHistoryList();
  });

  // Le bouton "Ouvrir les réglages" de l'écran "pas de clé" doit ouvrir la
  // modale de configuration API, gérée par main.js.
  document.getElementById('copilot-settings-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app-open-ai-settings'));
  });

  // Au chargement : prisme 1 (autonome) par défaut, qu'un tutoriel soit
  // sélectionné ou non.
  const currentPath = document.querySelector('#pedagogie-track-list .pedagogie-track-row.is-selected')?.title;
  currentTutorialPath = currentPath || null;
  currentMode = 'autonomous';
  currentSessionId = null;
  currentSessionContext = null;
  currentConversationId = null;
  updateHeaderForMode();
  updateModeToggle();
  if (!hasAIKey()) { showNoKeyState(); return; }
  // [Astra round 3] — showChatArea() manquait sur ce chemin : #copilot-chat-area
  // part de style="display:none" dans index.html, et #copilot-no-key aussi.
  // Résultat, avec une clé API configurée les DEUX blocs restaient masqués et
  // le panneau Copilot s'affichait entièrement vide sous son en-tête, sans la
  // moindre erreur en console.
  showChatArea();
  await startNewConversation(AUTONOMOUS_HISTORY_KEY);
  renderMessages();
  await renderHistoryList();
}

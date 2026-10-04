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
import { liveTake } from '../recorder/live-take.js';
import { reviewTake } from '../recorder/take-review.js';
import { readCopilotContext } from './copilot-context.js';
import {
  TUTORIAL_QUICK_ACTIONS, TUTORIAL_KEYS, TRANSFER_KINDS, TUTORIAL_PROGRESSIONS,
  otherKeyQuestion, applyQuestion, keyIdFrom, keyLabel,
} from './tutorial-questions.js';
import { linkClockTimes, clock } from './tutorial-moment.js';
import { gridFromExample, favoritesFromExample } from './example-export.js';
import {
  BACK_SECONDS, exampleSeconds, videoTimeAt, markerAt, markerNote, markerSpans, timeLabel,
} from './example-transport.js';

const els = {};
let currentTutorialPath = null;
let messages = [];
let currentConversationId = null;
// Exemple du Copilote en cours de lecture (identifiant du message), ou null.
let playingExampleId = null;
// [Claude] — 2026-10-03 — Sa barre de lecture : en pause ou non, et sa position (envoyée par
// main.js toutes les 250 ms). Les exemples par identifiant, pour construire la barre.
let examplePaused = false;
let exampleProgress = null;
const examplesById = new Map();
// [Claude] — 2026-09-25 — Dernier passage joué (« Qu'en penses-tu ? ») : son
// portrait (lines), ses notes exactes (events, pour le rejouer) et sa tonalité,
// gardés pour les questions de suivi de la même conversation.
let lastTake = null;
// [Claude] — 2026-09-26 — Écoute de « Qu'en penses-tu ? » : début (ms) et minuterie
// du compteur ; arrêt et envoi automatiques au bout de 5 minutes.
const REVIEW_MAX_SECONDS = 300;
let reviewStartedAt = 0;
let reviewTimer = null;
// [Claude] — 2026-09-26 — Un tour de conversation est en cours (réponse attendue).
let turnBusy = false;
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
    notesUnavailable: 'le tutoriel n\'a pas encore été analysé dans Pédagogie IA (son analyse démarre quand on l\'importe ou qu\'on l\'ouvre)',
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

// Propositions du mode exercice (envoyées d'un clic, comme les autres). [Claude] —
// 2026-10-04 — Ce qui est écrit part (Narcisse : « pour chaque étiquette, il y a une
// question » qu'on ne voit pas) : le message est le texte de l'étiquette.
const EXERCISE_QUICK_ACTIONS = [
  { label: 'Explique ce voicing', message: 'Explique ce voicing.' },
  { label: 'Comment le jouer à deux mains ?', message: 'Comment le jouer à deux mains ?' },
  { label: 'Quelles voix bougent ?', message: 'Quelles voix bougent ?' },
  { label: 'Fais-moi entendre la carte', message: 'Fais-moi entendre la carte.' },
];
let defaultQuickActions = null;

/**
 * Propositions sous la conversation : celles de l'exercice en mode exercice, celles du
 * tutoriel en mode tutoriel (Pédagogie IA), sinon celles de la page. [Claude] —
 * 2026-10-03 — En mode tutoriel, deux propositions ouvrent un petit choix (une
 * tonalité ; quoi reprendre, sur quelle progression, dans quelle tonalité).
 */
function renderQuickActionsForMode() {
  if (!els.quickActions) return;
  if (!defaultQuickActions) defaultQuickActions = [...els.quickActions.querySelectorAll('.copilot-chip')].map((b) => ({ label: b.textContent, message: b.dataset.message }));
  const list = currentMode === 'exercise' ? EXERCISE_QUICK_ACTIONS
    : currentMode === 'tutorial' ? TUTORIAL_QUICK_ACTIONS
      : defaultQuickActions;
  els.quickActions.querySelectorAll('.copilot-chip').forEach((b) => b.remove());
  closeChooser();
  // Juste après « Continuer : » (le sélecteur de style reste au bout de la rangée).
  const chips = list.map((a) => el('button', {
    type: 'button',
    className: `copilot-chip${a.chooser ? ' has-chooser' : ''}`,
    'data-message': a.message || null,
    'data-chooser': a.chooser || null,
    'aria-expanded': a.chooser ? 'false' : null,
    text: a.label,
  }));
  const label = els.quickActions.querySelector('.copilot-quick-actions-label');
  if (label) {
    label.textContent = 'Continuer : ';
    // [Claude] — 2026-10-04 — En mode tuto, les étiquettes disent déjà « ce passage » : sans
    // libellé, la rangée tient sur une ligne (la conversation y gagne de la hauteur).
    label.hidden = currentMode === 'tutorial';
    label.after(...chips);
  } else {
    els.quickActions.prepend(...chips);
  }
}

// ── Petits choix du mode tutoriel (Pédagogie IA) ─────────────────────────────
// [Claude] — 2026-10-03 — « Que donnerait ce voicing en Fa♯ ? » : une tonalité.
// « Comment appliquer ce qu'il vient de faire dans une 4-5-3-6-2-5-1 ? » : quoi
// reprendre (ses voicings, ses accords de passage, son lick), quelle progression, quelle
// tonalité. [Claude] — 2026-10-04 — Le choix écrit la phrase dans la case (« Rejoue ce
// passage en Fa. ») : on la lit, on la change si besoin, puis Entrée ou « Envoyer ».

/** Tonalité du tutoriel (la tonalité détectée), sinon Do. */
function tutorialKeyId() {
  return keyIdFrom(readCopilotContext('tutorial')?.key) || 'C';
}

// La phrase qu'un choix a écrite dans la case (effacée si on ferme le choix sans l'avoir touchée).
let preparedText = '';

/** Écrit la phrase dans la case, sans l'envoyer. */
function prepare(message) {
  if (!els.input || !message) return;
  els.input.value = message;
  preparedText = message;
  autoGrowInput();
}

/** « Envoyer » dans un choix : la phrase de la case part (celle qu'on a peut-être changée). */
function sendFromChooser() {
  if (!els.input?.value.trim()) return;
  preparedText = '';
  closeChooser();
  sendUserMessage();
}

function closeChooser() {
  els.chooser?.remove();
  els.chooser = null;
  els.quickActions?.querySelectorAll('.copilot-chip[data-chooser]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (preparedText && els.input?.value === preparedText) {
    els.input.value = '';
    autoGrowInput();
  }
  preparedText = '';
}

/** Le bouton « Envoyer » d'un choix (Entrée dans la case fait de même). */
function chooserSend({ disabled = false } = {}) {
  const button = el('button', {
    type: 'button', className: 'copilot-chooser-send', text: 'Envoyer',
    title: 'Envoie la phrase écrite dans la case (Entrée fait de même)',
    onClick: () => sendFromChooser(),
  });
  button.disabled = disabled;
  return button;
}

function keyButtons(onPick, selected = null) {
  return TUTORIAL_KEYS.map((k) => el('button', {
    type: 'button',
    className: `copilot-chooser-key${k.id === selected ? ' is-selected' : ''}`,
    'aria-pressed': k.id === selected ? 'true' : 'false',
    'data-key': k.id,
    text: k.label,
    onClick: () => onPick(k.id),
  }));
}

function buildKeyChooser() {
  const send = chooserSend({ disabled: true });
  const keys = el('div', { className: 'copilot-chooser-keys' });
  keys.append(...keyButtons((id) => {
    prepare(otherKeyQuestion(id));
    keys.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.key === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    send.disabled = false;
  }));
  return el('div', { className: 'copilot-chooser', role: 'group', 'aria-label': 'Rejouer ce passage dans quelle tonalité ?' }, [
    el('span', { className: 'copilot-chooser-title', text: 'Rejouer ce passage en' }),
    keys,
    send,
  ]);
}

function buildApplyChooser() {
  const choice = { kind: TRANSFER_KINDS[0].id, progression: TUTORIAL_PROGRESSIONS[0], key: tutorialKeyId() };
  const pick = (row, attr, value) => row.querySelectorAll('button').forEach((b) => {
    const on = b.dataset[attr] === value;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  // Chaque choix réécrit la phrase de la case : elle dit toujours ce qui partira.
  const write = () => prepare(applyQuestion(choice));
  const kinds = el('div', { className: 'copilot-chooser-row' }, TRANSFER_KINDS.map((k) => el('button', {
    type: 'button', className: 'copilot-chooser-option', 'data-kind': k.id, text: k.label,
    onClick: () => { choice.kind = k.id; pick(kinds, 'kind', k.id); write(); },
  })));
  const custom = el('input', {
    type: 'text', className: 'copilot-chooser-input', maxlength: '80',
    placeholder: 'ou la tienne : Fmaj7 E7 Am7 D9…', 'aria-label': 'Ta progression (degrés ou accords)',
  });
  const progs = el('div', { className: 'copilot-chooser-row' }, TUTORIAL_PROGRESSIONS.map((p) => el('button', {
    type: 'button', className: 'copilot-chooser-option', 'data-prog': p, text: p,
    onClick: () => { choice.progression = p; custom.value = ''; pick(progs, 'prog', p); write(); },
  })));
  custom.addEventListener('input', () => {
    if (custom.value.trim()) { choice.progression = custom.value.trim(); pick(progs, 'prog', ''); write(); }
  });
  const keys = el('div', { className: 'copilot-chooser-keys' });
  const setKey = (id) => {
    choice.key = id;
    keys.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.key === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    write();
  };
  keys.append(...keyButtons(setKey, choice.key));
  const send = chooserSend();
  custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send.click(); } });
  const box = el('div', { className: 'copilot-chooser is-apply', role: 'group', 'aria-label': 'Appliquer ce passage à une progression' }, [
    el('span', { className: 'copilot-chooser-title', text: 'Reprendre de ce passage' }), kinds,
    el('span', { className: 'copilot-chooser-title', text: 'Sur la progression' }), progs, custom,
    el('span', { className: 'copilot-chooser-title', text: `En (tonalité du tuto : ${keyLabel(tutorialKeyId())})` }), keys,
    send,
  ]);
  pick(kinds, 'kind', choice.kind);
  pick(progs, 'prog', choice.progression);
  // La phrase de départ est déjà dans la case.
  write();
  return box;
}

/** Ouvre (ou ferme) le petit choix d'une proposition. */
function toggleChooser(kind, chip) {
  const already = els.chooser?.dataset.kind === kind;
  closeChooser();
  if (already) return;
  const box = kind === 'key' ? buildKeyChooser() : buildApplyChooser();
  box.dataset.kind = kind;
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeChooser(); chip?.focus(); } });
  els.quickActions.after(box);
  els.chooser = box;
  chip?.setAttribute('aria-expanded', 'true');
  box.querySelector('button')?.focus();
}

/** [Astra round 4] Rangée de suggestions, dans la grammaire .tr-chat-demos de
 * la maquette : icône, libellé, et une petite mention de ce que fait le clic.
 * Ce sont de vraies actions (elles envoient la question au Copilot), pas des
 * boutons d'écoute décoratifs. */
function renderActionChips(actions) {
  if (!actions?.length) return null;
  const container = el('div', { className: 'tr-chat-demos copilot-message-actions' });
  for (const action of actions) {
    // [Claude] — 2026-10-04 — Ce qui est écrit part : l'étiquette montre le message envoyé
    // (avant : un libellé court, « Voicing », et une question cachée derrière).
    const message = String(action.message || action.label || '').trim();
    if (!message) continue;
    const btn = el('button', {
      className: 'copilot-chip',
      type: 'button',
      title: message,
      onClick: () => {
        if (!els.input) return;
        els.input.value = message;
        sendUserMessage();
      },
    });
    btn.innerHTML = ICON_SPARKLE;
    btn.appendChild(el('span', { text: message }));
    container.appendChild(btn);
  }
  return container.childElementCount ? container : null;
}

/** [Refonte 12/09 — détails] Accueil affiché quand la conversation est vide
 * mais que le Copilot est configuré (habillage repris d'Astra, classes déjà
 * stylées par astra-training.css : .tr-copilot-welcome / .tr-prompt-options).
 * Les suggestions utilisent les libellés exacts de la maquette Astra
 * (CopilotView.tsx, .tr-prompt-options). */
function renderCopilotWelcome() {
  if (currentMode === 'tutorial') return renderTutorialWelcome();
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
  // [Claude] — 2026-10-04 — Ce qui est écrit part : le libellé est la question envoyée.
  const welcomeActions = [
    { label: 'Montre-moi un voicing intéressant', icon: ICON_PIANO_MD, message: 'Montre-moi un voicing intéressant.' },
    { label: 'Explique-moi un 2-5-1', icon: ICON_MUSIC2, message: 'Explique-moi un 2-5-1.' },
    { label: 'Comment mieux accompagner ?', icon: ICON_SPARKLE_MD, message: 'Comment mieux accompagner ?' },
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

/**
 * [Claude] — 2026-10-03 — Accueil du mode tutoriel (Pédagogie IA, à côté de la vidéo) :
 * le Copilote dit ce qu'il regarde (« ici » = le passage en haut du panneau) et
 * propose les questions de Narcisse.
 */
function renderTutorialWelcome() {
  return el('div', { className: 'tr-copilot-welcome copilot-tutorial-welcome' }, [
    el('h2', { text: 'Une question sur ce passage ?' }),
    el('p', { text: 'Je regarde le passage choisi sous la vidéo : ce que le prof y joue et y dit. Écris ta question, ou clique une étiquette : ce qui est écrit dessus est envoyé tel quel.' }),
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
function renderMessageText(container, content) {
  const lines = String(content || '').split('\n');
  // [Claude] — 2026-10-03 — Tutoriel : chaque moment cité (« à 1:31 ») place la vidéo.
  const tutorial = currentMode === 'tutorial' ? readCopilotContext('tutorial') : null;
  const maxSeconds = Number.isFinite(tutorial?.duration) ? tutorial.duration : Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const p = document.createElement('p');
    let html = escapeHtml(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // [Claude] — 2026-10-03 — « _(remarque)_ » s'affichait avec ses soulignés.
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
    if (currentMode === 'tutorial') html = linkClockTimes(html, { maxSeconds });
    p.innerHTML = html;
    container.appendChild(p);
  }
  if (!container.childElementCount) container.appendChild(el('p', { text: String(content || '') }));
}

const FRENCH_NOTES = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const frenchNote = (midi) => `${FRENCH_NOTES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const ICON_PLAY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_STOP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';
const ICON_PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const ICON_BACK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

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
  // [Claude] — 2026-10-03 — Ce que fait le prof, appliqué à une progression : toutes ses
  // notes sont déjà écrites dans la réponse, accord par accord ; la carte ne les répète pas.
  const hands = example.kind === 'tutorial-transfer' ? []
    : (example.chords || []).slice(0, 4).filter((c) => c.leftHand?.length || c.rightHand?.length);
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
  // [Claude] — 2026-10-03 — La barre de lecture, sous l'exemple qui joue (ou en pause).
  examplesById.set(id, example);
  const transport = el('div', { className: 'copilot-example-transport' });
  transport.hidden = !playing;
  card.appendChild(transport);
  if (playing) updateTransport(transport, example, id);
  // [Claude] — 2026-10-03 — Lot 6 : l'exemple se travaille ensuite dans Exercices.
  const exportRow = renderExampleExport(example, id);
  if (exportRow) card.appendChild(exportRow);
  return card;
}

/**
 * [Claude] — 2026-10-03 — La barre de lecture de l'exemple (Narcisse : « revenir en arrière
 * manuellement quand le copilote joue, un peu comme sur un lecteur […] pour revoir un passage
 * et demander des explications supplémentaires »). Pause / Reprendre, « ⟲ 5 s », le curseur
 * (les moments où le prof parle y sont marqués), la phrase pendant une de ses pauses, et
 * l'instant de la vidéo avec « Voir dans la vidéo ». Le lecteur est celui de main.js
 * (évènement « copilot-example-control »).
 */
function buildTransport(box, example, id) {
  box.textContent = '';
  box.dataset.builtFor = id;
  const control = (action, extra = {}) => document.dispatchEvent(new CustomEvent('copilot-example-control', { detail: { id, action, ...extra } }));
  const duration = exampleSeconds(example);
  const toggle = el('button', {
    type: 'button',
    className: 'copilot-transport-btn',
    'data-action': 'toggle',
    onClick: () => control(examplePaused ? 'resume' : 'pause'),
  });
  const back = el('button', {
    type: 'button',
    className: 'copilot-transport-btn',
    'data-action': 'back',
    title: `Revenir ${BACK_SECONDS} secondes en arrière`,
    'aria-label': `Revenir ${BACK_SECONDS} secondes en arrière`,
    onClick: () => control('back', { seconds: BACK_SECONDS }),
  });
  back.innerHTML = ICON_BACK;
  back.appendChild(el('span', { text: `${BACK_SECONDS} s` }));
  // La piste : ce qui est joué, et les moments où le prof parle (ou s'arrête), à leur place.
  const track = el('div', { className: 'copilot-transport-track', 'aria-hidden': 'true' }, [
    el('div', { className: 'copilot-transport-fill' }),
  ]);
  for (const m of markerSpans(example, duration)) {
    track.appendChild(el('span', { className: `copilot-transport-mark is-${m.kind}`, style: `left: ${m.left}%; width: ${m.width}%`, title: m.title }));
  }
  const time = el('span', { className: 'copilot-transport-time' });
  const range = el('input', {
    type: 'range',
    className: 'copilot-transport-range',
    min: '0',
    max: String(Math.max(0.1, Math.round(duration * 10) / 10)),
    step: '0.1',
    value: '0',
    'aria-label': 'Position dans l\'exemple',
  });
  // Pendant qu'on tire le curseur, la position reçue ne le déplace pas.
  const release = () => setTimeout(() => { delete range.dataset.dragging; }, 300);
  range.addEventListener('pointerdown', () => { range.dataset.dragging = '1'; });
  range.addEventListener('pointerup', release);
  range.addEventListener('pointercancel', release);
  range.addEventListener('input', () => { time.textContent = timeLabel(Number(range.value), duration); });
  range.addEventListener('change', () => {
    control('seek', { seconds: Number(range.value) });
    release();
  });
  box.appendChild(el('div', { className: 'copilot-transport-row' }, [
    toggle,
    back,
    el('div', { className: 'copilot-transport-bar' }, [track, range]),
    time,
  ]));
  const note = el('p', { className: 'copilot-transport-note', 'aria-live': 'polite' });
  note.hidden = true;
  box.appendChild(note);
  // Un passage de la vidéo : l'instant correspondant, et y aller (la lecture se met en pause).
  if (videoTimeAt(example, 0) !== null) {
    box.appendChild(el('p', { className: 'copilot-transport-video' }, [
      el('span', { className: 'copilot-transport-video-time' }),
      el('button', {
        type: 'button',
        className: 'copilot-example-link',
        text: 'Voir dans la vidéo',
        title: 'Met l\'exemple en pause et place la vidéo du prof à cet instant',
        onClick: () => {
          const seconds = videoTimeAt(example, exampleProgress?.id === id ? exampleProgress.position : 0);
          if (!examplePaused) control('pause');
          if (Number.isFinite(seconds)) document.dispatchEvent(new CustomEvent('pedagogie-seek', { detail: { seconds } }));
        },
      }),
    ]));
  }
}

/** Met la barre à jour : bouton Pause / Reprendre, curseur, temps, phrase, instant de la vidéo. */
function updateTransport(box, example, id) {
  if (box.dataset.builtFor !== id) buildTransport(box, example, id);
  const progress = exampleProgress?.id === id ? exampleProgress : null;
  const duration = progress?.duration || exampleSeconds(example);
  const position = Math.min(duration, progress?.position || 0);
  const toggle = box.querySelector('[data-action="toggle"]');
  if (toggle && toggle.dataset.paused !== String(examplePaused)) {
    toggle.dataset.paused = String(examplePaused);
    toggle.innerHTML = examplePaused ? ICON_PLAY : ICON_PAUSE;
    toggle.appendChild(el('span', { text: examplePaused ? 'Reprendre' : 'Pause' }));
    toggle.setAttribute('aria-label', examplePaused ? 'Reprendre la lecture' : 'Mettre en pause');
  }
  const range = box.querySelector('.copilot-transport-range');
  const dragging = range?.dataset.dragging === '1';
  if (range && !dragging) {
    range.value = String(Math.round(position * 10) / 10);
    range.setAttribute('aria-valuetext', timeLabel(position, duration).replace(' / ', ' sur '));
  }
  const fill = box.querySelector('.copilot-transport-fill');
  if (fill) fill.style.width = `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%`;
  const time = box.querySelector('.copilot-transport-time');
  if (time && !dragging) time.textContent = timeLabel(position, duration);
  const note = box.querySelector('.copilot-transport-note');
  if (note) {
    const text = markerNote(markerAt(example, position, { after: 2.5 }));
    if (note.textContent !== text) note.textContent = text;
    const appearing = note.hidden && Boolean(text);
    note.hidden = !text;
    if (appearing) keepVisible(box);
  }
  const videoTime = box.querySelector('.copilot-transport-video-time');
  if (videoTime) {
    const seconds = videoTimeAt(example, position);
    videoTime.textContent = Number.isFinite(seconds) ? `Dans la vidéo : ${clock(seconds)} · ` : '';
  }
}

/** La barre de l'exemple qui joue suit sa position (sans redessiner la conversation). */
function refreshExampleTransport() {
  if (!els.messages || !playingExampleId) return;
  const card = [...els.messages.querySelectorAll('.copilot-example')].find((c) => c.dataset.exampleId === playingExampleId);
  const box = card?.querySelector('.copilot-example-transport');
  const example = examplesById.get(playingExampleId);
  if (!box || !example) return;
  const appearing = box.hidden;
  box.hidden = false;
  card.classList.toggle('is-paused', examplePaused);
  updateTransport(box, example, playingExampleId);
  // La barre vient d'apparaître sous la carte : elle reste visible dans la conversation.
  if (appearing) keepVisible(box);
}

/**
 * Un élément de la carte qui joue dépasse en bas de la conversation : elle défile juste ce
 * qu'il faut. Une conversation qu'on relit plus haut (carte hors de vue) n'est pas ramenée.
 */
function keepVisible(node) {
  const list = els.messages;
  if (!node || !list || list.scrollHeight <= list.clientHeight) return;
  const box = node.getBoundingClientRect();
  const view = list.getBoundingClientRect();
  if (box.top < view.bottom && box.bottom > view.bottom) list.scrollTop += box.bottom - view.bottom + 8;
}

// Ce qui a déjà été envoyé dans Exercices, par exemple (les messages sont souvent redessinés).
const exportedExamples = new Map();

/**
 * [Claude] — 2026-10-03 — Pédagogie IA, lot 6 : « Ajouter à Ma grille » (les accords de
 * l'exemple, en grille Perso) et « Ajouter aux Favoris » (ses voicings exacts), envoyés
 * à Exercices (main.js) par évènement. null : rien à envoyer (une note, un lick seul).
 */
function renderExampleExport(example, id) {
  const tutorial = example.kind === 'tutorial-transfer';
  const grid = gridFromExample(example, { prefix: tutorial ? 'Tuto' : 'Copilote' });
  const favorites = favoritesFromExample(example, { technique: tutorial ? 'Voicing du prof' : '' });
  if (!grid && !favorites.length) return null;
  const done = exportedExamples.get(id) || {};
  const row = el('div', { className: 'copilot-example-export' });
  const remember = (patch) => {
    exportedExamples.set(id, { ...exportedExamples.get(id), ...patch });
    row.replaceWith(renderExampleExport(example, id));
  };
  if (grid && done.grid) {
    row.appendChild(el('span', { className: 'copilot-example-done', text: 'Dans Ma grille (Exercices › Perso) ✓' }));
    row.appendChild(el('button', {
      type: 'button',
      className: 'copilot-example-link',
      text: 'Ouvrir dans Exercices',
      onClick: () => document.dispatchEvent(new CustomEvent('exercise-open-grid', { detail: { id: done.grid.id } })),
    }));
  } else if (grid) {
    row.appendChild(el('button', {
      type: 'button',
      className: 'copilot-example-action',
      text: 'Ajouter à Ma grille',
      title: `Enregistre « ${grid.name} » dans Exercices › Perso`,
      onClick: () => document.dispatchEvent(new CustomEvent('exercise-save-grid', {
        detail: { ...grid, done: (result) => { if (result?.ok) remember({ grid: result }); } },
      })),
    }));
  }
  if (favorites.length && done.favorites) {
    const { added, already } = done.favorites;
    const text = added === 0 ? 'Déjà dans tes Favoris ✓'
      : `${added} voicing${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} aux Favoris (Exercices › Accord cible) ✓${already ? `, ${already} y étai${already > 1 ? 'ent' : 't'} déjà` : ''}`;
    row.appendChild(el('span', { className: 'copilot-example-done', text }));
  } else if (favorites.length) {
    const count = favorites.length;
    row.appendChild(el('button', {
      type: 'button',
      className: 'copilot-example-action',
      text: count === 1 ? 'Ajouter ce voicing aux Favoris' : `Ajouter ${tutorial ? 'ses' : 'ces'} ${count} voicings aux Favoris`,
      title: 'Chaque voicing exact (mains, notes) devient un favori de l\'Accord cible',
      onClick: () => document.dispatchEvent(new CustomEvent('exercise-add-favorites', {
        detail: { favorites, done: (result) => { if (result?.ok) remember({ favorites: result }); } },
      })),
    }));
  }
  return row;
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
    card.classList.toggle('is-paused', playing && examplePaused);
    // [Claude] — 2026-10-03 — La barre de lecture n'est montrée que sous l'exemple qui joue.
    const transport = card.querySelector('.copilot-example-transport');
    if (transport && !playing && !transport.hidden) {
      transport.hidden = true;
      transport.textContent = '';
      delete transport.dataset.builtFor;
    }
    const button = card.querySelector('.copilot-example-play');
    if (!button) return;
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.innerHTML = playing ? ICON_STOP : ICON_PLAY;
    button.appendChild(el('span', { text: playing ? 'Arrêter' : card.dataset.playLabel || 'Écouter l\'exemple' }));
  });
  refreshExampleTransport();
}

const ICON_HEADPHONES = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/></svg>';
const REVIEW_LISTENING_HINT = 'J\'écoute ton jeu… joue, puis clique sur Stop.';
const REVIEW_NOTHING_HINT = 'Rien entendu : clique, joue au clavier, puis clique sur Stop.';

/**
 * [Claude] — 2026-09-26 — Libellé du bouton « Qu'en penses-tu ? » : au repos, ou
 * pendant l'écoute (« Stop · 0:12 »).
 * @param {{capturing?: boolean, seconds?: number}} state
 * @returns {{label: string, pressed: boolean, hint: string}}
 */
export function reviewButtonState({ capturing = false, seconds = 0 } = {}) {
  if (!capturing) return { label: 'Qu\'en penses-tu ?', pressed: false, hint: '' };
  const s = Math.max(0, Math.floor(seconds || 0));
  return { label: `Stop · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, pressed: true, hint: REVIEW_LISTENING_HINT };
}

function renderReviewButton(hint = null) {
  if (!els.reviewBtn) return;
  const capturing = liveTake.isCapturing();
  const state = reviewButtonState({ capturing, seconds: capturing ? (Date.now() - reviewStartedAt) / 1000 : 0 });
  els.reviewBtn.classList.toggle('is-listening', capturing);
  els.reviewBtn.setAttribute('aria-pressed', String(state.pressed));
  els.reviewBtn.innerHTML = capturing ? '<i class="copilot-review-dot" aria-hidden="true"></i>' : ICON_HEADPHONES;
  els.reviewBtn.appendChild(el('span', { text: state.label }));
  if (els.reviewHint) els.reviewHint.textContent = hint ?? state.hint;
}

/**
 * [Claude] — 2026-09-26 — « Qu'en penses-tu ? » (dans la case du Copilote, à la place
 * de « IA connectée ») : premier clic, le Copilote écoute ; second clic (Stop), ce
 * qui a été joué entre les deux part aussitôt. Narcisse : un essai raté juste avant
 * se mêlait à l'essai réussi quand le passage était « depuis la dernière pause ».
 * @returns {Promise<object|null>} l'avis de l'application, une fois envoyé
 */
export async function toggleReviewCapture() {
  if (!liveTake.isCapturing()) {
    liveTake.startCapture();
    reviewStartedAt = Date.now();
    clearInterval(reviewTimer);
    reviewTimer = setInterval(() => {
      if ((Date.now() - reviewStartedAt) / 1000 >= REVIEW_MAX_SECONDS) toggleReviewCapture();
      else renderReviewButton();
    }, 1000);
    renderReviewButton();
    return null;
  }
  clearInterval(reviewTimer);
  reviewTimer = null;
  const passage = liveTake.stopCapture();
  if (!passage) {
    renderReviewButton(REVIEW_NOTHING_HINT);
    return null;
  }
  renderReviewButton();
  return reviewPassage(passage);
}

/**
 * Le passage joué est analysé par l'application et part au Copilote avec la
 * question tapée (n'importe laquelle), ou « Qu'en penses-tu de ce que je viens de
 * jouer ? ». En mode exercice (« Demander au Copilote »), le jeu est comparé aux
 * accords de l'exercice, sans qu'il faille les taper.
 * @param {{events: object[], duration: number, noteCount: number}} passage
 */
export async function reviewPassage(passage, { question = '' } = {}) {
  if (!passage?.events?.length || !els.input) return null;
  const asked = String(question || els.input.value || '').trim();
  const exercise = currentMode === 'exercise' ? readCopilotContext('exercise') : null;
  const review = reviewTake(passage.events, { question: asked, expect: exercise ? { ...exercise.expect, label: exercise.title } : null });
  if (!review) return null;
  // Stop pendant que le Copilote répond encore : l'envoi attend la fin de la réponse
  // (deux minutes au plus : le service d'IA a 90 secondes pour répondre).
  for (let waited = 0; turnBusy && waited < 120000; waited += 200) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  els.input.value = '';
  autoGrowInput();
  const defaultQuestion = exercise ? `Qu'en penses-tu de ce que je viens de jouer sur l'exercice (${exercise.title}) ?` : DEFAULT_REVIEW_QUESTION;
  await runCopilotTurn(asked || defaultQuestion, { review: true, take: { lines: review.contextLines, events: passage.events, key: review.key?.label || null } });
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
    // [Claude] — 2026-09-26 — Un message qu'on ne sait plus afficher (ancien format
    // gardé dans l'historique) s'affiche en texte simple, sans bloquer les autres.
    try {
      renderOneMessage(msg);
    } catch (err) {
      console.warn('[Copilot] Message affiché en texte simple :', err);
      els.messages.appendChild(el('div', { className: `tr-chat-message copilot-message is-${msg.role === 'user' ? 'user' : 'assistant'}`, text: String(msg.content || '') }));
    }
  }
  // Auto-scroll vers le bas
  els.messages.scrollTop = els.messages.scrollHeight;
}

/** Un message de la conversation (voir renderMessages). */
function renderOneMessage(msg) {
  const isUser = msg.role === 'user';
  const row = el('div', { className: `tr-chat-message copilot-message is-${msg.role} ${msg.role}` });

  if (msg.role === 'system') {
    row.className += ' is-system';
    row.textContent = msg.content;
    els.messages.appendChild(row);
    return;
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
    return;
  }

  const content = el('div', { className: 'tr-message-content' });
  const author = el('div', { className: 'tr-message-author' }, [
    el('strong', { text: isUser ? 'Vous' : 'Copilot' }),
  ]);
  if (!isUser) author.appendChild(el('span', { text: 'ASSISTANT IA' }));
  content.appendChild(author);
  renderMessageText(content, msg.content);

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
  lastTake = null;
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
      intro = 'Ce tutoriel n\'est pas encore analysé : ouvrez-le dans Pédagogie IA, son analyse démarre. Le Copilot connaîtra alors sa grille, la parole du professeur et les notes jouées.';
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
  // [Claude] — 2026-10-03 — En mode tutoriel, la case parle du passage de la vidéo.
  if (els.input) {
    if (els.defaultPlaceholder == null) els.defaultPlaceholder = els.input.getAttribute('placeholder') || '';
    els.input.setAttribute('placeholder', currentMode === 'tutorial' ? 'Pose ta question sur ce passage…' : els.defaultPlaceholder);
  }
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

/**
 * [Claude] — 2026-10-03 — Rouvrir un tutoriel rouvre sa dernière conversation (Narcisse :
 * l'analyse et la conversation restent avec le tuto) ; sinon, une nouvelle.
 * @returns {Promise<string|null>}
 */
async function resumeOrStartConversation(key) {
  try {
    const latest = (await listAllConversations()).find((item) => item.tutorialPath === key && item.preview);
    if (latest) {
      const history = await loadHistory(latest.conversationId);
      if (history?.messages?.length) {
        lastTake = null;
        currentConversationId = latest.conversationId;
        messages = history.messages;
        return currentConversationId;
      }
    }
  } catch (err) {
    console.warn('[Copilot] Conversation du tutoriel non retrouvée :', err);
  }
  return startNewConversation(key);
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
  await resumeOrStartConversation(path);
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
 * [Claude] — 2026-09-25 — Mode exercice (« Demander au Copilote » dans Exercices ;
 * « Qu'en penses-tu ? » y compare le jeu à l'exercice). Même exercice : la
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
  // Réponse en cours : le texte reste dans la case, il partira ensuite.
  if (turnBusy) return;
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = '';
  autoGrowInput();
  // Envoyé depuis la case (Entrée) : le choix ouvert se referme.
  if (els.chooser) closeChooser();
  await runCopilotTurn(text);
}

/**
 * [Claude] — 2026-09-26 — Ce que le pianiste lit quand le Copilote n'a pas pu
 * répondre : la raison, en clair, et quoi faire.
 */
export function copilotErrorText(error) {
  const code = String(error || '');
  if (code === 'AI_API_KEY_INVALID') return 'La clé API a été refusée. Vérifiez-la dans Réglages › Assistant IA.';
  if (code === 'AI_TIMEOUT') return 'Le service d\'IA n\'a pas répondu à temps (90 secondes). Réessaie ; s\'il est souvent aussi lent, choisis un autre modèle dans Réglages › Assistant IA.';
  if (/^AI_API_ERROR_(413|429)$/.test(code)) return 'Le service d\'IA refuse la demande pour l\'instant (trop longue, ou trop de demandes rapprochées pour ce modèle). Réessaie dans une minute, ou choisis un autre modèle dans Réglages › Assistant IA.';
  if (/^AI_API_ERROR_5\d\d$/.test(code)) return 'Le service d\'IA a un problème de son côté. Réessaie dans un moment.';
  return `Je n'ai pas pu répondre (${code || 'erreur inconnue'}). Réessaie ; si ça se répète, recopie-moi ce message.`;
}

/**
 * [Claude] — 2026-09-25 — Jeu du pianiste que le Copilote peut rejouer à
 * l'identique (play_my_playing) : la session confiée (touches brutes, plus la
 * transposition du clavier, comme sa relecture) et le dernier passage de
 * « Qu'en penses-tu ? » (notes entendues).
 */
function playingSources() {
  const out = {};
  const session = getSessionContext();
  if (session?.events?.length) {
    out.session = { events: session.events, key: session.key || session.heardKey || null, offset: Number(readCopilotContext('keyboard')?.transpose) || 0 };
  }
  if (lastTake?.events?.length) out.passage = { events: lastTake.events, key: lastTake.key || null };
  return out.session || out.passage ? out : null;
}

/**
 * Un tour de conversation : la question (et, pour « Qu'en penses-tu ? », le
 * passage joué), l'appel au modèle, la réponse.
 * @param {string} text
 * @param {{review?: boolean, take?: {lines: string[], events: object[], key: string|null}}} [options]
 */
async function runCopilotTurn(text, { review = false, take = null } = {}) {
  // [Claude] — 2026-09-26 — Narcisse : « on ne peut plus converser avec l'IA, la case
  // ne réagit plus, même en rechargeant ». La case était désactivée pendant chaque
  // tour et ne se réactivait qu'à la fin d'un tour réussi : une réponse qui
  // n'arrivait pas, ou une erreur en route, la laissaient bloquée. Désormais la
  // case reste libre (on peut écrire la question suivante) ; seul l'envoi attend ;
  // quoi qu'il arrive, la réponse ou la raison de l'échec s'affiche.
  turnBusy = true;
  els.sendBtn.disabled = true;
  let autoplayMessage = null;
  try {
    // L'historique (fichiers) ne doit jamais empêcher de répondre.
    await ensureCurrentConversation().catch((err) => console.warn('[Copilot] Conversation non enregistrée :', err));
    // Après la création éventuelle de la conversation (qui oublie l'ancien passage).
    if (take) lastTake = take;
    messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    addTypingIndicator();

    const base = getTutorialContext() || getSessionContext() || getExerciseContext();
    // Le dernier passage joué reste connu pour les questions de suivi ; le jeu
    // (session, passage) reste rejouable.
    const playing = playingSources();
    let context = base;
    if (lastTake || playing) context = { ...(base || { type: 'autonomous' }) };
    if (lastTake?.lines?.length) context.take = lastTake.lines;
    if (playing) context.playing = playing;
    const copilotStyleId = els.styleSelect?.value || 'auto';
    const res = await sendCopilotMessage({ message: text, messages, context, copilotStyleId, review });

    removeTypingIndicator();
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
    } else {
      messages.push({ role: 'assistant', content: copilotErrorText(res.error), timestamp: new Date().toISOString() });
    }
  } catch (err) {
    console.warn('[Copilot] Tour interrompu :', err);
    removeTypingIndicator();
    messages.push({ role: 'assistant', content: copilotErrorText(err?.message || err), timestamp: new Date().toISOString() });
  } finally {
    turnBusy = false;
    els.sendBtn.disabled = false;
    els.input.disabled = false;
  }
  renderMessages();
  if (autoplayMessage) setTimeout(() => toggleExample(autoplayMessage), 700);
  els.input.focus();
  // Enregistrement et liste des conversations : après, sans jamais bloquer la case.
  try {
    await saveHistory(currentConversationId, historyKeyForMode(), messages.filter((m) => !m.isTyping));
    await renderHistoryList();
  } catch (err) {
    console.warn('[Copilot] Historique non mis à jour :', err);
  }
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
  els.newConvBtn = document.getElementById('copilot-new-conv-btn');
  els.modeToggleBtn = document.getElementById('copilot-mode-toggle-btn');
  els.selectedName = document.getElementById('copilot-selected-name');
  els.introText = document.getElementById('copilot-intro');
  els.historyList = document.getElementById('copilot-history-list');
  els.newConvSidebarBtn = document.getElementById('copilot-new-conv-sidebar-btn');
  els.deleteEmptyBtn = document.getElementById('copilot-delete-empty-btn');

  els.sendBtn?.addEventListener('click', sendUserMessage);
  // [Claude] — 2026-09-26 — « Qu'en penses-tu ? » : dans la case, à la place de « IA connectée ».
  els.reviewBtn = document.getElementById('copilot-review-btn');
  els.reviewHint = document.getElementById('copilot-review-hint');
  els.reviewBtn?.addEventListener('click', () => toggleReviewCapture());
  // « Demander au Copilote » depuis Exercices.
  document.addEventListener('copilot-open-exercise', () => switchToExerciseMode());
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
      if (chip.dataset.chooser) {
        toggleChooser(chip.dataset.chooser, chip);
        return;
      }
      const message = chip.dataset.message;
      if (!message) return;
      closeChooser();
      els.input.value = message;
      sendUserMessage();
    });
  }
  // [Claude] — 2026-10-03 — Un moment cité dans une réponse (« à 1:31 ») place la
  // vidéo de Pédagogie IA (pedagogie-tab.js écoute « pedagogie-seek »).
  els.messages?.addEventListener('click', (e) => {
    const time = e.target.closest?.('.copilot-time');
    if (!time) return;
    document.dispatchEvent(new CustomEvent('pedagogie-seek', { detail: { seconds: Number(time.dataset.seconds) } }));
  });

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
    if (playing) {
      playingExampleId = id;
      examplePaused = false;
      exampleProgress = null;
    } else if (playingExampleId === id) {
      playingExampleId = null;
      examplePaused = false;
      exampleProgress = null;
    }
    refreshExampleCards();
  });
  // [Claude] — 2026-10-03 — Sa position, toutes les 250 ms (main.js) : la barre la suit.
  document.addEventListener('copilot-example-progress', (e) => {
    const { id, position, duration, paused } = e.detail || {};
    if (!id || id !== playingExampleId) return;
    exampleProgress = { id, position: Number(position) || 0, duration: Number(duration) || 0 };
    examplePaused = Boolean(paused);
    refreshExampleTransport();
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

  // Au chargement : prisme 1 (autonome) par défaut. [Claude] — 2026-10-03 — Aucun tuto
  // n'est ouvert au démarrage (la liste qu'on lisait ici, dans le tiroir « Mes tutoriels »,
  // est retirée) : Pédagogie IA l'annonce quand on en ouvre un.
  currentTutorialPath = null;
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
  // [Claude] — 2026-09-26 — L'historique (fichiers) ne doit jamais empêcher la
  // conversation de s'afficher.
  await startNewConversation(AUTONOMOUS_HISTORY_KEY).catch((err) => console.warn('[Copilot] Conversation non enregistrée :', err));
  renderMessages();
  await renderHistoryList().catch((err) => console.warn('[Copilot] Liste des conversations indisponible :', err));
}

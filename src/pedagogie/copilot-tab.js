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
import { setKeyboardMarks, clearKeyboardMarks } from '../ui/keyboard-marks.js';
import { chordExampleSteps } from './example-guide.js';
import { liveTake } from '../recorder/live-take.js';
import { reviewTake, takeMarks, takeMoment, passageToExample, momentText } from '../recorder/take-review.js';
import { stepsFromExample, stepsFromMoments, judgeChordStep, judgeSequenceStep, stepFeedback } from './copilot-steps.js';

const els = {};
let currentTutorialPath = null;
let messages = [];
let currentConversationId = null;
// Exemple du Copilote en cours de lecture (identifiant du message), ou null.
let playingExampleId = null;
// [Claude] — 2026-09-25 — Exemple en cours de lecture (pour ses moments au clavier).
let playingExample = null;
// [Claude] — 2026-09-25 — Portrait du dernier passage joué (« Qu'en penses-tu ? »),
// gardé pour les questions de suivi de la même conversation.
let lastTakeContext = null;
const DEFAULT_REVIEW_QUESTION = 'Qu\'en penses-tu de ce que je viens de jouer ?';
// [Claude] — 2026-09-25 — Pas à pas au clavier (exemple ou erreurs d'un passage) :
// { id, title, steps, index, played, fresh, timer, finished }, ou null.
let stepper = null;

export const AUTONOMOUS_HISTORY_KEY = HISTORY_AUTONOMOUS_KEY;
let currentMode = 'autonomous';
let currentSessionId = null;
let currentSessionContext = null;

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
  if (mode === 'tutorial' || mode === 'session') {
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
function getTutorialContext() {
  if (currentMode !== 'tutorial' || !currentTutorialPath) return null;
  const analysis = window.__pedagogieAnalysis;
  if (!analysis) return { type: 'tutorial', path: currentTutorialPath };

  const chords = analysis.segments
    .filter((s) => s.chord?.resolved)
    .map((s) => ({ start: s.start, end: s.end, label: s.chord.label }));

  const transcript = analysis.narrationView
    ? analysis.narrationView.map((n) => ({ start: n.start, text: n.text }))
    : [];

  return {
    type: 'tutorial',
    path: currentTutorialPath,
    name: currentTutorialPath.split('/').pop(),
    key: analysis.key,
    chords,
    transcript,
  };
}

/** Renvoie un résumé de la session MIDI pour le contexte IA. */
function getSessionContext() {
  if (currentMode !== 'session' || !currentSessionContext) return null;
  return currentSessionContext;
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
function renderMessageText(container, content) {
  const lines = String(content || '').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const p = document.createElement('p');
    p.innerHTML = escapeHtml(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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
  const buttons = el('div', { className: 'copilot-example-buttons' }, [button]);
  // [Claude] — 2026-09-25 — Pas à pas : l'élève joue chaque accord (ou chaque groupe de notes) à son rythme.
  buttons.appendChild(el('button', {
    className: 'copilot-example-steps', type: 'button', title: 'Joue l\'exemple toi-même, étape par étape : le clavier montre quoi jouer et vérifie',
    onClick: () => startStepper(id, stepsFromExample(example), example.title || 'Exemple'),
    text: 'Pas à pas',
  }));
  card.appendChild(buttons);
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
  if (stepper?.id === id) card.appendChild(renderStepperBar());
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
  // Exemple d'une conversation enregistrée avant le 25/09 : ses moments sont
  // recalculés depuis les accords (les exemples de notes restent sans marques).
  if (!example.steps && example.chords?.length) example.steps = chordExampleSteps(example.chords);
  playingExample = { id, example };
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id, example } }));
}

/**
 * [Claude] — 2026-09-25 — Moment joué par l'exemple (main.js relaie la position du
 * lecteur) : le clavier montre le rôle de chaque note, la voix qui va bouger, et
 * la légende dit pourquoi (« Do (7e) descend sur Si, la 3ce de G7 »).
 */
function showExampleStep(id, step) {
  if (!playingExample || playingExample.id !== id) return;
  const moment = playingExample.example.steps?.[step];
  if (moment) setKeyboardMarks(moment.marks, { caption: moment.caption });
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
 * moments à revoir, qu'un clic montre au clavier.
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
  if (take.moments?.length) {
    buttons.appendChild(el('button', {
      className: 'copilot-example-steps', type: 'button', title: 'Chaque moment à revoir au clavier ; rejoue-le juste quand la correction est connue',
      onClick: () => startStepper(id, stepsFromMoments(take.moments, { marksOf: (m) => takeMarks(null, m) }), 'Tes erreurs', {
        doneText: 'Bravo : tu as rejoué juste chaque moment à revoir ! (Recommencer ou Quitter)',
      }),
      text: 'Voir mes erreurs',
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
  if (take.moments?.length) {
    const list = el('div', { className: 'copilot-take-moments' });
    for (const m of take.moments.slice(0, 8)) {
      list.appendChild(el('button', {
        className: 'copilot-take-moment', type: 'button', title: 'Montrer ce moment au clavier',
        onClick: () => {
          const view = takeMarks(null, m);
          setKeyboardMarks(view.marks, { caption: view.caption, tone: view.tone });
        },
        text: `${takeMoment(m.at)}${m.chord ? ` ${m.chord}` : ''} — ${m.text}`,
      }));
    }
    text.appendChild(list);
  }
  card.appendChild(text);
  if (stepper?.id === id) card.appendChild(renderStepperBar());
  return card;
}

// ── Pas à pas ──

function stepCaption(text = '') {
  const step = stepper.steps[stepper.index];
  return `Étape ${stepper.index + 1} / ${stepper.steps.length} — ${text || step.caption}`;
}

/** Montre l'étape en cours au clavier (rien de joué encore). */
function showStep() {
  if (!stepper) return;
  clearTimeout(stepper.timer);
  stepper.played = [];
  stepper.fresh = new Set();
  stepper.finished = false;
  const step = stepper.steps[stepper.index];
  const fb = stepFeedback(step, step.kind === 'sequence'
    ? { status: 'idle', matched: 0, expected: step.notes[0] }
    : { status: 'idle', missing: step.notes, extra: [], good: [] });
  const hint = step.kind === 'show' ? fb.caption
    : step.kind === 'sequence' ? `${step.caption} — joue les notes dans l'ordre`
      : step.correction ? `${step.caption} — rejoue-le juste (touches en pointillé)` : `${step.caption} — à toi !`;
  // Une erreur se montre d'abord telle quelle (note fausse en rouge, juste en pointillé).
  const marks = step.correction ? step.marks : fb.marks;
  setKeyboardMarks(marks, { caption: stepCaption(hint), tone: step.kind === 'show' || step.correction ? 'warn' : '' });
  refreshStepperBar();
}

/** Démarre le pas à pas d'une carte (exemple ou erreurs d'un passage). */
function startStepper(id, steps, title, { doneText = null } = {}) {
  if (!steps?.length) return;
  document.dispatchEvent(new CustomEvent('copilot-stop-example'));
  stopStepper({ clear: false });
  stepper = { id, title, steps, index: 0, played: [], fresh: new Set(), timer: null, finished: false, doneText: doneText || `Bravo : ${title} joué en entier ! (Recommencer ou Quitter)` };
  renderMessages();
  showStep();
}

function stopStepper({ clear = true } = {}) {
  if (!stepper) return;
  clearTimeout(stepper.timer);
  stepper = null;
  if (clear) clearKeyboardMarks();
  els.messages?.querySelectorAll('.copilot-stepper').forEach((bar) => bar.remove());
}

function goToStep(index) {
  if (!stepper) return;
  stepper.index = Math.max(0, Math.min(stepper.steps.length - 1, index));
  showStep();
}

/** Note jouée (main.js) : l'étape est jugée ; juste → étape suivante. */
function onLiveInput(detail) {
  if (!stepper || stepper.finished || !detail) return;
  const step = stepper.steps[stepper.index];
  if (step.kind === 'show') return;
  if (detail.type === 'on') {
    stepper.fresh.add(detail.midi);
    stepper.played.push(detail.midi);
  }
  let judge;
  if (step.kind === 'chord') {
    // Seulement les touches jouées depuis le début de l'étape (pas l'accord d'avant encore tenu).
    judge = judgeChordStep((detail.held || []).filter((n) => stepper.fresh.has(n)), step);
    if (judge.status === 'idle') return;
  } else {
    if (detail.type !== 'on') return;
    judge = judgeSequenceStep(stepper.played, step);
    // Une fausse note ne compte pas : on reprend à la note attendue.
    if (judge.status === 'wrong') stepper.played = stepper.played.slice(0, judge.matched);
  }
  const fb = stepFeedback(step, judge);
  setKeyboardMarks(fb.marks, { caption: stepCaption(fb.caption), tone: fb.tone });
  if (judge.status === 'ok') {
    clearTimeout(stepper.timer);
    stepper.timer = setTimeout(() => {
      if (!stepper) return;
      if (stepper.index < stepper.steps.length - 1) goToStep(stepper.index + 1);
      else {
        stepper.finished = true;
        setKeyboardMarks(fb.marks, { caption: stepper.doneText, tone: 'ok' });
        refreshStepperBar();
      }
    }, 900);
  }
}

/** Joue seulement l'étape en cours (accord plaqué, ou notes posément). */
function playCurrentStep() {
  if (!stepper) return;
  const step = stepper.steps[stepper.index];
  const events = [];
  if (step.kind === 'sequence') {
    step.notes.forEach((n, i) => {
      events.push({ time: i * 0.5, type: 'noteOn', note: n, velocity: 0.7 });
      events.push({ time: i * 0.5 + 0.45, type: 'noteOff', note: n });
    });
  } else {
    step.notes.forEach((n) => {
      events.push({ time: 0, type: 'noteOn', note: n, velocity: 0.7 });
      events.push({ time: 1.6, type: 'noteOff', note: n });
    });
  }
  events.sort((a, b) => a.time - b.time || (a.type === 'noteOff' ? -1 : 1));
  const beats = Math.max(...events.map((e) => e.time));
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id: `step-${stepper.id}`, example: { events, beats, tempo: 60 } } }));
}

function renderStepperBar() {
  const bar = el('div', { className: 'copilot-stepper', 'data-stepper-for': stepper.id });
  fillStepperBar(bar);
  return bar;
}

function fillStepperBar(bar) {
  bar.innerHTML = '';
  const step = stepper.steps[stepper.index];
  bar.appendChild(el('span', { className: 'copilot-stepper-title', text: `${stepper.title} · étape ${stepper.index + 1} / ${stepper.steps.length}` }));
  bar.appendChild(el('span', { className: 'copilot-stepper-step', text: step.caption }));
  const button = (text, onClick, disabled = false) => {
    const b = el('button', { type: 'button', text, onClick });
    if (disabled) b.disabled = true;
    return b;
  };
  bar.appendChild(el('div', { className: 'copilot-stepper-actions' }, [
    button('◀ Précédent', () => goToStep(stepper.index - 1), stepper.index === 0),
    step.kind !== 'show' ? button('Écouter l\'étape', playCurrentStep) : null,
    stepper.finished
      ? button('Recommencer', () => goToStep(0))
      : button('Suivant ▶', () => goToStep(stepper.index + 1), stepper.index >= stepper.steps.length - 1),
    button('Quitter', () => stopStepper()),
  ]));
}

/** Met la barre du pas à pas à jour sans tout redessiner. */
function refreshStepperBar() {
  if (!els.messages || !stepper) return;
  const bar = els.messages.querySelector(`.copilot-stepper[data-stepper-for="${stepper.id}"]`);
  if (bar) fillStepperBar(bar);
}

/** Réécoute du passage joué (même lecteur que les exemples, rôles au clavier). */
function toggleTakeReplay(msg) {
  const id = exampleIdOf(msg);
  if (playingExampleId === id) {
    document.dispatchEvent(new CustomEvent('copilot-stop-example'));
    return;
  }
  playingExample = { id, example: msg.take.example };
  document.dispatchEvent(new CustomEvent('copilot-play-example', { detail: { id, example: msg.take.example } }));
}

/** Pièce jointe d'une question « Qu'en penses-tu ? » (gardée dans l'historique). */
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
    })),
    example: passageToExample(passage.events, review),
  };
}

/**
 * « Qu'en penses-tu ? » : le dernier passage joué (depuis la dernière pause) est
 * analysé par l'application, montré au clavier, et joint à la question tapée
 * (n'importe laquelle), ou à « Qu'en penses-tu de ce que je viens de jouer ? ».
 * Sans clé d'IA, le verdict de l'application s'affiche au clavier.
 */
export async function reviewLastPassage({ question = '', fromKeyboard = false } = {}) {
  const passage = liveTake.lastPassage();
  if (!passage) {
    setKeyboardMarks([], {
      caption: 'Rien à écouter : joue d\'abord au clavier (MIDI, virtuel ou clavier d\'ordinateur), puis clique sur « Qu\'en penses-tu ? ».',
      tone: 'warn',
    });
    return null;
  }
  const asked = String(question || '').trim();
  const review = reviewTake(passage.events, { question: asked });
  if (!review) return null;
  const view = takeMarks(review, review.moments[0] || null);
  if (!hasAIKey() || !els.input) {
    setKeyboardMarks(view.marks, { caption: view.caption, tone: view.tone });
    return review;
  }
  if (fromKeyboard) {
    document.dispatchEvent(new CustomEvent('app-switch-tab', { detail: { tab: 'practice' } }));
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'copilot' } }));
  }
  // Après la bascule (qui efface le clavier) : le verdict, ou le premier moment à revoir.
  setKeyboardMarks(view.marks, { caption: view.caption, tone: view.tone });
  els.input.value = '';
  autoGrowInput();
  await runCopilotTurn(asked || DEFAULT_REVIEW_QUESTION, { take: takeAttachment(review, passage), review: true, takeContext: review.contextLines });
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
    renderMessageText(content, msg.content);
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
  const key =
    currentMode === 'tutorial' && currentTutorialPath
      ? currentTutorialPath
      : currentMode === 'session' && currentSessionId
        ? currentSessionId
        : AUTONOMOUS_HISTORY_KEY;
  return startNewConversation(key);
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
    if (els.introText) els.introText.textContent = 'Mode accompagnement : le Copilot connaît la grille, la transcription et la tonalité de ce tutoriel.';
  } else if (currentMode === 'session' && currentSessionContext) {
    const name = currentSessionContext.name || currentSessionId;
    if (els.selectedName) els.selectedName.textContent = `Copilot IA — Session : ${name}`;
    if (els.introText) els.introText.textContent = 'Mode session : le Copilot analyse la session MIDI sélectionnée.';
  } else {
    if (els.selectedName) els.selectedName.textContent = 'Copilot IA';
    if (els.introText) els.introText.textContent = '';
  }
}

function updateModeToggle() {
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
  updateHeaderForMode();
  updateModeToggle();
  if (!hasAIKey()) { showNoKeyState(); return; }
  showChatArea();
  await startNewConversation(currentSessionId);
  renderMessages();
  await renderHistoryList();
}

async function onModeToggleClick() {
  if (currentMode === 'tutorial' || currentMode === 'session') {
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
  stopStepper({ clear: false });
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

  const base = getTutorialContext() || getSessionContext();
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
    const key =
      currentMode === 'tutorial' && currentTutorialPath
        ? currentTutorialPath
        : currentMode === 'session' && currentSessionId
          ? currentSessionId
          : AUTONOMOUS_HISTORY_KEY;
    await saveHistory(currentConversationId, key, messages);
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
  const key =
    currentMode === 'tutorial' && currentTutorialPath
      ? currentTutorialPath
      : currentMode === 'session' && currentSessionId
        ? currentSessionId
        : AUTONOMOUS_HISTORY_KEY;
  await startNewConversation(key);
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
  // [Claude] — 2026-09-25 — « Qu'en penses-tu ? » : le passage joué + la question tapée.
  els.reviewBtn?.addEventListener('click', () => reviewLastPassage({ question: els.input?.value || '' }));
  document.addEventListener('copilot-review-take', (e) => reviewLastPassage({ question: e.detail?.question || '', fromKeyboard: true }));
  // [Claude] — 2026-09-25 — Pas à pas : notes jouées, et fin (croix de la légende, autre vue).
  document.addEventListener('app-live-input', (e) => onLiveInput(e.detail));
  document.addEventListener('keyboard-marks-cleared', () => stopStepper({ clear: false }));
  document.addEventListener('app-switch-training-view', (e) => { if (e.detail?.view !== 'copilot') stopStepper({ clear: false }); });
  document.addEventListener('app-switch-tab', (e) => { if (e.detail?.tab !== 'practice') stopStepper({ clear: false }); });
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

  document.addEventListener('copilot-switch-to-session', async (e) => {
    const sessionContext = e.detail;
    if (!sessionContext?.sessionId) return;
    await switchToSessionMode(sessionContext);
  });

  // Lecture d'un exemple commencée / finie (main.js). À la fin, les marques de
  // l'exemple s'effacent du clavier.
  document.addEventListener('copilot-example-state', (e) => {
    const { id, playing } = e.detail || {};
    if (playing) playingExampleId = id;
    else if (playingExampleId === id) {
      playingExampleId = null;
      if (playingExample?.id === id) {
        playingExample = null;
        clearKeyboardMarks();
      }
    }
    refreshExampleCards();
  });
  document.addEventListener('copilot-example-step', (e) => showExampleStep(e.detail?.id, e.detail?.step));

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

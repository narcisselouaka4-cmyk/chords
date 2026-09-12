// [Claude] — 2026-09-09 — Copilot IA : contrôleur du sous-onglet.
//
// Orchestration pure : écoute la sélection Pédagogie, charge l'historique,
// gère le chat, appelle copilot-client.js. Aucune décision musicale ici.

import {
  createConversation,
  loadHistory,
  saveHistory,
  deleteConversation,
  listAllConversations,
  labelForConversationPath,
  AUTONOMOUS_HISTORY_KEY as HISTORY_AUTONOMOUS_KEY,
} from './copilot-history.js';
import { sendCopilotMessage } from './copilot-client.js';
import { hasAIKey } from '../ai/openai-config.js';

const els = {};
let currentTutorialPath = null;
let messages = [];
let currentConversationId = null;

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

    // Notes réellement jouées au clavier virtuel par l'outil du Copilot.
    // Information, pas bouton : rien ne permet aujourd'hui de rejouer la démo.
    if (msg.toolResult?.played?.length) {
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
  if (items.length === 0) {
    els.historyList.appendChild(el('div', { className: 'copilot-history-preview', text: 'Aucune conversation.' }));
    return;
  }
  for (const item of items) {
    const dateText = formatHistoryDate(item.updatedAt);
    const isActive = item.conversationId === currentConversationId;
    const primary = item.preview || 'Conversation vide';
    const secondary = `${labelForConversationPath(item.tutorialPath)} · ${dateText || 'sans date'}`;
    const row = el('div', { className: `copilot-history-item ${isActive ? 'active' : ''}` }, [
      el('div', { className: 'copilot-history-info' }, [
        el('div', { className: 'copilot-history-label', text: primary }),
        el('div', { className: 'copilot-history-preview', text: secondary }),
      ]),
      el('button', {
        className: 'copilot-history-delete',
        text: '×',
        title: 'Supprimer cette conversation',
        onClick: (e) => { e.stopPropagation(); deleteHistoryItem(item.conversationId); },
      }),
    ]);
    row.addEventListener('click', async () => { await loadHistoryItem(item.conversationId); });
    els.historyList.appendChild(row);
  }
}

async function deleteHistoryItem(conversationId) {
  await deleteConversation(conversationId);
  if (conversationId === currentConversationId) {
    messages = [];
    currentConversationId = null;
    renderMessages();
  }
  await renderHistoryList();
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
    if (els.introText) els.introText.textContent = 'Mode autonome : posez vos questions librement, le Copilot peut démontrer au clavier virtuel.';
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
  els.input.disabled = true;
  els.sendBtn.disabled = true;

  await ensureCurrentConversation();
  messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
  addTypingIndicator();

  const context = getTutorialContext() || getSessionContext();
  const copilotStyleId = els.styleSelect?.value || 'auto';
  const res = await sendCopilotMessage({ message: text, messages, context, copilotStyleId });

  removeTypingIndicator();
  if (res.ok) {
    messages.push({
      role: 'assistant',
      content: res.content,
      toolResult: res.toolResult,
      suggestedActions: res.suggestedActions,
      timestamp: new Date().toISOString(),
    });
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
  await renderHistoryList();
  els.input.disabled = false;
  els.sendBtn.disabled = false;
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
  els.newConvBtn = document.getElementById('copilot-new-conv-btn');
  els.modeToggleBtn = document.getElementById('copilot-mode-toggle-btn');
  els.selectedName = document.getElementById('copilot-selected-name');
  els.introText = document.getElementById('copilot-intro');
  els.historyList = document.getElementById('copilot-history-list');
  els.newConvSidebarBtn = document.getElementById('copilot-new-conv-sidebar-btn');

  els.sendBtn?.addEventListener('click', sendUserMessage);
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

  // Au chargement : prisme 1 (autonome) par défaut, qu'un tutoriel soit
  // sélectionné ou non.
  const currentPath = document.querySelector('#pedagogie-track-list .pedagogie-track-item.active')?.title;
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

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

/** Rendu d’une rangée de chips d’action. */
function renderActionChips(actions) {
  if (!actions?.length) return null;
  const container = el('div', { className: 'copilot-message-actions' });
  for (const action of actions) {
    container.appendChild(el('button', {
      className: 'copilot-chip',
      type: 'button',
      text: action.label,
      title: action.message,
      onClick: () => {
        if (!els.input) return;
        els.input.value = action.message;
        sendUserMessage();
      },
    }));
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
  const options = el('div', { className: 'tr-prompt-options' });
  const welcomeActions = [
    { label: 'Enrichir mes voicings', icon: 'piano', message: 'Montre-moi un voicing intéressant pour cet accord.' },
    { label: 'Comprendre un 2-5-1', icon: 'music2', message: 'Explique-moi l\'harmonie d\'un 2-5-1.' },
    { label: 'Mieux accompagner', icon: 'sparkles', message: 'Comment mieux accompagner une mélodie ?' },
  ];
  for (const action of welcomeActions) {
    options.appendChild(el('button', {
      type: 'button',
      text: action.label,
      title: action.message,
      onClick: () => {
        if (!els.input) return;
        els.input.value = action.message;
        sendUserMessage();
      },
    }));
  }
  return el('div', { className: 'tr-copilot-welcome' }, [
    el('span', { className: 'tr-eyebrow', text: 'VOTRE PARTENAIRE D’HARMONIE' }),
    heading,
    el('p', { text: 'Un voicing à explorer, une progression à comprendre. Posez votre question ci-dessous.' }),
    options,
  ]);
}

/** Rendu de la liste des messages. */
function renderMessages() {
  els.messages.innerHTML = '';
  if (messages.length === 0) {
    els.messages.classList.add('is-empty');
    els.messages.appendChild(renderCopilotWelcome());
    return;
  }
  els.messages.classList.remove('is-empty');
  for (const msg of messages) {
    const row = el('div', { className: `copilot-message ${msg.role}` });
    if (msg.isTyping) {
      row.className += ' is-typing';
      const bubble = el('div', { className: 'copilot-bubble', innerHTML: '<span class="copilot-typing-dots"><span></span><span></span><span></span></span>' });
      row.appendChild(bubble);
    } else if (msg.role === 'system') {
      row.textContent = msg.content;
      row.className += ' is-system';
    } else {
      const bubble = el('div', { className: 'copilot-bubble', text: msg.content });
      row.appendChild(bubble);
    }
    if (msg.toolResult?.played?.length) {
      const played = el('div', { className: 'copilot-tool-note' }, [
        el('span', { text: '🎹 Notes jouées : ' }),
        el('span', { text: msg.toolResult.played.map((p) => p.name).join(', ') }),
      ]);
      row.appendChild(played);
    }
    if (msg.role === 'assistant' && msg.suggestedActions?.length) {
      const chips = renderActionChips(msg.suggestedActions);
      if (chips) row.appendChild(chips);
    }
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

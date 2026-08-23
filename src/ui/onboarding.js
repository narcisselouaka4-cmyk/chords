/**
 * Moteur de visite guidée — projecteur sur un élément réel de l'interface,
 * carte explicative, navigation clavier.
 *
 * Contraintes de conception :
 *   - **Jamais bloquant.** Une cible absente ou masquée ne casse rien : l'étape
 *     s'affiche centrée avec le même texte. Le tutoriel décrit l'application, il
 *     ne présume pas de son état.
 *   - **Jamais imposé.** Une proposition automatique ne se répète pas, et
 *     « Ne plus proposer » coupe définitivement les propositions sans empêcher
 *     de rouvrir le tutoriel à la demande.
 *   - **Aucune dépendance.** Vanilla JS, comme le reste du projet.
 */

import './components/onboarding.css';
import {
  CHAPTERS,
  STORAGE_KEY,
  defaultProgress,
  getChapter,
  parseProgress,
  shouldAutoStart,
} from './onboarding-content.js';

let progress = defaultProgress();
let tour = null; // { chapter, index, nodes… } quand une visite est en cours
let pickerEl = null;

// ── Progression persistée ───────────────────────────────────────────────────

function loadProgress() {
  try {
    progress = parseProgress(window.localStorage?.getItem(STORAGE_KEY));
  } catch {
    progress = defaultProgress();
  }
  return progress;
}

function saveProgress() {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Stockage indisponible : le tutoriel reste utilisable, simplement il sera
    // reproposé au prochain lancement. Ce n'est pas une raison d'échouer.
  }
}

function markSeen(chapterId) {
  if (!progress.seen.includes(chapterId)) {
    progress.seen.push(chapterId);
    saveProgress();
  }
}

// ── Rendu ───────────────────────────────────────────────────────────────────

/** Gras minimal : **texte**. Le contenu est écrit par nous, jamais par un tiers. */
function renderBody(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function resolveTarget(step) {
  if (!step.target) return null;
  let el = null;
  try {
    el = document.querySelector(step.target);
  } catch {
    return null;
  }
  return isVisible(el) ? el : null;
}

function positionCard(card, target) {
  const margin = 14;
  const rect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  // Sous la cible par défaut ; au-dessus si la place manque en bas.
  let top = rect.bottom + margin;
  if (top + cardRect.height > window.innerHeight - margin) {
    top = rect.top - cardRect.height - margin;
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - cardRect.height - margin));

  let left = rect.left + rect.width / 2 - cardRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - cardRect.width - margin));

  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
  card.classList.remove('centered');
}

function centerCard(card) {
  card.style.top = '';
  card.style.left = '';
  card.classList.add('centered');
}

function layout() {
  if (!tour) return;
  const step = tour.chapter.steps[tour.index];
  const target = resolveTarget(step);

  if (target) {
    const rect = target.getBoundingClientRect();
    const pad = 6;
    tour.spotlight.style.display = '';
    tour.spotlight.style.top = `${rect.top - pad}px`;
    tour.spotlight.style.left = `${rect.left - pad}px`;
    tour.spotlight.style.width = `${rect.width + pad * 2}px`;
    tour.spotlight.style.height = `${rect.height + pad * 2}px`;
    positionCard(tour.card, target);
  } else {
    // Cible absente ou masquée : on explique quand même, au centre.
    tour.spotlight.style.display = 'none';
    centerCard(tour.card);
  }
}

function renderStep() {
  const { chapter, index } = tour;
  const step = chapter.steps[index];
  const total = chapter.steps.length;

  tour.titleEl.textContent = step.title;
  tour.bodyEl.innerHTML = renderBody(step.body);
  tour.counterEl.textContent = `${index + 1} / ${total}`;
  tour.chapterEl.textContent = chapter.title;
  tour.prevBtn.disabled = index === 0;
  tour.nextBtn.textContent = index === total - 1 ? 'Terminer' : 'Suivant';

  const target = resolveTarget(step);
  tour.card.classList.toggle('no-target', !target);

  // Amener la cible à l'écran avant de mesurer sa position.
  if (target) {
    target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }
  requestAnimationFrame(layout);
}

function goTo(index) {
  if (!tour) return;
  if (index < 0) return;
  if (index >= tour.chapter.steps.length) {
    finish();
    return;
  }
  tour.index = index;
  renderStep();
}

function finish() {
  if (!tour) return;
  const chapterId = tour.chapter.id;
  markSeen(chapterId);
  close();
  // Émis après la fermeture pour qu'un chapitre suivant puisse démarrer
  // proprement sans se superposer au précédent.
  document.dispatchEvent(new CustomEvent('onboarding:chapter-finished', {
    detail: { chapter: chapterId },
  }));
}

function close() {
  if (!tour) return;
  window.removeEventListener('resize', layout);
  window.removeEventListener('scroll', layout, true);
  document.removeEventListener('keydown', tour.onKeydown, true);
  tour.root.remove();
  const { restoreFocus } = tour;
  tour = null;
  if (restoreFocus && restoreFocus.isConnected) {
    try { restoreFocus.focus(); } catch { /* l'élément a pu disparaître */ }
  }
}

function switchTab(tab) {
  if (!tab) return;
  document.dispatchEvent(new CustomEvent('app-switch-tab', { detail: { tab } }));
}

/** Démarre un chapitre. Retourne false si le chapitre n'existe pas. */
export function startChapter(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  if (tour) close();
  closePicker();
  switchTab(chapter.tab);

  const root = document.createElement('div');
  root.className = 'onboarding-root';
  root.innerHTML = `
    <div class="onboarding-veil"></div>
    <div class="onboarding-spotlight" aria-hidden="true"></div>
    <div class="onboarding-card" role="dialog" aria-modal="true"
         aria-labelledby="onboarding-title" tabindex="-1">
      <div class="onboarding-card-head">
        <span class="onboarding-chapter"></span>
        <span class="onboarding-counter"></span>
      </div>
      <h2 class="onboarding-title" id="onboarding-title"></h2>
      <div class="onboarding-body"></div>
      <div class="onboarding-actions">
        <button type="button" class="onboarding-skip">Passer</button>
        <span class="onboarding-spacer"></span>
        <button type="button" class="onboarding-prev btn-secondary btn-sm">Précédent</button>
        <button type="button" class="onboarding-next btn-primary btn-sm">Suivant</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const card = root.querySelector('.onboarding-card');
  tour = {
    chapter,
    index: 0,
    root,
    card,
    spotlight: root.querySelector('.onboarding-spotlight'),
    titleEl: root.querySelector('.onboarding-title'),
    bodyEl: root.querySelector('.onboarding-body'),
    counterEl: root.querySelector('.onboarding-counter'),
    chapterEl: root.querySelector('.onboarding-chapter'),
    prevBtn: root.querySelector('.onboarding-prev'),
    nextBtn: root.querySelector('.onboarding-next'),
    restoreFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    onKeydown: null,
  };

  tour.prevBtn.addEventListener('click', () => goTo(tour.index - 1));
  tour.nextBtn.addEventListener('click', () => goTo(tour.index + 1));
  root.querySelector('.onboarding-skip').addEventListener('click', () => finish());
  root.querySelector('.onboarding-veil').addEventListener('click', () => finish());

  tour.onKeydown = (e) => {
    if (!tour) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(tour.index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(tour.index - 1); }
  };
  document.addEventListener('keydown', tour.onKeydown, true);
  window.addEventListener('resize', layout);
  window.addEventListener('scroll', layout, true);

  renderStep();
  card.focus();
  return true;
}

// ── Menu des chapitres ──────────────────────────────────────────────────────

function closePicker() {
  pickerEl?.remove();
  pickerEl = null;
}

export function openPicker(anchor) {
  if (pickerEl) { closePicker(); return; }

  pickerEl = document.createElement('div');
  pickerEl.className = 'onboarding-picker';
  pickerEl.setAttribute('role', 'menu');
  pickerEl.innerHTML = `
    <div class="onboarding-picker-title">Tutoriel</div>
    ${CHAPTERS.map((chapter) => `
      <button type="button" class="onboarding-picker-item" data-chapter="${chapter.id}" role="menuitem">
        <span class="onboarding-picker-name">${chapter.title}</span>
        <span class="onboarding-picker-summary">${chapter.summary}</span>
        ${progress.seen.includes(chapter.id) ? '<span class="onboarding-picker-done" title="Déjà parcouru">✓</span>' : ''}
      </button>
    `).join('')}
    <label class="onboarding-picker-dismiss">
      <input type="checkbox" ${progress.dismissed ? 'checked' : ''} />
      Ne plus proposer automatiquement
    </label>
  `;
  document.body.appendChild(pickerEl);

  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    pickerEl.style.top = `${Math.round(rect.bottom + 8)}px`;
    pickerEl.style.right = `${Math.round(window.innerWidth - rect.right)}px`;
  }

  pickerEl.querySelectorAll('.onboarding-picker-item').forEach((btn) => {
    btn.addEventListener('click', () => startChapter(btn.dataset.chapter));
  });
  pickerEl.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
    progress.dismissed = e.target.checked;
    saveProgress();
  });

  const onOutside = (e) => {
    if (!pickerEl) return;
    if (pickerEl.contains(e.target) || anchor?.contains(e.target)) return;
    closePicker();
    document.removeEventListener('pointerdown', onOutside, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
}

// ── Déclencheurs contextuels ────────────────────────────────────────────────

/**
 * Propose un chapitre si, et seulement si, le moment s'y prête et qu'il n'a
 * jamais été vu. Silencieux dans tous les autres cas.
 */
export function maybeAutoStart(chapterId, trigger) {
  if (tour) return false;
  if (!shouldAutoStart(chapterId, trigger, progress)) return false;
  return startChapter(chapterId);
}

export function initOnboarding() {
  loadProgress();

  const helpBtn = document.getElementById('onboarding-help-btn');
  helpBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPicker(helpBtn);
  });

  // Les autres modules signalent un moment pédagogique sans rien savoir du
  // tutoriel : un simple évènement, que le moteur filtre.
  document.addEventListener('onboarding:trigger', (e) => {
    const { chapter, trigger } = e.detail || {};
    if (chapter && trigger) maybeAutoStart(chapter, trigger);
  });

  // Enchaînement du premier lancement : découverte, puis import.
  document.addEventListener('onboarding:chapter-finished', (e) => {
    if (e.detail?.chapter === 'welcome') maybeAutoStart('import', 'after:welcome');
  });

  // Premier lancement : on laisse l'interface se poser avant de proposer.
  setTimeout(() => maybeAutoStart('welcome', 'first-run'), 600);
}

/** Utilitaire pour les autres modules : signaler un moment pédagogique. */
export function notifyOnboarding(chapter, trigger) {
  document.dispatchEvent(new CustomEvent('onboarding:trigger', { detail: { chapter, trigger } }));
}

// Exposé pour le débogage et pour permettre à l'utilisateur de repartir de zéro.
window.__resetOnboarding = () => {
  progress = defaultProgress();
  saveProgress();
};

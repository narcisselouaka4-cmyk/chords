// [Refonte Astra 12/09] — Coquille recopiée de la maquette « Astra ».
// Ce module ne fait que raccorder les nouveaux habillages aux mécanismes qui
// existent déjà dans Zic. Il ne crée aucun second système : le thème reste
// celui de main.js (#theme-toggle + data-theme + localStorage, interdit 2.6),
// la bascule de vues reste initPracticeSubnavViews().

/**
 * Commutateur Sombre / Clair d'Astra.
 * Les deux boutons ne changent rien eux-mêmes : ils cliquent #theme-toggle
 * quand le thème demandé diffère du thème courant. Tout le reste (écriture du
 * localStorage, évènement app-theme-changed, couleur de fond du <html>) reste
 * dans initTheme() de main.js.
 */
function initAstraThemeSwitch() {
  const group = document.getElementById('astra-theme-switch');
  const toggle = document.getElementById('theme-toggle');
  if (!group || !toggle) return;

  const sync = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    group.querySelectorAll('button[data-theme-choice]').forEach((btn) => {
      const active = btn.dataset.themeChoice === current;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  };

  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme-choice]');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    if (btn.dataset.themeChoice !== current) toggle.click();
    sync();
  });

  window.addEventListener('app-theme-changed', sync);
  sync();
}

/** Le logotype ramène à Sessions MIDI, comme chez Astra. */
function initAstraBrand() {
  document.getElementById('brand-home')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app-switch-tab', { detail: { tab: 'practice' } }));
    document.dispatchEvent(new CustomEvent('app-switch-training-view', { detail: { view: 'midi-sessions' } }));
  });
}

/**
 * Fenêtres et tiroirs recopiés de la maquette, sans framework.
 * Convention : un bouton [data-astra-open="id"] affiche l'élément .tr-overlay
 * qui porte cet id ; [data-astra-close], un clic sur le fond, ou Échap ferment
 * la fenêtre ouverte. Le focus revient au bouton déclencheur.
 */
function initAstraDialogs() {
  let opener = null;

  const close = () => {
    const open = document.querySelector('.tr-overlay:not([hidden])');
    if (!open) return;
    open.hidden = true;
    document.body.classList.remove('tr-dialog-open');
    opener?.focus();
    opener = null;
  };

  const open = (id, trigger) => {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    close();
    opener = trigger || null;
    overlay.hidden = false;
    document.body.classList.add('tr-dialog-open');
    overlay.querySelector("input:not([type='checkbox']), textarea, button")?.focus();
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-astra-open]');
    if (trigger) { open(trigger.dataset.astraOpen, trigger); return; }
    const closer = e.target.closest('[data-astra-close]');
    if (closer) {
      close();
      // Relais éventuel vers un bouton existant de Zic (ex. « Nouvelle
      // session » depuis le tiroir), pour ne pas dupliquer sa logique.
      const relay = closer.dataset.astraClick;
      if (relay) document.querySelector(relay)?.click();
      return;
    }
    // Un choix fait dans une liste ferme le tiroir qui la contient.
    if (e.target.closest('[data-astra-close-on-click]') && e.target.closest('button, [role="button"], .midi-session-item')) { close(); return; }
    // Clic sur le fond de la fenêtre (et non sur le panneau).
    if (e.target.classList?.contains('tr-overlay')) close();
  });

  // Raccourcis clavier déclarés sur le bouton d'ouverture (ex. « B »).
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.tr-overlay:not([hidden])')) return;
    const key = e.key.toLowerCase();
    const trigger = [...document.querySelectorAll('[data-astra-shortcut]')]
      .find((btn) => btn.dataset.astraShortcut === key && btn.offsetParent !== null);
    if (!trigger) return;
    e.preventDefault();
    open(trigger.dataset.astraOpen, trigger);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.tr-overlay:not([hidden])')) {
      e.preventDefault();
      close();
    }
  });
}

/**
 * Relais génériques : un bouton [data-astra-click="<sélecteur>"] clique
 * l'élément visé. Sert à offrir deux points d'entrée (ex. rail replié du
 * clavier et barre d'outils) vers le SEUL bouton que main.js écoute, sans
 * dupliquer sa logique ni son identifiant.
 */
function initAstraRelays() {
  document.addEventListener('click', (e) => {
    const relay = e.target.closest('[data-astra-click]');
    if (!relay || relay.hasAttribute('data-astra-close')) return;
    const target = document.querySelector(relay.dataset.astraClick);
    if (target && target !== relay) target.click();
  });
}

/**
 * Pas à pas (« stepper ») d'Astra autour d'un champ numérique existant.
 * On n'ajoute pas d'état : on modifie la valeur du champ que main.js lit déjà,
 * puis on émet input + change pour que ses écouteurs réagissent normalement.
 */
function initAstraSteppers() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step-target]');
    if (!btn) return;
    const field = document.querySelector(btn.dataset.stepTarget);
    if (!field) return;
    const step = Number(btn.dataset.step) || 1;
    const min = field.min === '' ? -Infinity : Number(field.min);
    const max = field.max === '' ? Infinity : Number(field.max);
    const next = Math.max(min, Math.min(max, (Number(field.value) || 0) + step));
    if (next === Number(field.value)) return;
    field.value = String(next);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * Habillage du clavier : lecture d'accord en direct et poignée de hauteur.
 *
 * La lecture d'accord est un MIROIR de la scène Temps réel (#chord-name et
 * #notes-display) : aucune seconde détection n'est faite ici — le moteur
 * d'accords de Zic reste la seule source (interdit 2.2).
 */
function initAstraKeyboardChrome() {
  const panel = document.getElementById('keyboard-panel');
  if (!panel) return;

  const chordOut = document.getElementById('keyboard-readout-chord');
  const notesOut = document.getElementById('keyboard-readout-notes');
  const countOut = document.getElementById('keyboard-note-count');
  const railOut = document.getElementById('keyboard-rail-readout');
  const rangeOut = document.getElementById('keyboard-range-readout');
  const chordName = document.getElementById('chord-name');
  const notesDisplay = document.getElementById('notes-display');

  const syncReadout = () => {
    const chord = (chordName?.textContent || '').trim();
    const pills = notesDisplay ? [...notesDisplay.querySelectorAll('.note-pill')] : [];
    const notes = pills.length
      ? pills.map((p) => p.textContent.trim()).join(' ')
      : (notesDisplay?.textContent || '').trim();
    if (chordOut) chordOut.textContent = chord || '—';
    if (notesOut) notesOut.textContent = notes || 'aucune note';
    if (countOut) countOut.textContent = `${pills.length} note${pills.length > 1 ? 's' : ''}`;
    if (railOut) {
      railOut.innerHTML = '';
      if (chord) {
        const strong = document.createElement('strong');
        strong.textContent = chord;
        const label = document.createElement('span');
        label.textContent = 'accord';
        railOut.append(strong, label);
      } else if (notes) {
        const strong = document.createElement('strong');
        strong.textContent = notes;
        const label = document.createElement('span');
        label.textContent = 'notes';
        railOut.append(strong, label);
      } else {
        const idle = document.createElement('span');
        idle.className = 'vk-rail-idle';
        idle.textContent = 'Prêt · jouez au clavier';
        railOut.appendChild(idle);
      }
    }
  };

  if (chordName || notesDisplay) {
    const observer = new MutationObserver(syncReadout);
    if (chordName) observer.observe(chordName, { childList: true, characterData: true, subtree: true });
    if (notesDisplay) observer.observe(notesDisplay, { childList: true, characterData: true, subtree: true });
    syncReadout();
  }

  // Étendue affichée : reflet des champs Début / Fin du clavier.
  const start = document.getElementById('note-start');
  const end = document.getElementById('note-end');
  const syncRange = () => {
    if (rangeOut) rangeOut.textContent = `${start?.value || ''} – ${end?.value || ''}`;
  };
  start?.addEventListener('change', syncRange);
  end?.addEventListener('change', syncRange);
  document.getElementById('keyboard-size')?.addEventListener('change', () => setTimeout(syncRange, 0));
  syncRange();

  // Poignée de hauteur (fonctionnalité d'Astra). La hauteur est mémorisée et
  // posée en style inline sur le panneau ; le clavier SVG se redessine sur
  // l'évènement resize, comme lors du repli.
  const handle = document.getElementById('keyboard-resize');
  const MIN = 150;
  const MAX = 470;
  const STORAGE_KEY = 'keyboard-height';
  let stored = 0;
  try { stored = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch (_) { /* pas de persistance */ }
  if (stored >= MIN && stored <= MAX) panel.style.height = `${stored}px`;

  handle?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    const move = (e) => {
      const next = Math.round(Math.max(MIN, Math.min(MAX, startHeight - (e.clientY - startY))));
      panel.style.height = `${next}px`;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      try { localStorage.setItem(STORAGE_KEY, String(Math.round(panel.getBoundingClientRect().height))); } catch (_) { /* ignore */ }
      window.dispatchEvent(new Event('resize'));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  });
}

export function initAstraShell() {
  initAstraThemeSwitch();
  initAstraBrand();
  initAstraDialogs();
  initAstraRelays();
  initAstraSteppers();
  initAstraKeyboardChrome();
}

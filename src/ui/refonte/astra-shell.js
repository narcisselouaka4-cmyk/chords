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
    if (e.target.closest('[data-astra-close]')) { close(); return; }
    // Clic sur le fond de la fenêtre (et non sur le panneau).
    if (e.target.classList?.contains('tr-overlay')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.tr-overlay:not([hidden])')) {
      e.preventDefault();
      close();
    }
  });
}

export function initAstraShell() {
  initAstraThemeSwitch();
  initAstraBrand();
  initAstraDialogs();
}

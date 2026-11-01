// [Claude] — 2026-10-13 — Notification de l'application, visible quel que soit l'onglet.
//
// Narcisse : « une notification est là pour informer l'utilisateur peu importe où il est ». La
// notification « Le morceau est prêt dans le Studio » vivait DANS l'onglet Studio : invisible depuis
// Analyse ou Entraînement, c'est-à-dire précisément quand elle aurait servi. Celle-ci est posée sur
// <body>, en bas à droite, au-dessus du clavier ; elle porte un bouton d'action facultatif
// (« Ouvrir le Studio ») et se ferme seule ou d'un clic sur ×.
//
// Une notification avec la même clé `id` remplace la précédente au lieu de s'empiler.

const ROOT_ID = 'app-notify-root';

function root() {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'app-notify-root';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {{ id?: string, title: string, message?: string, action?: {label: string, onClick: () => void}, duration?: number, tone?: 'success'|'info'|'error' }} options
 * @returns {() => void} ferme la notification
 */
export function notify({ id = '', title, message = '', action = null, duration = 7000, tone = 'success' } = {}) {
  if (typeof document === 'undefined' || !title) return () => {};
  const host = root();
  if (id) host.querySelector(`.app-notify[data-id="${CSS.escape(id)}"]`)?.remove();

  const card = document.createElement('div');
  card.className = `app-notify is-${tone}`;
  card.setAttribute('role', 'status');
  if (id) card.dataset.id = id;

  const icon = document.createElement('span');
  icon.className = 'app-notify-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = tone === 'error'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>'
    : tone === 'info'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 11v6M12 7.5v.5"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  const body = document.createElement('div');
  body.className = 'app-notify-body';
  const strong = document.createElement('strong');
  strong.textContent = title;
  body.appendChild(strong);
  if (message) {
    const p = document.createElement('span');
    p.textContent = message;
    body.appendChild(p);
  }

  let timer = null;
  const close = () => {
    clearTimeout(timer);
    card.classList.remove('is-visible');
    setTimeout(() => card.remove(), 260);
  };

  if (action?.label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-notify-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { try { action.onClick?.(); } finally { close(); } });
    body.appendChild(btn);
  }

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'app-notify-close';
  x.setAttribute('aria-label', 'Fermer la notification');
  x.textContent = '×';
  x.addEventListener('click', close);

  card.append(icon, body, x);
  host.appendChild(card);
  requestAnimationFrame(() => card.classList.add('is-visible'));
  // Le survol suspend la fermeture automatique.
  const arm = () => { clearTimeout(timer); if (duration > 0) timer = setTimeout(close, duration); };
  card.addEventListener('mouseenter', () => clearTimeout(timer));
  card.addEventListener('mouseleave', arm);
  arm();
  return close;
}

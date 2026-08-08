// [Claude] — 2026-07-10 — Helpers pour construire des éléments du design system.

/**
 * Crée un bouton stylisé du design system.
 * @param {string} text
 * @param {'primary'|'secondary'} variant
 * @param {Object} attrs
 */
export function createButton(text, variant = 'primary', attrs = {}) {
  const btn = document.createElement('button');
  btn.className = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  btn.type = 'button';
  btn.textContent = text;
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === 'className') {
      btn.classList.add(...val.split(' ').filter(Boolean));
    } else {
      btn.setAttribute(key, val);
    }
  });
  return btn;
}

/**
 * Crée un badge.
 * @param {string} text
 * @param {'default'|'success'|'error'|'warning'|'muted'} tone
 */
export function createBadge(text, tone = 'default') {
  const badge = document.createElement('span');
  badge.className = `badge ${tone !== 'default' ? `badge-${tone}` : ''}`;
  badge.textContent = text;
  return badge;
}

/**
 * Crée une carte avec un titre optionnel et un contenu.
 * @param {Object} options
 * @param {string} [options.title]
 * @param {HTMLElement|string} options.content
 * @param {string} [options.className]
 */
export function createCard({ title, content, className = '' } = {}) {
  const card = document.createElement('div');
  card.className = `card ${className}`.trim();
  if (title) {
    const h = document.createElement('div');
    h.className = 'font-bold text-sm';
    h.textContent = title;
    card.appendChild(h);
  }
  const body = document.createElement('div');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);
  card.appendChild(body);
  return card;
}

/**
 * Crée une section repliable.
 * @param {string} title
 * @param {HTMLElement|string} content
 * @param {boolean} open
 */
export function createCollapsible(title, content, open = false) {
  const wrap = document.createElement('div');
  wrap.className = `collapse surface-secondary ${open ? 'open' : ''}`.trim();

  const header = document.createElement('div');
  header.className = 'collapse-header';
  header.innerHTML = `<span class="collapse-title">${escapeHtml(title)}</span><span class="collapse-icon">+</span>`;
  header.addEventListener('click', () => {
    wrap.classList.toggle('open');
  });

  const body = document.createElement('div');
  body.className = 'collapse-body';
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Crée une liste horizontale scrollable.
 */
export function createHorizontalList(className = '') {
  const list = document.createElement('div');
  list.className = `list-horizontal ${className}`.trim();
  return list;
}

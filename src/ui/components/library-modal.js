import './library-modal.css';

// Ouverture inspirée des deux maquettes Arena conservées dans l'ADR-062 :
// couverture de carnet fendue sur sa reliure, puis découverte de la vraie liste.
// Aucun délai ne retarde la lecture des morceaux ; le décor reste facultatif.
const OPEN_MS = 1080;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function makeCover(doc) {
  const cover = doc.createElement('div');
  cover.className = 'library-reveal';
  cover.setAttribute('aria-hidden', 'true');
  const face = `
    <div class="library-cover-face">
      <div class="library-cover-frame">
        <span class="library-cover-brand">Piano Jazz Chords</span>
        <span class="library-cover-title">Carnet</span>
        <span class="library-cover-subtitle">d’harmonie</span>
        <span class="library-cover-rule"></span>
        <span class="library-cover-caption">Votre bibliothèque</span>
      </div>
    </div>`;
  for (const side of ['left', 'right']) {
    const pane = doc.createElement('div');
    pane.className = `library-cover-pane library-cover-${side}`;
    pane.innerHTML = face;
    cover.appendChild(pane);
  }
  return cover;
}

export function initLibraryModal(doc = document) {
  const modal = doc.getElementById('library-modal');
  if (!modal) return;
  const win = doc.defaultView;
  const search = doc.getElementById('analyzer-library-search');
  const list = doc.getElementById('analyzer-library-list');
  const workspace = modal.closest('.analyzer-workspace');
  let previousInert = [];
  const motion = win.matchMedia(REDUCED_MOTION);
  const count = doc.getElementById('library-count');
  const updateCount = () => {
    if (!count || !list) return;
    const rows = [...list.querySelectorAll('.analyzer-library-row')];
    const visible = rows.filter((row) => !row.hidden && row.style.display !== 'none').length;
    count.textContent = list.getAttribute('aria-busy') === 'true' ? 'Chargement…'
      : search?.value.trim() ? `${visible} sur ${rows.length}`
        : `${rows.length} morceau${rows.length === 1 ? '' : 'x'}`;
  };
  const countObserver = new win.MutationObserver(() => win.queueMicrotask(updateCount));
  if (list) countObserver.observe(list, { childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  search?.addEventListener('input', () => win.queueMicrotask(updateCount));
  search?.addEventListener('keydown', () => win.queueMicrotask(updateCount));
  let opener = null;
  let timer = null;
  let cover = null;
  let observer = null;

  const finishOpening = () => {
    win.clearTimeout(timer);
    timer = null;
    observer?.disconnect();
    observer = null;
    cover?.remove();
    cover = null;
    modal.classList.remove('library-is-opening');
    list?.querySelectorAll('.analyzer-library-row').forEach((row) => row.style.removeProperty('--library-entry-delay'));
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (modal.style.display === 'none') return;
    finishOpening();
    list?.querySelectorAll('.analyzer-library-menu.open').forEach((menu) => {
      menu.classList.remove('open');
      menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    });
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    workspace?.classList.remove('library-page-open');
    previousInert.forEach(([element, inert]) => { element.inert = inert; });
    previousInert = [];
    doc.getElementById('analyzer-library-open')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  };

  const open = (event) => {
    // Un deuxième clic pendant l'ouverture ne remonte pas une couverture.
    if (modal.style.display !== 'none') return;
    opener = event?.currentTarget || doc.activeElement;
    finishOpening();
    if (!motion.matches) {
      cover = makeCover(doc);
      modal.appendChild(cover);
      const started = win.performance.now();
      const stagger = () => {
        const elapsed = win.performance.now() - started;
        list?.querySelectorAll('.analyzer-library-row').forEach((row, index) => {
          // Délais négatifs quand le disque répond tard : la liste rejoint
          // l'ouverture en cours au lieu de repartir depuis le début.
          row.style.setProperty('--library-entry-delay', `${320 + Math.min(index, 9) * 24 - elapsed}ms`);
        });
      };
      stagger();
      observer = new win.MutationObserver(stagger);
      if (list) observer.observe(list, { childList: true });
      modal.classList.add('library-is-opening');
      timer = win.setTimeout(finishOpening, OPEN_MS);
    }
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    workspace?.classList.add('library-page-open');
    previousInert = [...(workspace?.children || [])].filter((element) => element !== modal)
      .map((element) => [element, element.inert]);
    previousInert.forEach(([element]) => { element.inert = true; });
    doc.getElementById('analyzer-library-open')?.setAttribute('aria-expanded', 'true');
    search?.focus({ preventScroll: true });
    doc.dispatchEvent(new win.CustomEvent('app-library-refresh'));
  };

  doc.getElementById('library-toggle')?.addEventListener('click', open);
  doc.getElementById('analyzer-library-open')?.addEventListener('click', open);
  doc.getElementById('analyzer-library-open')?.setAttribute('aria-controls', 'library-modal');
  doc.getElementById('analyzer-library-open')?.setAttribute('aria-expanded', 'false');
  doc.getElementById('library-close')?.addEventListener('click', () => close());
  modal.addEventListener('click', (event) => {
    // Ne pas rendre le focus à l'accueil pendant l'ouverture d'un morceau.
    if (event.target.closest('.analyzer-library-item')) close({ restoreFocus: false });
  });
  // Échap referme d'abord le petit menu d'actions, puis la page au second appui.
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = list?.querySelector('.analyzer-library-menu.open');
    if (!menu) return;
    event.preventDefault();
    event.stopPropagation();
    menu.classList.remove('open');
    menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    menu.previousElementSibling?.focus();
  });
  // Une page n'enferme pas Tab : la navigation générale et le clavier restent disponibles.
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && modal.style.display === 'flex'
      && modal.contains(event.target)) close();
  });
  doc.addEventListener('app-settings-force-close', () => close({ restoreFocus: false }));
  doc.getElementById('app-settings-toggle')?.addEventListener('click', () => close({ restoreFocus: false }));
  // Un changement de préférence pendant l'ouverture retire immédiatement le décor.
  motion.addEventListener('change', () => { if (motion.matches) finishOpening(); });
  return { open, close };
}

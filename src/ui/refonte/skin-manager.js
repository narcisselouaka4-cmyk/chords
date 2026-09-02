// [Refonte v2/Global] — 2026-09-02 — Gestion du skin visuel sélectionnable.
//
// Deux skins réels et sélectionnables par l'utilisateur (decision-deux-themes-
// selectionnables-v2-global.md) : « v2 » (pilules, dégradés violets) et
// « Global » (anguleux, aplats). Ils partagent la même palette (§1) et le même
// contenu fonctionnel — seule la grammaire de forme change, portée par les
// variables CSS --r-* sous :root[data-skin='…'].
//
// Même mécanisme que le thème clair/sombre existant (attribut sur <html> +
// localStorage + CustomEvent), volontairement : on ne réinvente rien.

export const SKINS = ['v2', 'global'];
export const DEFAULT_SKIN = 'global';
const STORAGE_KEY = 'skin';

/** Lit le skin persisté, en repliant sur le défaut si absent ou invalide. */
export function getSkin() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SKINS.includes(saved)) return saved;
  } catch (_) {
    /* localStorage indisponible : on reste sur le défaut */
  }
  return DEFAULT_SKIN;
}

/**
 * Applique un skin : pose l'attribut data-skin sur <html>, persiste le choix et
 * notifie les composants qui en dépendent (canvas waveform, piano-roll…).
 * Bascule sans rechargement — aucune régression de comportement attendue.
 * @param {'v2'|'global'} skin
 * @returns {'v2'|'global'} le skin réellement appliqué (défaut si invalide)
 */
export function setSkin(skin) {
  const next = SKINS.includes(skin) ? skin : DEFAULT_SKIN;
  const root = document.documentElement;
  root.setAttribute('data-skin', next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (_) {
    /* pas de persistance possible : la bascule reste valable pour la session */
  }
  window.dispatchEvent(new CustomEvent('app-skin-changed', { detail: { skin: next } }));
  return next;
}

/**
 * Initialise le skin au démarrage et câble un éventuel sélecteur segmenté
 * (Réglages › Apparence). Le script inline de index.html a déjà posé
 * data-skin pour éviter tout flash ; on se resynchronise ici proprement.
 * @param {{ selector?: HTMLElement|null }} [opts]
 */
export function initSkin(opts = {}) {
  const current = getSkin();
  // Resynchronisation (au cas où le script inline aurait été contourné).
  if (document.documentElement.getAttribute('data-skin') !== current) {
    document.documentElement.setAttribute('data-skin', current);
  }

  const selector = opts.selector || null;
  if (selector) {
    const buttons = Array.from(selector.querySelectorAll('[data-skin-value]'));
    const sync = (skin) => {
      buttons.forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.skinValue === skin));
      });
    };
    sync(current);
    selector.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-skin-value]');
      if (!btn) return;
      const applied = setSkin(btn.dataset.skinValue);
      sync(applied);
    });
    window.addEventListener('app-skin-changed', (e) => sync(e.detail?.skin));
  }

  return current;
}

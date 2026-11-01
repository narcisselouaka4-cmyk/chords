// [Claude] — 2026-10-13 — Couleur générale de l'application.
//
// Narcisse : « presque tout est en violet par défaut. Je veux qu'on puisse modifier la couleur
// générale de l'application (passer au jaune, etc.), donc il faut tout relier à cette variable
// globale. » Le violet vivait dans cinq familles de variables (--tr-*, --r-*, --vk-*, --an-*,
// --accent), déclarées sur des éléments différents (:root, .training-shell, .an-workspace-shell,
// .vk-root) : une seule valeur posée sur :root ne les atteint pas. À partir d'UNE couleur choisie,
// on calcule la palette de chaque famille (sombre et clair) et on la pose dans une feuille de style
// injectée en dernier, qui l'emporte (!important) sur toutes les familles. Sans choix : aucune
// feuille, le violet d'origine.
//
// Partie pure (testée) : hexToHsl, accentPalette. Partie DOM : applyAccent, initAccentTheme.

export const ACCENT_KEY = 'pjc.accent';

/** Couleurs proposées dans Réglages (la première est celle d'origine). */
export const ACCENT_PRESETS = [
  { name: 'Violet', hex: '#9b7bf0', original: true },
  { name: 'Jaune', hex: '#f2b705' },
  { name: 'Orange', hex: '#f28c28' },
  { name: 'Rouge', hex: '#e5534b' },
  { name: 'Rose', hex: '#e56fb0' },
  { name: 'Bleu', hex: '#4f8df5' },
  { name: 'Turquoise', hex: '#1fb5b0' },
  { name: 'Vert', hex: '#4fbf6f' },
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** '#rrggbb' → {h: 0..360, s: 0..100, l: 0..100}, ou null. */
export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const hsl = (h, s, l, a) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}%${a != null ? ` / ${a}` : ''})`;

/** Clarté perçue d'une teinte HSL (0..1), pour choisir un texte lisible dessus. */
export function perceivedLightness(h, s, l) {
  const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const lin = (v) => { const u = v + m; return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Les variables de chaque famille, pour le thème sombre et le thème clair.
 * @param {string} hex - la couleur choisie
 * @returns {{dark: Record<string,string>, light: Record<string,string>}|null}
 */
export function accentPalette(hex) {
  const base = hexToHsl(hex);
  if (!base) return null;
  const { h } = base;
  // Un gris (saturation presque nulle) reste un gris ; sinon une saturation franche mais pas criarde.
  const s = base.s < 12 ? base.s : clamp(base.s, 55, 90);
  const make = (dark) => {
    const L = dark ? { acc: 76, strong: 82, deep: 64, soft: 19, text: 90, btn: 77, an: 70, anBright: 77, anDeep: 43 } : { acc: 47, strong: 40, deep: 38, soft: 94, text: 36, btn: 46, an: 55, anBright: 48, anDeep: 38 };
    const accent = hsl(h, s, L.acc);
    const strong = hsl(h, s, L.strong);
    const soft = hsl(h, dark ? Math.min(s, 28) : Math.min(s, 70), L.soft);
    const button = hsl(h, s, L.btn);
    // Texte posé SUR l'accent / le bouton : sombre si la teinte est claire (jaune), blanc sinon.
    const onButton = perceivedLightness(h, s, L.btn) > 0.38 ? '#1d1726' : '#ffffff';
    const onAccent = perceivedLightness(h, s, L.acc) > 0.38 ? '#1d1726' : '#ffffff';
    const grad2 = hsl(h - 12, Math.min(s, 70), dark ? 50 : 40);
    return {
      '--tr-accent': accent,
      '--tr-accent-strong': strong,
      '--tr-accent-soft': soft,
      '--tr-button': button,
      '--tr-button-text': onButton,
      '--tr-grid-fill': hsl(h, Math.min(s, 30), dark ? 21 : 90),
      '--r-accent': accent,
      '--r-accent-soft': soft,
      '--r-accent-text': hsl(h, Math.min(s, 100), L.text),
      '--r-accent-contrast': onButton,
      '--r-grad': `linear-gradient(90deg, ${accent}, ${grad2})`,
      '--r-btn-primary-fg': onButton,
      '--r-bass': accent,
      '--r-waveform': accent,
      '--vk-accent': accent,
      '--vk-accent-deep': hsl(h, s, L.deep),
      '--an-accent': hsl(h, s, L.an),
      '--an-accent-bright': hsl(h, s, L.anBright),
      '--an-accent-deep': hsl(h, Math.min(s, 60), L.anDeep),
      '--an-accent-soft': hsl(h, s, L.an, dark ? 0.14 : 0.1),
      '--an-accent-glow': hsl(h, s, L.an, dark ? 0.35 : 0.2),
      '--accent': accent,
      '--accent-soft': soft,
      '--accent-text': onAccent,
    };
  };
  // Les fonds clairs prennent eux aussi la teinte (gris très légèrement colorés) : avec un jaune, des
  // fonds lilas jureraient. Le thème sombre reste neutre.
  const hs = Math.min(s, 14);
  const light = make(false);
  Object.assign(light, {
    '--tr-bg': hsl(h, hs, 96), '--tr-header': hsl(h, hs, 98), '--tr-raised': hsl(h, hs, 94), '--tr-hover': hsl(h, hs, 92),
    '--tr-inset': hsl(h, hs, 97), '--tr-border': hsl(h, hs, 89), '--tr-border-soft': hsl(h, hs, 92),
    '--r-ground': hsl(h, hs, 96), '--r-surface-chip': hsl(h, hs, 94), '--r-border': hsl(h, hs, 89), '--r-border-strong': hsl(h, hs, 80),
  });
  return { dark: make(true), light };
}

const decl = (vars) => Object.entries(vars).map(([k, v]) => `${k}: ${v} !important;`).join(' ');

/** Le texte CSS qui applique une couleur à toute l'application (ou '' sans couleur valide). */
export function accentCss(hex) {
  const palette = accentPalette(hex);
  if (!palette) return '';
  return `:root:not([data-theme='light']), :root:not([data-theme='light']) * { ${decl(palette.dark)} }\n`
    + `:root[data-theme='light'], :root[data-theme='light'] * { ${decl(palette.light)} }\n`;
}

const safeStorage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

/** La couleur gardée, ou null (violet d'origine). */
export function savedAccent() {
  const v = safeStorage()?.getItem(ACCENT_KEY);
  return hexToHsl(v) ? v : null;
}

/** Applique (et garde) une couleur ; `null` revient au violet d'origine. */
export function applyAccent(hex) {
  const css = hex ? accentCss(hex) : '';
  let style = document.getElementById('app-accent-style');
  if (!css) { style?.remove(); } else {
    if (!style) { style = document.createElement('style'); style.id = 'app-accent-style'; document.head.appendChild(style); }
    style.textContent = css;
  }
  try { if (hex && css) safeStorage()?.setItem(ACCENT_KEY, hex); else safeStorage()?.removeItem(ACCENT_KEY); } catch { /* stockage indisponible */ }
  // Les canvas (forme d'onde…) relisent leurs couleurs.
  window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { accent: hex || null } }));
}

/** Au lancement : la couleur gardée, et les pastilles de Réglages. */
export function initAccentTheme() {
  const saved = savedAccent();
  if (saved) applyAccent(saved);
  const root = document.getElementById('accent-presets');
  const custom = document.getElementById('accent-custom');
  if (!root) return;
  const mark = () => {
    const current = savedAccent();
    for (const b of root.querySelectorAll('button[data-accent]')) {
      const on = b.dataset.accent === 'default' ? !current : (current || '').toLowerCase() === b.dataset.accent.toLowerCase();
      b.setAttribute('aria-pressed', String(on));
    }
    if (custom && current) custom.value = current;
  };
  for (const preset of ACCENT_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'accent-swatch';
    b.dataset.accent = preset.original ? 'default' : preset.hex;
    b.title = preset.original ? `${preset.name} (par défaut)` : preset.name;
    b.setAttribute('aria-label', `Couleur de l'application : ${preset.name}`);
    b.style.setProperty('--swatch', preset.hex);
    b.addEventListener('click', () => { applyAccent(preset.original ? null : preset.hex); mark(); });
    root.appendChild(b);
  }
  custom?.addEventListener('input', () => { applyAccent(custom.value); mark(); });
  mark();
}

// [Claude] — 2026-10-13 — « Cascade » : les notes de la session tombent du haut vers le clavier, comme
// dans les tutoriels façon Synthesia. Troisième angle du paysage harmonique (avec « 2D » et « Relief »). Nom courant : « Synthesia ».
//
// Idée de Narcisse : une note de do tout en haut descend jusqu'à la touche de do. Les colonnes sont
// donc alignées sur les VRAIES touches du clavier affiché en bas de l'application (mesurées dans le
// DOM, comme elles sont rendues : l'étendue réglée dans Réglages est respectée). Si le clavier n'est
// pas affiché, on retombe sur un clavier de 88 touches réparti sur la largeur.
//
// Où la 2D et le Relief montrent TOUTE la session d'un coup (vue d'ensemble), la chute ne montre que
// les prochaines secondes (vue de jeu) : le bas de la zone est « maintenant ». Une note qui touche la
// ligne s'allume ; elle disparaît dès qu'elle est passée.
//
// En enregistrement, le temps ne peut pas se lire à l'avance : les notes jouées montent depuis les
// touches (même échelle de temps, sens inversé).
//
// Canvas 2D : jusqu'à ~100 notes visibles par image, redessinées à chaque mise à jour de la position.

/** Secondes visibles au-dessus de la ligne (« maintenant »). */
export const LOOKAHEAD = 4;

import { formatNoteList } from '../../chord-engine/naming.js';

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
export const isBlackKey = (midi) => !WHITE_PC.has(((midi % 12) + 12) % 12);

/**
 * Clavier de secours (aucune touche mesurable) : touches blanches égales sur toute la largeur, noires
 * à cheval, comme un vrai clavier.
 * @returns {Map<number,{x:number,w:number,black:boolean}>}
 */
export function fallbackKeyLayout(width, lo = 21, hi = 108) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const w = width / Math.max(1, whites.length);
  const layout = new Map();
  const whiteIndex = new Map();
  whites.forEach((m, i) => { whiteIndex.set(m, i); layout.set(m, { x: i * w, w, black: false }); });
  for (let m = lo; m <= hi; m++) {
    if (!isBlackKey(m)) continue;
    // Une touche noire est à cheval sur la frontière qui suit la blanche juste en dessous.
    const below = whiteIndex.get(m - 1);
    if (below === undefined) continue;
    const bw = w * 0.62;
    layout.set(m, { x: (below + 1) * w - bw / 2, w: bw, black: true });
  }
  return layout;
}

/** Notes à dessiner : celles dont une partie tombe dans [position − behind, position + ahead]. */
export function windowNotes(notes, position, ahead = LOOKAHEAD, behind = 0) {
  const from = position - behind;
  const to = position + ahead;
  const out = [];
  for (const note of notes) {
    if (note.start > to) break;               // notes triées par début
    const end = note.start + Math.max(0.05, note.duration);
    if (end >= from) out.push(note);
  }
  return out;
}

/**
 * Rectangle d'une note dans la zone (px). En lecture : la note arrive d'en haut, son BAS est son début ;
 * en enregistrement : elle monte depuis la ligne, son HAUT est son début qui s'éloigne.
 */
export function noteBox(note, position, { height, lineY, ahead = LOOKAHEAD, recording = false }) {
  const pps = lineY / ahead;                   // pixels par seconde
  const end = note.start + Math.max(0.05, note.duration);
  let top; let bottom;
  if (!recording) {
    top = lineY - (end - position) * pps;
    bottom = lineY - (note.start - position) * pps;
    bottom = Math.min(bottom, lineY);          // ce qui est passé la ligne ne se voit plus
  } else {
    bottom = Math.min(lineY - (position - end) * pps, lineY);   // la fin est la plus proche de la ligne
    top = lineY - (position - note.start) * pps;                // le début s'éloigne vers le haut
  }
  return { top: Math.max(0, top), bottom: Math.min(height, bottom), raw: { top, bottom } };
}

const letterCache = new Map();
/** Lettre de la note (sans octave), dans la notation du clavier : « C#», « Do# »… */
export function noteLetter(midi, latin = false) {
  const pc = ((midi % 12) + 12) % 12;
  const key = `${pc}|${latin ? 1 : 0}`;
  if (!letterCache.has(key)) letterCache.set(key, formatNoteList([pc], latin)[0] || '');
  return letterCache.get(key);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
function normVelocity(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0.7;
  return clamp01(n > 1 ? n / 127 : n);
}

/** « rgb(r, g, b) » / « rgba(...) » → [r, g, b]. */
function parseRgb(text) {
  const m = String(text).match(/(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => Math.max(0, Math.min(255, Math.round(v)))) : [184, 160, 243];
}
const mixRgb = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const css = (rgb, alpha = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

/**
 * @param {HTMLElement} host
 * @param {{notes:Array, duration:number, position?:number, recording?:boolean, onSeek?:(t:number)=>void}} options
 * @returns {{update(next:object):void, destroy():void}}
 */
export function renderFallingNotes(host, options) {
  if (!host) return { update() {}, destroy() {} };
  // shift : transposition du clavier (demi-tons) — la lecture joue les notes transposées, les touches
  // s'allument donc décalées ; latin : notation des lettres (Do Ré Mi / C D E).
  let state = { notes: [], duration: 1, position: 0, recording: false, onSeek: null, shift: 0, latin: false, ...options };

  const canvas = document.createElement('canvas');
  canvas.className = 'tr-falling-notes';
  canvas.setAttribute('role', 'img');
  canvas.style.cssText = 'display:block;width:100%;height:100%;min-height:0;flex:1';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  host.appendChild(probe);

  let palette = null;
  function readPalette() {
    const get = (value) => { probe.style.color = ''; probe.style.color = value; return parseRgb(getComputedStyle(probe).color); };
    const accent = get('var(--tr-accent, #b8a0f3)');
    palette = {
      accent,
      light: mixRgb(accent, [255, 255, 255], 0.55),
      deep: mixRgb(accent, [0, 0, 0], 0.4),
      grid: get('var(--tr-grid-line, #37323e)'),
      bg: get('var(--tr-bg, #141416)'),
      text: get('var(--tr-muted, #89848f)'),
    };
    // Lettre posée sur une note : sombre sur un fond clair, claire sur un fond foncé
    const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    palette.onAccent = lum(accent) > 0.62 ? [29, 23, 38] : [255, 255, 255];
    palette.onDeep = [255, 255, 255];
    palette.onLight = [29, 23, 38];
  }

  let layout = null;
  let layoutKey = '';
  /** Position (px, relatif au canvas) des touches du clavier affiché ; clavier de secours sinon. */
  function measureKeys(width) {
    const rect = canvas.getBoundingClientRect();
    const map = new Map();
    for (const group of document.querySelectorAll('#keyboard-container .note[data-midi]')) {
      const midi = Number(group.dataset.midi);
      const key = group.querySelector('.piano-key') || group;
      const r = key.getBoundingClientRect();
      if (!Number.isFinite(midi) || r.width < 1) continue;
      map.set(midi, { x: r.left - rect.left, w: r.width, black: isBlackKey(midi) });
    }
    if (map.size >= 12) return map;
    return fallbackKeyLayout(width);
  }
  function ensureLayout(width) {
    const keys = document.getElementById('keyboard-container');
    const rect = canvas.getBoundingClientRect();
    const key = `${Math.round(width)}|${Math.round(rect.left)}|${keys ? Math.round(keys.getBoundingClientRect().width) : 0}|${keys ? keys.querySelectorAll('.note').length : 0}`;
    if (key !== layoutKey) { layout = measureKeys(width); layoutKey = key; }
    return layout;
  }

  let hits = [];
  let size = { w: 0, h: 0, dpr: 1 };
  function fit() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w !== size.w || h !== size.h || dpr !== size.dpr) {
      size = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      layoutKey = '';
    }
  }

  function draw() {
    fit();
    if (!palette) readPalette();
    const { w, h, dpr } = size;
    const { notes, recording } = state;
    const position = Math.max(0, Number(state.position) || 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const keys = ensureLayout(w);
    const lineY = Math.max(40, h - 3);
    canvas.setAttribute('aria-label', `Notes qui tombent vers le clavier. ${notes.length} notes.`);

    // Couloirs : un léger fond sur les touches noires, un trait à chaque do (début d'octave)
    ctx.lineWidth = 1;
    for (const [midi, k] of keys) {
      if (k.black) { ctx.fillStyle = css(palette.grid, 0.18); ctx.fillRect(k.x, 0, k.w, lineY); }
      else if (midi % 12 === 0) { ctx.fillStyle = css(palette.grid, 0.9); ctx.fillRect(Math.round(k.x), 0, 1, lineY); }
    }
    ctx.fillStyle = css(palette.grid, 0.5);
    for (const [midi, k] of keys) if (!k.black && midi % 12 === 5) ctx.fillRect(Math.round(k.x), 0, 1, lineY);

    // Notes : touches blanches d'abord, noires par-dessus (elles chevauchent la blanche voisine)
    hits = [];
    const visible = windowNotes(notes, position, LOOKAHEAD, recording ? LOOKAHEAD : 0);
    const shift = Math.round(Number(state.shift) || 0);
    for (const pass of [false, true]) {
      for (const note of visible) {
        const shown = note.midi + shift;
        const k = keys.get(shown);
        if (!k || k.black !== pass) continue;
        const box = noteBox(note, position, { height: h, lineY, recording });
        if (box.bottom - box.top < 1) continue;
        const velocity = normVelocity(note.velocity);
        const active = position >= note.start && position <= note.start + Math.max(0.05, note.duration);
        const inset = k.black ? 0.5 : 1.5;
        const x = k.x + inset; const bw = Math.max(3, k.w - inset * 2);
        const radius = Math.min(4, bw / 2, (box.bottom - box.top) / 2);
        const body = k.black ? palette.deep : palette.accent;
        ctx.save();
        const grad = ctx.createLinearGradient(0, box.top, 0, box.bottom);
        grad.addColorStop(0, css(active ? palette.light : mixRgb(body, [255, 255, 255], 0.18), (active ? 1 : 0.55 + velocity * 0.4)));
        grad.addColorStop(1, css(active ? palette.light : body, (active ? 1 : 0.55 + velocity * 0.4)));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, box.top, bw, box.bottom - box.top, radius);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = css(mixRgb(palette.accent, [255, 255, 255], k.black ? 0.4 : 0.6), active ? 0.95 : 0.55);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect(x + 0.4, box.top + 0.4, bw - 0.8, box.bottom - box.top - 0.8, radius);
        ctx.stroke();
        // Lettre de la note, discrète, en bas de la case (si la case est assez grande pour la porter)
        const boxH = box.bottom - box.top;
        if (boxH >= 15 && bw >= 9) {
          const name = noteLetter(shown, state.latin);
          const small = k.black || bw < 14;
          ctx.font = `600 ${small ? 7 : 9.5}px "DM Sans", sans-serif`;
          if (ctx.measureText(name).width <= bw - 1) {
            const ink = active ? palette.onLight : (k.black ? palette.onDeep : palette.onAccent);
            ctx.fillStyle = css(ink, active ? 0.8 : 0.72);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(name, x + bw / 2, box.bottom - 4.5);
          }
        }
        hits.push({ x, y: box.top, w: bw, h: boxH, start: note.start });
      }
    }

    // Ligne d'arrivée : un simple trait net (Narcisse : pas de brouillard ni de halo lumineux)
    ctx.fillStyle = css(palette.light, 0.85);
    ctx.fillRect(0, lineY, w, 1.5);

    if (!notes.length) {
      ctx.fillStyle = css(palette.text, 1);
      ctx.font = '13px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(recording ? 'Jouez sur le clavier. Vos notes montent depuis les touches.' : 'Votre prochaine session commence par une note.', w / 2, h / 2);
    }
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layoutKey = ''; draw(); }) : null;
  observer?.observe(canvas);
  const keyboardEl = document.getElementById('keyboard-container');
  if (keyboardEl && observer) observer.observe(keyboardEl);
  const onTheme = () => { palette = null; draw(); };
  window.addEventListener('app-theme-changed', onTheme);
  // Transposition, notation ou étendue du clavier modifiées : la cascade se recale tout de suite, même en pause.
  const onKeyboard = (e) => {
    const d = e?.detail || {};
    if (Number.isFinite(d.transpose)) state.shift = d.transpose;
    if (typeof d.latin === 'boolean') state.latin = d.latin;
    layoutKey = '';
    draw();
  };
  window.addEventListener('keyboard-settings-changed', onKeyboard);

  const onClick = (e) => {
    if (!state.onSeek || state.recording) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i];
      if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) { state.onSeek(hit.start); return; }
    }
  };
  const onMove = (e) => {
    if (!state.onSeek || state.recording) { canvas.style.cursor = ''; return; }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    canvas.style.cursor = hits.some((hit) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) ? 'pointer' : '';
  };
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);

  draw();

  return {
    update(next) { state = { ...state, ...next }; draw(); },
    destroy() {
      observer?.disconnect();
      window.removeEventListener('app-theme-changed', onTheme);
      window.removeEventListener('keyboard-settings-changed', onKeyboard);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
      host.innerHTML = '';
    },
  };
}

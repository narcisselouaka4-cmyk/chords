// [Refonte Astra 12/09] — « Paysage harmonique » : le piano roll en relief de la
// maquette, transposé tel quel en JS natif. Ni canvas, ni 3D, ni bibliothèque :
// du SVG pur, une projection isométrique calculée en arithmétique simple, et
// trois polygones par note (dessus, face, côté).
//
// Il remplace l'ancienne frise de Sessions MIDI, qui forçait toute la session à
// tenir dans la largeur et devenait illisible.
//
// PIÈGE D'ÉCHELLE (documenté dans le brief) : Astra suppose une vélocité MIDI
// brute de 0 à 127 ; chez Zic elle est normalisée entre 0 et 1
// (src/midi-fallback.js : `velocity: d2 / 127`). Branchée telle quelle, la
// formule d'Astra donnait à toutes les notes la même élévation minimale — un
// relief parfaitement plat. On normalise donc explicitement à l'échelle 0–1,
// en acceptant aussi une vélocité brute au cas où la source change.

const SVG_NS = 'http://www.w3.org/2000/svg';
// [Claude] — 2026-10-13 — Couleurs : plus aucun violet écrit en dur. Tout dérive de la couleur
// d'accent de l'application (--tr-accent), par mélange avec du blanc ou du noir : le paysage
// suit donc le choix fait dans Réglages › Apparence, sans être redessiné (les variables CSS
// sont relues par le navigateur à chaque affichage).
const ACCENT = 'var(--tr-accent, #b8a0f3)';
const mix = (pct, other) => `color-mix(in srgb, ${ACCENT} ${pct}%, ${other})`;
const TONE = {
  topLight: mix(68, '#ffffff'),     // dessus des notes, côté clair
  topDark: mix(94, '#000000'),      // dessus des notes, côté sombre
  frontLight: mix(88, '#000000'),   // face avant
  frontDark: mix(52, '#000000'),
  side: mix(42, '#000000'),         // face latérale
  accent: ACCENT,                   // halo, trait de la tête de lecture (voir plus bas)
  sounding: mix(24, '#ffffff'),     // note qui joue
  accentEdge: mix(58, '#ffffff'),   // contour des notes
  accentMark: mix(70, 'var(--tr-text, #ffffff)'),   // tête de lecture : clair en sombre, foncé en clair
  accentTop: mix(80, '#ffffff'),    // une note sur onze, pour casser l'uniformité
};
const SPAN_X = 1060;   // largeur utile du plancher, en unités de viewBox
const SPAN_Y = 180;    // profondeur utile du plancher

let uid = 0;

function el(name, attrs, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Vélocité ramenée à l'échelle 0–1, que la source soit normalisée ou brute. */
function normalizeVelocity(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v > 1 ? Math.min(1, v / 127) : Math.min(1, v);
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(midi) {
  return `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Dessine le paysage harmonique dans `host`.
 *
 * @param {HTMLElement} host        conteneur (il est vidé)
 * @param {object}      options
 * @param {Array<{midi:number,start:number,duration:number,velocity:number}>} options.notes
 * @param {number}      options.duration  durée totale en secondes
 * @param {number}      [options.position] tête de lecture, en secondes
 * @param {boolean}     [options.spatial]  true = relief, false = vue à plat
 * @param {boolean}     [options.recording]
 * @param {(time:number)=>void} [options.onSeek] clic sur une note
 * @returns {{ update(next:object): void, destroy(): void }}
 */
export function renderHarmonicRoll(host, options) {
  if (!host) return { update() {}, destroy() {} };
  const id = `hr${++uid}`;
  let state = {
    notes: [], duration: 1, position: 0, spatial: true, recording: false, onSeek: null,
    ...options,
  };
  let labelScale = 1;

  const svg = el('svg', {
    class: 'tr-harmonic-roll',
    viewBox: '0 0 1260 245',
    preserveAspectRatio: 'none',
    role: 'img',
  });
  host.innerHTML = '';
  host.appendChild(svg);

  // preserveAspectRatio="none" étire le SVG : sans correction, les étiquettes
  // seraient déformées verticalement. Le ResizeObserver rétablit leur échelle.
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect || rect.height <= 0) return;
        const next = (rect.width * 245) / (rect.height * 1260);
        if (Math.abs(next - labelScale) > 0.01) { labelScale = next; draw(); }
      })
    : null;
  observer?.observe(svg);

  function point(time, pitch, height = 0) {
    const sp = state.spatial;
    return [
      100 + time * 0.91 + (sp ? pitch * 0.59 : 0),
      202 - pitch * (sp ? 0.81 : 0.97) - (sp ? height : 0),
    ];
  }
  const poly = (points) => points.map((p) => p.join(',')).join(' ');

  function draw() {
    const { notes, spatial, recording } = state;
    const duration = Math.max(1, Number(state.duration) || 1);
    const position = Math.max(0, Number(state.position) || 0);
    svg.innerHTML = '';
    svg.setAttribute('aria-label',
      `Vue harmonique ${spatial ? 'en relief' : 'à plat'}. ${notes.length} notes sur ${formatTime(duration)}.`);

    const defs = el('defs');
    const grad = (gid, x2, y2, stops) => {
      const g = el('linearGradient', { id: gid, x1: 0, y1: 0, x2, y2 });
      stops.forEach(([offset, color, opacity]) => g.appendChild(el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
      return g;
    };
    defs.appendChild(grad(`${id}-plane`, 0, 1, [[null, 'var(--tr-grid-fill)', '0.08'], [1, 'var(--tr-grid-fill)', '0.5']]));
    defs.appendChild(grad(`${id}-top`, 1, 1, [[null, TONE.topLight, null], [1, TONE.topDark, null]]));
    defs.appendChild(grad(`${id}-front`, 0, 1, [[null, TONE.frontLight, null], [1, TONE.frontDark, null]]));
    defs.appendChild(grad(`${id}-cursor`, 0, 1, [[null, TONE.accent, '.3'], [1, TONE.accent, '0']]));
    const filter = el('filter', { id: `${id}-glow`, x: '-30%', y: '-50%', width: '160%', height: '200%' });
    filter.appendChild(el('feGaussianBlur', { stdDeviation: 5 }));
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Plancher et grille
    svg.appendChild(el('polygon', {
      points: poly([point(0, 0), point(SPAN_X, 0), point(SPAN_X, SPAN_Y), point(0, SPAN_Y)]),
      fill: `url(#${id}-plane)`, stroke: 'var(--tr-grid-line)', 'stroke-width': '0.8',
    }));
    for (let i = 0; i < 25; i++) {
      const x = i * (SPAN_X / 24);
      const a = point(x, 0); const b = point(x, SPAN_Y);
      svg.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--tr-grid-line)', 'stroke-width': i % 4 === 0 ? 0.8 : 0.45 }));
    }
    for (let i = 0; i < 13; i++) {
      const a = point(0, i * 15); const b = point(SPAN_X, i * 15);
      svg.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--tr-grid-line)', 'stroke-width': i % 4 === 0 ? 0.8 : 0.45 }));
    }
    // [Claude] — 2026-10-13 — Les repères C2, C3, C4, C5 sont retirés (Narcisse : « tu m'enlèves ça »).

    // Notes : on affiche l'intégralité de la session. Sur les très longues
    // sessions on échantillonne uniformément sur toute la durée pour conserver
    // un SVG léger, mais jamais seulement les dernières notes — cela créait un
    // vide artificiel en début de session (bug 220 notes).
    const MAX_NOTES = 800;
    const shown = notes.length <= MAX_NOTES
      ? notes
      : sampleNotesEvenly(notes, MAX_NOTES);
    shown.forEach((note, index) => {
      const velocity = normalizeVelocity(note.velocity);
      const x = (note.start / duration) * SPAN_X;
      const y = Math.min(171, Math.max(5, (note.midi - 36) * 3.8));
      const width = Math.max(9, (Math.max(0.05, note.duration) / duration) * SPAN_X);
      const depth = spatial ? 6.5 : 4.8;
      // Échelle 0–1 : 5 + v*57 couvre la même plage que 5 + vBrut*0.45 chez Astra.
      const height = 5 + velocity * 57;
      const active = position >= note.start && position <= note.start + note.duration;
      const top = [point(x, y, height), point(x + width, y, height), point(x + width, y + depth, height), point(x, y + depth, height)];
      const front = [point(x, y), point(x + width, y), point(x + width, y, height), point(x, y, height)];
      const side = [point(x + width, y), point(x + width, y + depth), point(x + width, y + depth, height), point(x + width, y, height)];

      const g = el('g', {
        class: `tr-note-solid${active ? ' is-sounding' : ''}`,
        opacity: active ? 1 : 0.64 + velocity * 0.34,
      });
      g.appendChild(el('title', {}, `${noteName(note.midi)} · ${formatTime(note.start)} · vélocité ${Math.round(velocity * 127)}`));
      if (active) g.appendChild(el('polygon', { points: poly(top), fill: TONE.accent, filter: `url(#${id}-glow)` }));
      if (spatial) {
        g.appendChild(el('polygon', { points: poly(front), fill: `url(#${id}-front)` }));
        g.appendChild(el('polygon', { points: poly(side), fill: TONE.side }));
      }
      g.appendChild(el('polygon', {
        points: poly(top),
        fill: active ? TONE.sounding : index % 11 === 0 ? TONE.accentTop : `url(#${id}-top)`,
        stroke: active ? '#ffffff' : TONE.accentEdge,
        'stroke-width': '0.55',
      }));
      if (state.onSeek && !state.recording) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => state.onSeek(note.start));
      }
      svg.appendChild(g);
    });

    // Tête de lecture
    // [Claude] — 2026-10-13 — « Le trait n'est pas droit » (Narcisse). Ce n'était pas un bug :
    // en relief, tous les points d'un même instant sont alignés sur l'oblique de la grille
    // (la perspective), et l'ancien trait partait du coin avant du sol vers le fond en montant
    // de 25 : ni vertical, ni posé sur le sol. Maintenant : un trait bien VERTICAL au bord
    // avant (sa pastille est sur le sol), et, en filigrane, la paroi qui s'étend derrière
    // jusqu'au fond (son arête au sol suit la grille, donc les notes jouées à cet instant
    // s'y alignent). À plat, tout reste un seul trait vertical.
    if (notes.length) {
      const px = (position / duration) * SPAN_X;
      const wall = 70;
      const f0 = point(px, 0); const f1 = point(px, SPAN_Y);
      const t0 = point(px, 0, wall); const t1 = point(px, SPAN_Y, wall);
      const head = el('g', { class: 'tr-playhead' });
      head.appendChild(el('polygon', { points: poly([f0, f1, t1, t0]), fill: `url(#${id}-cursor)` }));
      const edge = (from, to, width, opacity = 1) => el('line', {
        x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: TONE.accentMark, 'stroke-width': width, 'stroke-opacity': opacity, 'stroke-linecap': 'round',
      });
      if (spatial) {
        head.appendChild(edge(f0, f1, 1, 0.5));
        head.appendChild(edge(f1, t1, 0.8, 0.3));
        head.appendChild(edge(t0, t1, 0.7, 0.22));
        head.appendChild(edge(f0, t0, 2));
      } else {
        head.appendChild(edge(f0, f1, 1.4));
      }
      head.appendChild(el('circle', { cx: f0[0], cy: f0[1], r: 3.2, fill: TONE.accentMark }));
      svg.appendChild(head);
    }

    // Graduation temporelle
    for (let i = 0; i < 7; i++) {
      const p = point((i / 6) * SPAN_X, 0);
      svg.appendChild(el('text', {
        transform: `translate(${p[0]} 228) scale(1 ${labelScale})`,
        'text-anchor': 'middle', class: 'tr-roll-label',
      }, formatTime((i / 6) * duration)));
    }

    if (!notes.length) {
      svg.appendChild(el('text', {
        transform: `translate(630 128) scale(1 ${labelScale})`,
        'text-anchor': 'middle', class: 'tr-roll-empty',
      }, recording ? 'Jouez sur le clavier. Votre session prend forme.' : 'Votre prochaine session commence par une note.'));
    }
  }

  draw();

  return {
    update(next) { state = { ...state, ...next }; draw(); },
    destroy() { observer?.disconnect(); host.innerHTML = ''; },
  };
}

/**
 * Échantillonne `notes` de manière uniforme sur l'axe temporel. Garde la
 * première et la dernière note, puis répartit les indices intermédiaires.
 * Préserve l'ordre chronologique.
 */
function sampleNotesEvenly(notes, maxCount) {
  if (notes.length <= maxCount) return notes;
  const result = [];
  const step = (notes.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i++) {
    result.push(notes[Math.round(i * step)]);
  }
  return result;
}

/**
 * Convertit les fenêtres de notes de src/recorder/session-analysis.js
 * (`{ note, channel, velocity, onTime, offTime }`) vers le format du paysage
 * harmonique (`{ midi, start, duration, velocity }`).
 */
export function windowsToRollNotes(windows, fallbackDuration = 0.25) {
  return (windows || [])
    .filter((w) => Number.isFinite(w.note) && Number.isFinite(w.onTime))
    .map((w) => ({
      midi: w.note,
      start: w.onTime,
      duration: Number.isFinite(w.offTime) && w.offTime > w.onTime ? w.offTime - w.onTime : fallbackDuration,
      velocity: w.velocity,
    }))
    .sort((a, b) => a.start - b.start);
}

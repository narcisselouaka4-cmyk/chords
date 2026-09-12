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
    defs.appendChild(grad(`${id}-top`, 1, 1, [[null, '#ccb9ff', null], [1, '#9c79f4', null]]));
    defs.appendChild(grad(`${id}-front`, 0, 1, [[null, '#a183ed', null], [1, '#62489e', null]]));
    defs.appendChild(grad(`${id}-cursor`, 0, 1, [[null, '#b799ff', '.4'], [1, '#b799ff', '0']]));
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
    ['C2', 'C3', 'C4', 'C5'].forEach((label, index) => {
      const p = point(0, index * 45.6);
      svg.appendChild(el('text', { transform: `translate(${p[0] - 29} ${p[1] + 3}) scale(1 ${labelScale})`, class: 'tr-roll-label' }, label));
    });

    // Notes : les 220 dernières, comme dans la maquette.
    const shown = notes.slice(-220);
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
      if (active) g.appendChild(el('polygon', { points: poly(top), fill: '#b9a0ff', filter: `url(#${id}-glow)` }));
      if (spatial) {
        g.appendChild(el('polygon', { points: poly(front), fill: `url(#${id}-front)` }));
        g.appendChild(el('polygon', { points: poly(side), fill: '#514174' }));
      }
      g.appendChild(el('polygon', {
        points: poly(top),
        fill: active ? '#ede3ff' : index % 11 === 0 ? '#cfb9de' : `url(#${id}-top)`,
        stroke: active ? '#fff' : '#d2baff',
        'stroke-width': '0.55',
      }));
      if (state.onSeek && !state.recording) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => state.onSeek(note.start));
      }
      svg.appendChild(g);
    });

    // Tête de lecture
    if (notes.length) {
      const px = (position / duration) * SPAN_X;
      const head = el('g', { class: 'tr-playhead' });
      head.appendChild(el('polygon', {
        points: poly([point(px, 0), point(px, SPAN_Y), point(px, SPAN_Y, 58), point(px, 0, 58)]),
        fill: `url(#${id}-cursor)`,
      }));
      const a = point(px, 0); const b = point(px, SPAN_Y, 25);
      head.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#d6c4ff', 'stroke-width': '1.4' }));
      head.appendChild(el('circle', { cx: a[0], cy: a[1], r: 3, fill: '#d6c4ff' }));
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

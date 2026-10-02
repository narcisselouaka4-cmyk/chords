// [Claude] — 2026-10-02 — « Lecture en direct » du Temps réel.
//
// Narcisse : intégrer la fenêtre « Lecture en direct » de sa maquette
// (designtempsréel.zip, RealtimeView.tsx : PitchWheel + section rv-hero) —
// « les 12 degrés réunis en cercle : quand je joue Do Mi Sol, ça trace des lignes
// de Do à Mi, de Mi à Sol et de Sol à Do », rendu high-tech — directement dans la
// scène, pas en fenêtre ni en carte, au centre, à la place de l'affichage d'avant.
// Le nom de l'accord au-dessus de la roue, « Aussi » (autres lectures), et à droite
// les lectures : fondamentale, basse jouée, qualité, position, intervalles,
// voicing, MIDI, fréquence, puis « Réécouter ».
//
// Une seule source : display.js appelle renderLiveReading / clearLiveReading avec
// le résultat de detectChord (aucune seconde détection). Les aides pures sont
// exportées pour test-live-reading.js.

import { chordReadings } from '../chord-engine/index.js';
import {
  chordRootName, slashBassName, displayNoteName, spellChordNotes, degreeOf, chordFamily,
} from '../chord-engine/spelling.js';
import { classifyVoicing as classifyPlayedVoicing } from '../voicing-engine/voicing-classifier.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const LATIN = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
// Noms des positions libres de la roue (comme Sessions MIDI) ; une note jouée prend
// son orthographe dans l'accord (D♯ dans C7♯9, E♭ dans Cm7).
const WHEEL_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const SIMPLE_INTERVALS = ['Unisson', 'Seconde mineure', 'Seconde majeure', 'Tierce mineure', 'Tierce majeure', 'Quarte juste',
  'Triton', 'Quinte juste', 'Sixte mineure', 'Sixte majeure', 'Septième mineure', 'Septième majeure'];
const COMPOUND_INTERVALS = {
  12: 'Octave', 13: 'Neuvième mineure', 14: 'Neuvième majeure', 15: 'Dixième mineure', 16: 'Dixième majeure',
  17: 'Onzième juste', 18: 'Onzième augmentée', 19: 'Douzième juste', 20: 'Treizième mineure', 21: 'Treizième majeure',
  22: 'Quatorzième mineure', 23: 'Quatorzième majeure', 24: 'Double octave',
};

/** Nom français d'un intervalle en demi-tons (« Tierce mineure », « Dixième majeure »). */
export function intervalName(semitones) {
  const s = Math.abs(Math.round(semitones));
  if (s < 12) return SIMPLE_INTERVALS[s];
  if (COMPOUND_INTERVALS[s]) return COMPOUND_INTERVALS[s];
  const simple = s % 12 === 0 ? 'Octave' : SIMPLE_INTERVALS[s % 12];
  return `${simple} (+${Math.floor(s / 12)} oct.)`;
}

const pretty = (symbol) => String(symbol || '').replace(/#/g, '♯').replace(/b(?=\d)/g, '♭');

const QUALITIES = {
  '': 'majeur', m: 'mineur', dim: 'diminué', aug: 'augmenté', 5: 'quinte à vide',
  sus2: 'suspendu (sus2)', sus4: 'suspendu (sus4)', dim7: 'diminué 7', m7b5: 'demi-diminué (ø7)',
  m9b5: 'demi-diminué 9', mMaj7: 'mineur majeur 7', mMaj9: 'mineur majeur 9', add9: 'majeur add9',
  madd9: 'mineur add9', 6: 'majeur 6', m6: 'mineur 6', '6/9': 'majeur 6/9', 'm6/9': 'mineur 6/9',
};

/** Qualité en français (« dominante 13 », « majeur 7♯11 », « demi-diminué (ø7) »). */
export function qualityLabel(symbol) {
  const s = String(symbol ?? '');
  if (s === '?') return 'non identifié';
  if (Object.prototype.hasOwnProperty.call(QUALITIES, s)) return QUALITIES[s];
  switch (chordFamily(s)) {
    case 'dominant': return `dominante ${pretty(s)}`;
    case 'minor': return `mineur ${pretty(s.replace(/^m/, ''))}`;
    case 'diminished': return `diminué ${pretty(s)}`;
    default: return `majeur ${pretty(s.replace(/^maj/, ''))}`.trim();
  }
}

/** Nom jazz d'un degré dans l'accord (« 1 », « ♭3 », « ♯9 », « 13 »). */
function degreeLabel(semitones, rel, symbol) {
  const s = pcOf(semitones);
  const degree = degreeOf(s, rel, symbol);
  const hasSeventh = rel.has(10) || rel.has(11);
  const natural = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }[degree];
  let alter = s - natural;
  if (alter > 6) alter -= 12;
  if (alter < -6) alter += 12;
  const sign = alter === -2 ? '𝄫' : alter === -1 ? '♭' : alter === 1 ? '♯' : alter === 2 ? '𝄪' : '';
  let number = degree;
  if (degree === 2) number = /sus2/.test(symbol) ? 2 : 9;
  if (degree === 4) number = /sus/.test(symbol) && !rel.has(3) && !rel.has(4) ? 4 : 11;
  if (degree === 6) number = hasSeventh && !/dim7/.test(symbol) ? 13 : 6;
  return { degree, label: `${sign}${number}` };
}

/** Degrés présents, dans l'ordre d'empilement jazz : « 1 · 3 · ♭7 · 13 ». */
export function intervalDegrees(notes, rootPc, symbol = '') {
  const rel = new Set((notes || []).map((n) => pcOf(n - rootPc)));
  const order = { 1: 0, 3: 1, 5: 2, 7: 3, 2: 4, 4: 5, 6: 6 };
  // Une suspension (le 2 d'un sus2, le 4 d'un sus4) prend la place de la tierce.
  const rank = (d) => (/^[♭♯]?[24]$/.test(d.label) ? order[3] : order[d.degree]);
  return [...rel]
    .map((s) => ({ s, ...degreeLabel(s, rel, symbol) }))
    .sort((a, b) => rank(a) - rank(b) || a.s - b.s)
    .map((d) => d.label);
}

/** Position de la basse : fondamentale, renversements, basse sur une extension. */
export function positionLabel(result, notes) {
  if (!result || result.symbol === '?' || !notes?.length) return '—';
  if (result.rootless) return 'sans fondamentale';
  if (result.polychord) return 'polyaccord';
  const bass = pcOf(Math.min(...notes));
  if (!result.intervals.some((i) => pcOf(result.rootPc + i) === bass)) return 'basse étrangère à l\'accord';
  const rel = new Set(notes.map((n) => pcOf(n - result.rootPc)));
  const { degree, label } = degreeLabel(bass - result.rootPc, rel, result.symbol);
  switch (degree) {
    case 1: return 'position fondamentale';
    case 3: return /sus/.test(result.symbol) ? `basse sur la ${label}` : '1er renversement';
    case 5: return '2e renversement';
    case 7: return '3e renversement';
    default: return `basse sur la ${label}`;
  }
}

/** Nom d'une autre lecture (« Am7/C », « G13 sans fondamentale »). */
export function readingName(reading, latin = false) {
  const root = displayNoteName(chordRootName(reading.rootPc, reading.symbol), { latin });
  const name = `${root}${pretty(reading.symbol)}`;
  if (reading.rootless) return `${name} sans fondamentale`;
  return reading.isSlash ? `${name}/${displayNoteName(slashBassName(reading.bassPc, reading.rootPc, reading.symbol), { latin })}` : name;
}

/** Nom d'une note avec son octave (« Do3 », « E♭4 »). */
function noteWithOctave(spelled, latin) {
  return `${displayNoteName(spelled.name, { latin })}${spelled.octave}`;
}

/**
 * Tout ce que la Lecture en direct affiche, sans DOM.
 * @param {number[]} notes - notes entendues (MIDI)
 * @param {object|null} result - detectChord(notes)
 */
export function describeLiveReading(notes, result, latin = false) {
  const sorted = [...new Set((notes || []).filter(Number.isFinite))].sort((a, b) => a - b);
  const pcs = [...new Set(sorted.map(pcOf))];
  const chordKnown = Boolean(result) && pcs.length >= 3 && result.symbol !== '?';
  const spelled = spellChordNotes(sorted, chordKnown && !result.polychord ? result : null);
  const nameOfPc = new Map();
  for (const n of spelled) if (!nameOfPc.has(pcOf(n.midi))) nameOfPc.set(pcOf(n.midi), displayNoteName(n.name, { latin }));

  const out = {
    count: sorted.length,
    title: '',
    titleIsChord: false,
    root: '—', bass: '—', quality: 'en attente', position: '—', intervals: '—',
    voicing: '—', voicingDetail: '', midi: '—', frequency: '—', also: [],
    wheel: { active: new Set(pcs), rootPc: null, bassPc: sorted.length ? pcOf(sorted[0]) : null, names: nameOfPc },
  };
  if (!sorted.length) return out;

  out.bass = noteWithOctave(spelled[0], latin);
  out.midi = sorted.join(' · ');
  out.frequency = `${(440 * 2 ** ((sorted[0] - 69) / 12)).toFixed(1)} Hz`;

  if (pcs.length === 1) {
    out.title = sorted.length > 1 ? `${displayNoteName(spelled[0].name, { latin })} (octaves)` : noteWithOctave(spelled[0], latin);
    out.quality = sorted.length > 1 ? 'octaves' : 'note seule';
    out.root = displayNoteName(spelled[0].name, { latin });
    out.wheel.rootPc = pcs[0];
    return out;
  }
  if (pcs.length === 2) {
    const other = sorted.find((n) => pcOf(n) !== pcOf(sorted[0]));
    out.title = intervalName(other - sorted[0]);
    out.quality = 'intervalle';
    out.root = displayNoteName(spelled[0].name, { latin });
    out.intervals = intervalDegrees(sorted, pcOf(sorted[0]), '').join(' · ');
    return out;
  }
  if (!chordKnown) {
    out.title = [...nameOfPc.values()].join(' · ');
    out.quality = 'non identifié';
    return out;
  }

  out.titleIsChord = true;
  out.root = displayNoteName(chordRootName(result.rootPc, result.symbol), { latin });
  out.quality = result.polychord ? 'polyaccord (triade sur triade)' : qualityLabel(result.symbol);
  out.position = positionLabel(result, sorted);
  out.intervals = intervalDegrees(sorted, result.rootPc, result.symbol).join(' · ');
  out.wheel.rootPc = result.rootless ? null : result.rootPc;
  const played = classifyPlayedVoicing(sorted, result.rootPc, result.symbol);
  out.voicing = played.label || '—';
  out.voicingDetail = played.detail || '';
  out.also = chordReadings(sorted)
    .filter((r) => !(r.rootPc === result.rootPc && r.symbol === result.symbol))
    .slice(0, 3)
    .map((r) => readingName(r, latin));
  return out;
}

// ─── Rendu ───────────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
const CENTER = 100;
const RING = 70;
const LABEL_RADIUS = 86;
const INNER = 24;

const pointAt = (pc, radius) => {
  const angle = (pc / 12) * Math.PI * 2 - Math.PI / 2;
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];
};
const round = (n) => Math.round(n * 100) / 100;

function svgEl(parent, tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

/**
 * Roue construite une fois : anneaux, graduations, 12 positions. Les noms des notes
 * et le compte sont du texte HTML posé sur la roue (taille fixe, lisible même quand
 * la roue rapetisse sur un petit écran) ; le reste est du SVG.
 */
function buildWheel(svg) {
  svg.textContent = '';
  svg.setAttribute('viewBox', '0 0 200 200');
  svgEl(svg, 'circle', { cx: CENTER, cy: CENTER, r: RING, class: 'live-wheel-ring' });
  svgEl(svg, 'circle', { cx: CENTER, cy: CENTER, r: INNER, class: 'live-wheel-ring live-wheel-ring-inner' });
  const ticks = svgEl(svg, 'g', { class: 'live-wheel-ticks' });
  for (let i = 0; i < 60; i += 1) {
    if (i % 5 === 0) continue;
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    svgEl(ticks, 'line', {
      x1: round(CENTER + Math.cos(angle) * (RING + 3)), y1: round(CENTER + Math.sin(angle) * (RING + 3)),
      x2: round(CENTER + Math.cos(angle) * (RING + 5.5)), y2: round(CENTER + Math.sin(angle) * (RING + 5.5)),
    });
  }
  svgEl(svg, 'g', { class: 'live-wheel-shape-layer' });
  const nodes = svgEl(svg, 'g', { class: 'live-wheel-nodes' });
  for (let pc = 0; pc < 12; pc += 1) {
    const [x, y] = pointAt(pc, RING);
    const g = svgEl(nodes, 'g', { class: 'live-wheel-node', 'data-pc': pc });
    svgEl(g, 'circle', { cx: round(x), cy: round(y), r: 10, class: 'live-wheel-bass-ring' });
    svgEl(g, 'circle', { cx: round(x), cy: round(y), r: 2.4, class: 'live-wheel-dot' });
  }
  const wrap = svg.parentElement;
  wrap?.querySelector('.live-wheel-labels')?.remove();
  if (wrap) {
    const overlay = document.createElement('div');
    overlay.className = 'live-wheel-labels';
    overlay.setAttribute('aria-hidden', 'true');
    for (let pc = 0; pc < 12; pc += 1) {
      const [lx, ly] = pointAt(pc, LABEL_RADIUS);
      const label = document.createElement('span');
      label.className = 'live-wheel-label';
      label.dataset.pc = String(pc);
      label.style.left = `${round(lx / 2)}%`;
      label.style.top = `${round(ly / 2)}%`;
      overlay.appendChild(label);
    }
    const center = document.createElement('span');
    center.className = 'live-wheel-center';
    overlay.appendChild(center);
    wrap.appendChild(overlay);
  }
  svg.dataset.built = '1';
}

function defaultWheelName(pc, latin) {
  return displayNoteName(WHEEL_NAMES[pc], { latin });
}

function updateWheel(svg, wheel, latin) {
  if (!svg) return;
  if (svg.dataset.built !== '1') buildWheel(svg);
  const { active, rootPc, bassPc, names } = wheel;
  const overlay = svg.parentElement?.querySelector('.live-wheel-labels');
  for (const node of svg.querySelectorAll('.live-wheel-node')) {
    const pc = Number(node.dataset.pc);
    const on = active.has(pc);
    const flags = { 'is-active': on, 'is-root': on && pc === rootPc, 'is-bass': on && pc === bassPc && active.size > 1 };
    const label = overlay?.querySelector(`.live-wheel-label[data-pc="${pc}"]`);
    for (const [cls, value] of Object.entries(flags)) {
      node.classList.toggle(cls, value);
      label?.classList.toggle(cls, value);
    }
    const text = on && names.get(pc) ? names.get(pc) : defaultWheelName(pc, latin);
    if (label && label.textContent !== text) label.textContent = text;
  }
  const center = overlay?.querySelector('.live-wheel-center');
  if (center) center.textContent = active.size ? String(active.size) : '';

  // Les lignes ne sont redessinées (et animées) que si les notes changent.
  const ordered = [...active].sort((a, b) => a - b);
  const key = ordered.join(',');
  const layer = svg.querySelector('.live-wheel-shape-layer');
  if (layer.dataset.key === key) return;
  layer.dataset.key = key;
  layer.textContent = '';
  if (ordered.length < 2) return;
  const points = ordered.map((pc) => pointAt(pc, RING).map(round));
  for (const [x, y] of points) svgEl(layer, 'line', { x1: CENTER, y1: CENTER, x2: x, y2: y, class: 'live-wheel-spoke' });
  if (ordered.length === 2) {
    svgEl(layer, 'line', { x1: points[0][0], y1: points[0][1], x2: points[1][0], y2: points[1][1], class: 'live-wheel-shape', pathLength: 1 });
  } else {
    svgEl(layer, 'polygon', { points: points.map((p) => p.join(',')).join(' '), class: 'live-wheel-shape', pathLength: 1 });
  }
}

const byId = (id) => document.getElementById(id);
let lastChord = null; // dernier accord entendu (pour « Réécouter »)
// Notes du geste en cours, entre deux silences : relâcher les touches une à une ne
// doit pas réduire l'accord à réécouter à la dernière note tenue.
let gesture = null;

function remember(notes) {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (!gesture || sorted.some((n) => !gesture.includes(n))) gesture = sorted;
  lastChord = gesture;
}

function setText(id, value) {
  const el = byId(id);
  if (el && el.textContent !== value) el.textContent = value;
}

function renderAlso(names) {
  const row = byId('live-also');
  const chips = byId('live-also-chips');
  if (!row || !chips) return;
  row.hidden = names.length === 0;
  chips.textContent = '';
  for (const name of names) {
    const chip = document.createElement('span');
    chip.className = 'live-also-chip';
    chip.textContent = name;
    chips.appendChild(chip);
  }
}

function renderReadouts(view) {
  setText('live-count', `${view.count} note${view.count > 1 ? 's' : ''}`);
  setText('live-root', view.root);
  setText('live-bass', view.bass);
  setText('live-quality', view.quality);
  setText('live-position', view.position);
  setText('live-intervals', view.intervals);
  setText('live-voicing', view.voicing);
  setText('live-voicing-detail', view.voicingDetail);
  setText('live-midi', view.midi);
  setText('live-frequency', view.frequency);
  renderAlso(view.also);
  const stage = byId('practice-center');
  stage?.classList.toggle('has-notes', view.count > 0);
}

function updateReplay() {
  const button = byId('live-replay');
  if (!button) return;
  button.disabled = !lastChord;
  button.title = lastChord ? 'Réécouter le dernier accord joué' : 'Jouez un accord pour pouvoir le réécouter';
}

/**
 * Affiche la lecture des notes entendues. Retourne la vue (le titre sert à
 * display.js pour #chord-name quand ce n'est pas un accord : note, intervalle…).
 */
export function renderLiveReading(notes, result, latin = false) {
  const view = describeLiveReading(notes, result, latin);
  updateWheel(byId('live-wheel'), view.wheel, latin);
  renderReadouts(view);
  if (view.count >= 1) {
    remember(notes);
    updateReplay();
  }
  return view;
}

/** Rien n'est joué : roue au repos ; « Réécouter » garde le dernier accord. */
export function clearLiveReading(latin = false) {
  gesture = null;
  const view = describeLiveReading([], null, latin);
  updateWheel(byId('live-wheel'), view.wheel, latin);
  renderReadouts(view);
  updateReplay();
}

/** @param {{onReplay?: (notes: number[]) => void}} hooks */
export function initLiveReading({ onReplay } = {}) {
  updateWheel(byId('live-wheel'), describeLiveReading([], null).wheel, false);
  updateReplay();
  byId('live-replay')?.addEventListener('click', () => {
    if (lastChord && onReplay) onReplay([...lastChord]);
  });
}

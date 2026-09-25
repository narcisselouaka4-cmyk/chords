// [Claude] — 2026-09-24 — Exemples joués par le Copilote IA.
//
// Narcisse : « quand je lui demande de m'expliquer un 2-5-1, il va directement
// me le jouer au lieu d'expliquer d'abord » et « sa façon de jouer n'est pas
// terrible : on ne dirait pas un assistant qui maîtrise son instrument, mais
// plutôt un débutant ». Les outils du Copilote jouaient leurs notes pendant
// que la réponse se préparait (avant que le texte n'apparaisse), avec des accords
// secs de 0,6 s ou des arpèges d'une note toutes les 300–450 ms.
//
// Désormais un outil audio ne joue rien : il prépare un EXEMPLE (évènements
// datés en temps, tempo, titre, mains) que l'onglet affiche sous la réponse, avec
// un bouton Écouter. Les accords et progressions sont joués par le moteur de
// l'Exercice : voicings VoicingLab enchaînés d'un accord à l'autre, deux mains,
// styles de la démo (Gospel / worship, Ballade, Comping swing, Plaqué). Les
// lignes de guide tones, les licks et les notes isolées gardent leurs
// générateurs, rythmés plus posément.
//
// Technique par défaut (aucune demandée) : la main droite en voicings rootless
// (3e, 7e et 9e : Dm7 → Fa La Do Mi, G7 → Fa La Si Ré, Cmaj7 → Mi Sol Si Ré),
// enchaînés d'un accord à l'autre au-dessus de la basse de la main gauche : ce
// que joue un pianiste de jazz, de gospel ou de worship. Le mode Auto de
// l'Exercice commence, lui, par les shells du débutant (trois notes à la main
// gauche, rien à la main droite) : c'était le son « de débutant » entendu dans
// le Copilote. Un voicing rootless trop grave (sous Mi3) monte d'une octave ;
// les triades (F, Am), les accords sur basse (C/E, F/C) et les accords que
// l'Exercice ne joue qu'en shell sont voicés ici : triade serrée à la main
// droite, reliée à l'accord précédent par le plus petit mouvement, basse (ou
// basse écrite, en octave) à la main gauche.

import { createPracticeExercise, TECHNIQUES, TECHNIQUE_LABELS, isGridChordPlayable } from '../practice-exercise.js';
import { buildDemo, demoHands, DEMO_STYLES } from '../practice-demo.js';
import { parseChordSymbol, chordSymbolToPitchClasses } from './chord-parser-v2.js';

// Style du Copilote → style de démo. « Auto » : la Ballade, posée et claire.
const STYLE_TO_DEMO = { auto: 'ballade', worship: 'gospel', gospel: 'gospel', jazz: 'swing', neoSoul: 'ballade' };

// Tempo d'un exemple : un peu plus posé que la démo des exercices (on écoute
// pour comprendre), noires par minute.
const EXAMPLE_TEMPO = { gospel: 72, ballade: 60, swing: 108, plaque: 66 };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = (midi) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * Style de démo d'un exemple : celui du Copilote ; un accord plaqué demandé
 * explicitement se joue plaqué.
 * @param {string} styleId - 'auto'|'worship'|'gospel'|'jazz'|'neoSoul'
 * @param {string} [pattern] - 'block'|'rolled'|'arppegio-up'|'arppegio-down'
 */
export function demoStyleFor(styleId, pattern) {
  if (pattern === 'block') return 'plaque';
  return STYLE_TO_DEMO[styleId] || 'ballade';
}

// Technique d'un exemple quand l'élève n'en demande aucune (voir l'en-tête).
const DEFAULT_TECHNIQUE = 'rootless';
// Techniques trop maigres pour un exemple (une main, deux ou trois notes) : revoicées ici.
const THIN_TECHNIQUES = new Set(['shell', 'two_note_shell']);
// Main droite d'un accord voicé ici : pas sous Fa3, dessus entre Mi4 et Mi5.
const RH_LOW = 53;
const RH_TOP = [64, 76];
// Voicing rootless à une main plus grave que Mi3 : il monte d'une octave.
const ROOTLESS_LOW = 52;
const LOWEST_BASS = 28; // Mi1

const pcOf = (n) => ((n % 12) + 12) % 12;
const sorted = (notes) => [...new Set(notes)].sort((a, b) => a - b);

const TECHNIQUE_TEXT = {
  rootless: 'voicings rootless (3e, 7e, 9e)',
  close: 'position serrée',
  fourway_close: 'Four-Way Close',
  drop2: 'Drop 2',
  drop3: 'Drop 3',
  drop2_4: 'Drop 2-4',
  spread: 'voicings écartés',
  open: 'voicings ouverts',
  block: 'block chords',
  quartal: 'voicings en quartes',
  so_what: 'voicings So What',
  upper_structure: 'upper structures',
  stride: 'stride',
  cluster: 'clusters',
  shell: 'shells',
  two_note_shell: 'shells à deux notes',
  triad: 'triades',
  slash: 'accords sur basse',
};

/** Voicing rootless à une main : main droite vide, pas de fondamentale à gauche. */
function isOneHandRootless(chord) {
  const v = chord?.voicing;
  return Boolean(v) && !(v.rightHand || []).length && (v.leftHand || []).length >= 3
    && !(v.leftHand || []).some((n) => pcOf(n) === pcOf(chord.rootPc));
}

/** Notes jouées par la main droite (un rootless à une main passe à droite, voir demoHands). */
function rightHandOf(chord) {
  const v = chord?.voicing || {};
  return sorted(isOneHandRootless(chord) ? v.leftHand : v.rightHand || []);
}

/**
 * Main droite serrée d'un accord (toutes ses notes, quinte omise au-delà de
 * quatre), la plus proche de la main droite précédente (plus petit mouvement
 * des voix), dessus entre Mi4 et Mi5.
 */
function closeRightHand(pcs, rootPc, previous) {
  let tones = [...pcs];
  // Quinte omise au-delà de quatre notes ; la fondamentale reste à la basse dès
  // que la main droite en a trois autres (C6/9 : Mi La Ré au-dessus de Do Sol).
  if (tones.length > 4) tones = tones.filter((pc) => pcOf(pc - rootPc) !== 7);
  if (tones.length >= 4) tones = tones.filter((pc) => pc !== pcOf(rootPc));
  const order = [...tones].sort((a, b) => a - b);
  const candidates = [];
  for (let r = 0; r < order.length; r += 1) {
    const rotation = [...order.slice(r), ...order.slice(0, r)];
    for (let low = RH_LOW; low < RH_LOW + 24; low += 1) {
      if (pcOf(low) !== rotation[0]) continue;
      const notes = [low];
      for (const pc of rotation.slice(1)) {
        let n = notes[notes.length - 1] + 1;
        while (pcOf(n) !== pc) n += 1;
        notes.push(n);
      }
      candidates.push(notes);
    }
  }
  const outside = (top) => Math.max(0, RH_TOP[0] - top, top - RH_TOP[1]);
  // Seconde mineure entre deux doigts voisins : dure dans une main serrée.
  const rubs = (notes) => notes.slice(1).filter((n, i) => n - notes[i] === 1).length;
  const cost = (notes) => {
    const top = notes[notes.length - 1];
    let move = 0;
    if (previous?.length) {
      move = Math.abs(top - previous[previous.length - 1]) * 1.5 + Math.abs(notes[0] - previous[0]);
    } else {
      move = Math.abs(top - 70);
    }
    return move + outside(top) * 3 + rubs(notes) * 6;
  };
  return candidates.sort((a, b) => cost(a) - cost(b))[0] || null;
}

/**
 * Accord voicé ici (triade, accord sur basse, accord que l'Exercice ne joue
 * qu'en shell) : main droite serrée reliée à la précédente, main gauche libre
 * pour la basse du style, ou basse écrite en octave (C/E : Mi2 Mi3).
 * @returns {object|null} accord au format de l'Exercice ({name, rootPc, symbol, voicing, notes})
 */
export function voiceChord(name, previousRightHand = null) {
  const parsed = parseChordSymbol(name);
  if (!parsed?.ok || parsed.rootPc == null) return null;
  const slash = parsed.bassPc != null && parsed.bassPc !== parsed.rootPc;
  const upper = slash ? String(name).slice(0, String(name).lastIndexOf('/')) : name;
  const pcs = chordSymbolToPitchClasses(upper);
  if (!pcs?.length) return null;
  const rightHand = closeRightHand(pcs, parsed.rootPc, previousRightHand);
  if (!rightHand) return null;
  let leftHand = [];
  if (slash) {
    const b = 36 + pcOf(parsed.bassPc); // Do2 … Si2
    const room = rightHand[0] - 3;
    leftHand = [[b, b + 12], [b - 12, b], [b]].find((lh) => lh[0] >= LOWEST_BASS && lh[lh.length - 1] <= room) || [b - 12];
  }
  const symbol = String(upper).replace(/^[A-G][#b]?/, '');
  return {
    name: String(name),
    rootPc: parsed.rootPc,
    symbol,
    notes: sorted([...leftHand, ...rightHand]),
    voicing: { leftHand, rightHand, technique: slash ? 'slash' : pcs.length === 3 ? 'triad' : 'close', isPlayable: true, diagnostics: [] },
  };
}

/**
 * Accords d'une grille donnée en symboles (« Dm7 », « G7alt », « C/E »), joués
 * comme un pianiste (voir l'en-tête) ; chaque accord garde sa mesure.
 * @param {string[]} symbols
 * @param {{technique?: string}} [options] - technique demandée par l'élève, sinon 'auto'
 * @returns {object[]|null}
 */
export function buildExampleChords(symbols, { technique = 'auto' } = {}) {
  const list = (symbols || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (list.length === 0) return null;
  const explicit = technique !== 'auto' && TECHNIQUES.includes(technique);
  const exercise = createPracticeExercise();
  exercise.setTechnique(explicit ? technique : DEFAULT_TECHNIQUE);
  const playable = list.filter((name) => isGridChordPlayable(name));
  const voiced = playable.length ? exercise.previewGrid(playable.map((name) => ({ name })), null, { keepTensions: true }) || [] : [];
  const aligned = voiced.length === playable.length;
  // Rootless trop graves : toute la suite monte d'une octave (l'enchaînement reste le même).
  if (!explicit) {
    const oneHand = voiced.filter(isOneHandRootless);
    const lows = oneHand.map((c) => Math.min(...c.voicing.leftHand));
    const tops = oneHand.map((c) => Math.max(...c.voicing.leftHand));
    if (lows.length && Math.min(...lows) < ROOTLESS_LOW && Math.max(...tops) + 12 <= 86) {
      oneHand.forEach((c) => { c.voicing = { ...c.voicing, leftHand: c.voicing.leftHand.map((n) => n + 12) }; });
    }
  }
  // Place de chaque accord : celui de l'Exercice, ou null (voicé ici) pour une
  // triade, un accord sur basse, un shell, ou un voicing sans basse possible
  // (C6/9 en position serrée : Do4 Mi4 | La4 Ré5, la main gauche ne peut pas
  // prendre la fondamentale en plus).
  let k = 0;
  const slots = list.map((name) => {
    if (!isGridChordPlayable(name)) return null;
    const chord = aligned ? voiced[k] : voiced.find((c) => c.name === name) || null;
    k += 1;
    if (!chord || explicit) return chord;
    if (THIN_TECHNIQUES.has(chord.voicing?.technique)) return null;
    const hands = demoHands(chord, 'fifth');
    return hands.bass.length || hands.stride ? chord : null;
  });
  const chords = [];
  let previous = null;
  list.forEach((name, i) => {
    let chord = slots[i];
    if (!chord) {
      // Relié à l'accord précédent ; en tête, à l'accord suivant de l'Exercice.
      const next = slots.slice(i + 1).find(Boolean);
      chord = voiceChord(name, previous || (next ? rightHandOf(next) : null));
    }
    if (!chord) return;
    chords.push(chord);
    previous = rightHandOf(chord);
  });
  return chords.length ? chords : null;
}

/** Évènements d'une démo → notes jouées (pour les contrôles du Copilote). */
export function eventsToPlayed(events, tempo) {
  const msPerBeat = 60000 / tempo;
  return events
    .filter((e) => e.type === 'noteOn')
    .map((e) => ({ midi: e.note, name: midiName(e.note), startOffsetMs: Math.round(e.time * msPerBeat), hand: e.hand === 'lh' ? 'LH' : 'RH' }));
}

/** Mains réellement jouées pour un accord de l'exemple (carte + basse du style). */
function playedHands(chord, demoStyle) {
  const hands = demoStyle === 'plaque' ? null : demoHands(chord, demoStyle === 'swing' ? 'root' : 'fifth');
  const leftHand = hands ? hands.lh : chord.voicing?.leftHand || [];
  const rightHand = hands ? hands.rh : chord.voicing?.rightHand || [];
  return { leftHand: [...leftHand], rightHand: [...rightHand] };
}

/**
 * Exemple d'une progression (ou d'un seul accord) joué comme la démo des
 * exercices.
 * @returns {{kind: string, title: string, subtitle: string, style: string, tempo: number, events: object[], beats: number, chords: object[]}|null}
 */
export function buildChordExample(symbols, { styleId = 'auto', technique = 'auto', pattern } = {}) {
  const chords = buildExampleChords(symbols, { technique });
  if (!chords?.length) return null;
  const style = demoStyleFor(styleId, pattern);
  // Plaqué sans technique demandée : les deux mains quand même (la basse sous
  // un rootless), comme les autres styles. Un rootless demandé reste seul.
  if (style === 'plaque' && technique === 'auto') {
    chords.forEach((c) => {
      const hands = demoHands(c, 'fifth');
      c.voicing = { ...c.voicing, leftHand: hands.lh, rightHand: hands.rh };
    });
  }
  const { events, beats } = buildDemo(chords, style);
  const single = chords.length === 1;
  const techniques = [...new Set(chords.map((c) => c.voicing?.technique).filter(Boolean))];
  const explicit = technique !== 'auto' && TECHNIQUES.includes(technique);
  let handsText = 'voicings enchaînés à deux mains';
  if (explicit) {
    // Technique demandée : le voicing tel quel (celle qui la remplace si elle n'existe pas pour l'accord).
    handsText = `voicing ${techniques.map((t) => TECHNIQUE_LABELS[t] || t).join(' / ')}`;
  } else if (techniques.length === 1 && TECHNIQUE_TEXT[techniques[0]]) {
    handsText = `main droite en ${TECHNIQUE_TEXT[techniques[0]]}`;
  }
  const played = chords.map((c) => ({ name: c.name, technique: c.voicing?.technique, ...playedHands(c, style) }));
  return {
    kind: single ? 'voicing' : 'progression',
    title: chords.map((c) => c.name).join(' → '),
    subtitle: `${DEMO_STYLES[style].label} · ${single ? 'un accord' : `${chords.length} accords`} · ${handsText}`,
    style,
    tempo: EXAMPLE_TEMPO[style] || DEMO_STYLES[style].tempo,
    events,
    beats,
    chords: played,
  };
}

/**
 * Exemple à partir de notes datées en millisecondes (guide tones, lick, notes
 * isolées) : même lecteur, même carte. Les touches s'allument en jaune pendant
 * l'écoute (main.js) ; rien n'est marqué sur le clavier.
 * @param {{midi: number, startOffsetMs: number, durationMs: number, velocity?: number, hand?: string}[]} notes
 * @param {{kind?: string, title?: string, subtitle?: string}} [options]
 */
export function buildNotesExample(notes, { kind = 'notes', title = 'Notes', subtitle = '' } = {}) {
  const list = (notes || []).filter((n) => Number.isFinite(n.midi) && n.midi >= 21 && n.midi <= 108);
  if (list.length === 0) return null;
  // Tempo 60 : un temps = une seconde, les millisecondes se lisent directement.
  const events = [];
  for (const n of list) {
    const start = Math.max(0, n.startOffsetMs || 0) / 1000;
    const duration = Math.max(0.12, (n.durationMs || 800) / 1000);
    const hand = String(n.hand || '').toUpperCase() === 'LH' ? 'lh' : 'rh';
    events.push({ time: start, type: 'noteOn', note: n.midi, velocity: Math.min(1, Math.max(0.3, n.velocity ?? 0.7)), hand });
    events.push({ time: start + duration, type: 'noteOff', note: n.midi, hand });
  }
  // À temps égal : relâchements d'abord, puis les attaques.
  const order = { noteOff: 0, noteOn: 1 };
  events.sort((a, b) => a.time - b.time || order[a.type] - order[b.type]);
  const beats = Math.max(...events.map((e) => e.time));
  return { kind, title, subtitle, style: null, tempo: 60, events, beats, chords: [] };
}

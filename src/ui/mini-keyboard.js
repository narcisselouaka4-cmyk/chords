// [OpenCode] — 2026-07-04 — Mini-clavier SVG pédagogique pour un accord.
// Affiche environ 2 octaves (C4–B5 par défaut), touches blanches alignées,
// touches noires positionnées réalistes entre les blanches, notes actives en rouge.
// Retourne aussi la liste textuelle des notes pour affichage en dessous.

const WHITE_WIDTH = 20;
const WHITE_HEIGHT = 80;
const BLACK_WIDTH = 12;
const BLACK_HEIGHT = 50;
const START_MIDI = 60;    // C4
const END_MIDI = 83;      // B5
const WHITE_RADIUS = 3;
const BLACK_RADIUS = 2;

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LATIN_SHARP = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LATIN_FLAT = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];

function midiToNoteName(midi, useSharps = true, latin = false) {
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const names = latin
    ? (useSharps ? LATIN_SHARP : LATIN_FLAT)
    : (useSharps ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT);
  return `${names[pc]}${octave}`;
}

function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function whiteKeyIndex(midi, startMidi) {
  let count = 0;
  for (let i = startMidi; i < midi; i++) {
    if (!isBlackKey(i)) count++;
  }
  return count;
}

function blackKeyX(midi, startMidi) {
  const pc = midi % 12;
  const prevWhiteIndex = whiteKeyIndex(midi, startMidi) - 1; // index de la blanche précédente
  const baseX = (prevWhiteIndex + 1) * WHITE_WIDTH; // bord droit de la blanche précédente
  const offsets = {
    1: -BLACK_WIDTH * 0.35, // C# proche de D
    3: -BLACK_WIDTH * 0.65, // D# proche de E
    6: -BLACK_WIDTH * 0.30, // F# proche de G
    8: -BLACK_WIDTH * 0.50, // G# centré
    10: -BLACK_WIDTH * 0.70, // A# proche de B
  };
  return baseX + offsets[pc];
}

export function generateMiniKeyboard(activeNotes = [], options = {}) {
  const start = options.startMidi ?? START_MIDI;
  const end = options.endMidi ?? END_MIDI;
  const activeSet = new Set(activeNotes.map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  const leftHandSet = new Set((options.leftHand || []).map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  const rightHandSet = new Set((options.rightHand || []).map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));

  // S'assurer que start est une note blanche pour l'alignement
  let firstWhite = start;
  while (isBlackKey(firstWhite) && firstWhite <= end) firstWhite++;
  let lastWhite = end;
  while (isBlackKey(lastWhite) && lastWhite >= start) lastWhite--;

  const whites = [];
  for (let midi = firstWhite; midi <= lastWhite; midi++) {
    if (!isBlackKey(midi)) whites.push(midi);
  }
  const whiteCount = whites.length || 1;

  const width = whiteCount * WHITE_WIDTH;
  const height = WHITE_HEIGHT;

  let markup = '';

  function activeClasses(midi) {
    const classes = ['mini-key'];
    if (activeSet.has(midi)) {
      classes.push('is-active');
      if (leftHandSet.has(midi)) classes.push('is-lh');
      else if (rightHandSet.has(midi)) classes.push('is-rh');
    }
    return classes.join(' ');
  }

  function activeFill(midi) {
    if (!activeSet.has(midi)) return isBlackKey(midi) ? '#1f2937' : '#ffffff';
    if (leftHandSet.has(midi)) return 'var(--mini-key-lh, #3b82f6)';
    if (rightHandSet.has(midi)) return 'var(--mini-key-rh, #ef4444)';
    return 'var(--mini-key-active, #ef4444)';
  }

  // Touches blanches
  whites.forEach((midi, index) => {
    const x = index * WHITE_WIDTH;
    const active = activeSet.has(midi);
    const fill = activeFill(midi);
    const stroke = active ? (leftHandSet.has(midi) ? '#1d4ed8' : rightHandSet.has(midi) ? '#991b1b' : '#991b1b') : '#9ca3af';
    const title = active ? ` title="${midiToNoteName(midi, true, false)}"` : '';
    markup += `<rect class="${activeClasses(midi)}" data-midi="${midi}" x="${x}" y="0" width="${WHITE_WIDTH}" height="${WHITE_HEIGHT}" rx="${WHITE_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="${active ? 1.5 : 0.5}"${title}/>`;
  });

  // Touches noires
  for (let midi = firstWhite; midi <= lastWhite; midi++) {
    if (!isBlackKey(midi)) continue;
    const x = blackKeyX(midi, firstWhite);
    if (x < 0 || x + BLACK_WIDTH > width) continue;
    const active = activeSet.has(midi);
    const fill = activeFill(midi);
    const stroke = active ? (leftHandSet.has(midi) ? '#1d4ed8' : rightHandSet.has(midi) ? '#f87171' : '#f87171') : '#000000';
    const title = active ? ` title="${midiToNoteName(midi, true, false)}"` : '';
    markup += `<rect class="${activeClasses(midi)}" data-midi="${midi}" x="${x}" y="0" width="${BLACK_WIDTH}" height="${BLACK_HEIGHT}" rx="${BLACK_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="${active ? 1.5 : 0.5}"${title}/>`;
  }

  const svg = `\n<svg class="mini-keyboard" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${markup}</svg>\n`;
  const noteNames = activeNotes
    .filter((n) => typeof n === 'number')
    .sort((a, b) => a - b)
    .map((n) => midiToNoteName(n, true, false));
  return { svg, noteNames };
}

export function miniKeyboardForNotes(activeNotes, options = {}) {
  // Fenêtre dimensionnée sur l'étendue réelle des notes actives (avec une
  // marge d'une touche de part et d'autre), et non plus une fenêtre fixe de
  // 24 demi-tons : un voicing réel (main gauche + main droite) peut dépasser
  // 2 octaves (ex. Sol#2 à Fa#5 = 34 demi-tons observés), et les notes hors
  // fenêtre n'étaient tout simplement jamais dessinées. Le SVG s'élargit en
  // conséquence ; le viewBox + preserveAspectRatio du côté CSS gèrent déjà la
  // mise à l'échelle.
  // Le deuxième argument peut être un nombre (ancien centerMidi) ou un objet
  // d'options { centerMidi, leftHand, rightHand, startMidi, endMidi }.
  const opts = typeof options === 'number' ? { centerMidi: options } : options;
  const startMidiOverride = opts.startMidi ?? (opts.centerMidi != null && opts.centerMidi < 60 ? 48 : undefined);
  const kbOptions = {
    leftHand: opts.leftHand,
    rightHand: opts.rightHand,
  };
  if (!Array.isArray(activeNotes) || activeNotes.length === 0) {
    const fallbackStart = startMidiOverride ?? 60;
    return {
      svg: generateMiniKeyboard([], { ...kbOptions, startMidi: fallbackStart, endMidi: opts.endMidi ?? fallbackStart + 23 }).svg,
      noteNames: [],
    };
  }
  const min = Math.min(...activeNotes);
  const max = Math.max(...activeNotes);
  const MARGIN = 2;
  const finalStart = startMidiOverride ?? Math.max(21, min - MARGIN);
  const finalEnd = opts.endMidi ?? Math.max(finalStart + 23, Math.min(108, max + MARGIN));
  return generateMiniKeyboard(activeNotes, { ...kbOptions, startMidi: finalStart, endMidi: finalEnd });
}

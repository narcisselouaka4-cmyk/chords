// [OpenCode] — 2026-07-04 — Mini-clavier SVG pédagogique pour un accord.
// Affiche environ 2 octaves (C4–B5 par défaut), touches blanches alignées,
// touches noires positionnées réalistes entre les blanches, notes actives en couleur.
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

// Dégradés partagés (identiques dans chaque SVG : un id répété désigne le même rendu).
const vertical = (id, top, bottom) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
const horizontal = (id, left, right) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${left}"/><stop offset="0.8" stop-color="${right}"/></linearGradient>`;
const GRADIENTS = `<defs>${[
  vertical('mk-off-w', '#fdfcfe', '#f0edf3'),
  horizontal('mk-off-b', '#3f3c43', '#212027'),
  vertical('mk-on-w', '#c2a5fa', '#a583e2'),
  horizontal('mk-on-b', '#a082da', '#705095'),
  vertical('mk-rh-w', '#bfe6d8', '#8ccdb7'),
  horizontal('mk-rh-b', '#7fc4ad', '#4f8f7a'),
  vertical('mk-add-w', '#f6ddb0', '#e8b86a'),
  horizontal('mk-add-b', '#e0aa55', '#a8742a'),
].join('')}</defs>`;

export function generateMiniKeyboard(activeNotes = [], options = {}) {
  const start = options.startMidi ?? START_MIDI;
  const end = options.endMidi ?? END_MIDI;
  const activeSet = new Set(activeNotes.map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  const leftHandSet = new Set((options.leftHand || []).map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  const rightHandSet = new Set((options.rightHand || []).map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  // Notes ajoutées (doublures d'octave) : couleur distincte.
  const addedSet = new Set((options.added || []).filter((n) => typeof n === 'number'));

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
      if (addedSet.has(midi)) classes.push('is-added');
      else if (leftHandSet.has(midi)) classes.push('is-lh');
      else if (rightHandSet.has(midi)) classes.push('is-rh');
    }
    return classes.join(' ');
  }

  // [Claude] — 2026-09-24 — Style Astra (maquette .tr-mini-keyboard) : touches
  // nacrées / anthracite en dégradé ; notes jouées en violet d'accent, main
  // droite en vert sauge (--tr-green), notes ajoutées en ambre adouci.
  function tone(midi) {
    if (!activeSet.has(midi)) return 'off';
    if (addedSet.has(midi)) return 'add';
    if (rightHandSet.has(midi)) return 'rh';
    return 'on'; // main gauche, ou note jouée sans main précisée
  }
  const fillOf = (midi) => `url(#mk-${tone(midi)}-${isBlackKey(midi) ? 'b' : 'w'})`;
  const STROKES = {
    w: { off: '#bdb7c5', on: '#8f6fe0', rh: '#5fa892', add: '#c8923f' },
    b: { off: '#141318', on: '#5c437c', rh: '#3e8b74', add: '#9a6a22' },
  };

  // Touches blanches
  whites.forEach((midi, index) => {
    const x = index * WHITE_WIDTH;
    const active = activeSet.has(midi);
    const title = active ? ` title="${midiToNoteName(midi, true, false)}"` : '';
    markup += `<rect class="${activeClasses(midi)}" data-midi="${midi}" x="${x}" y="0" width="${WHITE_WIDTH}" height="${WHITE_HEIGHT}" rx="${WHITE_RADIUS}" fill="${fillOf(midi)}" stroke="${STROKES.w[tone(midi)]}" stroke-width="${active ? 1 : 0.6}"${title}/>`;
  });

  // Touches noires
  for (let midi = firstWhite; midi <= lastWhite; midi++) {
    if (!isBlackKey(midi)) continue;
    const x = blackKeyX(midi, firstWhite);
    if (x < 0 || x + BLACK_WIDTH > width) continue;
    const active = activeSet.has(midi);
    const title = active ? ` title="${midiToNoteName(midi, true, false)}"` : '';
    markup += `<rect class="${activeClasses(midi)}" data-midi="${midi}" x="${x}" y="-1" width="${BLACK_WIDTH}" height="${BLACK_HEIGHT}" rx="${BLACK_RADIUS}" fill="${fillOf(midi)}" stroke="${STROKES.b[tone(midi)]}" stroke-width="0.8"${title}/>`;
  }

  const svg = `\n<svg class="mini-keyboard" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${GRADIENTS}${markup}</svg>\n`;
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
    added: opts.added,
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

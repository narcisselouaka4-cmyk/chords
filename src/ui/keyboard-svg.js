import { noteNameToMidi, midiToNoteName } from '../chord-engine/intervals.js';

// [Claude] — 2026-07-03 — Refonte du rendu clavier pour reproduire les proportions et le style de chord-display (rednetio/chord-display)
const NOTE_RADIUS = 5;
const NOTE_WHITE_WIDTH = 40;
const NOTE_WHITE_HEIGHT = 150;
const NOTE_BLACK_WIDTH = 22;
const NOTE_BLACK_HEIGHT = 90;
const NOTE_TONIC_RADIUS = 5;
const NOTE_TONIC_BOTTOM_OFFSET = 30;
const NOTE_NAME_BOTTOM_OFFSET = 2;

function mixRGB(color1, color2, ratio) {
  const c1 = parseInt(color1.replace('#', ''), 16);
  const c2 = parseInt(color2.replace('#', ''), 16);
  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;
  const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
  const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
  const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function getNoteProps(midi, latin = false) {
  const name = midiToNoteName(midi, true, latin);
  const octave = Math.floor(midi / 12) - 1; // MIDI C4 = central C
  return { midi, name, octave, alt: isBlackKey(midi) };
}

function whiteKeyTemplate(props, posX, color, whiteHeight = NOTE_WHITE_HEIGHT) {
  const name = `${props.name}${props.octave}`;
  return `\
<g id="note-${props.midi}" class="note white" data-midi="${props.midi}" transform="translate(${posX},0)" style="color: ${color};">
  <rect class="piano-key" width="${NOTE_WHITE_WIDTH}" height="${whiteHeight + NOTE_RADIUS}" x="0" y="${-NOTE_RADIUS}" rx="${NOTE_RADIUS}" ry="${NOTE_RADIUS}"></rect>
  <circle class="piano-tonic" cx="${NOTE_WHITE_WIDTH / 2}" cy="${whiteHeight - NOTE_TONIC_BOTTOM_OFFSET}" r="${NOTE_TONIC_RADIUS}"></circle>
  <text class="piano-key-name" x="${NOTE_WHITE_WIDTH / 2}" y="${whiteHeight - NOTE_NAME_BOTTOM_OFFSET}" text-anchor="middle">${name}</text>
</g>`;
}

function blackKeyTemplate(props, posX, color, blackHeight = NOTE_BLACK_HEIGHT) {
  return `\
<g id="note-${props.midi}" class="note black" data-midi="${props.midi}" transform="translate(${posX - NOTE_BLACK_WIDTH / 2},0)" style="color: ${color};">
  <rect class="piano-key" width="${NOTE_BLACK_WIDTH}" height="${blackHeight + NOTE_RADIUS}" x="0" y="${-NOTE_RADIUS}" rx="${NOTE_RADIUS}" ry="${NOTE_RADIUS}"></rect>
  <circle class="piano-tonic" cx="${NOTE_BLACK_WIDTH / 2}" cy="${blackHeight - NOTE_TONIC_BOTTOM_OFFSET}" r="${NOTE_TONIC_RADIUS}"></circle>
</g>`;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// [Claude] — 2026-09-24 — Hauteur décidée par l'application, plus par une
// poignée (proportions absurdes : touches écrasées ou démesurées). Touches aux
// proportions d'un piano (hauteur = 3,75 × largeur, soit 150 / 40), largeur de
// touche plafonnée pour les petites étendues (clavier alors centré), hauteur
// bornée pour les très grandes.
const MAX_WHITE_KEY_PX = 44;
const KEY_HEIGHT_RATIO = NOTE_WHITE_HEIGHT / NOTE_WHITE_WIDTH;
const MIN_KEYS_HEIGHT_PX = 70;
const MAX_KEYS_HEIGHT_PX = 180;

function midiRange(noteStart, noteEnd) {
  const a = noteNameToMidi(noteStart, 4);
  const b = noteNameToMidi(noteEnd, 4);
  if (a === null || b === null) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Disposition du clavier pour une largeur donnée : nombre de touches blanches,
 * largeur d'une touche (px) et hauteur idéale de la zone des touches (px).
 */
export function keyboardLayout(noteStart, noteEnd, containerWidth) {
  const r = midiRange(noteStart, noteEnd);
  const whiteCount = r ? range(r[0], r[1]).filter((m) => !isBlackKey(m)).length : 1;
  const keyPx = Math.min(Math.max(containerWidth, 1) / Math.max(whiteCount, 1), MAX_WHITE_KEY_PX);
  const keysHeightPx = Math.round(Math.max(MIN_KEYS_HEIGHT_PX, Math.min(MAX_KEYS_HEIGHT_PX, keyPx * KEY_HEIGHT_RATIO)));
  return { whiteCount, keyPx, keysHeightPx };
}

// [Claude] — 2026-07-03 — Génération SVG avec proportions fixes (40×150 blanches, 22×90 noires), gradients chord-display et positionnement réaliste des touches noires
export function generateKeyboard(
  noteStart,
  noteEnd,
  containerWidth,
  containerHeight,
  colorNote = '#bf3a2b',
  colorTonic = '#111111',
  latin = false,
) {
  const safeColorNote = /^#[0-9A-Fa-f]{6}$/.test(colorNote) ? colorNote : '#bf3a2b';
  const colorNoteWhite = mixRGB(safeColorNote, '#ffffff', 0.4);
  const colorNoteBlack = safeColorNote;

  const startMidi = noteNameToMidi(noteStart, 4);
  const endMidi = noteNameToMidi(noteEnd, 4);

  if (startMidi === null || endMidi === null) {
    throw new Error(`Invalid note range: "${noteStart}" to "${noteEnd}"`);
  }

  const start = Math.min(startMidi, endMidi);
  const end = Math.max(startMidi, endMidi);

  // Largeur réelle du clavier (px) et hauteur des touches (unités du viewBox)
  // pour remplir exactement la hauteur de la zone, sans vide ni déformation.
  const { whiteCount, keyPx } = keyboardLayout(noteStart, noteEnd, containerWidth);
  const svgWidthPx = Math.round(keyPx * whiteCount);
  const whiteHeight = Math.max(30, Math.round(NOTE_WHITE_WIDTH * (Math.max(containerHeight, 1) / keyPx)));
  const blackHeight = Math.round(whiteHeight * (NOTE_BLACK_HEIGHT / NOTE_WHITE_HEIGHT));

  const keyboardNotes = range(start, end).reduce(
    (keyboard, midi) => {
      const props = getNoteProps(midi, latin);
      if (props.alt) {
        return {
          width: keyboard.width,
          height: keyboard.height,
          markup: keyboard.markup + blackKeyTemplate(props, keyboard.width, colorNoteBlack, blackHeight),
        };
      }
      return {
        width: keyboard.width + NOTE_WHITE_WIDTH,
        height: keyboard.height,
        markup: whiteKeyTemplate(props, keyboard.width, colorNoteWhite, whiteHeight) + keyboard.markup,
      };
    },
    { width: 0, height: whiteHeight, markup: '' },
  );

  return `\
<svg width="${svgWidthPx}" height="100%" style="width: ${svgWidthPx}px" viewBox="0 0 ${keyboardNotes.width} ${keyboardNotes.height}" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="insetKey">
      <feOffset dx="0" dy="-7"/>
      <feGaussianBlur stdDeviation="5" result="offset-blur"/>
      <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
      <feFlood flood-color="black" flood-opacity="0.4" result="color"/>
      <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
      <feComponentTransfer in="shadow" result="shadow">
        <feFuncA type="linear" slope="5"/>
      </feComponentTransfer>
      <feBlend mode="soft-light" in="shadow" in2="SourceGraphic"/>
    </filter>
    <linearGradient id="whiteKey" gradientTransform="rotate(90)">
      <stop offset="0%"  stop-color="#bbbbbb" />
      <stop offset="8%"  stop-color="#eeeeee" />
      <stop offset="90%" stop-color="#ffffff" />
      <stop offset="91%" stop-color="#eeeeee" />
    </linearGradient>
    <linearGradient id="blackKey" gradientTransform="rotate(90)">
      <stop offset="0%"  stop-color="#000000" />
      <stop offset="16%" stop-color="#222222" />
      <stop offset="80%" stop-color="#444444" />
      <stop offset="80.5%" stop-color="#aaaaaa" />
      <stop offset="85%" stop-color="#222222" />
      <stop offset="91%" stop-color="#000000" />
    </linearGradient>
  </defs>
  <rect id="keyboard-bg" width="${keyboardNotes.width}" height="${keyboardNotes.height}" x="0" y="0" />
  <g id="board" transform="translate(0,0)">
    ${keyboardNotes.markup}
  </g>
  <rect id="board-border" width="${keyboardNotes.width}" height="${keyboardNotes.height}" x="0" y="0" />
</svg>`;
}

let currentPitch = 0;
let currentMod = 0;

export function setPitchWheel(value) {
  currentPitch = value;
}

export function setModWheel(value) {
  currentMod = value;
}

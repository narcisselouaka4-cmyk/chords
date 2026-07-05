import { chordName, slashName } from '../chord-engine/naming.js';

const ROMAN_TO_INTERVAL = {
  I: 0,
  II: 2,
  III: 4,
  IV: 5,
  V: 7,
  VI: 9,
  VII: 11,
};

const SCALE_DEGREE_QUALITIES = {
  major: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
  minor: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'],
};

export function parseRoman(roman) {
  const match = roman.match(/^([b#]?)([IViv]+)(.*)$/);
  if (!match) return null;

  const accidental = match[1];
  const degree = match[2].toUpperCase();
  let qualityHint = match[3]; // like '7', 'maj7', 'm7', etc.

  if (!ROMAN_TO_INTERVAL[degree]) return null;
  let rootPc = ROMAN_TO_INTERVAL[degree];

  if (accidental === 'b') rootPc = (rootPc - 1 + 12) % 12;
  if (accidental === '#') rootPc = (rootPc + 1) % 12;

  const isMinor = roman === roman.toLowerCase() && roman !== roman.toUpperCase();

  // Default quality based on scale degree in major
  if (!qualityHint) {
    const defaultQuality = SCALE_DEGREE_QUALITIES.major[Object.keys(ROMAN_TO_INTERVAL).indexOf(degree)];
    qualityHint = defaultQuality;
  }

  return { rootPc, symbol: qualityHint };
}

export function loadProgression(input, key = 'C') {
  const tokens = input
    .replace(/\s+/g, '')
    .split(/[-\s,]+/)
    .filter(Boolean);

  return tokens.map((token) => {
    const parsed = parseRoman(token);
    if (!parsed) return null;
    return {
      token,
      rootPc: parsed.rootPc,
      symbol: parsed.symbol,
      display: chordName(parsed.rootPc, parsed.symbol),
    };
  }).filter(Boolean);
}

export function renderProgression(container, progression, currentIndex = -1) {
  container.innerHTML = '';
  for (let i = 0; i < progression.length; i++) {
    const chord = progression[i];
    const el = document.createElement('div');
    el.className = 'progression-chord' + (i === currentIndex ? ' current' : '');
    el.textContent = `${chord.token}: ${chord.display}`;
    container.appendChild(el);
  }
}

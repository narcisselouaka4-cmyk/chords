// [Claude] — 2026-09-25 — Gammes et modes, pour « Qu'en penses-tu ? » : reconnaître
// la gamme d'une ligne jouée (gamme, lick, run, arpège) et la comparer à celle
// que l'élève dit jouer (« j'ai joué Ré dorien, c'est juste ? »).
//
// Une même série de notes appartient à plusieurs modes (Do majeur = Ré dorien =
// Sol mixolydien) : le centre tonal vient de l'accord qui sonne sous la ligne,
// sinon de la note d'arrivée, de départ ou la plus tenue.

const pcOf = (n) => ((n % 12) + 12) % 12;

/** Gammes connues : intervalles depuis la tonique ; `rank` = plus courant d'abord. */
export const SCALES = [
  { id: 'major', name: 'majeur (ionien)', intervals: [0, 2, 4, 5, 7, 9, 11], rank: 0 },
  { id: 'dorian', name: 'dorien', intervals: [0, 2, 3, 5, 7, 9, 10], rank: 1 },
  { id: 'phrygian', name: 'phrygien', intervals: [0, 1, 3, 5, 7, 8, 10], rank: 2 },
  { id: 'lydian', name: 'lydien', intervals: [0, 2, 4, 6, 7, 9, 11], rank: 2 },
  { id: 'mixolydian', name: 'mixolydien', intervals: [0, 2, 4, 5, 7, 9, 10], rank: 1 },
  { id: 'aeolian', name: 'mineur naturel (éolien)', intervals: [0, 2, 3, 5, 7, 8, 10], rank: 0 },
  { id: 'locrian', name: 'locrien', intervals: [0, 1, 3, 5, 6, 8, 10], rank: 2 },
  { id: 'harmonic-minor', name: 'mineur harmonique', intervals: [0, 2, 3, 5, 7, 8, 11], rank: 1 },
  { id: 'melodic-minor', name: 'mineur mélodique', intervals: [0, 2, 3, 5, 7, 9, 11], rank: 1 },
  { id: 'phrygian-dominant', name: 'phrygien dominant', intervals: [0, 1, 4, 5, 7, 8, 10], rank: 3 },
  { id: 'lydian-dominant', name: 'lydien b7', intervals: [0, 2, 4, 6, 7, 9, 10], rank: 3 },
  { id: 'altered', name: 'altérée (super-locrien)', intervals: [0, 1, 3, 4, 6, 8, 10], rank: 3 },
  { id: 'locrian-2', name: 'locrien #2', intervals: [0, 2, 3, 5, 6, 8, 10], rank: 3 },
  { id: 'major-pentatonic', name: 'pentatonique majeure', intervals: [0, 2, 4, 7, 9], rank: 0 },
  { id: 'minor-pentatonic', name: 'pentatonique mineure', intervals: [0, 3, 5, 7, 10], rank: 0 },
  { id: 'blues', name: 'blues', intervals: [0, 3, 5, 6, 7, 10], rank: 1 },
  { id: 'major-blues', name: 'blues majeure', intervals: [0, 2, 3, 4, 7, 9], rank: 2 },
  { id: 'bebop-dominant', name: 'bebop dominante', intervals: [0, 2, 4, 5, 7, 9, 10, 11], rank: 3 },
  { id: 'bebop-major', name: 'bebop majeure', intervals: [0, 2, 4, 5, 7, 8, 9, 11], rank: 3 },
  { id: 'whole-tone', name: 'par tons', intervals: [0, 2, 4, 6, 8, 10], rank: 2 },
  { id: 'diminished-hw', name: 'diminuée demi-ton / ton', intervals: [0, 1, 3, 4, 6, 7, 9, 10], rank: 2 },
  { id: 'diminished-wh', name: 'diminuée ton / demi-ton', intervals: [0, 2, 3, 5, 6, 8, 9, 11], rank: 2 },
  { id: 'chromatic', name: 'chromatique', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rank: 4 },
];

const BY_ID = new Map(SCALES.map((s) => [s.id, s]));
export const scaleById = (id) => BY_ID.get(id) || null;

const ROOT_NAMES_FR = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];

/** « Ré dorien », « La pentatonique mineure ». */
export function scaleLabel(rootPc, scaleId) {
  const scale = scaleById(scaleId);
  return scale ? `${ROOT_NAMES_FR[pcOf(rootPc)]} ${scale.name}` : '';
}

/** Classes de hauteur d'une gamme posée sur une tonique. */
export function scalePitchClasses(rootPc, scaleId) {
  const scale = scaleById(scaleId);
  return scale ? scale.intervals.map((i) => pcOf(rootPc + i)) : [];
}

/**
 * Gammes qui expliquent le mieux une ligne.
 * @param {{pc: number, weight?: number}[]|number[]} notes - classes de hauteur (ou MIDI) jouées, pondérées
 * @param {{tonicHints?: number[]}} [options] - toniques plausibles, de la plus sûre à la moins sûre
 *   (fondamentale de l'accord sous la ligne, note d'arrivée, de départ…)
 * @returns {{rootPc: number, scaleId: string, label: string, outside: number[], coverage: number}[]} du meilleur au moins bon
 */
export function fitScales(notes, { tonicHints = [] } = {}) {
  const weights = new Array(12).fill(0);
  for (const n of notes || []) {
    const pc = typeof n === 'number' ? pcOf(n) : pcOf(n.pc);
    weights[pc] += typeof n === 'number' ? 1 : n.weight ?? 1;
  }
  const used = weights.map((w, pc) => (w > 0 ? pc : null)).filter((pc) => pc != null);
  if (used.length < 3) return [];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const hints = tonicHints.filter(Number.isFinite).map(pcOf);
  const candidates = [];
  // Une note de passage hors gamme coûte moins que la tonique évidente (première,
  // dernière note, accord sous la ligne) : « Ré dorien avec un Sib de passage »
  // plutôt qu'une gamme de huit notes qui les contiendrait toutes.
  for (const scale of SCALES) {
    if (scale.id === 'chromatic') continue;
    for (let root = 0; root < 12; root += 1) {
      const set = new Set(scale.intervals.map((i) => pcOf(root + i)));
      const outside = used.filter((pc) => !set.has(pc));
      const outsideWeight = outside.reduce((sum, pc) => sum + weights[pc], 0) / total;
      const coverage = used.filter((pc) => set.has(pc)).length / set.size;
      const hintIndex = hints.indexOf(root);
      candidates.push({
        rootPc: root, scaleId: scale.id, label: scaleLabel(root, scale.id), outside, coverage,
        score: outside.length * 4 + outsideWeight * 10 - coverage * 3 + scale.rank * 0.4
          + (hintIndex < 0 ? 5 : hintIndex * 1.2) + (scale.intervals.length >= 8 ? 2 : 0),
      });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates.slice(0, 5).map(({ score, ...rest }) => rest);
  // Plus de trois notes hors de toute gamme : chromatique.
  if (best[0] && best[0].outside.length >= 3) {
    return [{ rootPc: hints[0] ?? used[0], scaleId: 'chromatic', label: 'chromatique', outside: [], coverage: used.length / 12 }, ...best];
  }
  return best;
}

// ── Gamme demandée dans une question ──

const FR_ROOTS = [
  ['do', 0], ['ré', 2], ['re', 2], ['mi', 4], ['fa', 5], ['sol', 7], ['la', 9], ['si', 11],
];
const EN_ROOTS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SCALE_WORDS = [
  [/pentatonique\s+mineure|minor\s+pentatonic|penta\s+mineure/, 'minor-pentatonic'],
  [/pentatonique(?:\s+majeure)?|major\s+pentatonic|pentatonic/, 'major-pentatonic'],
  [/blues\s+majeur|major\s+blues/, 'major-blues'],
  [/blues/, 'blues'],
  [/mineur\s+harmonique|harmonic\s+minor/, 'harmonic-minor'],
  [/mineur\s+m[ée]lodique|melodic\s+minor|jazz\s+minor/, 'melodic-minor'],
  [/phrygien\s+dominant|phrygian\s+dominant/, 'phrygian-dominant'],
  [/lydien\s+b7|lydian\s+dominant|lydian\s+b7/, 'lydian-dominant'],
  [/alt[ée]r[ée]e|super[\s-]?locri|altered/, 'altered'],
  [/locrien\s+#\s?2|locrian\s+#\s?2/, 'locrian-2'],
  [/bebop\s+(?:de\s+)?dominante|bebop\s+dominant/, 'bebop-dominant'],
  [/bebop\s+majeure?|bebop\s+major/, 'bebop-major'],
  [/par\s+tons|whole[\s-]?tone/, 'whole-tone'],
  [/diminu[ée]e?\s+ton\s*\/?\s*demi|whole[\s-]half/, 'diminished-wh'],
  [/diminu[ée]e|demi[\s-]?ton\s*\/?\s*ton|half[\s-]whole|octatoni/, 'diminished-hw'],
  [/chromatique|chromatic/, 'chromatic'],
  [/dorien|dorian/, 'dorian'],
  [/phrygien|phrygian/, 'phrygian'],
  // « mixolydien » contient « lydien » : il passe avant.
  [/mixolydien|mixolydian/, 'mixolydian'],
  [/lydien|lydian/, 'lydian'],
  [/[ée]olien|aeolian|mineur\s+naturel|natural\s+minor/, 'aeolian'],
  [/locrien|locrian/, 'locrian'],
  [/ionien|ionian/, 'major'],
  [/\bmineure?\b|\bminor\b/, 'aeolian'],
  [/\bmajeure?\b|\bmajor\b/, 'major'],
];

function accidentalOf(text) {
  if (/^\s*(?:#|dièse|diese|sharp)/.test(text)) return 1;
  if (/^\s*(?:b\b|bémol|bemol|flat)/.test(text)) return -1;
  return 0;
}

const noteName = (name) => (name.length === 1 ? EN_ROOTS[name] : FR_ROOTS.find(([n]) => n === name)?.[1]);

/**
 * Tonique écrite juste après ou avant un nom de gamme : « dorien de ré »,
 * « pentatonique mineure de la », « blues en do », « ré dorien », « sib
 * majeur », « D dorian ». Devant un nom (« la pentatonique », « a blues »),
 * « la » / « a » est un article, pas une note.
 */
function rootNear(text, index, length) {
  const word = text.slice(index, index + length);
  const after = text.slice(index + length, index + length + 24);
  const a = /^\s*(?:de|d'|en|sur|in|on)\s*(do|ré|re|mi|fa|sol|la|si|[a-g])\b(\s*(?:#|b\b|dièse|diese|bémol|bemol))?/i.exec(after);
  if (a) {
    const base = noteName(a[1].toLowerCase());
    if (base != null) return pcOf(base + accidentalOf(a[2] || ''));
  }
  const before = text.slice(Math.max(0, index - 24), index);
  const b = /(?:^|[\s'(])(do|ré|re|mi|fa|sol|la|si|[a-g])(\s*(?:#|b|dièse|diese|bémol|bemol))?\s*$/i.exec(before);
  if (b) {
    const name = b[1].toLowerCase();
    const isNoun = /^(?:pentatonique|pentatonic|blues|bebop|par|whole|diminu|chromati)/.test(word);
    if ((name === 'la' || name === 'a') && isNoun) return null;
    const base = noteName(name);
    if (base != null) return pcOf(base + accidentalOf(b[2] || ''));
  }
  return null;
}

/**
 * Gamme ou arpège annoncé dans une question (« j'ai joué la gamme de Ré dorien »,
 * « ma pentatonique mineure de La est juste ? », « arpège de Dm7 »).
 * @returns {{kind: 'scale', rootPc: number, scaleId: string, label: string}|{kind: 'arpeggio', chord: string}|null}
 */
export function extractScaleRequest(text) {
  const raw = String(text || '');
  const arp = /arp[eè]g(?:e|io)s?\s+(?:de\s+|d'|sur\s+|of\s+)?([A-G][#b]?[^\s,.;!?]*)/i.exec(raw);
  if (arp) return { kind: 'arpeggio', chord: arp[1] };
  const lower = raw.toLowerCase();
  for (const [pattern, scaleId] of SCALE_WORDS) {
    const m = pattern.exec(lower);
    if (!m) continue;
    // « mineur » / « majeur » seuls : seulement avec « gamme » ou « mode » (sinon
    // « un accord mineur » passerait pour une gamme).
    if ((scaleId === 'aeolian' || scaleId === 'major') && /^(?:mineure?|minor|majeure?|major)$/.test(m[0].trim()) && !/gamme|scale|mode/.test(lower)) continue;
    const rootPc = rootNear(lower, m.index, m[0].length);
    if (rootPc == null && scaleId !== 'chromatic' && scaleId !== 'whole-tone') continue;
    return { kind: 'scale', rootPc: rootPc ?? 0, scaleId, label: scaleLabel(rootPc ?? 0, scaleId) };
  }
  return null;
}

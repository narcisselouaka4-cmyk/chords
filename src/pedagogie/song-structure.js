// [Claude] — 2026-10-04 — Pédagogie IA : la STRUCTURE d'un morceau — sa boucle, ses parties,
// ses accords de passage et ses remplacements.
//
// Narcisse : « je lui ai demandé de me dire quelle était la progression. Il m'a sorti une
// flopée d'accords. […] Quand je demande la progression, je ne demande pas les accords que
// joue le pianiste du début jusqu'à la fin. Ce que je demande en réalité, c'est la structure
// de la musique. Donc en gros, la boucle. Est-ce qu'il y a quatre accords ? Est-ce qu'il y a
// cinq accords ? […] C'est après qu'il va devoir expliquer les accords de passage. »
//
// Le Copilote ne recevait que la grille relevée, changement par changement : il la
// recopiait. L'application calcule désormais la structure, de façon déterministe (comme les
// transferts, tutorial-transfer.js), et le Copilote l'explique :
//   1. les accords de la grille deviennent des « jetons » : un par changement d'harmonie
//      (Dsus4 puis D, ou Dm9 puis Dm7 : le même), relus d'après les notes du prof quand
//      l'étiquette ne les explique pas (chordForNotes) ;
//   2. un accord bref (moins de la moitié de la durée habituelle d'un accord, ou plus bref
//      que ses voisins dans une relation de passage connue) est un accord de passage ; les
//      autres portent la structure ;
//   3. la boucle est le motif d'accords structurels qui revient le plus (en temps), quelle
//      que soit la façon dont on y entre : compter les motifs résiste aux erreurs de
//      lecture, qui ne cassent que les motifs où elles tombent ;
//   4. la boucle est suivie tour par tour : un accord à la place d'un autre est un
//      remplacement, un accord en plus un ajout, un accord sauté un manque. Ce qui ne suit
//      plus la boucle forme une autre partie (cherchée de la même façon), ou reste hors
//      boucle (introduction, fin, passage libre).
// Les degrés sont pris dans la tonalité du tuto (ou devinée d'après les accords).
//
// Fonctions pures, testées dans test-song-structure.js.

import { parseChordName } from './note-roles.js';
import { chordFamily, chordForNotes, knownRelation, parseKey, relationLabel } from './tutorial-transfer.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const DIATONIC = {
  major: ['major', 'minor', 'minor', 'major', 'dominant', 'minor', 'halfdim'],
  minor: ['minor', 'halfdim', 'major', 'minor', 'dominant', 'major', 'dominant'],
};
// Degrés hors de la gamme.
const MAJOR_CHROMATIC = { 1: 'b2', 3: 'b3', 6: '#4', 8: 'b6', 10: 'b7' };
const MINOR_CHROMATIC = { 1: 'b2', 4: '#3', 6: '#4', 9: '#6', 11: '#7' };
// Familles d'une même harmonie : D, D7, Dsus4, Dadd9 (« other » : sans tierce).
const KIND = { major: 'M', dominant: 'M', sus: 'M', other: 'M', minor: 'm', halfdim: 'ø', dim: '°' };
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);
const FRENCH_KEYS = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const FRENCH_KEYS_SHARP = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
/** Un accord de moins de la moitié de la durée habituelle est un accord de passage. */
const PASSING_SHARE = 0.5;
/** Plus bref que ses voisins et dans une relation de passage connue : de passage aussi. */
const PASSING_RELATION_SHARE = 0.75;
/** Longueurs de boucle cherchées (en accords). */
const MIN_PERIOD = 2;
const MAX_PERIOD = 16;
/** Une boucle doit couvrir au moins cette part du temps de ce qu'on analyse. */
const MIN_LOOP_SHARE = 0.3;

const clock = (t) => {
  const s = Math.max(0, Math.floor((Number(t) || 0) + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Même harmonie (même fondamentale, même genre d'accord). */
const sameHarmony = (a, b) => a.rootPc === b.rootPc && KIND[a.family] === KIND[b.family];

/**
 * Les accords de la grille en jetons : un par changement d'harmonie, avec sa durée jusqu'au
 * jeton suivant. L'accord est relu d'après les notes de son attaque quand l'étiquette ne
 * les explique pas (une basse que l'étiquette ignore : F/D lu « Dm7 », Em7 lu « G6 »…).
 * @param {{start: number, end?: number, label: string}[]} chords - grille relevée
 * @param {{notes?: {midi: number, start: number, end?: number, hand?: string}[]|null}} [options]
 * @returns {object[]} jetons {rootPc, quality, bassPc, name, family, start, end, dur, names}
 */
export function harmonicTokens(chords, { notes = null } = {}) {
  const sorted = [...(chords || [])].filter((c) => Number.isFinite(c?.start)).sort((a, b) => a.start - b.start);
  const heardNotes = Array.isArray(notes) ? notes.filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start)) : [];
  const tokens = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const c = sorted[i];
    let chord = parseChordName(c.label || c.name);
    if (!chord) continue;
    const end = Number.isFinite(c.end) && c.end > c.start ? c.end : (sorted[i + 1]?.start ?? c.start + 0.5);
    if (heardNotes.length) {
      // L'attaque de l'accord : ce qui commence avec lui (la main gauche un peu plus tard).
      const attack = heardNotes.filter((n) => n.start >= c.start - 0.12 && n.start < Math.min(end, c.start + (n.hand === 'lh' ? 0.35 : 0.15)));
      const heard = attack.length >= 2 ? chordForNotes(chord, attack) : null;
      if (heard?.renamed) chord = { ...chord, rootPc: heard.rootPc, quality: heard.quality, bassPc: heard.bassPc ?? null, name: heard.name };
    }
    const piece = { name: chord.name, quality: chord.quality, bassPc: chord.bassPc ?? null, family: chordFamily(chord.quality), dur: end - c.start };
    const last = tokens[tokens.length - 1];
    // La même harmonie (Dsus4 puis D) ne fait qu'un jeton ; mais une basse qui bouge (D puis
    // D/F#, la basse qui marche vers Sol) en fait un autre.
    const lastBass = last ? last.pieces[last.pieces.length - 1].bassPc : null;
    if (last && sameHarmony(last, { rootPc: chord.rootPc, family: piece.family }) && (piece.bassPc ?? chord.rootPc) === (lastBass ?? last.rootPc)) {
      last.end = Math.max(last.end, end);
      last.pieces.push(piece);
      continue;
    }
    tokens.push({ rootPc: chord.rootPc, family: piece.family, start: c.start, end, pieces: [piece] });
  }
  return tokens.map((t, i) => {
    // Nommé par sa plus longue partie (D plutôt que Dsus4 s'il dure plus).
    const main = t.pieces.reduce((a, b) => (b.dur > a.dur ? b : a));
    const next = tokens[i + 1];
    return {
      rootPc: t.rootPc,
      quality: main.quality,
      bassPc: main.bassPc,
      name: main.name,
      family: main.family,
      start: t.start,
      end: t.end,
      dur: Math.max(0.05, (next ? next.start : t.end) - t.start),
      names: [...new Set(t.pieces.map((p) => p.name))],
    };
  });
}

/**
 * La tonalité : celle du tuto si elle est connue ; sinon devinée, celle où les accords
 * (pesés par leur durée) sont le plus dans la gamme, l'accord de tonique comptant plus.
 * @returns {{rootPc: number, minor: boolean, flats: boolean, guessed: boolean}}
 */
export function structureKey(keyText, tokens = []) {
  const given = parseKey(keyText);
  if (given) return { ...given, guessed: false };
  let best = null;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  for (let rootPc = 0; rootPc < 12; rootPc += 1) {
    for (const minor of [false, true]) {
      const steps = minor ? MINOR_STEPS : MAJOR_STEPS;
      const tonic = (t) => t && t.rootPc === rootPc && KIND[t.family] === (minor ? 'm' : 'M');
      let score = 0;
      for (const t of tokens) {
        const step = steps.indexOf(pcOf(t.rootPc - rootPc));
        if (step < 0) continue;
        const fits = KIND[DIATONIC[minor ? 'minor' : 'major'][step]] === KIND[t.family];
        score += t.dur * (fits ? 1 : 0.4) * (step === 0 && fits ? 1.5 : 1);
      }
      // Commencer ou finir sur l'accord de tonique : un indice de plus (Sol – Mi m – Do – Ré
      // est en Sol, pas en Mi mineur). À égalité, le majeur (essayé d'abord) reste.
      if (tonic(first)) score += 0.5 * first.dur;
      if (tonic(last)) score += 0.5 * last.dur;
      if (!best || score > best.score + 1e-9) best = { rootPc, minor, score };
    }
  }
  const rootPc = best ? best.rootPc : 0;
  const minor = best ? best.minor : false;
  return { rootPc, minor, flats: (minor ? FLAT_MINOR : FLAT_MAJOR).has(rootPc), guessed: true };
}

/** « Sol majeur », « Fa♯ mineur ». */
export function keyName(key) {
  if (!key) return '';
  const names = key.flats ? FRENCH_KEYS : FRENCH_KEYS_SHARP;
  return `${names[pcOf(key.rootPc)]} ${key.minor ? 'mineur' : 'majeur'}`;
}

/**
 * Le degré d'un accord dans la tonalité, tel qu'un pianiste gospel le dit : « 1 », « 6 »,
 * « 4 » ; hors gamme « b7 », « #4 » ; et sa couleur quand elle n'est pas celle de la gamme :
 * « 3(7) » (Mi7 en Do), « 4(m) » (Fa mineur en Do), « 7(°) ».
 */
export function degreeLabel(key, chord) {
  const interval = pcOf(chord.rootPc - key.rootPc);
  const steps = key.minor ? MINOR_STEPS : MAJOR_STEPS;
  const step = steps.indexOf(interval);
  const number = step >= 0 ? String(step + 1) : (key.minor ? MINOR_CHROMATIC : MAJOR_CHROMATIC)[interval];
  const expected = step >= 0 ? DIATONIC[key.minor ? 'minor' : 'major'][step] : 'major';
  const family = chord.family;
  if (family === expected || family === 'other' || family === 'sus' || (expected === 'dominant' && family === 'major')) return number;
  if (expected === 'halfdim' && family === 'dim') return number;
  const mark = { dominant: '7', major: 'maj', minor: 'm', halfdim: 'ø', dim: '°' }[family];
  return mark ? `${number}(${mark})` : number;
}

/**
 * Les accords de passage : brefs (moins de la moitié de la durée habituelle d'un accord),
 * ou plus brefs que leurs voisins dans une relation de passage connue avec l'accord qui
 * suit (diminué, dominante, substitution tritonique, glissement chromatique). Marque
 * `passing` sur chaque jeton ; rend la durée habituelle.
 */
export function markPassing(tokens) {
  const durs = tokens.map((t) => t.dur).sort((a, b) => a - b);
  const typical = durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.6))] : 1;
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    if (!next) {
      t.passing = false;
      return;
    }
    const neighbour = Math.max(prev ? prev.dur : 0, next.dur);
    const brief = t.dur < PASSING_SHARE * typical;
    const leading = t.dur < PASSING_RELATION_SHARE * typical && t.dur <= 0.6 * neighbour && (t.family === 'dim' || knownRelation(t, next));
    t.passing = brief || leading;
  });
  return typical;
}

/** Les accords qui portent la structure : les jetons non brefs, fusionnés si la même harmonie revient après un passage. */
function structuralChords(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.passing) continue;
    const last = out[out.length - 1];
    if (last && sameHarmony(last, t)) {
      last.end = t.end;
      last.dur = t.start + t.dur - last.start;
      continue;
    }
    out.push({ ...t });
  }
  return out;
}

/** Vrai si la suite n'est pas elle-même la répétition d'une suite plus courte. */
function isPrimitive(gram) {
  const p = gram.length;
  for (let d = 1; d < p; d += 1) {
    if (p % d) continue;
    if (gram.every((x, i) => x === gram[i % d])) return false;
  }
  return true;
}

/** La forme commune à toutes les rotations d'une suite (pour compter 1-6-4-5 et 4-5-1-6 ensemble). */
function canonicalRotation(gram) {
  let best = null;
  for (let r = 0; r < gram.length; r += 1) {
    const text = [...gram.slice(r), ...gram.slice(0, r)].join(',');
    if (best === null || text < best) best = text;
  }
  return best;
}

/**
 * La boucle : le motif d'accords qui revient au moins deux tours de suite et couvre ainsi le
 * plus de temps, à une rotation près (1-6-4-5 et 4-5-1-6 sont la même), le plus court quand
 * deux motifs couvrent presque autant. Ne compter que des tours qui se suivent empêche un
 * motif plus long d'« expliquer » un remplacement, et un bout de motif de passer pour une
 * boucle. D'abord des tours identiques ; sinon (grille lue au son, pleine d'erreurs) des tours
 * qui ne diffèrent que d'un accord (deux pour une boucle de 8 ou plus), la boucle étant
 * alors prise accord par accord à la majorité, et dite « probable » (`sure: false`).
 * null : rien ne revient.
 * @param {number[]} keys - les accords structurels (degrés, 0 à 11, depuis la tonique)
 * @param {number[]} durs - leurs durées
 * @returns {{period: number, pattern: number[], first: number, share: number, sure: boolean}|null}
 */
export function findLoop(keys, durs, { minPeriod = MIN_PERIOD, maxPeriod = MAX_PERIOD, minShare = MIN_LOOP_SHARE } = {}) {
  const exact = searchLoop(keys, durs, { minPeriod, maxPeriod, minShare, tolerance: 0 });
  const loose = searchLoop(keys, durs, { minPeriod: 4, maxPeriod, minShare: Math.max(minShare, 0.4), tolerance: 1 });
  let found = exact;
  let sure = Boolean(exact);
  if (exact && loose && canonicalRotation(foldPattern(exact.pattern)) === canonicalRotation(foldPattern(loose.pattern))) {
    // La même boucle, vue aussi à travers les tours mal lus : elle commence plus tôt, dure
    // plus longtemps ; deux tours identiques l'ont déjà établie.
    if (loose.share > exact.share) found = loose;
  } else if (loose && (!exact || loose.share > exact.share + 0.2)) {
    found = loose;
    sure = false;
  }
  if (!found) return null;
  const folded = foldPattern(found.pattern);
  return { ...found, sure, ...(folded.length < found.period ? { period: folded.length, pattern: folded } : {}) };
}

/** Le plus fréquent d'une liste de nombres (le premier rencontré à égalité). */
function majority(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (best === null || c > best[1]) best = [v, c];
  return best ? best[0] : null;
}

function searchLoop(keys, durs, { minPeriod, maxPeriod, minShare, tolerance, candidates = null }) {
  const n = keys.length;
  const total = durs.reduce((a, b) => a + b, 0) || 1;
  let best = null;
  for (let p = minPeriod; p <= Math.min(maxPeriod, Math.floor(n / 2)); p += 1) {
    const allowed = tolerance === 0 ? 0 : p >= 8 ? 2 * tolerance : tolerance;
    // Deux tours de suite : les accords de [i, i+p) et de [i+p, i+2p) (à `allowed` près).
    const ok = [];
    for (let i = 0; i + 2 * p <= n; i += 1) {
      let diff = 0;
      for (let k = 0; k < p && diff <= allowed; k += 1) if (keys[i + k] !== keys[i + p + k]) diff += 1;
      ok.push(diff <= allowed);
    }
    const classes = new Map();
    for (let a = 0; a < ok.length; a += 1) {
      if (!ok[a] || (a > 0 && ok[a - 1])) continue;
      let b = a;
      while (ok[b + 1]) b += 1;
      // Une suite de tours qui se ressemblent : la boucle, accord par accord, à la majorité.
      const last = b + 2 * p - 1;
      const pattern = [];
      for (let k = 0; k < p; k += 1) {
        const values = [];
        for (let i = a + k; i <= last; i += p) values.push(keys[i]);
        pattern.push(majority(values));
      }
      if (pattern[0] === pattern[p - 1] || !isPrimitive(pattern)) continue;
      const canon = canonicalRotation(pattern);
      let cls = classes.get(canon);
      if (!cls) {
        cls = { first: a, pattern, covered: new Uint8Array(n) };
        classes.set(canon, cls);
      }
      for (let k = a; k <= last; k += 1) cls.covered[k] = 1;
    }
    let bestOfLength = null;
    for (const cls of classes.values()) {
      let time = 0;
      for (let k = 0; k < n; k += 1) if (cls.covered[k]) time += durs[k];
      const share = time / total;
      if (share < minShare) continue;
      const found = { period: p, pattern: cls.pattern, first: cls.first, share, sure: tolerance === 0 };
      if (!bestOfLength || share > bestOfLength.share) bestOfLength = found;
      // Une longueur plus grande ne l'emporte que si elle couvre nettement plus.
      if (!best || share > best.share + 0.04) best = found;
    }
    if (bestOfLength && candidates) candidates.push(bestOfLength);
  }
  return best;
}

/**
 * [Claude] — 2026-10-04 — Les boucles possibles : pour chaque longueur, le motif qui revient
 * le plus (tours identiques, puis tours qui se ressemblent), ramené à sa plus petite boucle.
 */
export function loopCandidates(keys, durs, { minPeriod = MIN_PERIOD, maxPeriod = MAX_PERIOD, minShare = MIN_LOOP_SHARE } = {}) {
  const found = [];
  searchLoop(keys, durs, { minPeriod, maxPeriod, minShare, tolerance: 0, candidates: found });
  searchLoop(keys, durs, { minPeriod: 4, maxPeriod, minShare: Math.max(minShare, 0.4), tolerance: 1, candidates: found });
  const seen = new Set();
  const out = [];
  for (const c of found) {
    const pattern = foldPattern(c.pattern);
    const id = `${canonicalRotation(pattern)}|${c.sure}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...c, period: pattern.length, pattern: pattern.length < c.period ? pattern : c.pattern });
  }
  return out;
}

/**
 * Une longue boucle qui n'est que la même petite boucle répétée, avec une variante
 * minoritaire (1-6-4-5 · 1-6-4-5 · 1-6-2-5) : c'est la petite boucle, et la variante un
 * remplacement. Une alternance à parts égales (1-6-4-5 · 1-6-2-5) reste une boucle longue.
 */
export function foldPattern(pattern) {
  const n = pattern.length;
  for (let d = 2; d < n; d += 1) {
    if (n % d) continue;
    const chunks = [];
    for (let k = 0; k < n; k += d) chunks.push(pattern.slice(k, k + d).join(','));
    const counts = new Map();
    for (const c of chunks) counts.set(c, (counts.get(c) || 0) + 1);
    const [chunk, count] = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a));
    if (count > chunks.length / 2) {
      const small = chunk.split(',').map(Number);
      if (small[0] !== small[d - 1] && isPrimitive(small)) return small;
    }
  }
  return pattern;
}

/**
 * Suit la boucle tour par tour à partir de `from` : chaque accord structurel tient sa place
 * (`fit`), en remplace un autre (`sub`), s'ajoute (`extra`), ou un accord de la boucle manque
 * (`missing`). S'arrête quand la boucle ne tient plus (la moitié d'un tour de suite sans
 * accord à sa place) ; rend le dernier accord à sa place.
 */
function followLoop(items, pattern, from, to) {
  const p = pattern.length;
  const marks = [];
  let slot = 0;
  let misses = 0;
  let lastFit = from - 1;
  const limit = Math.max(2, Math.ceil(p / 2));
  for (let i = from; i < to; i += 1) {
    const key = items[i].key;
    if (key === pattern[slot]) {
      marks.push({ i, kind: 'fit', slot });
      slot = (slot + 1) % p;
      misses = 0;
      lastFit = i;
      continue;
    }
    const next = (slot + 1) % p;
    if (key === pattern[next] && (i + 1 >= to || items[i + 1].key === pattern[(slot + 2) % p])) {
      marks.push({ i: null, kind: 'missing', slot, at: items[i].start });
      marks.push({ i, kind: 'fit', slot: next });
      slot = (next + 1) % p;
      misses = 0;
      lastFit = i;
      continue;
    }
    misses += 1;
    if (misses >= limit) break;
    if (i + 1 < to && items[i + 1].key === pattern[slot]) {
      marks.push({ i, kind: 'extra', slot });
      continue;
    }
    marks.push({ i, kind: 'sub', slot });
    slot = (slot + 1) % p;
  }
  // Ce qui suit le dernier accord à sa place n'appartient plus à la boucle.
  return { marks: marks.filter((m) => m.i === null ? true : m.i <= lastFit), last: lastFit };
}

/**
 * Remonte la boucle avant `first` (le début du premier motif répété), avec les mêmes
 * tolérances qu'en avant : un accord remplacé, ajouté ou sauté. Rend le plus ancien accord à
 * sa place et sa place dans la boucle.
 */
function extendBackward(items, pattern, first, from) {
  const p = pattern.length;
  const at = (k) => pattern[((k % p) + p) % p];
  let slot = p - 1;
  let misses = 0;
  let start = first;
  let startSlot = 0;
  const limit = Math.max(2, Math.ceil(p / 2));
  for (let i = first - 1; i >= from; i -= 1) {
    const key = items[i].key;
    if (key === at(slot)) {
      start = i;
      startSlot = ((slot % p) + p) % p;
      slot -= 1;
      misses = 0;
      continue;
    }
    if (key === at(slot - 1) && (i - 1 < from || items[i - 1].key === at(slot - 2))) {
      start = i;
      startSlot = (((slot - 1) % p) + p) % p;
      slot -= 2;
      misses = 0;
      continue;
    }
    misses += 1;
    if (misses >= limit) break;
    if (i - 1 >= from && items[i - 1].key === at(slot)) continue;
    slot -= 1;
  }
  return { start, slot: startSlot };
}

/** Le nom le plus fréquent d'une liste (le premier à égalité). */
function mostCommon(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  let best = null;
  for (const [name, count] of counts) if (!best || count > best.count) best = { name, count };
  return best?.name ?? null;
}

/** Une partie qui suit une boucle : ses accords, ses tours, ses remplacements, ajouts et manques. */
function loopSection(items, pattern, from, to, key) {
  const p = pattern.length;
  const followed = followLoop(items, pattern, from, to);
  let { marks, last } = followed;
  // Un dernier tour à peine commencé (moins de la moitié de ses accords) : c'est la fin du
  // morceau (Do puis Sol, longuement), pas la boucle.
  const completes = marks.filter((m) => m.i !== null && (m.kind === 'fit' || m.kind === 'sub') && m.slot === p - 1);
  const lastComplete = completes.length ? completes[completes.length - 1].i : null;
  if (lastComplete !== null && lastComplete < last) {
    const after = marks.filter((m) => m.i !== null && m.i > lastComplete && m.kind === 'fit').length;
    if (after < Math.ceil(p / 2)) {
      last = lastComplete;
      marks = marks.filter((m) => (m.i === null ? true : m.i <= last));
    }
  }
  const slots = pattern.map(() => []);
  const cycles = [];
  const subs = [];
  const extras = [];
  const missing = [];
  let cycleStart = null;
  const timeline = [];
  for (const m of marks) {
    const item = m.i === null ? null : items[m.i];
    if ((m.kind === 'fit' || m.kind === 'sub') && m.slot === 0) {
      cycleStart = item.start;
      cycles.push(cycleStart);
    }
    timeline.push({ kind: m.kind, slot: m.slot, at: item ? item.start : m.at, chord: item, cycle: Math.max(1, cycles.length) });
    if (m.kind === 'fit') slots[m.slot].push(item);
    else if (m.kind === 'sub') subs.push({ slot: m.slot, at: item.start, chord: item, cycle: Math.max(1, cycles.length) });
    else if (m.kind === 'extra') extras.push({ slot: m.slot, at: item.start, chord: item, cycle: Math.max(1, cycles.length) });
    else if (m.kind === 'missing') missing.push({ slot: m.slot, at: m.at, cycle: Math.max(1, cycles.length) });
  }
  const start = items[from].start;
  const end = items[last].start + items[last].dur;
  // Tours : de l'entrée sur le premier accord de la boucle au suivant (le premier, s'il
  // commence au milieu, compte quand même).
  const lengths = cycles.slice(1).map((t, k) => t - cycles[k]);
  const sortedLengths = [...lengths].sort((a, b) => a - b);
  const secondsPerCycle = sortedLengths.length ? sortedLengths[Math.floor(sortedLengths.length / 2)] : end - start;
  const loop = pattern.map((k, slot) => {
    const played = slots[slot];
    const chord = played.length ? played[0] : items.slice(from, last + 1).find((x) => x.key === k);
    const family = mostCommon(played.map((x) => x.family)) || chord?.family || 'major';
    return {
      interval: k,
      degree: degreeLabel(key, { rootPc: key.rootPc + k, family }),
      name: mostCommon(played.map((x) => x.name)) || chord?.name || '?',
      family,
      played: played.length,
    };
  });
  return {
    kind: 'loop',
    start,
    end,
    from,
    to: last,
    pattern: loop,
    period: p,
    cycles: Math.max(1, cycles.length),
    secondsPerCycle,
    timeline: timeline.map((x) => ({
      kind: x.kind,
      at: x.at,
      cycle: x.cycle,
      expected: loop[x.slot],
      ...(x.chord ? { name: x.chord.name, degree: degreeLabel(key, x.chord), dur: x.chord.dur } : {}),
    })),
    subs: subs.map((s) => ({ ...s, expected: loop[s.slot], degree: degreeLabel(key, s.chord), name: s.chord.name })),
    extras: extras.map((x) => ({ ...x, degree: degreeLabel(key, x.chord), name: x.chord.name })),
    missing: missing.map((x) => ({ ...x, expected: loop[x.slot] })),
  };
}

/** Analyse une plage d'accords structurels : une boucle (et ce qui l'entoure), ou rien de répété. */
/**
 * Place une boucle possible dans la plage : remontée avant son premier motif répété,
 * introduction écartée, puis suivie tour par tour. Rend la partie et sa note : la part du
 * temps où les accords sont à leur place, moins les écarts (remplacements, ajouts, manques).
 */
function placeLoop(items, candidate, from, to, key) {
  let pattern = candidate.pattern;
  const p = pattern.length;
  // Les tours d'avant le premier motif répété (mal lus, un accord sauté…) : le pianiste
  // était déjà dans la boucle. La boucle se lit dans l'ordre où il la joue.
  const back = extendBackward(items, pattern, from + candidate.first, from);
  let first = back.start;
  pattern = [...pattern.slice(back.slot), ...pattern.slice(0, back.slot)];
  // Un premier accord tenu bien plus longtemps qu'aux tours suivants : une introduction.
  const later = [];
  for (let i = first + p; i < to; i += p) if (items[i].key === pattern[0]) later.push(items[i].dur);
  later.sort((a, b) => a - b);
  if (later.length && items[first].dur >= 1.75 * later[Math.floor(later.length / 2)]) {
    first += 1;
    pattern = [...pattern.slice(1), pattern[0]];
  }
  const section = loopSection(items, pattern, first, to, key);
  section.sure = candidate.sure !== false;
  // Une boucle qui ne tient pas deux tours n'en est pas une.
  if (section.to - first + 1 < 2 * p) return null;
  // La note, comme une description à faire tenir : chaque accord à sa place compte pour un,
  // chaque écart coûte un, et chaque accord de la boucle à retenir un et quart. Une boucle
  // plus longue doit donc épargner plus d'écarts qu'elle n'ajoute d'accords : une variante
  // régulière (un tour sur deux, longtemps) en fait une boucle longue, des erreurs de lecture
  // éparses restent des écarts.
  const fits = section.timeline.filter((x) => x.kind === 'fit').length;
  const gaps = section.timeline.length - fits;
  return { section, first, score: fits - gaps - 1.25 * p };
}

/** Analyse une plage d'accords structurels : une boucle (et ce qui l'entoure), ou rien de répété. */
function analyzeRange(items, from, to, key, depth = 0) {
  if (to - from <= 0) return [];
  const free = () => [{ kind: 'free', from, to: to - 1, start: items[from].start, end: items[to - 1].start + items[to - 1].dur }];
  if (to - from < 4 || depth > 4) return free();
  const keys = items.slice(from, to).map((x) => x.key);
  const durs = items.slice(from, to).map((x) => x.dur);
  let best = null;
  for (const candidate of loopCandidates(keys, durs)) {
    const placed = placeLoop(items, candidate, from, to, key);
    if (!placed) continue;
    const better = !best || placed.score > best.score + 0.5
      || (Math.abs(placed.score - best.score) <= 0.5 && (candidate.period < best.period || (candidate.period === best.period && candidate.sure && !best.sure)));
    if (better) best = { ...placed, period: candidate.period, sure: candidate.sure };
  }
  if (!best) return free();
  return [
    ...analyzeRange(items, from, best.first, key, depth + 1),
    best.section,
    ...analyzeRange(items, best.section.to + 1, to, key, depth + 1),
  ];
}

/**
 * Les accords de passage d'une partie, regroupés : avant quel accord de la boucle, lequel,
 * ce qu'il fait par rapport à l'arrivée, combien de fois.
 */
function sectionPassing(tokens, section, items, key) {
  const groups = new Map();
  const list = [];
  tokens.forEach((t, i) => {
    if (!t.passing || t.start < section.start - 0.01 || t.start >= section.end) return;
    // L'arrivée : le premier accord structurel qui suit.
    const arrival = tokens.slice(i + 1).find((x) => !x.passing);
    if (!arrival) return;
    const arrivalItem = items.find((x) => x.start <= arrival.start + 0.01 && x.start + x.dur > arrival.start + 0.01);
    const arrivalSlot = section.pattern.findIndex((s) => s.interval === pcOf(arrival.rootPc - key.rootPc));
    const interval = pcOf(t.rootPc - arrival.rootPc);
    const groupKey = `${arrivalSlot}|${interval}|${t.family}`;
    let g = groups.get(groupKey);
    if (!g) {
      const step = { interval, family: t.family, bassInterval: t.bassPc != null ? pcOf(t.bassPc - arrival.rootPc) : null };
      g = {
        before: arrivalSlot >= 0 ? section.pattern[arrivalSlot] : { degree: degreeLabel(key, arrival), name: arrival.name },
        names: [],
        degree: degreeLabel(key, t),
        relation: relationLabel(step, arrival.family),
        times: [],
        inLoop: Boolean(arrivalItem) && arrivalSlot >= 0,
      };
      groups.set(groupKey, g);
    }
    g.names.push(t.name);
    g.times.push(t.start);
    list.push({ at: t.start, name: t.name, degree: degreeLabel(key, t), before: g.before, relation: g.relation });
  });
  return {
    list,
    groups: [...groups.values()]
      .map((g) => ({ ...g, name: mostCommon(g.names), count: g.times.length }))
      .sort((a, b) => b.count - a.count || a.times[0] - b.times[0]),
  };
}

/**
 * La structure d'un morceau : tonalité, parties (boucles et passages hors boucle), et pour
 * chaque boucle ses accords (degrés et noms), ses tours, ses remplacements, ses accords de
 * passage.
 * @param {{chords: object[], notes?: object[]|null, key?: string|null}} input
 * @returns {{key: object, sections: object[], tokens: number, passing: number, share: number}|null}
 */
export function songStructure({ chords = [], notes = null, key = null } = {}) {
  const tokens = harmonicTokens(chords, { notes });
  if (tokens.length < 2) return null;
  markPassing(tokens);
  const theKey = structureKey(key, tokens.filter((t) => !t.passing));
  const items = structuralChords(tokens).map((t) => ({ ...t, key: pcOf(t.rootPc - theKey.rootPc) }));
  if (!items.length) return null;
  const sections = analyzeRange(items, 0, items.length, theKey);
  // Des lettres par boucle (la même boucle qui revient garde sa lettre).
  const letters = new Map();
  for (const s of sections) {
    if (s.kind !== 'loop') continue;
    const canon = canonicalRotation(s.pattern.map((x) => x.interval));
    if (!letters.has(canon)) letters.set(canon, String.fromCharCode(65 + letters.size));
    s.label = letters.get(canon);
    const passing = sectionPassing(tokens, s, items, theKey);
    s.passing = passing.groups;
    s.passingList = passing.list;
  }
  sections.forEach((s, i) => {
    if (s.kind !== 'free') return;
    s.place = i === 0 ? 'intro' : i === sections.length - 1 ? 'fin' : 'passage';
    s.chords = items.slice(s.from, s.to + 1).map((x) => ({ degree: degreeLabel(theKey, x), name: x.name, at: x.start }));
  });
  const total = items.reduce((sum, x) => sum + x.dur, 0) || 1;
  const looped = sections.filter((s) => s.kind === 'loop').reduce((sum, s) => sum + (s.end - s.start), 0);
  return {
    key: { ...theKey, name: keyName(theKey) },
    sections,
    tokens: tokens.length,
    passing: tokens.filter((t) => t.passing).length,
    share: Math.min(1, looped / total),
  };
}

/** « 1 – 6 – 4 – 5 » et « G – Em – C – D ». */
const loopDegrees = (s) => s.pattern.map((x) => x.degree).join(' – ');
const loopNames = (s) => s.pattern.map((x) => x.name).join(' – ');

/** « 1:12 et 1:44 » (trois moments au plus). */
function moments(times) {
  const shown = times.slice(0, 3).map(clock);
  const more = times.length > 3 ? ` (et ${times.length - 3} autre${times.length > 4 ? 's' : ''} fois)` : '';
  return `${shown.length > 1 ? `${shown.slice(0, -1).join(', ')} et ${shown[shown.length - 1]}` : shown[0]}${more}`;
}

/**
 * Le bloc « Structure du morceau » du contexte du Copilote.
 * @param {object|null} structure - songStructure()
 * @returns {string[]}
 */
export function structureLines(structure, { maxPassing = 5 } = {}) {
  if (!structure) return [];
  const out = ['', '## Structure du morceau (calculée par l\'application d\'après la grille relevée, qui peut contenir des erreurs de lecture)'];
  out.push(`Tonalité : ${structure.key.name}${structure.key.guessed ? ' (devinée d\'après les accords)' : ''}.`);
  const loops = structure.sections.filter((s) => s.kind === 'loop');
  if (!loops.length) {
    const firsts = structure.sections.flatMap((s) => s.chords || []).slice(0, 12);
    out.push('Pas de boucle : la suite des accords principaux ne se répète pas.');
    if (firsts.length) out.push(`Accords principaux, dans l'ordre : ${firsts.map((c) => `${c.degree} (${c.name})`).join(' – ')}${structure.sections.flatMap((s) => s.chords || []).length > 12 ? ' – …' : ''}.`);
    return out;
  }
  const lettered = new Set(loops.map((s) => s.label)).size > 1;
  for (const s of structure.sections) {
    if (s.kind === 'free') {
      const what = { intro: 'Introduction', fin: 'Fin', passage: 'Passage hors boucle' }[s.place];
      const shown = s.chords.slice(0, 12).map((c) => `${c.degree} (${c.name})`).join(' – ');
      out.push(`${what} (${clock(s.start)} → ${clock(s.end)}) : ${shown}${s.chords.length > 12 ? ` – … (${s.chords.length} accords)` : ''}.`);
      continue;
    }
    const title = lettered ? `Partie ${s.label}` : 'Boucle';
    const unsure = s.sure ? '' : ' (probable : les tours relevés diffèrent un peu, la grille contient sans doute des erreurs de lecture)';
    out.push(`${title} — ${s.period} accords : ${loopDegrees(s)} (${loopNames(s)}) ; environ ${Math.round(s.secondsPerCycle)} s par tour ; ${s.cycles} tour${s.cycles > 1 ? 's' : ''} (${clock(s.start)} → ${clock(s.end)})${unsure}.`);
    // Remplacements : un accord joué à la place d'un accord de la boucle.
    const subs = new Map();
    for (const r of s.subs) {
      const k = `${r.slot}|${r.degree}`;
      if (!subs.has(k)) subs.set(k, { ...r, times: [] });
      subs.get(k).times.push(r.at);
    }
    for (const r of [...subs.values()].sort((a, b) => b.times.length - a.times.length).slice(0, 4)) {
      out.push(`  Remplacement : le ${r.expected.degree} (${r.expected.name}) remplacé par ${r.name} (${r.degree}), à ${moments(r.times)}${r.times.length === 1 ? ' (une seule fois : peut-être une erreur de lecture)' : ''}.`);
    }
    for (const x of s.extras.slice(0, 3)) out.push(`  Accord ajouté : ${x.name} (${x.degree}) avant le ${x.expected?.degree ?? s.pattern[x.slot].degree} à ${clock(x.at)}.`);
    for (const m of s.missing.slice(0, 3)) out.push(`  Accord sauté : le ${m.expected.degree} (${m.expected.name}) vers ${clock(m.at)}.`);
    if (s.passing.length) {
      const list = s.passing.slice(0, maxPassing).map((g) => `${g.name} avant le ${g.before.degree} (${g.before.name}) : ${g.relation}, ${g.count === 1 ? `une fois (${clock(g.times[0])})` : `${g.count} fois`}`);
      out.push(`  Accords de passage : ${list.join(' ; ')}${s.passing.length > maxPassing ? ` ; et ${s.passing.length - maxPassing} autre${s.passing.length - maxPassing > 1 ? 's' : ''}` : ''}.`);
    }
  }
  return out;
}

const PLACE_WORDS = { intro: 'l\'introduction', fin: 'la fin', passage: 'un passage hors boucle' };

/**
 * [Claude] — 2026-10-04 — Le passage dont parle le pianiste (« ici »), situé dans la
 * structure : quelle partie, quels tours, et chaque accord à sa place — de la boucle,
 * remplacé, ajouté —, puis les accords de passage qui y tombent. Pour que le Copilote
 * distingue ce qui porte la structure, ce qui y mène et ce qui la remplace.
 * @param {object|null} structure - songStructure()
 * @param {{start: number, end: number}} window
 * @returns {string[]}
 */
export function structureMomentLines(structure, { start, end } = {}) {
  if (!structure || !Number.isFinite(start) || !Number.isFinite(end)) return [];
  const out = [];
  const lettered = new Set(structure.sections.filter((s) => s.kind === 'loop').map((s) => s.label)).size > 1;
  for (const s of structure.sections) {
    if (s.end <= start || s.start >= end) continue;
    if (s.kind === 'free') {
      const shown = s.chords.slice(0, 8).map((c) => `${c.degree} (${c.name})`).join(' – ');
      out.push(`Dans la structure : ${PLACE_WORDS[s.place]} (${shown}${s.chords.length > 8 ? ' – …' : ''}), hors boucle.`);
      continue;
    }
    const inside = s.timeline.filter((x) => x.at >= start - 0.01 && x.at < end);
    const tours = [...new Set(inside.map((x) => x.cycle))];
    const where = tours.length ? `, tour${tours.length > 1 ? `s ${tours[0]} à ${tours[tours.length - 1]}` : ` ${tours[0]}`} sur ${s.cycles}` : '';
    out.push(`Dans la structure : ${lettered ? `partie ${s.label}, ` : ''}boucle ${loopDegrees(s)} (${loopNames(s)})${where}.`);
    const say = (x) => {
      if (x.kind === 'fit') return `${clock(x.at)} le ${x.expected.degree} (${x.name})`;
      if (x.kind === 'sub') return `${clock(x.at)} le ${x.expected.degree} remplacé par ${x.name} (${x.degree})`;
      if (x.kind === 'extra') return `${clock(x.at)} ${x.name} (${x.degree}) ajouté`;
      return `${clock(x.at)} le ${x.expected.degree} (${x.expected.name}) sauté`;
    };
    if (inside.length && inside.length <= 8) {
      out.push(`Accords de la boucle ici : ${inside.map(say).join(' · ')}.`);
    } else if (inside.length) {
      // Un long passage : seulement ce qui s'écarte de la boucle.
      const odd = inside.filter((x) => x.kind !== 'fit');
      out.push(odd.length
        ? `Écarts à la boucle ici : ${odd.slice(0, 8).map(say).join(' · ')}${odd.length > 8 ? ' · …' : ''} (les autres accords sont à leur place).`
        : 'Ici, tous les accords de la boucle sont à leur place.');
    }
    const passing = (s.passingList || []).filter((x) => x.at >= start - 0.01 && x.at < end);
    if (passing.length) {
      out.push(`Accords de passage ici : ${passing.map((x) => `${clock(x.at)} ${x.name} avant le ${x.before.degree} (${x.before.name}) : ${x.relation}`).join(' ; ')}.`);
    }
  }
  return out;
}

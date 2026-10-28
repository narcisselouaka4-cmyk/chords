// [Claude] — 2026-10-16 — Pédagogie IA : ce que le prof DIT de sa théorie — la tonalité qu'il annonce,
// les degrés qu'il nomme, les mots qu'il emploie.
//
// Mesuré sur « Passing chords… Drop 2 Inner Voicings » : le prof annonce « the key of C sharp » et
// « from the chord I to the chord V », il le répète treize fois ; le moteur, lui, devinait La♭ majeur
// d'après les accords relevés et affichait « 4 → 1 ». Le guide disait donc le contraire du tuto.
// Narcisse : « en gros le guide tuto ne nous aide pas du tout à comprendre la vidéo ».
//
// La parole est la source la plus sûre sur la tonalité et les degrés : le prof sait ce qu'il joue.
// Ce module ne fait que la LIRE — aucune déduction harmonique. Ce qu'il n'annonce pas reste au moteur
// (« Sabaoth », « Cory Henry » : rien de dit, rien d'inventé).
//
// Trois langues, parce que la bibliothèque de Narcisse en compte trois (anglais, français, espagnol).
//
// Module PUR (aucune dépendance au navigateur), testé par test-spoken-theory.js.

const pcOf = (n) => ((n % 12) + 12) % 12;

const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SOLFEGE_PC = { do: 0, ut: 0, ré: 2, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Le texte d'une tonalité, tel que `structureKey` l'attend : « Db », « Am ». */
export const keyText = (pc, minor) => `${KEY_NAMES[pcOf(pc)]}${minor ? 'm' : ''}`;

const sharpen = (pc, acc) => {
  const a = String(acc || '').toLowerCase();
  if (a === 'sharp' || a === '#' || a === '♯' || a === 'dièse' || a === 'diese' || a === 'sostenido') return pc + 1;
  if (a === 'flat' || a === 'b' || a === '♭' || a === 'bémol' || a === 'bemol') return pc - 1;
  return pc;
};
const isMinor = (word) => /^(?:min|m$|mineur|menor)/i.test(String(word || '').trim());

// ── Tonalité annoncée ────────────────────────────────────────────────────────
// Mesuré : « the key of C sharp », « key of Db », « in F major », « now I'm in A-flat major »,
// « en ré bémol majeur », « tonalité de sol », « en la tonalidad de sol menor ».
const KEY_PATTERNS = [
  // « key of C sharp minor » — la forme la plus franche, lettre en minuscule tolérée.
  { re: /\bkey of\s+([A-Ga-g])\s*[-\s]?\s*(sharp|flat|#|b|♭|♯)?\s*(major|minor|min|m)?\b/g, letter: 1, acc: 2, mode: 3 },
  // « in F major », « in A-flat minor » : la lettre doit être EN MAJUSCULE, sinon « in a major way »
  // est lu comme « en La majeur » (mesuré : faux positif, les transcriptions écrivent « F major »).
  { re: /\bin\s+([A-G])\s*[-\s]?\s*(sharp|flat|#|b|♭|♯)?\s*(major|minor|min)\b/g, letter: 1, acc: 2, mode: 3 },
  { re: /\btonalit[ée] (?:de |d')\s*(do|ut|ré|re|mi|fa|sol|la|si)\s*(bémol|bemol|dièse|diese)?\s*(majeur|mineur)?\b/gi, letter: 1, acc: 2, mode: 3, solfege: true },
  // « en ré bémol », « en sol mineur » : exiger l'altération ou le mode, sinon « en mi-chemin ».
  { re: /\ben\s+(do|ut|ré|re|mi|fa|sol|la|si)\s+(bémol|bemol|dièse|diese)\s*(majeur|mineur)?\b/gi, letter: 1, acc: 2, mode: 3, solfege: true },
  { re: /\ben\s+(do|ut|ré|re|mi|fa|sol|la|si)\s+(majeur|mineur)\b/gi, letter: 1, mode: 2, solfege: true },
  { re: /\b(?:tonalidad|tono) de\s+(do|re|mi|fa|sol|la|si)\s*(bemol|sostenido)?\s*(mayor|menor)?\b/gi, letter: 1, acc: 2, mode: 3, solfege: true },
];

// ── Degrés nommés ────────────────────────────────────────────────────────────
// Mesuré : « chord I », « chord 2 », « the 5 chord », « the 5 », « my 5 », « degré 4 », « 6, 5 chord
// progression », « 2-5-1 ». Jamais un « I » nu : en anglais c'est le pronom le plus courant.
const DEGREE_PATTERNS = [
  /\b(?:chords?|accords?|degr[ée]e?s?|grados?)\s+(?:of\s+|de\s+|du\s+)?([1-7]|i{1,3}|iv|vi{0,2}|v)\b/gi,
  /\b([1-7]|I{1,3}|IV|VI{0,2}|V)\s+(?:chord|accord)\b/g,
  /\b(?:the|my|your|le|la|du|mon|ton|votre|el|su)\s+([1-7])\b/gi,
];
/** « 2-5-1 », « 6, 5 », « 6 2 5 » dits d'affilée : une suite de degrés — peut-être une progression. */
const PROGRESSION_RE = /\b([1-7])\s*(?:[-–—,]|\s)\s*([1-7])(?:\s*(?:[-–—,]|\s)\s*([1-7]))?(?:\s*(?:[-–—,]|\s)\s*([1-7]))?\b/g;
/**
 * … mais une suite de chiffres n'est une progression ANNONCÉE que si un mot musical la suit.
 * Mesuré sur la vidéo de salsa : « 1, 2, 3, 4 » revient cinq fois — c'est le décompte avant de
 * jouer, et le Copilote l'aurait présenté comme une progression annoncée par le prof. « It's a
 * 6, 5 chord progression » et « a 2-5-1 turnaround », eux, se nomment.
 */
const MUSICAL_AFTER = /^[\s,]*(?:chord|chords|progression|progressions|changes|turn\s?around|cadence|movement|move|accord|accords|mouvement|cadencia|acorde|acordes|progresi[óo]n)\b/i;
const AFTER_WINDOW = 26;
/**
 * « from the chord I to the chord V » : la façon dont un prof annonce le mouvement qu'il enseigne.
 * Mesuré sur « Passing chords… Drop 2 » — il le dit quatre fois, de quatre façons : « a simple
 * transition from the chord I to the chord V », « from going from your 1 chord to your chord V »,
 * « whenever you have to go from a 1 to a 5 », « going from your chord I to your chord V ».
 */
const DEG = '(?:[1-7]|i{1,3}|iv|vi{0,2}|v)';
const TRANSITION_PATTERNS = [
  new RegExp(`\\bfrom\\s+(?:the|my|your|a|an)?\\s*(?:chord\\s+)?(${DEG})\\b[^.?!]{0,40}?\\bto\\s+(?:the|my|your|a|an)?\\s*(?:chord\\s+)?(${DEG})\\b`, 'gi'),
  // « aller du 1 au 6 », « du 2 vers le 5 », « del 1 al 4 »
  /\bdu\s+([1-7])\s+(?:au|vers\s+le|jusqu'au)\s+([1-7])\b/gi,
  /\bdel?\s+([1-7])\s+al\s+([1-7])\b/gi,
];

// ── Vocabulaire employé ──────────────────────────────────────────────────────
// Narcisse : « ce n'est pas à moi de les donner, mais à toi de les implémenter à travers le jeu du
// pianiste ». Mieux encore quand il le dit lui-même : c'est SON mot qui s'affiche.
const TERM_PATTERNS = [
  ['drop 2', /\bdrop\s*(?:two|2|to)\b/i],
  ['accord de passage', /\bpassing\s+chords?\b|\baccords?\s+de\s+passage\b|\bacordes?\s+de\s+paso\b/i],
  ['notes de passage', /\bgrace\s+notes?\b|\bnotes?\s+de\s+passage\b/i],
  ['upper structure', /\bupper\s+structures?\b/i],
  ['renversement', /\binversions?\b|\brenversements?\b|\binversi[óo]n\b/i],
  ['chromatisme', /\bchromatic\w*\b|\bchromatisme\b|\bchromatiques?\b|\bcrom[áa]tic\w*\b/i],
  ['marche harmonique', /\bwalk(?:ing)?\s*(?:up|down)\b|\bmarche\s+harmonique\b/i],
  ['substitution tritonique', /\btritone\s+sub\w*\b|\bsubstitution\s+tritonique\b/i],
  ['triton', /\btritone\b|\btriton\b/i],
  ['voicing', /\bvoicings?\b/i],
  ['tensions', /\btensions?\b|\bextensions?\b/i],
  ['gamme diminuée', /\bdiminished\s+scale\b|\bgamme\s+diminu\w+\b/i],
  ['tourne', /\bturn\s?arounds?\b|\btourne\b/i],
  ['lick', /\blicks?\b/i],
  ['emprunt', /\bkey\s+borrowing\b|\bborrow\w*\b|\bemprunt\w*\b/i],
  ['substitution', /\bsubstitut\w*\b|\bsustituci[óo]n\b/i],
  ['pédale', /\bsustain\s+pedal\b|\bp[ée]dale\b/i],
  ['anatole', /\banatole\b/i],
  ['quartes', /\bfourths?\b|\bquartes?\b/i],
  ['basse qui monte', /\bbass\s+(?:walk|run)\w*\b|\bbasse\s+qui\s+monte\b/i],
];

/** L'instant d'un mot dans une ligne parlée : interpolé sur sa durée (une ligne peut durer 40 s). */
function instantOf(line, index) {
  const start = Number(line.start);
  const end = Number(line.end);
  const len = String(line.text || '').length || 1;
  if (!Number.isFinite(start)) return null;
  if (!Number.isFinite(end) || end <= start) return start;
  return Math.round((start + (end - start) * Math.min(1, Math.max(0, index / len))) * 100) / 100;
}

/**
 * Ce que le prof dit de sa théorie, ligne par ligne.
 * @param {{start: number, end?: number, text: string}[]} lines - la parole transcrite
 * @returns {{keys: object[], degrees: object[], terms: object[], progressions: object[],
 *   degreeCount: Record<string, number>}}
 */
export function readSpokenTheory(lines = []) {
  const keys = [];
  const degrees = [];
  const terms = [];
  const progressions = [];
  for (const line of lines || []) {
    const text = String(line?.text || '');
    if (!text.trim() || !Number.isFinite(Number(line?.start))) continue;
    for (const p of KEY_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) {
        const raw = String(m[p.letter] || '').toLowerCase();
        const base = p.solfege ? SOLFEGE_PC[raw] : LETTER_PC[raw];
        if (base == null) continue;
        keys.push({
          at: instantOf(line, m.index),
          pc: pcOf(sharpen(base, p.acc ? m[p.acc] : null)),
          minor: isMinor(p.mode ? m[p.mode] : ''),
          text: m[0].trim(),
        });
      }
    }
    // Les degrés de CETTE ligne, chacun une fois : « your 1 chord » est attrapé par deux motifs
    // (le déterminant, puis « 1 chord ») alors que c'est une seule mention. On les départage sur le
    // texte, pas sur le temps : une ligne lente étale les instants.
    const here = [];
    for (const re of DEGREE_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const token = String(m[1]);
        const n = /^\d$/.test(token) ? Number(token) : ROMAN[token.toLowerCase()];
        if (!(n >= 1 && n <= 7)) continue;
        if (here.some((x) => x.degree === String(n) && Math.abs(x.index - m.index) <= m[0].length)) continue;
        here.push({ index: m.index, degree: String(n), text: m[0].trim() });
      }
    }
    // Les suites de degrés qu'il énonce : « 2-5-1 » d'affilée, ou « from the chord I to the chord V ».
    const suites = [];
    PROGRESSION_RE.lastIndex = 0;
    let m;
    while ((m = PROGRESSION_RE.exec(text))) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + AFTER_WINDOW);
      suites.push({ index: m.index, list: m.slice(1).filter(Boolean).map(String), text: m[0].trim(), named: MUSICAL_AFTER.test(after) });
    }
    for (const re of TRANSITION_PATTERNS) {
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        const pair = [m[1], m[2]].map((x) => (/^\d$/.test(x) ? x : String(ROMAN[String(x).toLowerCase()] || '')));
        if (pair.some((x) => !x)) continue;
        // « from the chord I to the chord V » : il dit explicitement qu'il va de l'un à l'autre.
        suites.push({ index: m.index, list: pair, text: m[0].trim().replace(/\s+/g, ' '), named: true });
      }
    }
    for (const s of suites.sort((a, b) => a.index - b.index)) {
      if (s.list.length < 2) continue;
      progressions.push({ at: instantOf(line, s.index), degrees: s.list, text: s.text, named: s.named });
      // Les degrés d'une suite annoncée comptent comme nommés — sans doubler ceux que les motifs
      // précédents ont déjà relevés au même endroit (« a 6, 5 chord progression »).
      for (const d of s.list) {
        if (here.some((x) => x.degree === d && Math.abs(x.index - s.index) <= s.text.length)) continue;
        here.push({ index: s.index, degree: d, text: s.text });
      }
    }
    for (const d of here) degrees.push({ at: instantOf(line, d.index), degree: d.degree, text: d.text });
    for (const [name, re] of TERM_PATTERNS) {
      if (re.test(text)) terms.push({ at: instantOf(line, 0), name, text: name });
    }
  }
  const sortAt = (a, b) => (a.at ?? 0) - (b.at ?? 0);
  const degreeCount = {};
  for (const d of degrees) degreeCount[d.degree] = (degreeCount[d.degree] || 0) + 1;
  return { keys: keys.sort(sortAt), degrees: degrees.sort(sortAt), terms: terms.sort(sortAt), progressions: progressions.sort(sortAt), degreeCount };
}

/** Vide (pas de parole) : la même forme, pour que l'appelant n'ait pas à tester. */
export const NO_SPOKEN_THEORY = Object.freeze({ keys: [], degrees: [], terms: [], progressions: [], degreeCount: {} });

/**
 * La tonalité qu'il annonce pour une plage de temps : la dernière annoncée avant la fin de la plage
 * (il l'annonce avant de jouer : « today's demonstration is going to be done on the key of C sharp »),
 * à condition qu'aucune autre ne soit annoncée dans la plage elle-même.
 * @returns {{pc: number, minor: boolean, text: string, at: number}|null}
 */
export function spokenKeyFor(spoken, start, end, { lookBehind = 90 } = {}) {
  const list = (spoken?.keys || []).filter((k) => Number.isFinite(k.at));
  if (!list.length) return null;
  const inside = list.filter((k) => k.at >= start - 0.5 && k.at < end);
  if (inside.length) {
    // Plusieurs annonces dans la plage : la première (elle ouvre ce qu'il va jouer).
    return inside[0];
  }
  const before = list.filter((k) => k.at < start && k.at >= start - lookBehind);
  return before.length ? before[before.length - 1] : null;
}

/** Combien de fois chaque degré est nommé dans une plage (tout le tuto si `start`/`end` sont nuls). */
export function degreesNamed(spoken, start = null, end = null) {
  const out = {};
  for (const d of spoken?.degrees || []) {
    if (Number.isFinite(start) && Number.isFinite(end) && !(d.at >= start && d.at < end)) continue;
    out[d.degree] = (out[d.degree] || 0) + 1;
  }
  return out;
}

/** Les mots qu'il emploie dans une plage, les plus proches d'abord, sans répétition. */
export function termsNear(spoken, start, end, { margin = 8 } = {}) {
  const seen = new Set();
  const out = [];
  for (const t of spoken?.terms || []) {
    if (!Number.isFinite(t.at) || t.at < start - margin || t.at > end + margin) continue;
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    out.push(t.name);
  }
  return out;
}

/**
 * La progression qu'il ANNONCE : la suite de degrés qu'il énonce le plus souvent (au moins deux
 * degrés, dits au moins deux fois), ou la plus longue à égalité. « a 6, 5 chord progression »,
 * « 2-5-1 ». Rend null s'il n'annonce rien : le moteur garde la main.
 * @returns {{degrees: string[], times: number, text: string}|null}
 */
export function announcedProgression(spoken) {
  const count = new Map();
  for (const p of spoken?.progressions || []) {
    if (!p.named) continue;
    const id = p.degrees.join('-');
    const cur = count.get(id);
    if (cur) cur.times += 1;
    else count.set(id, { degrees: p.degrees, times: 1, text: p.text });
  }
  const best = [...count.values()].sort((a, b) => b.times - a.times || b.degrees.length - a.degrees.length)[0];
  return best && best.times >= 2 ? best : null;
}

/**
 * Le prof annonce-t-il ce mouvement ? `2` : les deux degrés sont nommés ; `1` : un seul ; `0` : aucun.
 * Et `pair` : les deux se suivent dans une progression qu'il énonce (« I to the V »).
 */
export function movementSaid(spoken, fromDegree, toDegree) {
  const named = spoken?.degreeCount || {};
  const a = String(fromDegree || '');
  const b = String(toDegree || '');
  const degrees = (named[a] ? 1 : 0) + (named[b] ? 1 : 0);
  // Seule une suite qui se nomme compte comme annoncée : un décompte « 1, 2, 3, 4 » n'annonce rien.
  const pair = (spoken?.progressions || []).some((p) => p.named && p.degrees.some((d, i) => d === a && p.degrees[i + 1] === b));
  return { degrees, pair, countFrom: named[a] || 0, countTo: named[b] || 0 };
}

/**
 * [Claude] — 2026-09-24 — Voicings contrôlés d'après les manuels.
 *
 * Narcisse doute des voicings VoicingLab des accords enrichis (11e, 13e) et
 * altérés (#11, b9, #9, b13, #5, b5, alt). Audit du 24/09 sur les 3 643 voicings
 * servis pour ces accords : environ 1 100 ne respectent pas la définition de leur
 * famille ou une règle de voicing courante. Exemple : la « close position » de
 * Bmaj13 (B D# A# G#, 1-3-7-13 empilés) s'étale sur presque deux octaves, alors
 * qu'une close tient dans une octave.
 *
 * Décision de Narcisse (24/09) : garder les voicings VoicingLab conformes et
 * reconstruire les autres d'après les formules des manuels, avec les mêmes notes
 * que VoicingLab quand elles sont justes.
 *
 * Définitions retenues (recoupées sur plusieurs sites : The Jazz Piano Site,
 * Learn Jazz Standards, piano.org, PianoGroove, Piano With Jonny, Wikipedia) :
 * - close position : toutes les notes dans une octave ;
 * - drop 2 / drop 3 / drop 2-4 : une close à 4 voix dont la 2e / la 3e / les 2e
 *   et 4e voix en partant du haut descendent d'une octave ;
 * - four-way close : 4 notes dans une octave ; block (locked hands) : la même,
 *   avec la mélodie doublée une octave plus bas ;
 * - rootless A / B (Bill Evans) : sans fondamentale, départ sur la tierce (A) ou
 *   sur la septième (B), dans une octave ;
 * - spread : fondamentale à la basse, plus d'une octave ; open : plus d'une octave ;
 * - upper structure : triade majeure à la main droite sur la tierce et la
 *   septième (triton) à la main gauche : II (9 #11 13), bIII (#9), bV (b9 #11),
 *   bVI (#5/b13 #9), VI (13 b9) ; bVII et IV sur les accords sus ;
 * - So What : trois quartes justes puis une tierce majeure.
 * Règles de voicing :
 * - limites d'intervalle grave (Mark Levine, The Jazz Piano Book) : sous ces
 *   notes, l'intervalle devient boueux ;
 * - pas de 9e mineure entre deux voix, sauf b9 au-dessus de la fondamentale d'un
 *   accord qui porte b9 ;
 * - pas de 11 juste avec une tierce majeure (note à éviter : on omet la tierce).
 */

/**
 * Limites d'intervalle grave (Levine) : note la plus basse admise sous chaque
 * intervalle entre deux voix voisines (demi-tons → MIDI, Do4 = 60).
 * 2de mineure Mi3, 2de majeure Mib3, 3ce mineure Do3, 3ce majeure Sib2, quarte
 * La2, triton Sib2, quinte Sib1, 6te et 7e Fa2, 9e mineure Mi2, 9e majeure Mib2,
 * 10e mineure Do2, 10e majeure Sib1.
 */
export const LOW_INTERVAL_LIMITS = Object.freeze({
  1: 52, 2: 51, 3: 48, 4: 46, 5: 45, 6: 46, 7: 34, 8: 41, 9: 41, 10: 41, 11: 41, 13: 40, 14: 39, 15: 36, 16: 34,
});

const sortedUnique = (notes) => [...new Set(notes)].sort((a, b) => a - b);
const rel = (n, rootPc) => (((n - rootPc) % 12) + 12) % 12;

/**
 * Vrai si aucun intervalle entre voix voisines ne passe sous sa limite grave.
 * `skipBass` : la basse est jouée seule (stride), son écart avec l'accord ne compte pas.
 */
export function respectsLowIntervalLimits(notes, { skipBass = false } = {}) {
  const s = sortedUnique(notes);
  for (let i = skipBass ? 2 : 1; i < s.length; i++) {
    const limit = LOW_INTERVAL_LIMITS[s[i] - s[i - 1]];
    if (limit != null && s[i - 1] < limit) return false;
  }
  return true;
}

/**
 * Paires de notes à distance de 9e mineure (13, 25… demi-tons), sauf la b9
 * au-dessus de la fondamentale quand l'accord la porte.
 * @returns {[number, number][]}
 */
export function minorNinthClashes(notes, rootPc, { flatNineChord = false } = {}) {
  const s = sortedUnique(notes);
  const clashes = [];
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const d = s[j] - s[i];
      if (d < 13 || d % 12 !== 1) continue;
      if (flatNineChord && rel(s[i], rootPc) === 0 && rel(s[j], rootPc) === 1) continue;
      clashes.push([s[i], s[j]]);
    }
  }
  return clashes;
}

/** Vrai si la 11 juste sonne avec une tierce majeure (note à éviter). */
export function hasEleventhAgainstMajorThird(notes, rootPc) {
  const rels = new Set(notes.map((n) => rel(n, rootPc)));
  return rels.has(4) && rels.has(5);
}

const isClose = (s) => s.length > 0 && s[s.length - 1] - s[0] < 12;

/**
 * Vrai si les notes redonnent une close à 4 voix quand on remonte d'une octave
 * les voix descendues (`dropped` = rangs depuis le haut dans la close : 2, 3, 4).
 */
function isDrop(s, dropped) {
  if (s.length !== 4) return false;
  const lowered = s.slice(0, dropped.length);
  const restored = sortedUnique([...s.slice(dropped.length), ...lowered.map((n) => n + 12)]);
  if (restored.length !== 4 || !isClose(restored)) return false;
  // Chaque voix remontée retrouve son rang : 2e voix du haut = index 2, etc.
  return lowered.every((n) => dropped.includes(4 - restored.indexOf(n + 12)));
}

/**
 * Définition de la famille respectée ?
 * @param {string} technique - technique de l'Exercice (close, drop2, rootless…)
 * @param {{lh: number[], rh: number[], familyId?: string}} v
 * @param {number} rootPc
 * @param {{thirds: number[], sevenths: number[]}} guide - tierces (ou quarte des
 *   accords sus / 11) et septièmes (ou sixte) de l'accord, en demi-tons
 */
export function respectsFamilyDefinition(technique, v, rootPc, guide) {
  const all = [...v.lh, ...v.rh];
  const s = sortedUnique(all);
  if (s.length === 0) return false;
  const span = s[s.length - 1] - s[0];
  switch (technique) {
    case 'close':
    case 'fourway_close':
      return isClose(s) && (technique === 'close' || s.length === 4);
    case 'drop2': return isDrop(s, [2]);
    case 'drop3': return isDrop(s, [3]);
    case 'drop2_4': return isDrop(s, [2, 4]);
    case 'block': {
      const top = s[s.length - 1];
      const inner = s.filter((n) => n > top - 12 && n < top);
      return s[0] === top - 12 && s.length === inner.length + 2 && inner.length >= 2;
    }
    case 'rootless': {
      if (s.some((n) => rel(n, rootPc) === 0) || span > 12) return false;
      const bass = rel(s[0], rootPc);
      return guide.thirds.includes(bass) || guide.sevenths.includes(bass);
    }
    case 'spread': return rel(s[0], rootPc) === 0 && span > 12;
    case 'open': return span > 12;
    case 'so_what': return s.slice(1).map((n, i) => n - s[i]).join() === '5,5,5,4';
    case 'upper_structure': {
      const lh = v.lh.map((n) => rel(n, rootPc));
      return triadRootPc(v.rh) != null
        && lh.some((i) => guide.thirds.includes(i)) && lh.some((i) => guide.sevenths.includes(i));
    }
    default:
      return true;
  }
}

/** Fondamentale (classe de hauteur) de la triade majeure ou mineure jouée, ou null. */
function triadRootPc(notes) {
  const pcs = [...new Set(notes.map((n) => ((n % 12) + 12) % 12))];
  if (notes.length !== 3 || pcs.length !== 3) return null;
  for (const r of pcs) {
    const set = new Set(pcs.map((pc) => (pc - r + 12) % 12));
    if (set.has(7) && (set.has(4) || set.has(3))) return r;
  }
  return null;
}

// ── Reconstruction ──────────────────────────────────────────────────────────

/** Place les notes à l'octave dont le milieu est le plus proche de `anchor`. */
function nearAnchor(notes, anchor) {
  if (anchor == null || notes.length === 0) return notes;
  const mid = (Math.min(...notes) + Math.max(...notes)) / 2;
  const shift = Math.round((anchor - mid) / 12) * 12;
  return notes.map((n) => n + shift);
}

/** Close ascendante (dans une octave) des classes de hauteur, en partant de `first`. */
function closeFrom(rels, first, rootPc) {
  const order = [...rels].sort((a, b) => ((a - first + 12) % 12) - ((b - first + 12) % 12));
  const base = 60 + ((rootPc + first) % 12);
  return order.map((r) => base + ((r - first + 12) % 12));
}

/** Toutes les close (un renversement par note à la basse). */
function closeInversions(rels, rootPc) {
  return [...rels].map((first) => closeFrom(rels, first, rootPc));
}

function drop(close, ranks) {
  const out = [...close];
  for (const rank of ranks) out[out.length - rank] -= 12;
  return out.sort((a, b) => a - b);
}

/**
 * Voicings reconstruits pour une famille, à partir des classes de hauteur d'une
 * variante VoicingLab non conforme (mêmes notes, disposition du manuel).
 * @param {string} technique
 * @param {Set<number>} rels - classes de hauteur (demi-tons depuis la fondamentale)
 * @param {number} rootPc
 * @param {{thirds: number[], sevenths: number[], alteredFifth?: boolean}} guide
 * @param {number|null} anchor - milieu du voicing d'origine (registre)
 * @returns {{lh: number[], rh: number[]}[]}
 */
export function rebuildFromNotes(technique, rels, rootPc, guide, anchor = null) {
  const set = new Set(rels);
  const out = [];
  const add = (lh, rh) => {
    const placed = nearAnchor([...lh, ...rh], anchor);
    out.push({ lh: placed.slice(0, lh.length), rh: placed.slice(lh.length) });
  };
  switch (technique) {
    case 'close': {
      // Position fondamentale (tierce à la basse sans fondamentale), une main.
      const first = set.has(0) ? 0 : guide.thirds.find((t) => set.has(t));
      if (first != null) add([], closeFrom(set, first, rootPc));
      break;
    }
    case 'fourway_close':
      if (set.size === 4) closeInversions(set, rootPc).forEach((c) => add([], c));
      break;
    case 'drop2':
    case 'drop3':
    case 'drop2_4': {
      if (set.size !== 4) break;
      const ranks = { drop2: [2], drop3: [3], drop2_4: [2, 4] }[technique];
      for (const c of closeInversions(set, rootPc)) {
        const notes = drop(c, ranks);
        add(notes.slice(0, ranks.length), notes.slice(ranks.length));
      }
      break;
    }
    case 'block':
      if (set.size === 4) {
        for (const c of closeInversions(set, rootPc)) add([c[c.length - 1] - 12], c);
      }
      break;
    case 'rootless': {
      const noRoot = new Set([...set].filter((r) => r !== 0));
      for (const first of [...guide.thirds, ...guide.sevenths]) {
        if (!noRoot.has(first)) continue;
        add(closeFrom(noRoot, first, rootPc), []);
      }
      break;
    }
    case 'open':
    case 'spread': {
      // Fondamentale et quinte (ou septième) à la main gauche, le reste en close
      // au-dessus : plus d'une octave au total.
      if (!set.has(0)) break;
      // Quinte altérée (#5, b13, b5) : la quinte juste ne s'y ajoute pas (9e
      // mineure Sol3–Lab4 dans l'Open de C7#5 publié par VoicingLab).
      if (guide.alteredFifth) set.delete(7);
      const partner = set.has(7) ? 7 : guide.sevenths.find((s) => set.has(s));
      const lh = [48 + rootPc % 12];
      if (technique === 'open' && partner != null) lh.push(lh[0] + partner);
      const upper = [...set].filter((r) => r !== 0 && !(technique === 'open' && r === partner));
      if (upper.length < 2) break;
      const first = guide.thirds.find((t) => upper.includes(t)) ?? upper[0];
      let rh = closeFrom(new Set(upper), first, rootPc);
      while (rh[0] <= lh[lh.length - 1]) rh = rh.map((n) => n + 12);
      while (rh[0] - 12 > lh[lh.length - 1] && rh[rh.length - 1] - lh[0] - 12 > 12) rh = rh.map((n) => n - 12);
      add(lh, rh);
      break;
    }
    default:
      break;
  }
  return out;
}

// Triades d'upper structure (majeures), en demi-tons au-dessus de la fondamentale.
const UPPER_STRUCTURE_TRIADS = [2, 3, 6, 8, 9, 10, 5];

/**
 * Upper structures du manuel : triade majeure (3 renversements) au-dessus de la
 * tierce et de la septième. Le tri musical (notes admises, 9e mineures, 11 contre
 * la tierce) est fait par l'appelant.
 * @returns {{lh: number[], rh: number[], triad: number}[]}
 */
export function upperStructureCandidates(rootPc, guide) {
  const third = guide.thirds[0];
  const seventh = guide.sevenths[0];
  if (third == null || seventh == null) return [];
  // Main gauche : tierce entre Mi3 et Ré#4, septième au-dessus (triton du V7).
  const low = 52 + ((rootPc + third - 52) % 12 + 12) % 12;
  const lh = [low, low + ((seventh - third + 12) % 12)];
  const out = [];
  for (const triad of UPPER_STRUCTURE_TRIADS) {
    const r = (rootPc + triad) % 12;
    const shapes = [[0, 4, 7], [4, 7, 12], [7, 12, 16]];
    for (const shape of shapes) {
      let rh = shape.map((i) => 48 + r + i);
      while (rh[0] <= lh[1]) rh = rh.map((n) => n + 12);
      out.push({ lh: [...lh], rh, triad });
    }
  }
  return out;
}

/**
 * Échelles d'accord des dominantes (notes admises, demi-tons) : une upper
 * structure doit tenir dans l'une d'elles.
 */
const DOMINANT_SCALES = {
  mixolydian: [0, 2, 4, 7, 9, 10],
  lydianDominant: [0, 2, 4, 6, 7, 9, 10],
  mixolydianFlat13: [0, 2, 4, 7, 8, 10],
  halfWhole: [0, 1, 3, 4, 6, 7, 9, 10],
  altered: [0, 1, 3, 4, 6, 8, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  susMixolydian: [0, 2, 5, 7, 9, 10],
};

/** Échelles admises pour une qualité de dominante (ou sus), ou null. */
export function dominantScalesFor(quality) {
  const q = String(quality || '');
  const S = DOMINANT_SCALES;
  if (/maj|^m(?!aj)|dim|^aug/.test(q)) return null;
  if (q.includes('alt')) return [S.altered];
  if (q.includes('sus') || q === '11') return [S.susMixolydian];
  const flatOrSharpNine = /b9|#9/.test(q);
  const raisedFifth = /#5|b13/.test(q);
  if (flatOrSharpNine) return raisedFifth ? [S.altered] : [S.halfWhole, S.altered];
  if (raisedFifth) return [S.wholeTone, S.altered, S.mixolydianFlat13];
  if (/b5|#11/.test(q)) return [S.lydianDominant, S.wholeTone];
  if (/7|9|13/.test(q)) return [S.mixolydian];
  return null;
}

/** Vrai si toutes les notes tiennent dans une des échelles de l'accord. */
export function fitsChordScale(notes, rootPc, scales) {
  if (!scales) return true;
  const rels = new Set(notes.map((n) => rel(n, rootPc)));
  return scales.some((scale) => [...rels].every((r) => scale.includes(r)));
}

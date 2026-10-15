// [Claude] — 2026-10-14 — Pédagogie IA : recouper les notes lues à l'IMAGE avec celles entendues au SON.
//
// Narcisse : « quand c'est lu à l'image, l'image peut parfois bugger alors que le son, lui, est bon…
// pourquoi ne pas aussi se baser sur le son, notamment pour comparer les notes, surtout au niveau des
// octaves, ainsi que pour les slides ? »
//
// Avant : les notes du prof venaient de l'image seule (touches allumées du clavier dessiné, ou V2N).
// Le son ne servait qu'à comparer les ACCORDS (cross-check.js), à mesurer la force des attaques
// (dynamics.js) et à écouter la parole. Une octave fausse, une note manquée (image brouillée, caméra
// coupée) ou un glissando mal vu restaient donc dans le relevé.
//
// Maintenant : la transcription du son (piano-transcriber.py : hauteur exacte, début, fin, force)
// sert de SECONDE LECTURE INDÉPENDANTE, et corrige l'image dans trois cas, jamais au-delà :
//   1. OCTAVE — une note vue à l'image n'est pas entendue à cette hauteur, mais la même note est
//      entendue à une, deux octaves d'écart au même instant : on prend la hauteur entendue.
//      (Cas typique : clavier dessiné mal calé → toutes les notes décalées d'une octave.)
//   2. LACUNE — l'image ne voit AUCUNE note pendant un moment où le son en fait entendre (image
//      brouillée, plan coupé, clavier masqué) : les notes entendues sont ajoutées.
//   3. GLISSANDO — dans une montée ou une descente rapide vue à l'image, les notes entendues entre
//      les notes vues (l'image en saute au rythme de ses images) sont ajoutées.
// Tout le reste est laissé tel quel : une note entendue sans équivalent à l'image, au milieu d'un
// accord, peut être une résonance ou un autre instrument — elle est comptée, pas ajoutée.
//
// Garde-fou : si le son et l'image ne se recoupent presque pas (moins de 30 % des notes vues sont
// retrouvées, à la hauteur ou à l'octave près), le son est jugé peu fiable (musique de fond,
// bruit…) et RIEN n'est changé. Le rapport le dit.
//
// Module PUR (aucune dépendance au navigateur), testé par test-sound-reconcile.js.

export const SOUND_CHECK_DEFAULTS = {
  /** Écart d'attaque toléré (s) entre une note vue et la même entendue : l'image retarde, l'échantillonnage arrondit. */
  onsetTol: 0.25,
  /** Notes entendues ignorées : plus courtes (s) ou plus faibles (0 à 1) que cela. */
  minDuration: 0.05,
  minVelocity: 0.12,
  /** Autour d'une note vue, l'image « voit » (s) ; au-delà c'est une lacune. */
  blindGap: 0.5,
  /** Part minimale de notes vues retrouvées au son pour le croire. */
  minReliable: 0.3,
  /**
   * Décalage d'octave GÉNÉRAL : si au moins `globalShiftShare` des notes retrouvées au son sont décalées
   * du même nombre d'octaves (et il y en a au moins `globalShiftMin`), le clavier dessiné est mal calé
   * pour TOUTE la vidéo : on applique ce décalage aussi aux notes que le son ne confirme pas.
   */
  globalShiftShare: 0.6,
  globalShiftMin: 8,
  /**
   * Plages [{start, end}] réellement écoutées. Absent : tout le son est là. Présent (transcription par
   * extraits, sound-sampling.js) : seules les notes vues DANS ces plages sont recoupées et comptées
   * pour la fiabilité ; le décalage d'octave général trouvé s'applique ensuite à toutes les autres.
   */
  spans: null,
  /** Glissando : écart maximal (s) entre deux attaques voisines, et nombre minimal d'attaques. */
  runStep: 0.25,
  runMinEvents: 3,
};

const round2 = (x) => Math.round(x * 100) / 100;
const pc = (midi) => ((midi % 12) + 12) % 12;

/** Notes entendues → {midi, start, end, velocity 0-1}, triées, sans bruit. */
export function normalizeSoundNotes(list, options = {}) {
  const o = { ...SOUND_CHECK_DEFAULTS, ...options };
  return (list || [])
    .filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.onset ?? n?.start))
    .map((n) => {
      const start = Number(n.onset ?? n.start);
      const endRaw = Number(n.offset ?? n.end);
      const v = Number(n.velocity);
      return {
        midi: Math.round(n.midi),
        start,
        end: Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 0.25,
        velocity: Number.isFinite(v) ? (v > 1 ? v / 127 : v) : 0.6,
      };
    })
    .filter((n) => n.midi >= 21 && n.midi <= 108 && n.end - n.start >= o.minDuration && n.velocity >= o.minVelocity)
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
}

/** Plages de temps où l'image « voit » quelque chose (chaque note élargie de `gap`, fusionnées). */
function coverage(notes, gap) {
  const spans = notes
    .map((n) => [n.start - gap, n.end + gap])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

function covered(ranges, t) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < ranges[mid][0]) hi = mid - 1;
    else if (t > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Montées / descentes rapides vues à l'image : suites d'attaques (≤ 2 notes ensemble) de plus en plus
 * hautes — ou de plus en plus basses — espacées de `runStep` au plus.
 * @returns {{start: number, end: number, lo: number, hi: number}[]}
 */
export function findRuns(notes, options = {}) {
  const o = { ...SOUND_CHECK_DEFAULTS, ...options };
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  // Attaques : notes commençant ensemble (à 30 ms près).
  const events = [];
  for (const n of sorted) {
    const last = events[events.length - 1];
    if (last && n.start - last.start <= 0.03) last.notes.push(n);
    else events.push({ start: n.start, notes: [n] });
  }
  const single = events.map((e) => ({
    start: e.start,
    end: Math.max(...e.notes.map((n) => n.end)),
    size: e.notes.length,
    // La note qui « mène » : la plus haute (montée) ou la plus basse (descente) ; on garde les deux.
    hi: Math.max(...e.notes.map((n) => n.midi)),
    lo: Math.min(...e.notes.map((n) => n.midi)),
  }));
  const runs = [];
  let i = 0;
  while (i < single.length) {
    if (single[i].size > 2) { i += 1; continue; }
    let j = i;
    let dir = 0;
    while (j + 1 < single.length) {
      const a = single[j];
      const b = single[j + 1];
      if (b.size > 2 || b.start - a.start > o.runStep) break;
      const step = b.hi - a.hi;
      if (step === 0 || Math.abs(step) > 14) break;
      const d = step > 0 ? 1 : -1;
      if (dir !== 0 && d !== dir) break;
      dir = d;
      j += 1;
    }
    if (j - i + 1 >= o.runMinEvents) {
      const part = single.slice(i, j + 1);
      runs.push({
        start: part[0].start,
        end: part[part.length - 1].end,
        lo: Math.min(...part.map((p) => p.lo)),
        hi: Math.max(...part.map((p) => p.hi)),
      });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return runs;
}

/**
 * Recoupe les notes lues à l'image avec celles entendues.
 * @param {{midi: number, start: number, end: number, hand?: string|null, velocity?: number}[]} imageNotes
 * @param {{midi: number, onset: number, offset?: number, velocity?: number}[]} soundList - transcription du son
 * @param {object} [options] - voir SOUND_CHECK_DEFAULTS
 * @returns {{ notes: object[], report: {
 *   reliable: boolean, reason: string|null, imageNotes: number, soundNotes: number, confirmed: number,
 *   octaveFixed: number, addedGap: number, addedSlide: number, heardOnly: number, unsupported: number }}}
 */
export function reconcileWithSound(imageNotes, soundList, options = {}) {
  const o = { ...SOUND_CHECK_DEFAULTS, ...options };
  const image = (imageNotes || []).map((n) => ({ ...n }));
  const sound = normalizeSoundNotes(soundList, o);
  const report = {
    reliable: false, reason: null, imageNotes: image.length, soundNotes: sound.length,
    confirmed: 0, octaveFixed: 0, addedGap: 0, addedSlide: 0, heardOnly: 0, unsupported: 0,
    globalShift: 0, octaveInferred: 0, studied: image.length, sampled: false,
  };
  if (!sound.length) { report.reason = 'no-sound'; return { notes: image, report }; }
  if (!image.length) { report.reason = 'no-image'; return { notes: image, report }; }

  const claimed = new Set();
  const spans = Array.isArray(o.spans) && o.spans.length ? o.spans : null;
  const inSpan = (n) => !spans || spans.some((sp) => n.start >= sp.start && n.start < sp.end);
  const outside = spans ? image.map((n, idx) => idx).filter((idx) => !inSpan(image[idx])) : [];
  const studiedNotes = image.map((n, idx) => ({ n, idx })).filter(({ n }) => inSpan(n));
  report.studied = studiedNotes.length;
  report.sampled = Boolean(spans);
  if (!studiedNotes.length) { report.reason = 'unreliable'; return { notes: image, report }; }
  const byImageStart = studiedNotes.sort((a, b) => a.n.start - b.n.start);

  // Candidats : notes entendues d'attaque proche, la plus proche dans le temps d'abord.
  const nearby = (n, predicate) => {
    const out = [];
    for (let k = 0; k < sound.length; k += 1) {
      const s = sound[k];
      if (s.start < n.start - o.onsetTol) continue;
      if (s.start > n.start + o.onsetTol) break;
      if (!claimed.has(k) && predicate(s)) out.push({ k, s, d: Math.abs(s.start - n.start) });
    }
    return out.sort((a, b) => a.d - b.d);
  };

  // 1. Même hauteur.
  const unmatched = [];
  for (const { n, idx } of byImageStart) {
    const c = nearby(n, (s) => s.midi === n.midi)[0];
    if (c) { claimed.add(c.k); report.confirmed += 1; } else unmatched.push({ n, idx });
  }
  // 2. Même note, autre octave.
  const fixes = [];
  const lost = [];
  for (const { n, idx } of unmatched) {
    const c = nearby(n, (s) => s.midi !== n.midi && pc(s.midi) === pc(n.midi) && Math.abs(s.midi - n.midi) <= 24)[0];
    if (c) { claimed.add(c.k); fixes.push({ idx, midi: c.s.midi }); } else { report.unsupported += 1; lost.push(idx); }
  }

  // Garde-fou : l'image et le son se recoupent-ils assez pour croire le son ?
  const shared = report.confirmed + fixes.length;
  if (shared / studiedNotes.length < o.minReliable) {
    report.reason = 'unreliable';
    report.unsupported = studiedNotes.length - report.confirmed;
    return { notes: image, report };
  }
  report.reliable = true;

  for (const f of fixes) {
    const n = image[f.idx];
    // Pas de doublon : la même hauteur ne peut pas déjà sonner au même instant.
    const clash = image.some((m, i) => i !== f.idx && m.midi === f.midi && Math.abs(m.start - n.start) < 0.1);
    if (clash) { report.unsupported += 1; continue; }
    n.octaveFrom = n.midi;
    n.midi = f.midi;
    report.octaveFixed += 1;
  }

  // [Claude] — 2026-10-15 — Décalage d'octave général. Mesuré sur « Above All » (clavier dessiné lu une
  // octave trop bas) : 1168 des 1376 notes retrouvées au son étaient à +12. Le recoupement corrige
  // chaque note qu'il retrouve, mais laissait telles quelles les ~740 que le son ne confirme pas : la
  // vidéo sonnait alors mi-juste, mi-une octave trop bas. Une erreur de calage du clavier est la même
  // pour toutes les notes : on l'étend aux notes non confirmées.
  const shiftCount = new Map();
  for (const f of fixes) {
    const was = image[f.idx].octaveFrom ?? image[f.idx].midi;
    shiftCount.set(f.midi - was, (shiftCount.get(f.midi - was) || 0) + 1);
  }
  const matched = report.confirmed + fixes.length;
  const [topShift, topCount] = [...shiftCount].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  if (topShift !== 0 && matched >= o.globalShiftMin && topCount / matched >= o.globalShiftShare) {
    report.globalShift = topShift;
    for (const idx of [...lost, ...outside]) {
      const n = image[idx];
      const to = n.midi + topShift;
      if (to < 21 || to > 108) continue;
      const clash = image.some((m, i) => i !== idx && m.midi === to && Math.abs(m.start - n.start) < 0.1);
      if (clash) continue;
      n.octaveFrom = n.midi;
      n.midi = to;
      report.octaveInferred += 1;
    }
  }

  // 3. Notes entendues sans équivalent à l'image : lacune, glissando, ou simple « entendu ».
  const seen = coverage(image, o.blindGap);
  const runs = findRuns(image, o);
  const added = [];
  for (let k = 0; k < sound.length; k += 1) {
    if (claimed.has(k)) continue;
    const s = sound[k];
    let kind = null;
    if (!covered(seen, s.start)) kind = 'gap';
    else if (runs.some((r) => s.start >= r.start - 0.05 && s.start <= r.end + 0.1 && s.midi >= r.lo - 2 && s.midi <= r.hi + 2)) kind = 'slide';
    if (!kind) { report.heardOnly += 1; continue; }
    // La main d'une note de glissando : celle de la note vue la plus proche.
    let hand = null;
    if (kind === 'slide') {
      let best = Infinity;
      for (const m of image) {
        const d = Math.abs(m.start - s.start) + Math.abs(m.midi - s.midi) * 0.02;
        if (d < best) { best = d; hand = m.hand || null; }
      }
    }
    added.push({
      midi: s.midi,
      start: round2(s.start),
      end: round2(s.end),
      hand,
      velocity: round2(s.velocity),
      from: 'son',
      kind,
    });
    if (kind === 'gap') report.addedGap += 1; else report.addedSlide += 1;
  }

  const notes = [...image, ...added].sort((a, b) => a.start - b.start || a.midi - b.midi);
  return { notes, report };
}

/** Phrase pour l'écran : ce que le son a changé dans la lecture à l'image. */
export function soundCheckSentence(report) {
  if (!report) return '';
  if (report.reason === 'not-installed') return 'La transcription des notes au son n\'est pas installée : les notes viennent de l\'image seule.';
  if (report.reason === 'no-sound') return 'Le son n\'a pas pu être transcrit : les notes viennent de l\'image seule.';
  if (report.reason === 'unreliable') return 'Le son et l\'image ne se recoupent pas assez (musique de fond ?) : les notes viennent de l\'image seule.';
  if (!report.reliable) return '';
  const parts = [`${report.confirmed} notes de l'image confirmées par le son`];
  if (report.sampled) parts.unshift(`son écouté par extraits (${report.studied} notes comparées)`);
  if (report.octaveFixed) parts.push(`${report.octaveFixed} octave${report.octaveFixed > 1 ? 's' : ''} corrigée${report.octaveFixed > 1 ? 's' : ''}`);
  if (report.octaveInferred) parts.push(`${report.octaveInferred} de plus d'après le décalage général du clavier`);
  if (report.addedGap) parts.push(`${report.addedGap} note${report.addedGap > 1 ? 's' : ''} ajoutée${report.addedGap > 1 ? 's' : ''} là où l'image ne voyait rien`);
  if (report.addedSlide) parts.push(`${report.addedSlide} note${report.addedSlide > 1 ? 's' : ''} ajoutée${report.addedSlide > 1 ? 's' : ''} dans des glissandos`);
  return `${parts.join(', ')}.`;
}

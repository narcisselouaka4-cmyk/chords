// [Claude] — 2026-09-05 — Pédagogie IA : recoupement de deux lectures.
//
// Une même vidéo peut être lue de deux façons indépendantes : par l'image
// (Format B — ce qui est montré au clavier) et par le son (pipeline Chordify —
// ce qui est entendu). Quand les deux sont disponibles, elles ne disent pas
// toujours la même chose, et c'est une information, pas une gêne.
//
// DISCIPLINE : un désaccord se consigne, il ne s'arrondit pas. Ce module ne
// choisit JAMAIS un gagnant à la place de l'utilisateur. Il aligne les deux
// lectures sur l'axe du temps, mesure leur accord, et énumère les écarts avec
// leur nature.
//
// Le cas le plus fréquent sur le fichier de référence mérite d'être compris :
// l'image lit « la5 » (quinte à vide) là où l'oreille et la grille de référence
// disent « la ». Les deux ont raison — la tierce n'est pas jouée à ce
// moment-là, mais l'harmonie est bien celle de la. L'écart est donc classé
// `enrichment` et non `conflict`.
//
// Module pur : ni DOM, ni IPC, ni moteur d'accords.

/** Nature d'un écart entre deux lectures. */
export const DIVERGENCE = {
  AGREE: 'agree',            // même étiquette
  ENRICHMENT: 'enrichment',  // même fondamentale, précision différente
  QUALITY: 'quality',        // même fondamentale, qualité opposée (majeur/mineur)
  CONFLICT: 'conflict',      // fondamentales différentes
  MISSING: 'missing',        // une seule source couvre l'instant
};

const PITCH_CLASSES = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/**
 * Classe de hauteur de la fondamentale d'une étiquette d'accord.
 * Accepte les notations anglaises avec dièse ou bémol.
 *
 * @param {string} label
 * @returns {number|null}
 */
export function rootPitchClass(label) {
  if (typeof label !== 'string') return null;
  const m = /^\s*([A-G])([#b♯♭]?)/.exec(label);
  if (!m) return null;
  const accidental = m[2].replace('♯', '#').replace('♭', 'b');
  const pc = PITCH_CLASSES[`${m[1]}${accidental}`];
  return pc === undefined ? null : pc;
}

/**
 * Indique si une étiquette dénote une qualité mineure.
 * @param {string} label
 * @returns {boolean}
 */
export function isMinorLabel(label) {
  if (typeof label !== 'string') return false;
  const tail = label.replace(/^\s*[A-G][#b♯♭]?/, '');
  return /^m(?!aj)/.test(tail) || tail.startsWith('min') || tail.startsWith('-');
}

/**
 * Étiquette active à un instant donné dans une liste de segments.
 *
 * @param {{start: number, end: number}[]} segments
 * @param {number} t
 * @returns {object|null}
 */
export function segmentAt(segments, t) {
  for (const s of segments || []) {
    if (t >= s.start && t < s.end) return s;
  }
  return null;
}

/**
 * Compare deux lectures segmentées sur une grille temporelle régulière.
 *
 * @param {object} params
 * @param {{start: number, end: number, label: string|null}[]} params.video
 * @param {{start: number, end: number, label: string|null}[]} params.audio
 * @param {number} [params.step] - pas d'échantillonnage, en secondes
 * @param {number} [params.duration]
 * @returns {{
 *   step: number, samples: number,
 *   counts: Record<string, number>, agreementRatio: number, rootAgreementRatio: number,
 *   divergences: {start: number, end: number, kind: string, video: string|null, audio: string|null}[],
 *   summary: string
 * }}
 */
export function crossCheck(params) {
  const step = params.step ?? 0.5;
  const video = params.video || [];
  const audio = params.audio || [];
  const spans = [...video, ...audio];
  const duration = params.duration
    ?? (spans.length ? Math.max(...spans.map((s) => s.end)) : 0);

  const counts = {
    [DIVERGENCE.AGREE]: 0,
    [DIVERGENCE.ENRICHMENT]: 0,
    [DIVERGENCE.QUALITY]: 0,
    [DIVERGENCE.CONFLICT]: 0,
    [DIVERGENCE.MISSING]: 0,
  };
  const raw = [];

  for (let t = 0; t < duration - 1e-9; t += step) {
    const v = segmentAt(video, t);
    const a = segmentAt(audio, t);
    const vl = v?.label ?? null;
    const al = a?.label ?? null;
    let kind;
    if (!vl || !al) kind = DIVERGENCE.MISSING;
    else if (vl === al) kind = DIVERGENCE.AGREE;
    else {
      const vr = rootPitchClass(vl);
      const ar = rootPitchClass(al);
      if (vr === null || ar === null) kind = DIVERGENCE.CONFLICT;
      else if (vr !== ar) kind = DIVERGENCE.CONFLICT;
      else if (isMinorLabel(vl) !== isMinorLabel(al)) kind = DIVERGENCE.QUALITY;
      else kind = DIVERGENCE.ENRICHMENT;
    }
    counts[kind]++;
    raw.push({ t, kind, video: vl, audio: al });
  }

  // Regrouper les instants consécutifs de même nature pour un rapport lisible.
  const divergences = [];
  for (const r of raw) {
    if (r.kind === DIVERGENCE.AGREE) continue;
    const last = divergences[divergences.length - 1];
    if (last && last.kind === r.kind && last.video === r.video && last.audio === r.audio
      && Math.abs(last.end - r.t) < step * 1.5) {
      last.end = r.t + step;
    } else {
      divergences.push({ start: r.t, end: r.t + step, kind: r.kind, video: r.video, audio: r.audio });
    }
  }

  const comparable = raw.length - counts[DIVERGENCE.MISSING];
  const rootAgree = counts[DIVERGENCE.AGREE] + counts[DIVERGENCE.ENRICHMENT] + counts[DIVERGENCE.QUALITY];

  return {
    step,
    samples: raw.length,
    counts,
    agreementRatio: comparable > 0 ? counts[DIVERGENCE.AGREE] / comparable : null,
    rootAgreementRatio: comparable > 0 ? rootAgree / comparable : null,
    divergences,
    summary: buildSummary(counts, comparable),
  };
}

function buildSummary(counts, comparable) {
  if (comparable === 0) {
    return 'Une seule source est disponible : aucun recoupement n\'a pu être fait.';
  }
  const pct = (n) => `${Math.round((n / comparable) * 100)} %`;
  const parts = [`${pct(counts[DIVERGENCE.AGREE])} des instants comparables donnent la même étiquette`];
  if (counts[DIVERGENCE.ENRICHMENT] > 0) {
    parts.push(`${pct(counts[DIVERGENCE.ENRICHMENT])} même fondamentale mais précision différente `
      + '(souvent une tierce jouée d\'un côté et pas de l\'autre)');
  }
  if (counts[DIVERGENCE.QUALITY] > 0) {
    parts.push(`${pct(counts[DIVERGENCE.QUALITY])} même fondamentale mais qualité opposée`);
  }
  if (counts[DIVERGENCE.CONFLICT] > 0) {
    parts.push(`${pct(counts[DIVERGENCE.CONFLICT])} en désaccord franc`);
  }
  return `${parts.join(' ; ')}. Aucun arbitrage n'a été fait : les deux lectures sont conservées.`;
}

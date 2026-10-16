// [Claude] — 2026-10-15 — Quels passages faire écouter au modèle de transcription ?
//
// Transcrire le piano au son coûte ~2,5x la durée de l'audio sur CPU (19 min de vidéo : 38 min).
// Or le son ne sert, quand l'image se lit bien, qu'à fixer l'octave de tout le clavier et à
// recouper l'image (sound-reconcile.js) : quelques extraits denses suffisent. Mesuré le 15/10 :
// l'écart d'octave est le même du début à la fin d'une vidéo (« Above All » : +12 pour 85 % des
// notes retrouvées). On choisit donc, dans chaque quart de la vidéo, la fenêtre où l'IMAGE a vu le
// plus de notes — là où le recoupement a le plus à comparer.
//
// Module PUR (aucune dépendance au navigateur), testé par test-sound-sampling.js.

export const SOUND_SAMPLING_DEFAULTS = {
  /** Nombre de zones égales ; une fenêtre au plus par zone. */
  count: 4,
  /** Durée d'une fenêtre (s). */
  length: 20,
  /** En dessous de cette durée, on écoute tout : le gain serait mince. */
  wholeBelow: 60,
  /** Notes vues minimum dans une fenêtre pour qu'elle serve (sinon : parole, titre, silence). */
  minNotes: 10,
  /** Pas de glissement de la fenêtre (s). */
  step: 2,
};

/**
 * @param {{start: number}[]} imageNotes - notes lues à l'image
 * @param {number} duration - durée de la vidéo (s)
 * @param {object} [options]
 * @returns {{start: number, duration: number}[]} extraits triés, [] si l'image n'en désigne aucun
 */
export function pickSoundWindows(imageNotes, duration, options = {}) {
  const o = { ...SOUND_SAMPLING_DEFAULTS, ...options };
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) return [];
  if (total <= o.wholeBelow) return [{ start: 0, duration: round1(total) }];

  const starts = (imageNotes || []).map((n) => Number(n?.start)).filter(Number.isFinite).sort((a, b) => a - b);
  const countIn = (from, to) => {
    let lo = 0; let hi = starts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] < from) lo = mid + 1; else hi = mid; }
    let n = 0;
    for (let i = lo; i < starts.length && starts[i] < to; i += 1) n += 1;
    return n;
  };

  const length = Math.min(o.length, total);
  const zone = total / o.count;
  const windows = [];
  for (let z = 0; z < o.count; z += 1) {
    const zoneStart = z * zone;
    const zoneEnd = (z + 1) * zone;
    let best = null;
    for (let s = zoneStart; s + length <= zoneEnd + 1e-9; s += o.step) {
      const n = countIn(s, s + length);
      if (!best || n > best.n) best = { start: s, n };
    }
    if (best && best.n >= o.minNotes) windows.push({ start: round1(best.start), duration: round1(length) });
  }
  return windows;
}

/** `--windows=` pour piano-transcriber.py : « début:durée,début:durée ». */
export function windowsArgument(windows) {
  return (windows || []).map((w) => `${round1(w.start)}:${round1(w.duration)}`).join(',');
}

/** Les mêmes extraits, en plages de temps {start, end} (pour sound-reconcile `spans`). */
export function windowsToSpans(windows) {
  return (windows || []).map((w) => ({ start: w.start, end: w.start + w.duration }));
}

const round1 = (x) => Math.round(x * 10) / 10;

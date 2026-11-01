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

/**
 * [Claude] — 2026-11-02 — La fenêtre où il JOUE le plus, pour y chercher le tempo.
 *
 * Mesuré sur « Clase 2 — improvisar en la SALSA » (19 min, il parle l'essentiel du temps) :
 * sur la vidéo entière, le tempo sort à confiance **0,00** — l'application n'applique donc
 * rien (metronome-menu.js n'accepte qu'à partir de 0,3), et c'est honnête : l'autocorrélation
 * y est ambiguë (quatre candidats à moins de 4 % d'écart). Sur vingt secondes où il joue
 * vraiment, la même mesure donne **0,33 — « probable »**.
 *
 * L'application sait déjà calculer le tempo du passage tracé ; ce qui manquait, c'est son
 * repli quand aucun passage ne l'est. Plutôt que toute la vidéo, on prend le moment le plus
 * joué. Cela ne demande rien au pianiste.
 *
 * Attention : dans un tutoriel, il joue des extraits à des tempos DIFFÉRENTS (mesuré : 92,5
 * à 10:50, 123,4 à 16:20). Un « tempo de la vidéo » n'existe pas vraiment ; cette fenêtre
 * donne celui du moment le plus joué, pas une vérité sur tout le fichier.
 *
 * @param {{start: number}[]} imageNotes - notes relevées
 * @param {number} duration - durée de la vidéo (s)
 * @param {{length?: number, step?: number, minNotes?: number}} [options]
 * @returns {{start: number, end: number} | null} null si le relevé ne désigne aucun moment joué
 */
export function busiestWindow(imageNotes, duration, options = {}) {
  const length = Number(options.length) || 30;
  const step = Number(options.step) || 5;
  const minNotes = Number.isFinite(options.minNotes) ? options.minNotes : SOUND_SAMPLING_DEFAULTS.minNotes;
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) return null;
  const starts = (imageNotes || []).map((n) => Number(n?.start)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!starts.length) return null;
  // Plus courte que la fenêtre voulue : il n'y a rien à choisir.
  if (total <= length) return starts.length >= minNotes ? { start: 0, end: round1(total) } : null;
  let best = null;
  for (let from = 0; from + length <= total + 1e-9; from += step) {
    const to = from + length;
    let n = 0;
    for (let i = 0; i < starts.length && starts[i] < to; i += 1) if (starts[i] >= from) n += 1;
    if (!best || n > best.n) best = { start: from, n };
  }
  if (!best || best.n < minNotes) return null;
  return { start: round1(best.start), end: round1(best.start + length) };
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

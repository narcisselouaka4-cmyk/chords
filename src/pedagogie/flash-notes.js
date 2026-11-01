// [Claude] — 2026-10-14 — Pédagogie IA : tutos dont le clavier dessiné n'allume une touche
// qu'AU MOMENT où elle est frappée (« Next Level Worship » : une barre verte qui s'éteint au
// bout de 0,1 à 0,4 s, alors que le prof tient l'accord, pédale enfoncée).
//
// Lues telles quelles, ces notes sont des éclairs : la grille ne trouve pas d'accord (il n'y a
// jamais plus de deux ou trois touches allumées ensemble), et le rejeu sonne piqué. Un pianiste
// qui regarde la vidéo comprend, lui, que les notes sonnent jusqu'au changement d'harmonie.
// On fait de même :
//   1. reconnaître ce rendu : presque toutes les notes sont brèves (voir isFlashRendering) ;
//   2. découper le temps en harmonies : une nouvelle harmonie commence quand des touches
//      frappées ensemble apportent une note (classe de hauteur) que l'harmonie en cours n'avait
//      pas, une fois celle-ci installée (HARMONY_SETTLE) ;
//   3. tenir chaque note jusqu'à la fin de son harmonie (ou jusqu'à sa prochaine frappe), sans
//      dépasser MAX_HOLD.
// Les attaques ne bougent pas : seules les fins sont prolongées. Module pur, testé par
// test-flash-notes.js.

const pcOf = (n) => ((n % 12) + 12) % 12;
const round2 = (x) => Math.round(x * 100) / 100;

/** Une note « brève » dure au plus ceci (s). */
export const FLASH_SECONDS = 0.4;
/** Part minimale de notes brèves pour parler d'un rendu « éclair ». */
export const FLASH_SHARE = 0.75;
/** Durée médiane maximale d'un rendu « éclair » (s). */
export const FLASH_MEDIAN = 0.3;
/** Il faut assez de notes pour juger. */
export const FLASH_MIN_NOTES = 40;
/** Touches frappées ensemble : à moins de ceci l'une de l'autre (s). */
export const ATTACK_GROUP = 0.12;
/** Une harmonie s'installe pendant ceci (s) : ses premières notes ne la ferment pas. */
export const HARMONY_SETTLE = 0.6;
/** Des notes nouvelles à moins de ceci (demi-tons) au-dessus de la basse : la main gauche bouge. */
export const BASS_REACH = 5;
/** Une harmonie ne dure jamais plus que ceci (s) : au-delà, la suivante commence. */
export const MAX_WINDOW = 8;
/** Une note n'est jamais tenue plus longtemps que ceci (s). */
export const MAX_HOLD = 4;

/**
 * Le clavier de ce tuto n'allume-t-il les touches qu'à la frappe ?
 * @param {{start: number, end: number}[]} notes
 */
export function isFlashRendering(notes) {
  const list = (notes || []).filter((n) => Number.isFinite(n?.start) && Number.isFinite(n?.end));
  if (list.length < FLASH_MIN_NOTES) return false;
  const d = list.map((n) => n.end - n.start).sort((a, b) => a - b);
  const median = d[Math.floor(d.length / 2)];
  const short = d.filter((x) => x <= FLASH_SECONDS + 1e-9).length / d.length;
  return median <= FLASH_MEDIAN + 1e-9 && short >= FLASH_SHARE;
}

/** Notes frappées ensemble (à ATTACK_GROUP près), dans l'ordre du temps. */
function attackGroups(notes) {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const groups = [];
  for (const n of sorted) {
    const last = groups[groups.length - 1];
    if (last && n.start - last.start <= ATTACK_GROUP) last.notes.push(n);
    else groups.push({ start: n.start, notes: [n] });
  }
  return groups;
}

/**
 * Les harmonies successives : [{ start, end, pcs:Set }]. Un silence de plus de MAX_HOLD coupe
 * aussi (le prof s'arrête pour parler).
 */
export function harmonyWindows(notes) {
  const groups = attackGroups(notes || []);
  const windows = [];
  let cur = null;
  let lastAttack = -Infinity;
  for (const g of groups) {
    const pcs = g.notes.map((n) => pcOf(n.midi));
    const low = Math.min(...g.notes.map((n) => n.midi));
    const fresh = cur ? new Set(pcs.filter((pc) => !cur.pcs.has(pc))).size : 0;
    const settled = cur ? g.start - cur.start >= HARMONY_SETTLE : true;
    const gap = g.start - lastAttack > MAX_HOLD;
    // Une harmonie change quand des notes nouvelles arrivent PAR LE BAS (la main gauche bouge),
    // ou en nombre ; une note de plus en haut (la tierce ajoutée, une mélodie) ne la ferme pas.
    // Une basse plus grave, même sur une note déjà entendue, en ouvre une aussi (retour au Mi♭).
    // La basse qui bouge (une autre note, pas plus haut que BASS_REACH au-dessus) change aussi
    // l'harmonie, même sans note nouvelle (Do → La → Fa dans une même tonalité).
    const bassMoves = cur && low !== cur.low && pcOf(low) !== pcOf(cur.low) && low <= cur.low + BASS_REACH;
    const changes = cur && settled && (
      (fresh > 0 && (low <= cur.low + BASS_REACH || fresh >= 2))
      || low <= cur.low - 3
      || bassMoves
      || g.start - cur.start >= MAX_WINDOW
    );
    if (!cur || gap || changes) {
      if (cur) cur.end = gap ? lastAttack + FLASH_SECONDS : g.start;
      cur = { start: g.start, end: null, pcs: new Set(), low };
      windows.push(cur);
    }
    cur.low = Math.min(cur.low, low);
    for (const pc of pcs) cur.pcs.add(pc);
    lastAttack = Math.max(lastAttack, ...g.notes.map((n) => n.end));
  }
  if (cur) cur.end = lastAttack;
  return windows;
}

/**
 * Prolonge chaque note jusqu'à la fin de son harmonie (ou sa prochaine frappe), sans dépasser
 * MAX_HOLD. Les notes déjà longues ne raccourcissent jamais.
 * @param {{midi: number, start: number, end: number}[]} notes
 * @returns {object[]} de nouvelles notes (les entrées ne sont pas modifiées)
 */
export function holdFlashNotes(notes) {
  const list = (notes || []).filter((n) => Number.isFinite(n?.start) && Number.isFinite(n?.end));
  const windows = harmonyWindows(list);
  const nextSame = new Map();
  const byStart = [...list].sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = byStart.length - 1; i >= 0; i -= 1) {
    const n = byStart[i];
    const again = nextSame.get(n.midi);
    nextSame.set(n.midi, n.start);
    const w = windows.find((x) => n.start >= x.start - 1e-9 && n.start < x.end + 1e-9) || null;
    let end = w ? w.end : n.end;
    if (Number.isFinite(again)) end = Math.min(end, again);
    end = Math.min(end, n.start + MAX_HOLD);
    out.push({ ...n, end: round2(Math.max(n.end, end)) });
  }
  return out.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

/** Notes → relevés image par image (pour regrouper les accords sur les notes tenues). */
export function notesToSamples(notes, { fps = 8, duration = null } = {}) {
  const list = (notes || []).filter((n) => Number.isFinite(n?.start) && Number.isFinite(n?.end));
  const last = Number.isFinite(duration) ? duration : list.reduce((m, n) => Math.max(m, n.end), 0);
  const frames = Math.max(1, Math.ceil(last * fps));
  const samples = Array.from({ length: frames }, (_, i) => ({ t: i / fps, keys: [] }));
  for (const n of list) {
    const from = Math.max(0, Math.round(n.start * fps));
    const to = Math.min(frames, Math.max(from + 1, Math.round(n.end * fps)));
    for (let f = from; f < to; f += 1) samples[f].keys.push({ midi: n.midi, hand: n.hand || null });
  }
  return samples;
}

/**
 * La grille d'un rendu « éclair » : un accord par harmonie (harmonyWindows), nommé d'après
 * toutes les notes frappées pendant celle-ci. Même forme que les segments de
 * video-analysis.js (groupSegments + labelSegments) : le reste de l'application ne voit pas
 * la différence. Les harmonies voisines de même nom sont réunies.
 * @param {object[]} notes - notes lues (éclairs), pas encore tenues
 * @param {(midis: number[]) => object} labelNotes - chord-labeling.js
 */
export function flashSegments(notes, labelNotes) {
  const list = (notes || []).filter((n) => Number.isFinite(n?.start) && Number.isFinite(n?.end));
  const out = [];
  for (const w of harmonyWindows(list)) {
    const midis = [...new Set(list.filter((n) => n.start >= w.start - 1e-9 && n.start < w.end).map((n) => n.midi))].sort((a, b) => a - b);
    if (!midis.length) continue;
    const presence = {};
    for (const m of midis) presence[m] = 1;
    const seg = {
      start: round2(w.start),
      end: round2(w.end),
      duration: round2(w.end - w.start),
      midis,
      bassMidi: midis[0],
      presence,
      sampleCount: 0,
      chord: labelNotes(midis),
    };
    const last = out[out.length - 1];
    if (last && last.chord.resolved && seg.chord.resolved && last.chord.label === seg.chord.label && seg.start - last.end < 0.05) {
      last.end = seg.end;
      last.duration = round2(last.end - last.start);
      last.midis = [...new Set([...last.midis, ...seg.midis])].sort((a, b) => a - b);
    } else out.push(seg);
  }
  return out;
}

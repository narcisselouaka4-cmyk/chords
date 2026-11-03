// Un passage prend une place dans le rythme joué ; on ne le comprime pas dans un trou MIDI.
const pc = (n) => ((n % 12) + 12) % 12;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
export const PASSING_TIMING_VERSION = 2;

/** Repères de basse réellement attaqués, sans compter deux fois la couleur d'un même accord. */
function bassAnchors(chords, pairs) {
  const anchors = [];
  for (const c of chords) {
    const bass = Math.min(...c.notes);
    const p = pairs.find((p) => p.event.note === bass && p.event.time >= c.at - .025 && p.event.time < c.at + .35);
    if (!p) continue;
    const last = anchors.at(-1);
    if (last && p.event.time - last.time < .4) {
      if (bass < last.note) anchors[anchors.length - 1] = { time: p.event.time, note: bass };
    } else anchors.push({ time: p.event.time, note: bass });
  }
  return anchors;
}

/** Subdivision locale corroborée par les attaques. Cela n'affirme pas la mesure du morceau. */
function rhythmicWindow(review, pairs, target) {
  const anchors = bassAnchors(review.chords, pairs);
  const arrival = anchors.find((a) => a.time >= target.at - .025 && a.time <= target.at + .35);
  const index = anchors.indexOf(arrival);
  if (index < 1) return null;
  const before = anchors[index - 1].time;
  const span = arrival.time - before;
  if (span < 1 || span > 4) return null;
  const spans = anchors.slice(1).map((a, i) => a.time - anchors[i].time).filter((s) => s >= 1 && s <= 4);
  if (spans.length < 2 || Math.abs(span / median(spans) - 1) > .25) return null;
  const typical = median(spans);
  if (spans.filter((s) => Math.abs(s / typical - 1) <= .2).length / spans.length < .7) return null;
  const step = span / 8;
  const onsets = [];
  pairs.map((p) => p.event.time).filter((t) => t >= before - .07 && t < arrival.time - step / 2).sort((a, b) => a - b).forEach((t) => {
    if (!onsets.length || t - onsets.at(-1) > .07) onsets.push(t);
  });
  // Assez d'attaques réparties sur l'accord ; un accord plaqué ou un rubato ne définit pas une grille.
  if (onsets.length < 5 || onsets.at(-1) - onsets[0] < span * .6) return null;
  const errors = onsets.map((t) => Math.abs((t - before) / step - Math.round((t - before) / step)));
  if (errors.filter((e) => e <= .35).length / onsets.length < .75 || errors.reduce((a, b) => a + b, 0) / errors.length > .2) return null;
  // Trois subdivisions pour entendre l'arpège de passage, à partir d'un contretemps.
  const start = arrival.time - 3 * step;
  const end = arrival.time - Math.min(.025, step * .08);
  return { start, end, step, arrival: arrival.time, attacks: [start, start + step, start + 2 * step] };
}

function heldPedal(events, start, end) {
  let down = false;
  for (const e of events) {
    if (e.time >= end) break;
    if (e.type !== 'control' || e.controller !== 64) continue;
    if (e.time >= start && down) return true;
    down = e.value >= 64;
    if (e.time >= start && down) return true;
  }
  return down;
}

/** Modifier uniquement l'accompagnement qui occupe la place du passage ; la source reste intacte. */
export function planPassingEdit(take, review, pairs, target, previous, notes, anchor) {
  const timing = rhythmicWindow(review, pairs, target);
  if (!timing || heldPedal(take.events, timing.start, timing.end)) return null;
  const allowed = new Set([0, 4, 7, 10].map((n) => pc(notes[0] + n)));
  const melodyFloor = Math.min(Math.max(...previous.notes), Math.max(...target.notes));
  const adjustments = [];
  for (const p of pairs) {
    if (p.event.time >= timing.end || p.end <= timing.start) continue;
    const collision = notes.findIndex((n, i) => n === p.event.note && p.event.time < timing.end && p.end > timing.attacks[i]);
    const incompatible = !allowed.has(pc(p.event.note));
    if (collision < 0 && !incompatible) continue;
    // Ne pas effacer une mélodie dissonante : chercher une autre transition plutôt que la réécrire.
    if (p.event.note >= melodyFloor && incompatible) {
      if (p.end > timing.start + timing.step * .2) return null;
      continue; // simple recouvrement de relâchement au bord de l'attaque
    }
    const boundary = collision >= 0 && !incompatible ? timing.attacks[collision] : timing.start;
    if (p.event.time >= boundary - .01) {
      adjustments.push({ on: p.on, off: p.off, remove: true });
    } else {
      const end = boundary - Math.min(.01, timing.step * .04);
      if (end - p.event.time < .05) return null;
      adjustments.push({ on: p.on, off: p.off, end });
    }
  }
  return { type: 'passing', timingVersion: PASSING_TIMING_VERSION, on: anchor.on, start: timing.start, end: timing.end,
    notes, attacks: timing.attacks, adjustments, rhythm: { step: timing.step, arrival: timing.arrival } };
}

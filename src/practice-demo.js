// [Claude] — 2026-09-24 — Démonstration d'un mouvement (Narcisse : « avoir un
// avant-goût des contenus […] une sorte de bouton Play […] pour savoir dans
// quelle direction on va »).
//
// La démo joue les MÊMES voicings que l'exercice (voicings enchaînés de
// practice-exercise.js, doublures comprises) : on entend exactement ce qu'on va
// jouer. Rien n'est repris d'un enregistrement : le jeu est écrit ici d'après
// des procédés courants du piano gospel / worship (grilles et procédés ne sont
// pas protégés), et le son est celui du piano de l'application (échantillons
// Salamander, licence CC-BY) ou du VST branché sur la sortie MIDI.
//
// Style « Gospel / worship » (choix de Narcisse pour la première version), une
// mesure de 4 temps par accord :
//   - temps 1 : basse en octaves (fondamentale) sous le voicing ; pédale changée ;
//   - temps 2 et 4 : le voicing rejoué, plus court et plus doux ;
//   - 4e temps « et » : la basse approche la fondamentale suivante par demi-ton,
//     et la voix qui bouge le moins anticipe sa note de l'accord suivant
//     (petit mouvement interne) ;
//   - dernier accord : arpégé du grave à l'aigu, tenu.
// Les temps sont exprimés en temps (noires) ; le lecteur les convertit selon le tempo.

export const DEMO_STYLES = {
  gospel: { label: 'Gospel / worship', tempo: 72, beatsPerChord: 4 },
};

const LOWEST_BASS = 28; // Mi1 : plus grave, la basse devient un grondement.

/** Basse en octaves sous le voicing : [grave, aigu], ou une seule note faute de place. */
export function bassOctave(rootPc, voicingNotes) {
  const lowest = Math.min(...voicingNotes);
  // Octave entière au moins une tierce mineure sous le voicing.
  for (let high = lowest - 3; high >= LOWEST_BASS + 12; high -= 1) {
    if (((high % 12) + 12) % 12 === rootPc) return [high - 12, high];
  }
  for (let low = lowest - 3; low >= LOWEST_BASS; low -= 1) {
    if (((low % 12) + 12) % 12 === rootPc) return [low];
  }
  return [];
}

/**
 * Note d'approche de la basse suivante : un demi-ton sous elle si la basse
 * monte, au-dessus si elle descend ; rien si la fondamentale ne change pas.
 */
export function bassApproach(currentBass, nextBass) {
  if (currentBass == null || nextBass == null || currentBass === nextBass) return null;
  return nextBass > currentBass ? nextBass - 1 : nextBass + 1;
}

/**
 * Petit mouvement interne vers l'accord suivant : la note du voicing qui a le
 * plus court chemin (1 ou 2 demi-tons) vers une note de l'accord suivant, et
 * cette note d'arrivée. null si tout est tenu ou si tout saute.
 * @returns {{from: number, to: number}|null}
 */
export function innerMovement(current, next) {
  let best = null;
  for (const from of current) {
    for (const to of next) {
      const d = Math.abs(to - from);
      if (d === 0 || d > 2 || current.includes(to)) continue;
      if (!best || d < best.d || (d === best.d && from > best.from)) best = { from, to, d };
    }
  }
  return best ? { from: best.from, to: best.to } : null;
}

/**
 * Démo gospel / worship d'une grille.
 * @param {{name: string, rootPc: number, notes: number[]}[]} chords - voicings de l'exercice
 * @param {{beatsPerChord?: number}} [options]
 * @returns {{events: {time: number, type: 'noteOn'|'noteOff'|'sustain'|'step', note?: number, velocity?: number, value?: boolean, step?: number}[], beats: number}}
 */
export function buildGospelDemo(chords, { beatsPerChord = DEMO_STYLES.gospel.beatsPerChord } = {}) {
  const events = [];
  const note = (time, n, velocity, duration) => {
    events.push({ time, type: 'noteOn', note: n, velocity });
    events.push({ time: time + duration, type: 'noteOff', note: n });
  };
  const sorted = chords.map((c) => [...new Set(c.notes)].sort((a, b) => a - b));
  const basses = chords.map((c, i) => bassOctave(c.rootPc, sorted[i]));
  // Nuance légèrement variée d'un accord à l'autre, sans hasard (démo reproductible).
  const shade = (i, base) => Math.min(1, Math.max(0.3, base + ((i % 3) - 1) * 0.03));

  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const voicing = sorted[i];
    const bass = basses[i];
    const last = i === chords.length - 1;
    events.push({ time: t, type: 'step', step: i });
    // Pédale : relevée juste avant le temps, reprise juste après (legato sans mélange).
    if (i > 0) events.push({ time: t - 0.03, type: 'sustain', value: false });
    events.push({ time: t + 0.06, type: 'sustain', value: true });
    bass.forEach((n) => note(t, n, shade(i, 0.78), last ? beatsPerChord : beatsPerChord - 0.5));
    if (last) {
      // Accord final arpégé du grave à l'aigu, tenu.
      voicing.forEach((n, k) => note(t + k * 0.06, n, shade(i, 0.64), beatsPerChord - k * 0.06));
      events.push({ time: t + beatsPerChord, type: 'sustain', value: false });
      return;
    }
    voicing.forEach((n) => note(t, n, shade(i, 0.66), 0.9));
    voicing.forEach((n) => note(t + 1, n, shade(i, 0.5), 0.45));
    voicing.forEach((n) => note(t + 3, n, shade(i, 0.55), 0.45));
    // 4e temps « et » : approche de la basse et mouvement interne.
    const nextBass = basses[i + 1];
    const approach = bassApproach(bass[bass.length - 1], nextBass[nextBass.length - 1]);
    if (approach != null) note(t + 3.5, approach, shade(i, 0.6), 0.5);
    const move = innerMovement(voicing, sorted[i + 1]);
    if (move) note(t + 3.5, move.to, shade(i, 0.5), 0.5);
  });

  events.sort((a, b) => a.time - b.time || order(a) - order(b));
  return { events, beats: chords.length * beatsPerChord };
}

// À temps égal : relâcher et changer la pédale avant de rejouer.
function order(e) {
  if (e.type === 'noteOff') return 0;
  if (e.type === 'sustain') return e.value ? 3 : 1;
  if (e.type === 'step') return 2;
  return 4;
}

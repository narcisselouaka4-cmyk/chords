// [Claude] — 2026-09-24 — Démonstration d'un mouvement (Narcisse : « avoir un
// avant-goût des contenus […] une sorte de bouton Play […] pour savoir dans
// quelle direction on va »).
//
// La démo joue les MÊMES voicings que l'exercice (voicings enchaînés de
// practice-exercise.js, doublures comprises) : on entend exactement ce qu'on va
// jouer. Rien n'est repris d'un enregistrement : le jeu est écrit ici d'après
// des procédés courants du piano (grilles et procédés ne sont pas protégés), et
// le son est celui du piano de l'application (échantillons Salamander, licence
// CC-BY) ou du VST branché sur la sortie MIDI.
//
// Quatre styles, une mesure de 4 temps par accord :
//   - Gospel / worship (72) : basse en octaves au 1er temps, voicing rejoué sur
//     les temps 2 et 4, pédale changée à chaque accord ; au 4e temps « et », la
//     basse approche la fondamentale suivante par demi-ton et la voix qui bouge
//     le moins anticipe sa note de l'accord suivant ; dernier accord arpégé.
//   - Ballade (60) : basse seule au 1er temps, voicing arpégé doucement du grave
//     à l'aigu, les deux notes du dessus reprises au 3e temps, pédale changée à
//     chaque accord ; dernier accord arpégé plus lentement.
//   - Comping swing (132) : rythme « Charleston » — accord court au 1er temps
//     puis au « et » du 2e temps (croche swinguée, aux deux tiers du temps) —,
//     basse au 1er temps, sans pédale ; dernier accord tenu.
//   - Plaqué (72) : le voicing seul, tenu toute la mesure, pour entendre
//     l'harmonie sans rien d'autre.
// Les temps sont exprimés en temps (noires) ; le lecteur les convertit selon le tempo.

export const DEMO_STYLES = {
  gospel: { label: 'Gospel / worship', tempo: 72, beatsPerChord: 4, build: buildGospelDemo },
  ballade: { label: 'Ballade', tempo: 60, beatsPerChord: 4, build: buildBalladeDemo },
  swing: { label: 'Comping swing', tempo: 132, beatsPerChord: 4, build: buildSwingDemo },
  plaque: { label: 'Plaqué', tempo: 72, beatsPerChord: 4, build: buildPlaqueDemo },
};

/** Ordre d'affichage des styles. */
export const DEMO_STYLE_IDS = ['gospel', 'ballade', 'swing', 'plaque'];

/**
 * Style par défaut d'un mouvement, d'après son style (champ `style` de la
 * bibliothèque) : jazz → Comping swing, gospel et worship → Gospel / worship ;
 * sans style (« Ma grille ») → Ballade.
 */
export function defaultDemoStyle(movementStyle) {
  return { jazz: 'swing', gospel: 'gospel', worship: 'gospel' }[movementStyle] || 'ballade';
}

/** Démo d'une grille dans le style demandé (Gospel / worship si inconnu). */
export function buildDemo(chords, styleId) {
  const style = DEMO_STYLES[styleId] || DEMO_STYLES.gospel;
  return style.build(chords, { beatsPerChord: style.beatsPerChord });
}

const LOWEST_BASS = 28; // Mi1 : plus grave, la basse devient un grondement.
const HIGHEST_SINGLE_BASS = 47; // Si2 : une basse seule reste dans le grave.
const SWING_OFFBEAT = 2 / 3; // croche swinguée : aux deux tiers du temps.

const pcOf = (n) => ((n % 12) + 12) % 12;

/** Basse en octaves sous le voicing : [grave, aigu], ou une seule note faute de place. */
export function bassOctave(rootPc, voicingNotes) {
  const lowest = Math.min(...voicingNotes);
  // Octave entière au moins une tierce mineure sous le voicing.
  for (let high = lowest - 3; high >= LOWEST_BASS + 12; high -= 1) {
    if (pcOf(high) === rootPc) return [high - 12, high];
  }
  for (let low = lowest - 3; low >= LOWEST_BASS; low -= 1) {
    if (pcOf(low) === rootPc) return [low];
  }
  return [];
}

/**
 * Basse seule (fondamentale) entre Mi1 et Si2, au moins une tierce mineure sous
 * le voicing ; aucune si le voicing a déjà sa fondamentale dans ce grave.
 * @returns {number|null}
 */
export function bassNote(rootPc, voicingNotes) {
  const lowest = Math.min(...voicingNotes);
  if (pcOf(lowest) === rootPc && lowest <= HIGHEST_SINGLE_BASS) return null;
  for (let n = Math.min(lowest - 3, HIGHEST_SINGLE_BASS); n >= LOWEST_BASS; n -= 1) {
    if (pcOf(n) === rootPc) return n;
  }
  return null;
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
 * Partition en cours d'écriture : notes, pédale et repères d'accord, triés à la fin.
 * La nuance varie légèrement d'un accord à l'autre, sans hasard (démo reproductible).
 */
function createScore(chords) {
  const events = [];
  return {
    events,
    voicings: chords.map((c) => [...new Set(c.notes)].sort((a, b) => a - b)),
    note(time, n, velocity, duration) {
      events.push({ time, type: 'noteOn', note: n, velocity });
      events.push({ time: time + duration, type: 'noteOff', note: n });
    },
    step(time, i) {
      events.push({ time, type: 'step', step: i });
    },
    pedal(time, down) {
      events.push({ time, type: 'sustain', value: down });
    },
    // Pédale changée sur le temps : relevée juste avant, reprise juste après
    // (legato sans mélange des deux accords).
    pedalChange(time, first) {
      if (!first) events.push({ time: time - 0.03, type: 'sustain', value: false });
      events.push({ time: time + 0.06, type: 'sustain', value: true });
    },
    shade(i, base) {
      return Math.min(1, Math.max(0.3, base + ((i % 3) - 1) * 0.03));
    },
    finish(beats) {
      events.sort((a, b) => a.time - b.time || order(a) - order(b));
      return { events, beats };
    },
  };
}

/**
 * Démo gospel / worship d'une grille.
 * @param {{name: string, rootPc: number, notes: number[]}[]} chords - voicings de l'exercice
 * @param {{beatsPerChord?: number}} [options]
 * @returns {{events: {time: number, type: 'noteOn'|'noteOff'|'sustain'|'step', note?: number, velocity?: number, value?: boolean, step?: number}[], beats: number}}
 */
export function buildGospelDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore(chords);
  const basses = chords.map((c, i) => bassOctave(c.rootPc, score.voicings[i]));

  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const voicing = score.voicings[i];
    const bass = basses[i];
    const last = i === chords.length - 1;
    score.step(t, i);
    score.pedalChange(t, i === 0);
    bass.forEach((n) => score.note(t, n, score.shade(i, 0.78), last ? beatsPerChord : beatsPerChord - 0.5));
    if (last) {
      // Accord final arpégé du grave à l'aigu, tenu.
      voicing.forEach((n, k) => score.note(t + k * 0.06, n, score.shade(i, 0.64), beatsPerChord - k * 0.06));
      score.pedal(t + beatsPerChord, false);
      return;
    }
    voicing.forEach((n) => score.note(t, n, score.shade(i, 0.66), 0.9));
    voicing.forEach((n) => score.note(t + 1, n, score.shade(i, 0.5), 0.45));
    voicing.forEach((n) => score.note(t + 3, n, score.shade(i, 0.55), 0.45));
    // 4e temps « et » : approche de la basse et mouvement interne.
    const nextBass = basses[i + 1];
    const approach = bassApproach(bass[bass.length - 1], nextBass[nextBass.length - 1]);
    if (approach != null) score.note(t + 3.5, approach, score.shade(i, 0.6), 0.5);
    const move = innerMovement(voicing, score.voicings[i + 1]);
    if (move) score.note(t + 3.5, move.to, score.shade(i, 0.5), 0.5);
  });

  return score.finish(chords.length * beatsPerChord);
}

/**
 * Démo ballade : basse seule, voicing arpégé doucement du grave à l'aigu (en
 * doubles croches à partir du « et » du 1er temps), les deux notes du dessus
 * reprises au 3e temps, pédale changée à chaque accord.
 */
export function buildBalladeDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore(chords);
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const voicing = score.voicings[i];
    const last = i === chords.length - 1;
    score.step(t, i);
    score.pedalChange(t, i === 0);
    const bass = bassNote(chord.rootPc, voicing);
    if (bass != null) score.note(t, bass, score.shade(i, 0.62), beatsPerChord - 0.1);
    // Arpège : plus lent sur l'accord final, qui conclut.
    const stepBeats = last ? 0.33 : 0.25;
    voicing.forEach((n, k) => {
      const start = 0.5 + k * stepBeats;
      score.note(t + start, n, score.shade(i, 0.48 + k * 0.02), beatsPerChord - start - 0.1);
    });
    if (last) {
      score.pedal(t + beatsPerChord, false);
      return;
    }
    // 3e temps : les deux notes du dessus reprises, plus doucement.
    voicing.slice(-2).forEach((n) => score.note(t + 2, n, score.shade(i, 0.42), 1.9));
  });
  return score.finish(chords.length * beatsPerChord);
}

/**
 * Démo comping swing : basse au 1er temps, accords courts en rythme
 * « Charleston » (1er temps, puis « et » du 2e temps en croche swinguée), sans
 * pédale ; le dernier accord est tenu.
 */
export function buildSwingDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore(chords);
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    const voicing = score.voicings[i];
    const last = i === chords.length - 1;
    score.step(t, i);
    const bass = bassNote(chord.rootPc, voicing);
    if (last) {
      if (bass != null) score.note(t, bass, score.shade(i, 0.7), beatsPerChord - 1);
      voicing.forEach((n) => score.note(t, n, score.shade(i, 0.64), beatsPerChord - 1));
      return;
    }
    if (bass != null) score.note(t, bass, score.shade(i, 0.7), 0.9);
    voicing.forEach((n) => score.note(t, n, score.shade(i, 0.6), 0.55));
    // Anticipation du 2e temps, accentuée.
    voicing.forEach((n) => score.note(t + 1 + SWING_OFFBEAT, n, score.shade(i, 0.68), 0.4));
  });
  return score.finish(chords.length * beatsPerChord);
}

/** Démo plaquée : le voicing seul, tenu toute la mesure. */
export function buildPlaqueDemo(chords, { beatsPerChord = 4 } = {}) {
  const score = createScore(chords);
  chords.forEach((chord, i) => {
    const t = i * beatsPerChord;
    score.step(t, i);
    score.voicings[i].forEach((n) => score.note(t, n, score.shade(i, 0.6), beatsPerChord - 0.08));
  });
  return score.finish(chords.length * beatsPerChord);
}

// À temps égal : relâcher et changer la pédale avant de rejouer.
function order(e) {
  if (e.type === 'noteOff') return 0;
  if (e.type === 'sustain') return e.value ? 3 : 1;
  if (e.type === 'step') return 2;
  return 4;
}

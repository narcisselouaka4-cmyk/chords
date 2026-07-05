import { detectChord } from '../chord-engine/index.js';

// [Claude] — 2026-07-03 — Calcul du voice leading entre deux accords.
// Chaque note de l'accord précédent est associée à la note la plus proche de l'accord suivant
// en termes de classes de hauteur. On minimise le mouvement total.
export function buildVoiceLeading(fromNotes, toNotes) {
  if (!fromNotes?.length || !toNotes?.length) return null;

  const fromPcs = [...new Set(fromNotes.map((n) => n % 12))].sort((a, b) => a - b);
  const toPcs = [...new Set(toNotes.map((n) => n % 12))].sort((a, b) => a - b);

  const movements = [];
  let totalMovement = 0;

  // Greedy matching: for each source pitch class, find closest destination pitch class
  const used = new Set();
  for (const fromPc of fromPcs) {
    let bestTo = null;
    let bestDistance = Infinity;

    for (const toPc of toPcs) {
      if (used.has(toPc)) continue;
      const rawDistance = Math.abs(toPc - fromPc);
      const distance = Math.min(rawDistance, 12 - rawDistance);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTo = toPc;
      }
    }

    if (bestTo !== null) {
      used.add(bestTo);
      const rawSemitones = bestTo - fromPc;
      const signedSemitones =
        rawSemitones > 6 ? rawSemitones - 12 : rawSemitones < -6 ? rawSemitones + 12 : rawSemitones;
      movements.push({ from: fromPc, to: bestTo, semitones: signedSemitones });
      totalMovement += Math.abs(signedSemitones);
    } else {
      movements.push({ from: fromPc, to: null, semitones: 0 });
    }
  }

  return { movements, totalMovement };
}

// [Claude] — 2026-07-03 — Score de fluidité : inversement proportionnel au mouvement total.
// Moins les voix bougent inutilement, plus le score est élevé.
export function buildFluidityScore(voiceLeadings, maxMovement = 24) {
  if (!voiceLeadings?.length) return null;
  const total = voiceLeadings.reduce((sum, vl) => sum + (vl?.totalMovement || 0), 0);
  const average = total / voiceLeadings.length;
  const normalized = Math.min(average / maxMovement, 1);
  return Math.round((1 - normalized) * 100);
}

// [Claude] — 2026-07-03 — Score de tension : proportion de notes de tension (9/11/13/altérations)
// par rapport aux notes de base de l'accord.
export function buildTensionScore(results) {
  if (!results?.length) return null;
  let totalTension = 0;
  let totalChordTones = 0;

  for (const result of results) {
    if (!result) continue;
    const intervals = result.intervals || [];
    const tensionIntervals = intervals.filter((i) =>
      [2, 5, 6, 8, 9, 10, 11, 13, 14, 15, 17, 18, 20, 21].includes(i)
    );
    totalTension += tensionIntervals.length;
    totalChordTones += Math.max(intervals.length, 3);
  }

  if (totalChordTones === 0) return 0;
  return Math.round((totalTension / totalChordTones) * 100);
}

// [Claude] — 2026-07-03 — Score de richesse harmonique : diversité des types d'accords utilisés.
export function buildRichnessScore(results) {
  if (!results?.length) return null;
  const symbols = new Set(results.filter(Boolean).map((r) => r.symbol));
  const ratio = symbols.size / results.length;
  return Math.round(Math.min(ratio, 1) * 100);
}

// [Claude] — 2026-07-03 — Analyse complète d'une séquence d'accords pour le Module 2.
export function analyzeSequence(chords) {
  if (!chords?.length) return null;

  const analyzed = chords.map((chord, index) => {
    const notes = chord.notes || [];
    const result = detectChord(notes);
    const prevResult = index > 0 ? analyzed[index - 1]?.result : null;
    const voiceLeading =
      prevResult && result ? buildVoiceLeading(prevResult.notes, result.notes) : null;

    return {
      ...chord,
      result,
      voiceLeading,
    };
  });

  const voiceLeadings = analyzed.map((a) => a.voiceLeading).filter(Boolean);
  const results = analyzed.map((a) => a.result).filter(Boolean);

  return {
    chords: analyzed,
    fluidity: buildFluidityScore(voiceLeadings),
    tension: buildTensionScore(results),
    richness: buildRichnessScore(results),
  };
}

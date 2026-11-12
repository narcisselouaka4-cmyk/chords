/** Les temps écrits restent des noires ; la pulsation latine est à la blanche.
 * Le tempo de présentation est le nouveau 1×, sans modifier le relevé source. */
export function studyTempo(entry, fallback = 72) {
  const score = (entry?.phraseStudy || entry)?.score;
  return (score?.tempo || fallback) * (score?.performanceRate || 1.3);
}

export function studyPulse(entry) {
  return (entry?.phraseStudy || entry)?.score?.pulseBeats || 1;
}

/** Regroupe les gestes sous leurs accords d'accompagnement, sans enrichissement
 * automatique. Les licks possèdent des repères explicites issus de la source. */
export function studyForPlayback(entry, mode = 'auto') {
  const source = entry?.phraseStudy || entry;
  if (!source?.score?.preserveTexture || mode !== 'plaque') return source;
  const { steps } = source.score;
  let harmony = source.score.harmony;
  if (!harmony) {
    harmony = [];
    source.pattern.split('-').forEach((token, i) => {
      const previous = harmony.at(-1);
      if (previous?.token === token) previous.to = i + 1;
      else harmony.push({ from: i, to: i + 1, token, lh: steps[i].lh, rh: steps[i].rh });
    });
  }
  return {
    ...source, phraseStudy: source,
    pattern: harmony.map(s => s.token).join('-'),
    roles: harmony.map(() => 'structural'),
    score: { ...source.score, harmony: [], practice: null, carryAcrossSteps: false,
      steps: harmony.map(s => {
        const beats = steps.slice(s.from, s.to).reduce((sum, step) => sum + step.beats, 0);
        return { beats, lh: s.lh, rh: s.rh, label: 'Accord d’accompagnement',
          attacks: ['lh','rh'].map(hand => ({ at: 0, hand, notes: s[hand], duration: beats - .05, velocity: .6 })) };
      }),
    },
  };
}

export function harmonyTokenAt(entry, index) {
  return entry.score?.harmony?.find(s => index >= s.from && index < s.to)?.token
    || entry.pattern.split('-')[index];
}

/** Les motifs ont plusieurs attaques par accord. La frise expose ces gestes,
 * tandis que l'exercice conserve ses repères harmoniques et ses notes écrites. */
export function phraseGestures(chords) {
  let start = 0;
  return chords.flatMap((chord, stepIndex) => {
    const step = chord.studyStep;
    const groups = new Map();
    for (const a of step.attacks) {
      const notes = a.notes?.map(n => n + step.keyPc)
        || (a.hand === 'lh' ? chord.voicing.leftHand : chord.voicing.rightHand);
      if (!notes.length) continue;
      if (!groups.has(a.at)) groups.set(a.at, []);
      groups.get(a.at).push(...notes);
    }
    const rows = [...groups].sort(([a],[b])=>a-b).map(([at, notes]) => ({
      ...chord, notes: [...new Set(notes)].sort((a,b)=>a-b), pathStep: stepIndex, phraseBeat: start + at,
    }));
    start += step.beats;
    return rows;
  });
}

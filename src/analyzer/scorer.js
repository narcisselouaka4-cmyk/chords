// [OpenCode] — 2026-07-04 — Scoring de la qualité harmonique d'une session.

const MAJOR_SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11];

export function scoreSession(chords, keyPc = null) {
  if (!chords || chords.length === 0) {
    return {
      voiceLeading: { value: 0, comment: 'Aucun accord détecté' },
      transitions: { value: 0, comment: 'Aucune transition à évaluer' },
      tensions: { value: 0, comment: 'Aucune tension détectée' },
      innerVoices: { value: 0, comment: 'Pas de mouvement interne' },
    };
  }

  return {
    voiceLeading: scoreVoiceLeading(chords),
    transitions: scoreTransitions(chords, keyPc),
    tensions: scoreTensions(chords),
    innerVoices: scoreInnerVoices(chords),
  };
}

function scoreVoiceLeading(chords) {
  let totalMovement = 0;
  let count = 0;

  for (let i = 1; i < chords.length; i++) {
    const prev = chords[i - 1];
    const curr = chords[i];
    const prevRoot = prev.bassPc ?? prev.rootPc;
    const currRoot = curr.bassPc ?? curr.rootPc;
    const raw = Math.abs(currRoot - prevRoot);
    const movement = Math.min(raw, 12 - raw);
    totalMovement += movement;
    count++;
  }

  const avgMovement = count > 0 ? totalMovement / count : 0;
  // In jazz/gospel, stepwise or 4th/5th root movements are good.
  // 0-2 semitones = excellent, 3-4 = good, 5-6 = average, >6 = poor
  let value;
  if (avgMovement <= 2) value = 9 + (2 - avgMovement) / 2;
  else if (avgMovement <= 4) value = 7 + (4 - avgMovement);
  else if (avgMovement <= 6) value = 5 + (6 - avgMovement) / 2;
  else value = Math.max(0, 10 - (avgMovement - 6) * 1.5);
  value = Math.round(Math.min(10, value) * 10) / 10;

  let comment = 'Mouvements de voix corrects';
  if (value >= 8) comment = 'Mouvements de voix fluides';
  else if (value <= 4) comment = 'Mouvements de voix abrupts';

  return { value, comment };
}

function scoreTransitions(chords, keyPc) {
  let good = 0;
  let count = 0;

  const isFifthDown = (fromRoot, toRoot) => {
    const diff = (toRoot - fromRoot + 12) % 12;
    return diff === 7; // V -> I or II -> VI etc.
  };

  for (let i = 1; i < chords.length; i++) {
    const prev = chords[i - 1];
    const curr = chords[i];
    const prevRoot = prev.rootPc;
    const currRoot = curr.rootPc;

    if (isFifthDown(prevRoot, currRoot)) good++;
    if (isFifthDown(currRoot, prevRoot)) good += 0.5;
    count++;
  }

  let value = count > 0 ? (good / count) * 10 : 0;
  value = Math.min(10, Math.round(value * 10) / 10);

  let comment = 'Transitions standard';
  if (value >= 8) comment = 'Excellente utilisation des résolutions V-I';
  else if (value <= 4) comment = 'Transitions peu conventionnelles';

  return { value, comment };
}

function scoreTensions(chords) {
  let tensionCount = 0;
  let total = 0;

  for (const chord of chords) {
    total++;
    const symbol = chord.symbol;
    if (symbol.includes('9') || symbol.includes('11') || symbol.includes('13') || symbol.includes('#') || symbol.includes('b')) {
      tensionCount++;
    }
  }

  const ratio = total > 0 ? tensionCount / total : 0;
  let value = ratio * 10;
  value = Math.min(10, Math.round(value * 10) / 10);

  let comment = 'Utilisation modérée des tensions';
  if (value >= 8) comment = 'Riche utilisation des tensions et extensions';
  else if (value <= 3) comment = 'Peu de tensions ou d\'extensions';

  return { value, comment };
}

function scoreInnerVoices(chords) {
  let richCount = 0;
  let total = 0;

  for (const chord of chords) {
    total++;
    const noteCount = chord.notes?.length || 0;
    const techniques = chord.techniques || [];
    if (noteCount >= 4 || techniques.length > 0) {
      richCount++;
    }
  }

  const ratio = total > 0 ? richCount / total : 0;
  let value = 4 + ratio * 6;
  value = Math.min(10, Math.round(value * 10) / 10);

  let comment = 'Voix internes simples mais cohérentes';
  if (value >= 8) comment = 'Voix internes riches et variées';
  else if (value <= 5) comment = 'Voix internes très simples';

  return { value, comment };
}

// [Claude] — 2026-09-05 — Coach d'accompagnement au chant : rapport en trois parties.
//
// Transforme les métriques (accompaniment-metrics.js) en observations
// affichables, dans le format demandé par Narcisse : ce qui va bien / ce qui
// bloque / ce qui gagnerait à être allégé ou enlevé.
//
// DISCIPLINE DE CE MODULE — c'est le point le plus important du chantier.
// Le rapport ne note pas, il montre. Aucun score global, aucun verdict du type
// « tu joues trop » : ce verdict supposerait un seuil (« à partir de quel taux
// de recouvrement ? ») qui ne peut être calibré que sur du jeu réel de
// Narcisse, ce qui n'a pas encore eu lieu. Chaque observation produite ici
// repose donc sur l'une des trois bases suivantes, et sur aucune autre :
//
//   'fact'      — un comptage brut, vrai par construction.
//                 « 3 respirations sur 12 sont restées sans réponse. »
//   'ranking'   — un classement relatif, sans seuil absolu.
//                 « Vos trois phrases les plus couvertes sont les n° 4, 7 et 2. »
//   'direction' — une comparaison dont le SENS souhaité vient de l'objectif que
//                 Narcisse a lui-même énoncé (« un bon pianiste accompagnateur
//                 laisse la voix mise en avant et rebondit uniquement sur les
//                 moments de vide »). Le sens est jugé, jamais l'ampleur.
//
// Tout ce qui dépendrait d'un seuil absolu est exposé comme chiffre nu dans
// `facts`, sans commentaire de valeur, et `calibration.calibrated` reste false.

/**
 * Formate un instant en mm:ss.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Formate un ratio en pourcentage entier.
 * @param {number|null} value
 * @returns {string}
 */
export function formatPercent(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)} %`;
}

function finding(id, section, basis, text, extra = {}) {
  return {
    id,
    section,
    basis,
    text,
    calibrated: false,
    confidence: extra.confidence || 'high',
    ...extra,
  };
}

/**
 * Construit le rapport en trois parties.
 *
 * @param {ReturnType<import('./accompaniment-metrics.js').analyzeAccompaniment>} analysis
 * @param {object} [options]
 * @param {number} [options.topPhrases] - taille des classements
 * @returns {{
 *   strengths: object[], blockers: object[], toLighten: object[],
 *   facts: object[], calibration: object, replay: object[]
 * }}
 */
export function buildCoachReport(analysis, options = {}) {
  const topN = options.topPhrases ?? 3;
  const space = analysis.space;
  const register = analysis.register;

  const strengths = [];
  const blockers = [];
  const toLighten = [];
  const facts = [];
  const replay = [];

  // ---------------------------------------------------------------------
  // Rien joué : on le dit, on ne fabrique pas un rapport vide d'apparence
  // normale.
  // ---------------------------------------------------------------------
  if (!space.noteCount) {
    return {
      strengths: [],
      blockers: [finding('no-play', 'blockers', 'fact',
        'Aucune note n\'a été jouée pendant la séance : il n\'y a rien à analyser.')],
      toLighten: [],
      facts: [],
      replay: [],
      calibration: buildCalibrationNote(),
      empty: true,
    };
  }

  // ---------------------------------------------------------------------
  // 1. DIRECTION — densité sous la voix vs densité dans les respirations.
  //    C'est la mesure qui répond le plus directement au constat de départ.
  // ---------------------------------------------------------------------
  const dr = space.density.ratio;
  const noAnswerAtAll = space.gapsDuration > 0
    && space.density.onsetsDuringGaps === 0
    && space.density.onsetsDuringSinging > 0;

  if (noAnswerAtAll) {
    // Cas extrême, et c'est justement celui que Narcisse se reproche : tout le
    // jeu tombe sous la voix, aucune respiration n'est habitée. Le rapport de
    // densités n'est pas calculable (division par zéro) ; le dire en clair vaut
    // mieux que de laisser un silence là où le constat est le plus net.
    blockers.push(finding('density-all-under-voice', 'blockers', 'direction',
      `Vos ${space.density.onsetsDuringSinging} attaques tombent toutes pendant que la voix `
      + `chante : aucune des ${space.gapFill.gapCount} respirations n'a reçu de réponse. `
      + `C'est l'inverse exact du réflexe que vous visez.`,
      { metric: 'density.onsetsDuringGaps', value: 0 }));
  } else if (dr !== null) {
    if (dr > 1) {
      blockers.push(finding('density-inverted', 'blockers', 'direction',
        `Vous jouez ${formatRatio(dr)} fois plus d'attaques par seconde pendant que la voix `
        + `chante (${formatDensity(space.density.duringSinging)}) que dans les respirations `
        + `(${formatDensity(space.density.duringGaps)}). C'est l'inverse du réflexe que vous `
        + `visez : laisser la voix devant et rebondir dans les vides.`,
        { metric: 'density.ratio', value: dr }));
    } else {
      strengths.push(finding('density-correct', 'strengths', 'direction',
        `Votre jeu est plus dense dans les respirations (${formatDensity(space.density.duringGaps)} `
        + `attaques/s) que sous la voix (${formatDensity(space.density.duringSinging)}) : `
        + `c'est exactement le réflexe d'accompagnateur que vous cherchez.`,
        { metric: 'density.ratio', value: dr }));
    }
  } else if (space.density.duringSinging !== null && space.gapsDuration === 0) {
    facts.push(finding('no-gaps', 'facts', 'fact',
      'La voix ne laisse aucune respiration interne sur cette région : la comparaison '
      + 'entre densité sous la voix et densité dans les vides n\'a pas de sens ici.'));
  }

  // ---------------------------------------------------------------------
  // 2. FAIT — les respirations rendues, et celles laissées sans réponse.
  // ---------------------------------------------------------------------
  const gf = space.gapFill;
  if (gf.gapCount > 0) {
    const unanswered = gf.gapCount - gf.answeredCount;
    if (gf.answeredCount > 0) {
      strengths.push(finding('gaps-answered', 'strengths', 'fact',
        `Vous avez répondu dans ${gf.answeredCount} respiration${gf.answeredCount > 1 ? 's' : ''} `
        + `sur ${gf.gapCount}.`,
        { metric: 'gapFill.answeredCount', value: gf.answeredCount }));
    }
    if (unanswered > 0 && !noAnswerAtAll) {
      const missed = gf.gaps.filter((g) => !g.answered);
      blockers.push(finding('gaps-unanswered', 'blockers', 'fact',
        `${unanswered} respiration${unanswered > 1 ? 's sont restées' : ' est restée'} `
        + `sans réponse : ${missed.slice(0, 4).map((g) => formatTime(g.start)).join(', ')}`
        + `${missed.length > 4 ? '…' : ''}. Ce sont des places offertes au piano.`,
        { metric: 'gapFill.unanswered', value: unanswered }));
      for (const gap of missed.slice(0, 4)) {
        replay.push({
          kind: 'gap',
          label: `Respiration à ${formatTime(gap.start)}`,
          start: gap.start,
          end: gap.end,
          reason: 'Aucune note jouée dans ce vide.',
        });
      }
    }
  }

  if (noAnswerAtAll) {
    for (const gap of gf.gaps.slice(0, 4)) {
      replay.push({
        kind: 'gap',
        label: `Respiration à ${formatTime(gap.start)}`,
        start: gap.start,
        end: gap.end,
        reason: 'Aucune note jouée dans ce vide.',
      });
    }
  }

  // ---------------------------------------------------------------------
  // 3. CLASSEMENT — les phrases les plus couvertes par le piano.
  //    Un classement ne suppose aucun seuil : il dit « celles-ci d'abord »,
  //    pas « celles-ci sont mauvaises ».
  // ---------------------------------------------------------------------
  const rankable = space.phrases.filter((p) => p.overlapRatio !== null);
  if (rankable.length > 0) {
    const densest = [...rankable].sort((a, b) => {
      if (b.overlapRatio !== a.overlapRatio) return b.overlapRatio - a.overlapRatio;
      return (b.density ?? 0) - (a.density ?? 0);
    }).slice(0, topN);

    if (densest.length > 0 && densest[0].overlapRatio > 0) {
      const listed = densest
        .filter((p) => p.overlapRatio > 0)
        .map((p) => `n° ${p.index + 1} (${formatTime(p.start)}, `
          + `${formatPercent(p.overlapRatio)} couverte, ${p.onsetCount} attaque${p.onsetCount > 1 ? 's' : ''})`);
      toLighten.push(finding('densest-phrases', 'toLighten', 'ranking',
        `Les phrases où votre jeu couvre le plus la voix : ${listed.join(', ')}. `
        + `Réécoutez-les d'abord : c'est là que l'allègement se verra le plus.`,
        { metric: 'phrases.overlapRatio', value: densest[0].overlapRatio }));
      for (const p of densest.filter((x) => x.overlapRatio > 0)) {
        replay.push({
          kind: 'phrase',
          label: `Phrase ${p.index + 1}`,
          start: p.start,
          end: p.end,
          reason: `${formatPercent(p.overlapRatio)} de la phrase couverte, ${p.onsetCount} attaques.`,
        });
      }
    }

    // Les phrases laissées libres méritent d'être nommées : c'est le geste
    // réussi, et il est aussi instructif que le geste raté.
    const clearest = rankable.filter((p) => p.overlapRatio === 0);
    if (clearest.length > 0) {
      strengths.push(finding('clear-phrases', 'strengths', 'fact',
        `${clearest.length} phrase${clearest.length > 1 ? 's ont' : ' a'} été laissée`
        + `${clearest.length > 1 ? 's' : ''} entièrement libre${clearest.length > 1 ? 's' : ''} `
        + `(${clearest.slice(0, 4).map((p) => `n° ${p.index + 1}`).join(', ')}`
        + `${clearest.length > 4 ? '…' : ''}) : la voix y passe seule.`,
        { metric: 'phrases.clearCount', value: clearest.length }));
    }
  }

  // ---------------------------------------------------------------------
  // 4. COUCHE 2 — registre. Toujours étiquetée comme une tendance, jamais
  //    comme un constat : l'extraction de hauteur se trompe une fois sur deux.
  // ---------------------------------------------------------------------
  if (register.available) {
    const inside = register.insideTessitura.ratio;
    if (inside !== null && inside > 0) {
      toLighten.push(finding('register-inside', 'toLighten', 'fact',
        `${formatPercent(inside)} de vos notes tombent dans la tessiture chantée `
        + `(${midiToName(register.tessitura.minMidi)}–${midiToName(register.tessitura.maxMidi)}). `
        + `Monter ou descendre d'une octave y libère de la place.`,
        {
          metric: 'register.insideTessitura.ratio',
          value: inside,
          confidence: 'low',
          confidenceNote: register.confidenceNote,
        }));
    }
    const clash = register.clash.ratio;
    if (clash !== null && clash > 0) {
      facts.push(finding('register-clash', 'facts', 'fact',
        `Tendance : ${formatPercent(clash)} du temps où piano et voix sonnent ensemble, `
        + `une note jouée se trouve à moins d'une tierce mineure de la note chantée.`,
        {
          metric: 'register.clash.ratio',
          value: clash,
          confidence: 'low',
          confidenceNote: register.confidenceNote,
        }));
    }
  } else if (register.message) {
    facts.push(finding('register-unavailable', 'facts', 'fact', register.message,
      { confidence: 'low' }));
  }

  // ---------------------------------------------------------------------
  // 5. CHIFFRES NUS — présentés sans commentaire de valeur, précisément
  //    parce qu'aucun seuil ne permet encore de les qualifier.
  // ---------------------------------------------------------------------
  facts.push(finding('overlap-raw', 'facts', 'fact',
    `Le piano sonne pendant ${formatPercent(space.overlap.ratio)} du temps chanté.`,
    { metric: 'overlap.ratio', value: space.overlap.ratio }));
  facts.push(finding('coverage-raw', 'facts', 'fact',
    `Le piano occupe ${formatPercent(space.gapFill.coverageRatio)} du temps des respirations.`,
    { metric: 'gapFill.coverageRatio', value: space.gapFill.coverageRatio }));
  facts.push(finding('counts-raw', 'facts', 'fact',
    `${space.noteCount} notes jouées sur ${formatTime(space.analyzedDuration)} — `
    + `${analysis.segmentation.phraseCount} phrases chantées, `
    + `${space.gapFill.gapCount} respirations internes.`));

  if (strengths.length === 0) {
    strengths.push(finding('none-strength', 'strengths', 'fact',
      'Rien à signaler de positif sur les mesures disponibles pour cette séance. '
      + 'Ce n\'est pas un jugement sur votre jeu : seules la densité et le placement '
      + 'sont mesurés ici, pas le goût musical.'));
  }
  if (blockers.length === 0) {
    blockers.push(finding('none-blocker', 'blockers', 'fact',
      'Aucun blocage détecté sur les mesures de densité et de placement.'));
  }
  if (toLighten.length === 0) {
    toLighten.push(finding('none-lighten', 'toLighten', 'fact',
      'Rien à alléger d\'après les mesures : votre jeu ne couvre aucune phrase '
      + 'de manière saillante par rapport aux autres.'));
  }

  return {
    strengths,
    blockers,
    toLighten,
    facts,
    replay: replay.sort((a, b) => a.start - b.start),
    calibration: buildCalibrationNote(),
    empty: false,
  };
}

/**
 * Note de calibration, affichée telle quelle dans le rapport.
 *
 * Question de goût explicitement NON tranchée : à partir de quel taux de
 * recouvrement doit-on dire « tu joues trop » ? Y répondre demande de comparer
 * plusieurs séances réelles de Narcisse et de confronter le chiffre à son
 * ressenti. Tant que ça n'a pas eu lieu, l'application mesure et montre, mais
 * ne tranche pas.
 */
export function buildCalibrationNote() {
  return {
    calibrated: false,
    title: 'Aucun seuil de jugement n\'est calibré',
    text: 'Les mesures ci-dessus sont exactes, mais l\'application ne dit pas encore à partir '
      + 'de quel chiffre « c\'est trop ». Ce seuil ne peut venir que de la comparaison de '
      + 'plusieurs séances réelles avec votre propre ressenti. En attendant, le rapport '
      + 'montre des faits, des classements et des comparaisons de sens — pas des verdicts.',
  };
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',');
}

function formatDensity(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toFixed(1).replace('.', ',');
}

const PITCH_NAMES = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

/**
 * Nom français d'une note MIDI, pour l'affichage de la tessiture.
 * @param {number} midi
 * @returns {string}
 */
export function midiToName(midi) {
  if (!Number.isFinite(midi)) return '—';
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${PITCH_NAMES[pc]}${octave}`;
}

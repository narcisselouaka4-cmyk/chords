// [OpenCode] — 2026-08-24 — Réharmonisation V1, Tâche 4 : cartes multiples.
//
// Génère plusieurs réharmonisations complètes et distinctes sur la même
// mélodie, présentées comme des cartes nommées. Une variante est désignée
// par défaut = la mieux notée sur les 4 critères de validité.
//
// Trois variantes V1 présentées par intensité, jamais par nom de style :
//   1. « Fidèle » : candidats canoniques seuls, pas de techniques
//      stylistiques. Reste proche de la progression originale.
//   2. « Équilibrée » : candidats canoniques + techniques structurelles du style
//      (add9, add6, sus2 pour Gospel). Recommandée par défaut.
//   3. « Audacieuse » : candidats canoniques + toutes techniques du style
//      y compris passages pour plus de tension.
//
// [OpenCode] — 2026-08-25 — EXP-031 Tâche 3 : paramétré par style via le
// registre (style-registry.js). Le style par défaut est 'gospel' pour
// préserver R1 inchangé. Pour Worship, seule la variante fidèle est produite
// (pas de techniques stylistiques). Pour Jazz/Neo Soul V1, seules les
// techniques de passage existent → la variante structurelle = fidèle est
// ignorée (pas de doublon).
//
// Aucune décision musicale nouvelle : on enrichit ou non le pool de candidats
// et on délègue au path-finder canonique. Les variantes sont déterministes.

import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';
import { validateReharmonizationPlan } from './reharmonization-validator.js';
import { getStyle, STYLE_REGISTRY } from './style-registry.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   plan: object,
 *   validationReport: object,
 *   recommended: boolean
 * }} ReharmonizationVariant
 */

function computeMovement(from, to) {
  if (!from || !to || from.length === 0 || to.length === 0) return 999;
  const n = Math.min(from.length, to.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.abs(to[i] - from[i]);
  }
  total += Math.abs(from.length - to.length) * 6;
  return total;
}

/**
 * Construit un plan en filtrant les candidats stylistiques selon les sources autorisées,
 * avec enrichissement des voicings via le générateur du style.
 *
 * @param {{ track: object, harmonicContext: object }} wrapper
 * @param {{ styleId: string, allowedSources: Set<string> | null }} filter
 *   - styleId : id du style (registre)
 *   - allowedSources : null = canonique seul (fidèle) ; sinon set de sources
 *     stylistiques autorisées
 * @returns {object} HarmonizationPlan (même forme que buildHarmonizationPlan)
 */
function buildFilteredPlan(wrapper, filter) {
  const { track, harmonicContext } = wrapper;
  const anchors = harmonicContext.anchors;
  const N = anchors.length;
  const style = getStyle(filter.styleId) || STYLE_REGISTRY.gospel;

  const candidateLayers = [];
  for (let i = 0; i < N; i++) {
    const canonical = generateChordCandidatesForAnchor({ anchor: anchors[i], track, harmonicContext });
    const canonicalCandidates = canonical.status === 'generated' ? canonical.candidates : [];
    let merged = canonicalCandidates.slice();
    if (filter.allowedSources && style.buildCandidatesForAnchor) {
      const styleCands = style.buildCandidatesForAnchor({ anchor: anchors[i], track, harmonicContext });
      merged = merged.concat(styleCands.filter((c) => filter.allowedSources.has(c.source)));
    }
    // Dédoublonnage par (pitchClasses, quality, bass).
    const seen = new Set();
    const dedup = [];
    for (const c of merged) {
      const key = `${c.pitchClasses.join(',')}|${c.qualityId}|${c.bassPitchClass ?? 'x'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(c);
    }
    if (dedup.length === 0) {
      throw new RangeError(`Variante : aucun candidat pour l'ancre ${i}`);
    }
    candidateLayers.push(Object.freeze(dedup));
  }

  const harmonicPathResult = findBestHarmonicPath({ candidateLayers: Object.freeze(candidateLayers) });
  const voicingPathResult = findBestVoicingPath({ harmonicPathResult });

  // [OpenCode] — 2026-08-25 — EXP-032 : enrichissement des voicings avec le
  // générateur du style (même patron que gospel-harmonization-planner.js).
  // Pour la variante fidèle (allowedSources=null), pas d'enrichissement.
  const enrichedVoicings = [];
  const voicingTechniqueUsed = [];
  // Vérifie si le style a un générateur de voicings ET qu'on n'est pas en mode fidèle.
  const hasStyleVoicings = filter.allowedSources !== null && typeof style.generateVoicings === 'function';

  for (let i = 0; i < N; i++) {
    const canonicalVoicing = voicingPathResult.voicings[i];
    const candidate = harmonicPathResult.path[i];

    if (!hasStyleVoicings) {
      enrichedVoicings.push(canonicalVoicing);
      voicingTechniqueUsed.push(null);
      continue;
    }

    const targetBass = canonicalVoicing.bassMidiNote || 43;
    const targetOctave = Math.floor(targetBass / 12) - 1;
    const styleVoicings = style.generateVoicings(candidate, { centerOctave: targetOctave });

    if (styleVoicings.length === 0) {
      enrichedVoicings.push(canonicalVoicing);
      voicingTechniqueUsed.push(null);
      continue;
    }

    const prevNotes = i > 0
      ? (enrichedVoicings[i - 1]?.midiNotes || canonicalVoicing.midiNotes)
      : canonicalVoicing.midiNotes;

    const melodyEvent = anchors[i].melodyEventId
      ? track.events.find((e) => e.id === anchors[i].melodyEventId)
      : null;
    const melodyPc = melodyEvent ? ((melodyEvent.midi % 12) + 12) % 12 : null;

    let best = canonicalVoicing;
    let bestTechnique = null;
    let bestMovement = computeMovement(prevNotes, canonicalVoicing.midiNotes);

    for (const sv of styleVoicings) {
      // Le voicing idiomatique doit contenir la note mélodique (si présente) — critère 1
      if (melodyPc !== null) {
        const voicingPcs = sv.midiNotes.map((n) => ((n % 12) + 12) % 12);
        if (!voicingPcs.includes(melodyPc)) continue;
      }
      const movement = computeMovement(prevNotes, sv.midiNotes);
      // Préfère le voicing idiomatique s'il a un mouvement raisonnable
      // (≤ bestMovement + 20) — même seuil que Gospel (EXP-030 Tâche C).
      if (movement <= bestMovement + 20) {
        bestMovement = movement;
        best = {
          candidate: sv.candidate,
          midiNotes: sv.midiNotes,
          leftHand: sv.leftHand,
          rightHand: sv.rightHand,
          bassMidiNote: sv.bassMidiNote,
          bassPitchClass: sv.bassPitchClass,
          inversionInterval: sv.inversionInterval,
          isRootPosition: sv.isRootPosition,
          spanSemitones: sv.spanSemitones,
          registerDeviation: sv.registerDeviation,
        };
        bestTechnique = style.identifyVoicingTechnique(sv);
      }
    }

    enrichedVoicings.push(Object.freeze(best));
    voicingTechniqueUsed.push(bestTechnique);
  }

  const stepsArr = [];
  for (let i = 0; i < N; i++) {
    const step = {
      index: i,
      anchor: anchors[i],
      candidateLayer: candidateLayers[i],
      candidate: harmonicPathResult.path[i],
      voicing: enrichedVoicings[i],
      harmonicTransition: i === 0 ? null : harmonicPathResult.transitions[i - 1],
      voicingTransition: i === 0 ? null : voicingPathResult.transitions[i - 1],
    };
    // Clé de technique de voicing spécifique au style pour la traçabilité UI.
    if (hasStyleVoicings) {
      step[`${style.id}VoicingTechnique`] = voicingTechniqueUsed[i];
    }
    stepsArr.push(Object.freeze(step));
  }
  const steps = Object.freeze(stepsArr);

  // Rapport de techniques (traçabilité — style-spécifique).
  const used = [];
  const usedIds = new Set();
  for (let i = 0; i < steps.length; i++) {
    const tech = style.identifyTechnique(steps[i].candidate);
    if (tech) {
      used.push({ techniqueId: tech.id, name: tech.name, stepIndex: i });
      usedIds.add(tech.id);
    }
  }
  const allTechniques = style.listTechniques();
  const unused = allTechniques.filter((t) => !usedIds.has(t.id)).map((t) => ({ techniqueId: t.id, name: t.name }));

  return Object.freeze({
    track,
    harmonicContext,
    candidateLayers: Object.freeze(candidateLayers),
    harmonicPathResult,
    voicingPathResult,
    steps,
    techniqueReport: Object.freeze({ used: Object.freeze(used), unused: Object.freeze(unused) }),
  });
}

// Sépare les sources stylistiques en structurelles vs passage pour un style.
// Retourne { structuralSources, passageSources } comme Sets.
function splitStyleSources(styleId) {
  const style = getStyle(styleId) || STYLE_REGISTRY.gospel;
  const structural = new Set(style.techniqueSources.filter((s) => style.structuralSources.includes(s)));
  const passage = new Set(style.techniqueSources.filter((s) => style.passageSources.includes(s)));
  return { structuralSources: structural, passageSources: passage };
}

/**
 * Génère les variantes de réharmonisation sur la même mélodie, paramétrées
 * par le style actif (défaut 'gospel' pour préserver R1).
 *
 * @param {{ track: object, harmonicContext: object }} wrapper
 * @param {{ styleId?: string }} [options]
 * @returns {{ variants: ReharmonizationVariant[], recommendedId: string }}
 */
export function buildReharmonizationVariants(wrapper, options = {}) {
  if (!wrapper || !wrapper.track || !wrapper.harmonicContext) {
    throw new TypeError('buildReharmonizationVariants : { track, harmonicContext } requis');
  }
  const styleId = options.styleId || 'gospel';
  const style = getStyle(styleId) || STYLE_REGISTRY.gospel;
  const { structuralSources, passageSources } = splitStyleSources(styleId);

  const variants = [];

  // 1. Version fidèle : candidats canoniques seuls.
  try {
    const plan = buildFilteredPlan(wrapper, { styleId, allowedSources: null });
    variants.push({
      id: 'faithful',
      label: 'Fidèle',
      description: 'Changements minimes, proche de la progression originale.',
      plan,
      validationReport: validateReharmonizationPlan(plan, { styleId }),
      recommended: false,
    });
  } catch (err) {
    // Une variante peut échouer si le pool est vide ; on la saute.
  }

  // 2. Version <style> structurelle : canonique + techniques structurelles.
  //    Pour Worship (pas de techniques) ou Jazz/Neo Soul V1 (pas de techniques
  //    structurelles — seulement des passages), cette variante est identique à
  //    fidèle → on la saute pour éviter un doublon.
  if (structuralSources.size > 0) {
    try {
      const plan = buildFilteredPlan(wrapper, {
        styleId,
        allowedSources: structuralSources,
      });
      variants.push({
        id: 'stylistic',
        label: 'Équilibrée',
        description: 'Recommandée — enrichissements stylistiques mesurés.',
        plan,
        validationReport: validateReharmonizationPlan(plan, { styleId }),
        recommended: false,
      });
    } catch (err) { /* skip */ }
  }

  // 3. Version tendue : canonique + techniques structurelles + passages.
  //    Pour Worship, pas de techniques → pas de variante tendue.
  if (passageSources.size > 0) {
    try {
      const allStyleSources = new Set([...structuralSources, ...passageSources]);
      const plan = buildFilteredPlan(wrapper, {
        styleId,
        allowedSources: allStyleSources,
      });
      variants.push({
        id: 'tense',
        label: 'Audacieuse',
        description: 'Tensions les plus marquées, couleurs harmoniques avancées.',
        plan,
        validationReport: validateReharmonizationPlan(plan, { styleId }),
        recommended: false,
      });
    } catch (err) { /* skip */ }
  }

  if (variants.length === 0) {
    throw new Error('Aucune variante n\'a pu être construite.');
  }

  // Désignation de la variante recommandée : la mieux notée sur les 4 critères.
  // En cas d'égalité, priorité stylistic > faithful > tense (la plus riche sans
  // excès de tension). On départage par le score harmonique total décroissant.
  const scoreOrder = { stylistic: 3, faithful: 2, tense: 1 };
  variants.sort((a, b) => {
    const sa = a.validationReport.score;
    const sb = b.validationReport.score;
    if (sa !== sb) return sb - sa; // score de validité décroissant
    const ha = a.plan.harmonicPathResult.totalScore;
    const hb = b.plan.harmonicPathResult.totalScore;
    if (Math.abs(ha - hb) > 1e-9) return hb - ha; // score harmonique décroissant
    return (scoreOrder[b.id] || 0) - (scoreOrder[a.id] || 0);
  });
  variants[0].recommended = true;

  return {
    variants: Object.freeze(variants.map((v) => Object.freeze(v))),
    recommendedId: variants[0].id,
  };
}
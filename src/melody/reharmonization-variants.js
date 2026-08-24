// [OpenCode] — 2026-08-24 — Réharmonisation V1, Tâche 4 : cartes multiples.
//
// Génère plusieurs réharmonisations complètes et distinctes sur la même
// mélodie, présentées comme des cartes nommées. Une variante est désignée
// par défaut = la mieux notée sur les 4 critères de validité.
//
// Trois variantes V1 :
//   1. « Version fidèle » : candidats canoniques seuls, pas de techniques
//      Gospel. Reste proche de la progression originale.
//   2. « Version gospel » : candidats canoniques + techniques structurelles
//      Gospel (add9, add6, sus2). Enrichie mais sans tension de passage.
//   3. « Version tendue » : candidats canoniques + toutes techniques Gospel
//      y compris passages altérés (V7b9). Plus de tension harmonique.
//
// Aucune décision musicale nouvelle : on enrichit ou non le pool de candidats
// et on délègue au path-finder canonique. Les variantes sont déterministes.

import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
import { buildGospelCandidatesForAnchor } from './gospel-techniques.js';
import { findBestHarmonicPath } from './harmonic-path-finder.js';
import { findBestVoicingPath } from './voicing-path-finder.js';
import { validateReharmonizationPlan } from './reharmonization-validator.js';
import { identifyGospelTechnique, listGospelTechniques } from './gospel-techniques.js';

// Techniques structurelles seulement (add9, add6, sus2) — sans passages.
const STRUCTURAL_TECHNIQUE_SOURCES = new Set([
  'gospel-add9',
  'gospel-add6',
  'gospel-sus2',
]);

// Techniques de passage altéré (V7b9) — pour la version tendue.
const PASSAGE_TECHNIQUE_SOURCES = new Set([
  'gospel-passage-7b9',
  'gospel-passage-7sharp5',
]);

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

/**
 * Construit un plan en filtrant les candidats Gospel selon les sources autorisées.
 *
 * @param {{ track: object, harmonicContext: object }} wrapper
 * @param {{ allowGospel: boolean, allowedGospelSources: Set<string> }} filter
 * @returns {object} HarmonizationPlan (même forme que buildHarmonizationPlan)
 */
function buildFilteredPlan(wrapper, filter) {
  const { track, harmonicContext } = wrapper;
  const anchors = harmonicContext.anchors;
  const N = anchors.length;

  const candidateLayers = [];
  for (let i = 0; i < N; i++) {
    const canonical = generateChordCandidatesForAnchor({ anchor: anchors[i], track, harmonicContext });
    const canonicalCandidates = canonical.status === 'generated' ? canonical.candidates : [];
    let merged = canonicalCandidates.slice();
    if (filter.allowGospel) {
      const gospel = buildGospelCandidatesForAnchor({ anchor: anchors[i], track, harmonicContext });
      merged = merged.concat(gospel.filter((c) => filter.allowedGospelSources.has(c.source)));
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

  const stepsArr = [];
  for (let i = 0; i < N; i++) {
    stepsArr.push(Object.freeze({
      index: i,
      anchor: anchors[i],
      candidateLayer: candidateLayers[i],
      candidate: harmonicPathResult.path[i],
      voicing: voicingPathResult.voicings[i],
      harmonicTransition: i === 0 ? null : harmonicPathResult.transitions[i - 1],
      voicingTransition: i === 0 ? null : voicingPathResult.transitions[i - 1],
    }));
  }
  const steps = Object.freeze(stepsArr);

  // Rapport de techniques (traçabilité).
  const used = [];
  const usedIds = new Set();
  for (let i = 0; i < steps.length; i++) {
    const tech = identifyGospelTechnique(steps[i].candidate);
    if (tech) {
      used.push({ techniqueId: tech.id, name: tech.name, stepIndex: i });
      usedIds.add(tech.id);
    }
  }
  const allTechniques = listGospelTechniques();
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

/**
 * Génère les trois variantes de réharmonisation sur la même mélodie.
 *
 * @param {{ track: object, harmonicContext: object }} wrapper
 * @returns {{ variants: ReharmonizationVariant[], recommendedId: string }}
 */
export function buildReharmonizationVariants(wrapper) {
  if (!wrapper || !wrapper.track || !wrapper.harmonicContext) {
    throw new TypeError('buildReharmonizationVariants : { track, harmonicContext } requis');
  }

  const variants = [];

  // 1. Version fidèle : candidats canoniques seuls.
  try {
    const plan = buildFilteredPlan(wrapper, { allowGospel: false, allowedGospelSources: new Set() });
    variants.push({
      id: 'faithful',
      label: 'Version fidèle',
      description: 'Harmonie diatonique canonique, sans enrichissements Gospel.',
      plan,
      validationReport: validateReharmonizationPlan(plan),
      recommended: false,
    });
  } catch (err) {
    // Une variante peut échouer si le pool est vide ; on la saute.
  }

  // 2. Version gospel : canonique + techniques structurelles.
  try {
    const plan = buildFilteredPlan(wrapper, {
      allowGospel: true,
      allowedGospelSources: STRUCTURAL_TECHNIQUE_SOURCES,
    });
    variants.push({
      id: 'gospel',
      label: 'Version gospel',
      description: 'Harmonie enrichie de couleurs gospel (add9, add6, sus2).',
      plan,
      validationReport: validateReharmonizationPlan(plan),
      recommended: false,
    });
  } catch (err) { /* skip */ }

  // 3. Version tendue : canonique + techniques structurelles + passages altérés.
  try {
    const plan = buildFilteredPlan(wrapper, {
      allowGospel: true,
      allowedGospelSources: new Set([...STRUCTURAL_TECHNIQUE_SOURCES, ...PASSAGE_TECHNIQUE_SOURCES]),
    });
    variants.push({
      id: 'tense',
      label: 'Version tendue',
      description: 'Harmonie gospel avec accords de passage altérés (V7b9) pour plus de tension.',
      plan,
      validationReport: validateReharmonizationPlan(plan),
      recommended: false,
    });
  } catch (err) { /* skip */ }

  if (variants.length === 0) {
    throw new Error('Aucune variante n\'a pu être construite.');
  }

  // Désignation de la variante recommandée : la mieux notée sur les 4 critères.
  // En cas d'égalité, priorité gospel > faithful > tense (la plus riche sans
  // excès de tension). On départage par le score harmonique total décroissant.
  const scoreOrder = { gospel: 3, faithful: 2, tense: 1 };
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
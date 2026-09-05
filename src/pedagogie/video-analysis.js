// [Claude] — 2026-09-05 — Pédagogie IA : assemblage d'une analyse vidéo.
//
// Réunit les briques : lecture des touches → segments → accords → concepts.
// Le module reste PUR : il ne reçoit que des relevés déjà faits (un relevé par
// instant), jamais des images ni un chemin de fichier. C'est ce qui permet à
// l'extraction d'images de vivre dans le processus principal Electron, en flux,
// sans que la mémoire enfle — et à cet assemblage d'être testé en Node.

import { groupSegments } from './note-grouping.js';
import { labelSegments, mergeSameLabel } from './chord-labeling.js';
import { collectConcepts, collectMissing, narrationNotAttemptedState } from './glossary.js';
import { FORMATS, explainUnrecognised } from './format-detector.js';

/**
 * Construit l'analyse d'une vidéo au Format B.
 *
 * @param {object} params
 * @param {{t: number, keys: {midi: number, hand: string}[]}[]} params.samples
 * @param {object} params.geometry
 * @param {number} params.sampleInterval - pas entre deux relevés, en secondes
 * @param {string} [params.key] - tonalité, si une autre source la connaît
 * @param {object} [params.narration] - état de narration déjà construit
 *        (voir transcription.js). C'est lui qui fait foi quand il est fourni.
 * @param {boolean} [params.hasNarration] - raccourci historique : « il y a de
 *        la parole », sans le texte. Conservé pour ne pas casser un appelant.
 * @param {object} [params.options]
 * @returns {object}
 */
export function buildVideoAnalysis(params) {
  const { samples, geometry, sampleInterval } = params;
  const options = params.options || {};

  const segments = mergeSameLabel(
    labelSegments(
      groupSegments(samples || [], { ...options, sampleInterval }),
      options,
    ),
  );

  const concepts = collectConcepts(segments, { key: params.key });
  const missingConcepts = collectMissing(concepts);

  // Ce qui n'a pas pu être résolu est compté et montré, pas passé sous silence.
  const unresolved = segments.filter((s) => !s.chord.resolved);
  const thirdless = segments.filter((s) => s.chord.resolved && s.chord.thirdMissing);

  return {
    source: 'video',
    format: FORMATS.PIANO_ROLL,
    segments,
    concepts,
    missingConcepts,
    narration: resolveNarration(params),
    keyboard: {
      lowestMidi: geometry?.lowestMidi ?? null,
      highestMidi: geometry?.highestMidi ?? null,
      // Rappel porté jusqu'à l'affichage : l'octave affichée est une hypothèse.
      // Elle ne change AUCUN nom d'accord — seulement la hauteur à laquelle les
      // touches s'allument sur le clavier virtuel.
      anchorIsHeuristic: geometry?.anchorIsHeuristic ?? null,
    },
    stats: {
      sampleCount: (samples || []).length,
      segmentCount: segments.length,
      unresolvedCount: unresolved.length,
      thirdlessCount: thirdless.length,
      duration: samples && samples.length
        ? samples[samples.length - 1].t + sampleInterval
        : 0,
    },
    notes: buildNotes({ unresolved, thirdless, missingConcepts, geometry }),
  };
}

/**
 * Analyse d'une vidéo dont l'image n'a rien donné : le résultat vient du son.
 *
 * Elle existe pour que l'écran ait toujours quelque chose d'honnête à montrer.
 * Le pire cas de la taxonomie — clavier réel, aucune couleur, aucun texte — est
 * confirmé réel et dans le périmètre : il ne doit pas produire un écran vide.
 *
 * @param {object} params
 * @param {string} params.reason - motif d'échec de la cascade
 * @param {{start: number, end: number, label: string}[]} [params.audioSegments]
 * @param {string} [params.key]
 * @param {object} [params.narration] - état de narration déjà construit
 * @returns {object}
 */
export function buildAudioOnlyAnalysis(params) {
  const audioSegments = (params.audioSegments || []).map((s) => ({
    start: s.start,
    end: s.end,
    duration: s.end - s.start,
    midis: [],
    chord: {
      resolved: Boolean(s.label),
      label: s.label ?? null,
      symbol: null,
      thirdMissing: false,
      noteNames: [],
      note: null,
    },
  }));

  const concepts = collectConcepts(audioSegments, { key: params.key });

  return {
    source: 'audio',
    format: FORMATS.UNRECOGNISED,
    segments: audioSegments,
    concepts,
    missingConcepts: collectMissing(concepts),
    narration: resolveNarration(params),
    keyboard: { lowestMidi: null, highestMidi: null, anchorIsHeuristic: null },
    stats: {
      sampleCount: 0,
      segmentCount: audioSegments.length,
      unresolvedCount: audioSegments.filter((s) => !s.chord.resolved).length,
      thirdlessCount: 0,
      duration: audioSegments.length ? audioSegments[audioSegments.length - 1].end : 0,
    },
    notes: [
      {
        kind: 'format',
        text: explainUnrecognised(params.reason),
      },
      {
        kind: 'source',
        text: 'Les accords ci-dessous viennent de l\'analyse du son, pas de l\'image : '
          + 'ils décrivent ce qui est entendu, pas les doigts sur le clavier.',
      },
    ],
  };
}

/**
 * Quel état de narration porter dans l'analyse.
 *
 * L'ORDRE COMPTE, et c'est le point qui manquait jusqu'ici. `hasNarration`
 * n'était jamais transmis par l'appelant : le champ retombait donc
 * systématiquement sur « cette source ne comporte pas de commentaire parlé »,
 * y compris sur un tutoriel où quelqu'un parle du début à la fin. Rien
 * n'écoutait la bande son ; le message affirmait pourtant un fait sur elle.
 *
 * Désormais : un état construit par transcription.js fait foi — il porte la
 * raison exacte. À défaut, on ne prétend rien sur le contenu : on dit que rien
 * n'a été écouté.
 *
 * @param {object} params
 * @returns {object}
 */
function resolveNarration(params) {
  if (params?.narration && typeof params.narration === 'object') return params.narration;
  if (params?.hasNarration) return { available: true };
  return narrationNotAttemptedState();
}

function buildNotes({ unresolved, thirdless, missingConcepts, geometry }) {
  const notes = [];
  if (geometry?.anchorIsHeuristic) {
    notes.push({
      kind: 'octave',
      text: 'L\'octave affichée est déduite de la taille du clavier, pas lue à l\'écran. '
        + 'Elle ne change aucun nom d\'accord — seulement la hauteur des touches allumées.',
    });
  }
  if (thirdless.length > 0) {
    notes.push({
      kind: 'third',
      text: `${thirdless.length} passage${thirdless.length > 1 ? 's' : ''} sans tierce jouée : `
        + 'l\'accord y est affiché en quinte à vide, tel qu\'il est à l\'écran, plutôt que '
        + 'complété depuis la tonalité.',
    });
  }
  if (unresolved.length > 0) {
    const plural = unresolved.length > 1;
    notes.push({
      kind: 'unresolved',
      text: `${unresolved.length} passage${plural ? 's' : ''} n'${plural ? 'ont' : 'a'} pas pu être `
        + `nommé${plural ? 's' : ''} : les notes lues n'y forment pas un accord connu. `
        + 'Elles sont montrées telles quelles.',
    });
  }
  if (missingConcepts.length > 0) {
    const plural = missingConcepts.length > 1;
    notes.push({
      kind: 'glossary-debt',
      text: `${missingConcepts.length} concept${plural ? 's' : ''} rencontré${plural ? 's' : ''} `
        + `sans fiche au glossaire : ${missingConcepts.join(', ')}. `
        + "Rien n'a été improvisé pour combler le vide.",
    });
  }
  return notes;
}

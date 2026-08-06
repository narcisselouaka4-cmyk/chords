// [OpenCode] — 2026-08-06 — Incrément 2 : contexte harmonique.
// Création, édition et validation d'un HarmonicContext lié à une MelodyTrack.
// Réutilise parseChordSymbol / resolveCanonicalChordDefinition du moteur
// d'accords existant (src/chord-engine/chord-display.js, chord-defs.js).

import { parseChordSymbol, resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';

// ---------------------------------------------------------------------------
// Types conceptuels (documentés dans ./midi-types.js)
// ---------------------------------------------------------------------------

/**
 * Référence d'accord réutilisant les structures existantes du moteur d'accords.
 * Format compatible avec parseChordSymbol() de chord-display.js.
 *
 * @typedef {{
 *   root: number,
 *   quality: string,
 *   bass: number | null
 * }} ChordReference
 */

/**
 * @typedef {{
 *   id: string,
 *   melodyEventId: string | null,
 *   relativeTime: number,
 *   sourceTime: number | null,
 *   type: 'start' | 'end' | 'user' | 'original-chord' | 'section',
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   originalChord: ChordReference | null,
 *   locked: boolean,
 *   label: string | null
 * }} HarmonicAnchor
 */

/**
 * @typedef {{
 *   id: string,
 *   melodyTrackId: string,
 *   tonalContext: import('./tonal-context.js').TonalContext,
 *   startChord: ChordReference | null,
 *   endChord: ChordReference | null,
 *   originalProgression: HarmonicAnchor[],
 *   anchors: HarmonicAnchor[],
 *   version: number,
 *   createdAt: number,
 *   updatedAt: number
 * }} HarmonicContext
 */

/**
 * @typedef {{
 *   severity: 'error' | 'warning',
 *   code: string,
 *   message: string,
 *   anchorId: string | null,
 *   melodyEventId: string | null
 * }} ValidationIssue
 */

/**
 * @typedef {{
 *   valid: boolean,
 *   errors: ValidationIssue[],
 *   warnings: ValidationIssue[]
 * }} ValidationResult
 */

// ---------------------------------------------------------------------------
// Identifiants
// ---------------------------------------------------------------------------

let nextContextId = 0;
let nextAnchorId = 0;

function makeContextId() {
  return `harm-ctx-${++nextContextId}`;
}

function makeAnchorId() {
  return `anchor-${++nextAnchorId}`;
}

// ---------------------------------------------------------------------------
// Résolution d'accord
// ---------------------------------------------------------------------------

/**
 * Parse et valide un symbole d'accord. Retourne une ChordReference ou une erreur.
 *
 * @param {string} chordStr
 * @returns {{ chord: ChordReference | null, error: string | null }}
 */
function resolveChordReference(chordStr) {
  if (!chordStr || chordStr === 'N') {
    return { chord: null, error: null };
  }

  const parsed = parseChordSymbol(chordStr);
  if (parsed.isN) {
    return { chord: null, error: null };
  }

  const quality = parsed.quality || '';
  const def = resolveCanonicalChordDefinition(quality);
  if (!def && quality !== '') {
    return { chord: null, error: `Qualité d'accord inconnue : "${quality}" dans "${chordStr}"` };
  }

  return {
    chord: {
      root: ((parsed.root % 12) + 12) % 12,
      quality: quality,
      bass: parsed.bass != null ? ((parsed.bass % 12) + 12) % 12 : null,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Crée un HarmonicContext vide lié à une MelodyTrack.
 *
 * @param {import('./midi-types.js').MelodyTrack} track
 * @param {object} [options]
 * @param {import('./tonal-context.js').TonalContext} [options.tonalContext]
 * @param {string | null} [options.startChord]
 * @param {string | null} [options.endChord]
 * @returns {HarmonicContext}
 */
export function createHarmonicContext(track, options = {}) {
  const now = Date.now();
  const tonalContext = options.tonalContext || null;

  let startChord = null;
  if (options.startChord) {
    const resolved = resolveChordReference(options.startChord);
    if (resolved.error) {
      throw new Error(`Accord initial invalide : ${resolved.error}`);
    }
    startChord = resolved.chord;
  }

  let endChord = null;
  if (options.endChord) {
    const resolved = resolveChordReference(options.endChord);
    if (resolved.error) {
      throw new Error(`Accord final invalide : ${resolved.error}`);
    }
    endChord = resolved.chord;
  }

  return {
    id: makeContextId(),
    melodyTrackId: track.id,
    tonalContext,
    startChord,
    endChord,
    originalProgression: [],
    anchors: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Définit l'accord initial.
 *
 * @param {HarmonicContext} context
 * @param {string | ChordReference | null} chord - symbole d'accord ou null pour retirer
 * @returns {HarmonicContext}
 */
export function setStartChord(context, chord) {
  let resolved = null;
  if (chord !== null && chord !== undefined) {
    if (typeof chord === 'string') {
      const r = resolveChordReference(chord);
      if (r.error) {
        throw new Error(`Accord initial invalide : ${r.error}`);
      }
      resolved = r.chord;
    } else {
      resolved = { ...chord };
    }
  }
  return {
    ...context,
    startChord: resolved,
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Définit l'accord final.
 *
 * @param {HarmonicContext} context
 * @param {string | ChordReference | null} chord - symbole d'accord ou null pour retirer
 * @returns {HarmonicContext}
 */
export function setEndChord(context, chord) {
  let resolved = null;
  if (chord !== null && chord !== undefined) {
    if (typeof chord === 'string') {
      const r = resolveChordReference(chord);
      if (r.error) {
        throw new Error(`Accord final invalide : ${r.error}`);
      }
      resolved = r.chord;
    } else {
      resolved = { ...chord };
    }
  }
  return {
    ...context,
    endChord: resolved,
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Ajoute une ancre harmonique.
 *
 * @param {HarmonicContext} context
 * @param {{
 *   melodyEventId?: string | null,
 *   relativeTime?: number,
 *   sourceTime?: number | null,
 *   type?: HarmonicAnchor['type'],
 *   harmonizationPolicy?: HarmonicAnchor['harmonizationPolicy'],
 *   originalChord?: string | ChordReference | null,
 *   locked?: boolean,
 *   label?: string | null
 * }} anchorData
 * @returns {HarmonicContext}
 */
export function addHarmonicAnchor(context, anchorData) {
  const relativeTime = anchorData.relativeTime ?? 0;
  const type = anchorData.type || 'user';
  const policy = anchorData.harmonizationPolicy || 'automatic';

  if (!['force', 'automatic', 'skip'].includes(policy)) {
    throw new Error(`Politique d'harmonisation inconnue : "${policy}"`);
  }

  let originalChord = null;
  if (anchorData.originalChord) {
    if (typeof anchorData.originalChord === 'string') {
      const r = resolveChordReference(anchorData.originalChord);
      if (r.error) {
        throw new Error(`Accord d'ancre invalide : ${r.error}`);
      }
      originalChord = r.chord;
    } else {
      originalChord = { ...anchorData.originalChord };
    }
  }

  const anchor = {
    id: makeAnchorId(),
    melodyEventId: anchorData.melodyEventId || null,
    relativeTime,
    sourceTime: anchorData.sourceTime ?? null,
    type,
    harmonizationPolicy: policy,
    originalChord,
    locked: anchorData.locked || false,
    label: anchorData.label || null,
  };

  return {
    ...context,
    anchors: [...context.anchors, anchor],
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Met à jour une ancre existante (patch partiel).
 *
 * @param {HarmonicContext} context
 * @param {string} anchorId
 * @param {Partial<HarmonicAnchor>} patch
 * @returns {HarmonicContext}
 */
export function updateHarmonicAnchor(context, anchorId, patch) {
  const index = context.anchors.findIndex((a) => a.id === anchorId);
  if (index === -1) {
    throw new Error(`Ancre introuvable : ${anchorId}`);
  }

  const existing = context.anchors[index];
  const updated = { ...existing };

  if ('melodyEventId' in patch) updated.melodyEventId = patch.melodyEventId;
  if ('relativeTime' in patch) updated.relativeTime = patch.relativeTime;
  if ('sourceTime' in patch) updated.sourceTime = patch.sourceTime;
  if ('type' in patch) updated.type = patch.type;
  if ('harmonizationPolicy' in patch) {
    if (!['force', 'automatic', 'skip'].includes(patch.harmonizationPolicy)) {
      throw new Error(`Politique d'harmonisation inconnue : "${patch.harmonizationPolicy}"`);
    }
    updated.harmonizationPolicy = patch.harmonizationPolicy;
  }
  if ('originalChord' in patch) {
    if (patch.originalChord && typeof patch.originalChord === 'string') {
      const r = resolveChordReference(patch.originalChord);
      if (r.error) throw new Error(`Accord d'ancre invalide : ${r.error}`);
      updated.originalChord = r.chord;
    } else {
      updated.originalChord = patch.originalChord ? { ...patch.originalChord } : null;
    }
  }
  if ('locked' in patch) updated.locked = patch.locked;
  if ('label' in patch) updated.label = patch.label;

  const anchors = [...context.anchors];
  anchors[index] = updated;

  return {
    ...context,
    anchors,
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Supprime une ancre.
 *
 * @param {HarmonicContext} context
 * @param {string} anchorId
 * @returns {HarmonicContext}
 */
export function removeHarmonicAnchor(context, anchorId) {
  return {
    ...context,
    anchors: context.anchors.filter((a) => a.id !== anchorId),
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Définit la progression originale (remplace l'existante).
 *
 * @param {HarmonicContext} context
 * @param {Array<{
 *   melodyEventId?: string | null,
 *   relativeTime: number,
 *   sourceTime?: number | null,
 *   chord: string | ChordReference,
 *   type?: HarmonicAnchor['type'],
 *   harmonizationPolicy?: HarmonicAnchor['harmonizationPolicy'],
 *   locked?: boolean,
 *   label?: string | null
 * }>} progression
 * @returns {HarmonicContext}
 */
export function setOriginalProgression(context, progression) {
  const anchors = progression.map((entry, i) => {
    let originalChord = null;
    if (entry.chord) {
      if (typeof entry.chord === 'string') {
        const r = resolveChordReference(entry.chord);
        if (r.error) {
          throw new Error(`Accord de progression invalide à l'index ${i} : ${r.error}`);
        }
        originalChord = r.chord;
      } else {
        originalChord = { ...entry.chord };
      }
    }

    return {
      id: makeAnchorId(),
      melodyEventId: entry.melodyEventId || null,
      relativeTime: entry.relativeTime,
      sourceTime: entry.sourceTime ?? null,
      type: entry.type || 'original-chord',
      harmonizationPolicy: entry.harmonizationPolicy || 'automatic',
      originalChord,
      locked: entry.locked || false,
      label: entry.label || null,
    };
  });

  return {
    ...context,
    originalProgression: anchors,
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Valide un HarmonicContext.
 *
 * @param {HarmonicContext} context
 * @param {import('./midi-types.js').MelodyTrack} track
 * @returns {ValidationResult}
 */
export function validateHarmonicContext(context, track) {
  /** @type {ValidationIssue[]} */
  const errors = [];
  /** @type {ValidationIssue[]} */
  const warnings = [];

  // 1. MelodyTrack référencée
  if (!track || !track.id) {
    errors.push({
      severity: 'error',
      code: 'MISSING_TRACK',
      message: 'Aucune MelodyTrack référencée.',
      anchorId: null,
      melodyEventId: null,
    });
    return { valid: false, errors, warnings };
  }

  if (context.melodyTrackId !== track.id) {
    errors.push({
      severity: 'error',
      code: 'TRACK_MISMATCH',
      message: `Le contexte référence la piste "${context.melodyTrackId}" mais la piste fournie est "${track.id}".`,
      anchorId: null,
      melodyEventId: null,
    });
  }

  // 2. Tonalité sélectionnée ou absence explicitement acceptée
  if (context.tonalContext) {
    if (!context.tonalContext.selected && !context.tonalContext.confirmedByUser) {
      warnings.push({
        severity: 'warning',
        code: 'NO_TONALITY_SELECTED',
        message: 'Aucune tonalité sélectionnée dans le contexte tonal.',
        anchorId: null,
        melodyEventId: null,
      });
    }
  } else {
    warnings.push({
      severity: 'warning',
      code: 'NO_TONAL_CONTEXT',
      message: 'Aucun contexte tonal associé.',
      anchorId: null,
      melodyEventId: null,
    });
  }

  // 3. startChord et endChord reconnus
  if (context.startChord) {
    const quality = context.startChord.quality || '';
    if (quality !== '') {
      const def = resolveCanonicalChordDefinition(quality);
      if (!def) {
        errors.push({
          severity: 'error',
          code: 'UNKNOWN_START_CHORD',
          message: `Qualité d'accord initial inconnue : "${quality}".`,
          anchorId: null,
          melodyEventId: null,
        });
      }
    }
  }

  if (context.endChord) {
    const quality = context.endChord.quality || '';
    if (quality !== '') {
      const def = resolveCanonicalChordDefinition(quality);
      if (!def) {
        errors.push({
          severity: 'error',
          code: 'UNKNOWN_END_CHORD',
          message: `Qualité d'accord final inconnue : "${quality}".`,
          anchorId: null,
          melodyEventId: null,
        });
      }
    }
  }

  // 4. anchorId uniques
  const anchorIds = new Set();
  for (const anchor of context.anchors) {
    if (anchorIds.has(anchor.id)) {
      errors.push({
        severity: 'error',
        code: 'DUPLICATE_ANCHOR_ID',
        message: `Identifiant d'ancre en double : "${anchor.id}".`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
    anchorIds.add(anchor.id);
  }

  // 5. melodyEventId existants
  const trackEventIds = new Set(track.events.map((e) => e.id));
  for (const anchor of context.anchors) {
    if (anchor.melodyEventId && !trackEventIds.has(anchor.melodyEventId)) {
      errors.push({
        severity: 'error',
        code: 'UNKNOWN_MELODY_EVENT',
        message: `L'ancre "${anchor.id}" référence un MelodyEvent inexistant : "${anchor.melodyEventId}".`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
  }

  // Vérifier aussi les melodyEventId dans la progression originale
  for (const anchor of context.originalProgression) {
    if (anchor.melodyEventId && !trackEventIds.has(anchor.melodyEventId)) {
      errors.push({
        severity: 'error',
        code: 'UNKNOWN_MELODY_EVENT_IN_PROGRESSION',
        message: `La progression originale (ancre "${anchor.id}") référence un MelodyEvent inexistant : "${anchor.melodyEventId}".`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
  }

  // 6. Ordre chronologique
  const sortedByTime = [...context.anchors].sort((a, b) => a.relativeTime - b.relativeTime);
  for (let i = 0; i < sortedByTime.length; i++) {
    if (sortedByTime[i].id !== context.anchors[i].id) {
      warnings.push({
        severity: 'warning',
        code: 'ANCHORS_NOT_SORTED',
        message: 'Les ancres ne sont pas triées chronologiquement.',
        anchorId: null,
        melodyEventId: null,
      });
      break;
    }
  }

  // 7. Temps dans la plage de la piste
  const trackDuration = track.duration || (track.endedAt - track.startedAt);
  for (const anchor of context.anchors) {
    if (anchor.relativeTime < 0) {
      errors.push({
        severity: 'error',
        code: 'ANCHOR_TIME_NEGATIVE',
        message: `L'ancre "${anchor.id}" a un temps négatif : ${anchor.relativeTime}.`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
    if (trackDuration > 0 && anchor.relativeTime > trackDuration + 1e-6) {
      warnings.push({
        severity: 'warning',
        code: 'ANCHOR_TIME_OUTSIDE_TRACK',
        message: `L'ancre "${anchor.id}" (t=${anchor.relativeTime}) dépasse la durée de la piste (${trackDuration}).`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
  }

  // 8. Progression originale valide
  for (const anchor of context.originalProgression) {
    if (anchor.originalChord) {
      const quality = anchor.originalChord.quality || '';
      if (quality !== '') {
        const def = resolveCanonicalChordDefinition(quality);
        if (!def) {
          errors.push({
            severity: 'error',
            code: 'UNKNOWN_PROGRESSION_CHORD',
            message: `Qualité d'accord inconnue dans la progression originale (ancre "${anchor.id}") : "${quality}".`,
            anchorId: anchor.id,
            melodyEventId: anchor.melodyEventId,
          });
        }
      }
    }
  }

  // Vérifier l'ordre chronologique de la progression originale
  for (let i = 1; i < context.originalProgression.length; i++) {
    if (context.originalProgression[i].relativeTime < context.originalProgression[i - 1].relativeTime) {
      errors.push({
        severity: 'error',
        code: 'PROGRESSION_TIME_ORDER',
        message: `Ordre temporel invalide dans la progression originale à l'index ${i}.`,
        anchorId: context.originalProgression[i].id,
        melodyEventId: context.originalProgression[i].melodyEventId,
      });
    }
  }

  // 9. Aucune politique inconnue
  const validPolicies = new Set(['force', 'automatic', 'skip']);
  for (const anchor of context.anchors) {
    if (!validPolicies.has(anchor.harmonizationPolicy)) {
      errors.push({
        severity: 'error',
        code: 'UNKNOWN_POLICY',
        message: `Politique d'harmonisation inconnue pour l'ancre "${anchor.id}" : "${anchor.harmonizationPolicy}".`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
  }

  // 10. Aucun événement incomplet utilisé comme ancre obligatoire
  const incompleteIds = new Set(
    track.events
      .filter((e) => e.duration <= 0 || e.endedAt <= e.startedAt)
      .map((e) => e.id),
  );

  for (const anchor of context.anchors) {
    if (
      anchor.melodyEventId &&
      incompleteIds.has(anchor.melodyEventId) &&
      anchor.harmonizationPolicy === 'force'
    ) {
      errors.push({
        severity: 'error',
        code: 'INCOMPLETE_EVENT_AS_FORCE_ANCHOR',
        message: `L'ancre "${anchor.id}" utilise un événement incomplet "${anchor.melodyEventId}" avec politique "force".`,
        anchorId: anchor.id,
        melodyEventId: anchor.melodyEventId,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Trie les ancres par temps sans muter l'entrée.
 *
 * @param {HarmonicContext} context
 * @returns {HarmonicContext}
 */
export function sortAnchors(context) {
  const sorted = [...context.anchors].sort((a, b) => a.relativeTime - b.relativeTime);
  return {
    ...context,
    anchors: sorted,
    version: context.version + 1,
    updatedAt: Date.now(),
  };
}

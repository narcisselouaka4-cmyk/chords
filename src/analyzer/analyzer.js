import { buildChordTimeline } from './chord-timeline.js';
import { segment } from './segmenter.js';
import { detectKey, computeKeyFromRawNotes } from './key-detector.js';
import { readSessionFile, writeSessionFile } from '../recorder/storage.js';

// [OpenCode] — 2026-07-06 — Orchestrateur d'analyse des sessions MIDI.

const APP_VERSION = '0.1.0';

export async function analyzeSession(sessionId, events, session) {
  const cached = await loadAnalysis(sessionId);
  if (cached) return cached;

  const totalDuration = session.duration || estimateDuration(events);

  // Pipeline de détection d'accords
  const timeline = buildChordTimeline(events);
  const chords = timeline.chords || [];
  const isMelodic = timeline.isMelodic || false;

  // Détection de tonalité : si mélodique, utiliser les notes brutes ; sinon, pipeline accords + KS
  let key = null;
  if (isMelodic) {
    key = computeKeyFromRawNotes(events, { useSharps: true, latin: false });
  } else {
    key = detectKey(events, chords, { useSharps: true, latin: false });
  }

  if (isMelodic) {
    // Mode mélodique : pas de segmentation en accords
    const result = {
      sessionId,
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      duration: totalDuration,
      sourceType: session.sourceType || 'midi',
      key,
      isMelodic: true,
      chords: [],
      sections: [],
      melodyLine: timeline.melodyLine || [],
    };
    await saveAnalysis(sessionId, result);
    return result;
  }

  const sections = segment(chords, totalDuration);

  // Convert sections chordIndices to reference chord objects for convenience
  const enrichedSections = sections.map((s) => ({
    ...s,
    chords: s.chordIndices.map((idx) => chords[idx]).filter(Boolean),
  }));

  const result = {
    sessionId,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    duration: totalDuration,
    sourceType: session.sourceType || 'midi',
    key,
    isMelodic: false,
    chords,
    sections: enrichedSections,
    melodyLine: [],
  };

  await saveAnalysis(sessionId, result);
  return result;
}

export async function loadAnalysis(sessionId) {
  try {
    const json = await readSessionFile(sessionId, 'analysis/analysis.json');
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function saveAnalysis(sessionId, result) {
  await writeSessionFile(sessionId, 'analysis/analysis.json', JSON.stringify(result, null, 2));
}

function estimateDuration(events) {
  if (!events || events.length === 0) return 0;
  const last = events[events.length - 1];
  return last.time || 0;
}

export { detectKey, computeKeyFromRawNotes };

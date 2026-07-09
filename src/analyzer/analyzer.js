import { buildChordTimeline } from './chord-timeline.js';
import { segment } from './segmenter.js';
import { detectKey, computeKeyFromRawNotes } from './key-detector.js';
import { scoreSession } from './scorer.js';
import { buildVoiceLeading } from './voice-leading.js';
import {
  enrichChordsWithDegrees,
  summarizeHarmonicPatterns,
} from './harmonic-patterns.js';
import { readSessionFile, writeSessionFile } from '../recorder/storage.js';

// [OpenCode] — 2026-07-06 — Orchestrateur d'analyse des sessions MIDI.
// [Claude] — 2026-07-07 — Intégration des scores, des degrés et des patterns harmoniques.

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

  // Scores globaux
  const scores = scoreSession(chords, key?.pc ?? null);

  // Degrés dans la tonalité détectée
  const chordsWithDegrees = key ? enrichChordsWithDegrees(chords, key) : chords;

  // Voice leading entre accords consécutifs
  const voiceLeadings = [];
  for (let i = 1; i < chordsWithDegrees.length; i++) {
    const prev = chordsWithDegrees[i - 1];
    const curr = chordsWithDegrees[i];
    const vl = buildVoiceLeading(prev.notes || [], curr.notes || []);
    if (vl) {
      voiceLeadings.push({
        fromIndex: i - 1,
        toIndex: i,
        ...vl,
      });
    }
  }

  // Patterns harmoniques (II-V-I, cadences, turnarounds, substitutions)
  const patterns = key ? summarizeHarmonicPatterns(chordsWithDegrees, key) : null;

  const result = {
    sessionId,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    duration: totalDuration,
    sourceType: session.sourceType || 'midi',
    key,
    isMelodic: false,
    chords: chordsWithDegrees,
    sections: enrichedSections,
    scores,
    voiceLeadings,
    patterns,
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

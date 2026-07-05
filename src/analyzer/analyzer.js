import { buildChordTimeline } from './chord-timeline.js';
import { segment } from './segmenter.js';
import { noteNameToPc } from '../chord-engine/intervals.js';
import { readSessionFile, writeSessionFile } from '../recorder/storage.js';

// [OpenCode] — 2026-07-04 — Orchestrateur d'analyse des sessions MIDI.

const APP_VERSION = '0.1.0';

export async function analyzeSession(sessionId, events, session) {
  const cached = await loadAnalysis(sessionId);
  if (cached) return cached;

  const chords = buildChordTimeline(events);
  const totalDuration = session.duration || estimateDuration(events);
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
    chords,
    sections: enrichedSections,
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

function parseKey(key) {
  if (!key) return null;
  const match = key.match(/^[A-Ga-g][#b]?/);
  if (!match) return null;
  const name = match[0].toUpperCase();
  return noteNameToPc(name);
}

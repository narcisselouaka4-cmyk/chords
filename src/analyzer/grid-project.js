import { normalizeGridSettings, validBeatTimes } from './musical-grid.js';
import { DISPLAY_RHYTHM_VERSION } from './display-beats.js';

// Métadonnées à côté de l'analyse : jamais dans les accords ni dans les exports.
export function readGridView(project, analysis) {
  const view = project?.display?.chordGrid || {};
  const settings = normalizeGridSettings(view.settings, analysis.timeSignature);
  if (settings.downbeatSeconds > analysis.duration) settings.downbeatSeconds = null;
  const referenceTempo = settings.tempoOverride || analysis.tempo || 120;
  const candidate = view.rhythm;
  const rhythm = candidate?.version === DISPLAY_RHYTHM_VERSION && candidate.source === 'librosa-display'
    && Number.isFinite(candidate.tempo) && candidate.tempo > 0
    && Math.abs(candidate.sourceTempo - referenceTempo) < 0.1
    && Math.abs(candidate.duration - analysis.duration) < 0.15 && validBeatTimes(candidate.beatTimes, analysis.duration)
    ? { version: candidate.version, source: candidate.source, sourceTempo: candidate.sourceTempo, tempo: candidate.tempo, duration: candidate.duration, beatTimes: [...candidate.beatTimes] } : null;
  return { settings, rhythm };
}

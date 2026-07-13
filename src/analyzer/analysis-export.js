import { buildMidiFileMultiTrack } from '../recorder/serializer.js';
import { getEffectiveChord, deriveChordDisplay, parseChordSymbol } from '../ui/chord-editor.js';

// ── Phase D : exports et statistiques basés sur effectiveChord ──

const DEFAULT_OPTIONS = {
  includeBass: true,
  includeChords: true,
  bassProgram: 33,
  chordProgram: 1,
  bassVelocity: 0.78,
  chordVelocity: 0.63,
  chordOctave: 4,
  slashBassOctave: 3,
};

function effectiveNotesForChord(chord, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const effectiveChordStr = getEffectiveChord(chord);
  const display = deriveChordDisplay(effectiveChordStr);

  if (!display.chordTonePcs.length) return [];

  const rootMidi = display.rootPc + (opts.chordOctave + 1) * 12;
  const notes = display.chordTonePcs.map((pc) => rootMidi + ((pc - display.rootPc + 12) % 12));

  // Slash chord : la basse doit être la note la plus grave.
  // Si elle est déjà dans l'accord, on retire l'instance existante et on la
  // place une octave en dessous. Sinon on l'ajoute simplement en dessous.
  if (display.bassPc != null && display.bassPc !== display.rootPc) {
    const bassIndex = notes.findIndex((midi) => (midi % 12) === display.bassPc);
    const bassMidi = display.bassPc + (opts.slashBassOctave + 1) * 12;
    if (bassIndex >= 0) {
      notes[bassIndex] = bassMidi;
    } else {
      notes.push(bassMidi);
    }
  }

  return notes.sort((a, b) => a - b);
}

export function buildAnalysisMidiEvents(analysis, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const bassSegments = analysis.bassSegments || [];
  const chords = analysis.chords || [];
  const tracks = [];

  if (opts.includeBass && bassSegments.length > 0) {
    const bassEvents = [];
    for (const seg of bassSegments) {
      bassEvents.push(
        { time: seg.startTime, type: 'note_on', note: seg.midi, velocity: opts.bassVelocity },
        { time: seg.endTime, type: 'note_off', note: seg.midi, velocity: 0 },
      );
    }
    tracks.push({
      name: 'Bass detected',
      channel: 0,
      program: opts.bassProgram,
      events: bassEvents,
    });
  }

  if (opts.includeChords && chords.length > 0) {
    const chordEvents = [];
    for (const chord of chords) {
      const notes = effectiveNotesForChord(chord, opts);
      if (notes.length === 0) continue;
      for (const midi of notes) {
        chordEvents.push(
          { time: chord.startTime, type: 'note_on', note: midi, velocity: opts.chordVelocity },
          { time: chord.endTime, type: 'note_off', note: midi, velocity: 0 },
        );
      }
    }
    tracks.push({
      name: 'Chords detected',
      channel: 1,
      program: opts.chordProgram,
      events: chordEvents,
    });
  }

  return tracks;
}

export function exportAnalysisToMidi(analysis, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tracks = buildAnalysisMidiEvents(analysis, opts);
  if (tracks.length === 0) return null;

  return buildMidiFileMultiTrack(tracks, {
    tempo: analysis.tempo || 120,
    title: analysis.title || 'Piano Jazz Chords Analysis',
    timeSignature: [4, 4, 24, 8],
  });
}

export function exportAnalysisToJson(analysis, options = {}) {
  const segments = (analysis.chords || []).map((chord) => {
    const detected = parseChordSymbol(chord.chord);
    const override = chord.manualOverride;
    const effective = parseChordSymbol(getEffectiveChord(chord));
    return {
      segmentId: chord.segmentId,
      startTime: chord.startTime,
      endTime: chord.endTime,
      duration: chord.endTime - chord.startTime,
      detectedChord: {
        symbol: chord.chord,
        root: detected.root,
        quality: detected.quality,
        bass: detected.bass,
      },
      manualOverride: override
        ? {
            root: override.root,
            quality: override.quality,
            bass: override.bass,
          }
        : null,
      effectiveChord: {
        symbol: getEffectiveChord(chord),
        root: effective.root,
        quality: effective.quality,
        bass: effective.bass,
      },
      wasManuallyEdited: override != null,
    };
  });

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    title: analysis.title || 'Piano Jazz Chords Analysis',
    duration: analysis.duration || 0,
    tempo: analysis.tempo || 120,
    timeSignature: analysis.timeSignature || '4/4',
    key: analysis.key || null,
    manuallyEditedCount: segments.filter((s) => s.wasManuallyEdited).length,
    segments,
  };
}

export function exportAnalysisToText(analysis, options = {}) {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  const lines = [];
  lines.push(`# ${analysis.title || 'Piano Jazz Chords Analysis'}`);
  lines.push(`# Duration: ${formatTime(analysis.duration || 0)}`);
  lines.push(`# Tempo: ${analysis.tempo || 120} BPM`);
  lines.push(`# Key: ${analysis.key || 'unknown'}`);
  lines.push('');

  for (const chord of analysis.chords || []) {
    const effective = getEffectiveChord(chord);
    const marker = chord.manualOverride ? ' *' : '';
    lines.push(`${formatTime(chord.startTime)} - ${formatTime(chord.endTime)}    ${effective}${marker}`);
  }

  return lines.join('\n');
}

export function computeProductStatistics(analysis) {
  const chords = analysis.chords || [];
  const totalDuration = chords.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
  const qualityCounts = {};
  const chordCounts = {};
  let slashChordCount = 0;
  let manuallyEditedCount = 0;

  for (const chord of chords) {
    const effective = getEffectiveChord(chord);
    const display = deriveChordDisplay(effective);
    const quality = display.quality || 'major';
    qualityCounts[quality] = (qualityCounts[quality] || 0) + 1;

    chordCounts[effective] = (chordCounts[effective] || 0) + 1;
    // Un slash chord compte comme tel uniquement si la basse n'est pas déjà
    // dans les notes de l'accord (sinon c'est une redistribution interne).
    if (display.bassPc != null && display.bassPc !== display.rootPc && !display.chordTonePcs.includes(display.bassPc)) slashChordCount++;
    if (chord.manualOverride != null) manuallyEditedCount++;
  }

  const mostUsedChords = Object.entries(chordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, count]) => ({ symbol, count }));

  return {
    totalSegments: chords.length,
    totalDuration,
    manuallyEditedCount,
    slashChordCount,
    qualityCounts,
    mostUsedChords,
  };
}

export function countManuallyEditedChords(analysis) {
  return (analysis.chords || []).filter((c) => c.manualOverride != null).length;
}

// [OpenCode] — 2026-07-04 — Segmentation simple d'une session en sections musicales.
// Utilise les silences et la répétition des progressions comme heuristiques.

const MIN_SECTION_DURATION = 6; // secondes
const SILENCE_THRESHOLD = 1.5; // secondes

export function segment(chords, totalDuration) {
  if (!chords || chords.length === 0) {
    return [];
  }

  const boundaries = findBoundaries(chords, totalDuration);
  const sections = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start < MIN_SECTION_DURATION && i !== 0) continue;

    const indices = chords
      .map((c, idx) => (c.time >= start && c.time < end ? idx : -1))
      .filter((idx) => idx !== -1);

    // Also include chords that started slightly before but extend into this section
    chords.forEach((c, idx) => {
      if (c.time < start && c.endTime > start && !indices.includes(idx)) {
        indices.push(idx);
      }
    });
    indices.sort((a, b) => a - b);

    sections.push({
      start,
      end,
      label: guessLabel(sections, i, end - start, totalDuration),
      chordIndices: indices,
    });
  }

  // Merge very short sections
  return mergeShortSections(sections, totalDuration);
}

function findBoundaries(chords, totalDuration) {
  const boundaries = new Set([0]);

  // Boundaries from silence gaps
  for (let i = 0; i < chords.length - 1; i++) {
    const gap = chords[i + 1].time - chords[i].endTime;
    if (gap >= SILENCE_THRESHOLD) {
      boundaries.add(Math.round(chords[i].endTime * 10) / 10);
    }
  }

  // Periodicity boundary: if a progression repeats, mark its start
  const progressionSignatures = chords.map((c) => `${c.rootPc}:${c.symbol}:${c.bassPc ?? ''}`);
  for (let length = 2; length <= 8; length++) {
    for (let start = 0; start < progressionSignatures.length - length * 2; start++) {
      const first = progressionSignatures.slice(start, start + length).join('|');
      const second = progressionSignatures.slice(start + length, start + length * 2).join('|');
      if (first === second) {
        const t = chords[start + length]?.time ?? 0;
        boundaries.add(Math.round(t * 10) / 10);
      }
    }
  }

  boundaries.add(Math.ceil(totalDuration * 10) / 10);
  return Array.from(boundaries).sort((a, b) => a - b);
}

function guessLabel(existingSections, index, duration, totalDuration) {
  // For short sessions (under 60s), use neutral A/B/C labels instead of Intro/Outro.
  const isShortSession = totalDuration < 60;
  if (isShortSession) {
    return `Section ${String.fromCharCode(65 + index)}`;
  }

  const isFirst = index === 0;
  const labels = ['Intro', 'Verse', 'PreChorus', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'];
  if (isFirst) return 'Intro';
  const label = labels[Math.min(index, labels.length - 1)];
  return label;
}

function mergeShortSections(sections, totalDuration) {
  const merged = [];
  for (const section of sections) {
    if (merged.length === 0) {
      merged.push(section);
      continue;
    }
    const last = merged[merged.length - 1];
    if (section.end - section.start < MIN_SECTION_DURATION) {
      last.end = section.end;
      last.chordIndices = [...last.chordIndices, ...section.chordIndices];
    } else {
      merged.push(section);
    }
  }

  // Fix last label only for longer sessions
  const isShortSession = totalDuration < 60;
  if (merged.length > 1 && !isShortSession) {
    merged[merged.length - 1].label = 'Outro';
  }

  return merged;
}

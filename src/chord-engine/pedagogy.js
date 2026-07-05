import { chordName, slashName, inversionName, formatNoteList } from './naming.js';

function buildVoicing(rootPc, intervals, inversion = 0) {
  // Build a closed voicing from the root in root position, then rotate by inversion index.
  const notes = intervals.map((i) => (rootPc + i) % 12);
  const rotated = [...notes.slice(inversion), ...notes.slice(0, inversion)];
  return rotated;
}

function drop2Voicing(rootPc, intervals) {
  // Take root position, drop the second highest note (second from top) down an octave.
  if (intervals.length < 4) return null;
  const notes = intervals.map((i) => (rootPc + i) % 12);
  const secondFromTopIndex = notes.length - 2;
  return notes.filter((_, i) => i !== secondFromTopIndex).concat([notes[secondFromTopIndex]]);
}

function drop3Voicing(rootPc, intervals) {
  if (intervals.length < 4) return null;
  const notes = intervals.map((i) => (rootPc + i) % 12);
  const thirdFromTopIndex = notes.length - 3;
  return notes.filter((_, i) => i !== thirdFromTopIndex).concat([notes[thirdFromTopIndex]]);
}

function drop24Voicing(rootPc, intervals) {
  if (intervals.length < 5) return null;
  const notes = intervals.map((i) => (rootPc + i) % 12);
  const secondFromTopIndex = notes.length - 2;
  const fourthFromTopIndex = notes.length - 4;
  const kept = notes.filter((_, i) => i !== secondFromTopIndex && i !== fourthFromTopIndex);
  return kept.concat([notes[fourthFromTopIndex], notes[secondFromTopIndex]]);
}

export function getPedagogy(result, latin = false) {
  const items = [];
  if (!result) return items;

  const { rootPc, symbol, fullName, intervals, inversion, bassPc, isSlash } = result;
  const name = isSlash
    ? slashName(rootPc, symbol, bassPc, latin)
    : chordName(rootPc, symbol, latin);

  items.push({
    title: 'Accord',
    content: `${name} (${fullName || 'accord'}) — ${inversionName(inversion)}`,
  });

  items.push({
    title: 'Notes présentes',
    content: formatNoteList(result.notes, latin).join(' — '),
  });

  // Voicing suggestions
  const close = buildVoicing(rootPc, intervals, 0);
  items.push({
    title: 'Close position',
    content: formatNoteList(close, latin).join(' — '),
  });

  if (intervals.length >= 4) {
    const d2 = drop2Voicing(rootPc, intervals);
    if (d2) {
      items.push({
        title: 'Drop 2',
        content: formatNoteList(d2, latin).join(' — '),
      });
    }
  }

  if (intervals.length >= 4) {
    const d3 = drop3Voicing(rootPc, intervals);
    if (d3) {
      items.push({
        title: 'Drop 3',
        content: formatNoteList(d3, latin).join(' — '),
      });
    }
  }

  if (intervals.length >= 5) {
    const d24 = drop24Voicing(rootPc, intervals);
    if (d24) {
      items.push({
        title: 'Drop 2 & 4',
        content: formatNoteList(d24, latin).join(' — '),
      });
    }
  }

  // Jazz usage hint
  if (symbol.includes('7')) {
    items.push({
      title: 'Usage jazz',
      content: 'Souvent utilisé comme accord de dominante pour résoudre (V → I).',
    });
  }
  if (symbol.includes('m7')) {
    items.push({
      title: 'Usage jazz',
      content: 'Peut servir d’accord II dans une progression II-V-I.',
    });
  }
  if (symbol.includes('maj7')) {
    items.push({
      title: 'Usage jazz',
      content: 'Accord de repos tonal, très présent dans les ballades.',
    });
  }

  return items;
}

export function getPedagogyHtml(result, latin = false) {
  const items = getPedagogy(result, latin);
  if (items.length === 0) return '<p>Jouez des notes pour voir les techniques...</p>';
  return items
    .map(
      (item) =>
        `<div class="pedagogy-item"><strong>${item.title}</strong><br/>${item.content}</div>`,
    )
    .join('');
}

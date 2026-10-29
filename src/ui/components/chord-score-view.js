import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector, StaveTie, GhostNote } from 'vexflow/bravura';
import { buildChordScore } from '../staff/chord-score-model.js';
import { canonicalChordInput, formatMusicChord, notationOptions } from '../music-notation.js';
import { beatAtTime } from '../../analyzer/musical-grid.js';

const ns = 'http://www.w3.org/2000/svg';
const stamp = (time) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
function svgElement(tag, attrs, text) {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text != null) el.textContent = text;
  return el;
}

export function createChordScoreView(host, { onSeek, onEdit } = {}) {
  let model, activeBeat = -1, activeSystem = null, hitAreas = [], systems = [], noteGroups = [], chordLabels = [];
  function render(grid, { formatChord = (symbol) => symbol } = {}) {
    model = grid; activeBeat = -1; activeSystem = null; hitAreas = []; systems = []; noteGroups = []; chordLabels = [];
    host.replaceChildren();
    const note = document.createElement('p'); note.className = 'score-caption';
    note.textContent = 'Réduction harmonique · positions proposées · durées calées sur la grille';
    host.appendChild(note);
    const bars = buildChordScore(grid, { spellSymbol: (symbol) => canonicalChordInput(formatMusicChord(symbol, { ...notationOptions(), latin: false })) }), count = host.clientWidth < 1050 ? 2 : 4;
    const sections = new Set(grid.sections.map((s) => s.rows[0].from));
    let previousNotes = null, previousMeter = null;
    for (let start = 0; start < bars.length; start += count) {
      const group = bars.slice(start, start + count);
      const line = document.createElement('div'); line.className = 'score-system';
      if (start && sections.has(group[0].from)) line.classList.add('score-section-start');
      host.appendChild(line);
      const width = Math.max(host.clientWidth - 12, count * 300), height = 265;
      const renderer = new Renderer(line, Renderer.Backends.SVG); renderer.resize(width, height);
      const context = renderer.getContext();
      const svg = line.querySelector('svg');
      svg.style.width = '100%'; svg.style.height = 'auto';
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', `Partition, ${stamp(grid.boundaries[group[0].from])}`);
      svg.appendChild(svgElement('text', { x: 8, y: 16, class: 'score-time' }, stamp(grid.boundaries[group[0].from])));
      const pairs = group.map((bar, index) => {
        const top = new Stave(20 + index * (width - 30) / count, 45, (width - 30) / count);
        const bottom = new Stave(top.getX(), 155, top.getWidth());
        if (index === 0) {
          top.addClef('treble'); bottom.addClef('bass');
        }
        if (index === 0 || previousMeter !== bar.signature) {
          top.addTimeSignature(bar.signature); bottom.addTimeSignature(bar.signature);
        }
        previousMeter = bar.signature;
        const topNotes = [], bottomNotes = [];
        for (const event of bar.events) {
          const make = (clef, pitches) => event.voicing.unsupported ? new GhostNote({ duration: event.duration }) : new StaveNote({
            clef, keys: pitches.length ? pitches.map((p) => `${p.name.toLowerCase()}/${p.octave}`) : [clef === 'treble' ? 'b/4' : 'd/3'],
            duration: event.duration + (pitches.length ? '' : 'r'), auto_stem: true,
          });
          topNotes.push(make('treble', event.voicing.treble));
          bottomNotes.push(make('bass', event.voicing.bass));
        }
        const voices = [topNotes, bottomNotes].map((notes) => new Voice({ num_beats: bar.to - bar.from, beat_value: grid.settings.beatUnit }).addTickables(notes));
        // Pas d'armure globale trompeuse en présence de modulations : altérations locales,
        // avec réinitialisation à chaque mesure et bécarres automatiques.
        voices.forEach((voice) => Accidental.applyAccidentals([voice], 'C'));
        top.setContext(context).draw(); bottom.setContext(context).draw();
        if (index === 0) new StaveConnector(top, bottom).setType(StaveConnector.type.BRACE).setContext(context).draw();
        new StaveConnector(top, bottom).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
        new StaveConnector(top, bottom).setType(StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();
        bottom.setNoteStartX(top.getNoteStartX());
        const formatter = new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]);
        formatter.format(voices, Math.max(70, top.getNoteEndX() - top.getNoteStartX() - 20));
        voices[0].draw(context, top); voices[1].draw(context, bottom);
        return { bar, top, bottom, topNotes, bottomNotes };
      });
      let currentLabel = null;
      for (const pair of pairs) {
        const { bar, top, topNotes, bottomNotes } = pair;
        for (let i = 0; i < bar.events.length; i++) {
          const event = bar.events[i], notes = [topNotes[i], bottomNotes[i]];
          if (event.tiePrevious && previousNotes) {
            notes.forEach((current, staff) => {
              const previous = previousNotes.notes[staff];
              const indices = current.getKeys().map((_, k) => k);
              if (previousNotes.line === line) new StaveTie({ first_note: previous, last_note: current, first_indices: indices, last_indices: indices }).setContext(context).draw();
              else {
                new StaveTie({ first_note: previous, first_indices: indices, last_indices: indices }).setContext(previousNotes.context).draw();
                new StaveTie({ last_note: current, first_indices: indices, last_indices: indices }).setContext(context).draw();
              }
            });
          }
          const x = notes[0].getAbsoluteX();
          if ((!event.tiePrevious && (event.symbol !== 'N' || !previousNotes?.silence)) || i === 0 && pair === pairs[0]) {
            currentLabel = svgElement('text', { x: x - 4, y: 42, class: 'score-chord-label' },
              event.symbol === 'N' ? 'Silence' : formatChord(event.symbol) + (event.voicing.unsupported ? ' · non transcrit' : ''));
            svg.appendChild(currentLabel);
          }
          const left = i ? (topNotes[i - 1].getAbsoluteX() + x) / 2 : top.getNoteStartX() - 10;
          const right = i + 1 < topNotes.length ? (x + topNotes[i + 1].getAbsoluteX()) / 2 : top.getNoteEndX();
          for (let beat = event.from; beat < event.to; beat++) {
            const startX = left + (right - left) * (beat - event.from) / (event.to - event.from);
            const hit = svgElement('rect', { x: startX, y: 44, width: Math.max(2, (right - left) / (event.to - event.from)), height: 210,
              class: 'score-beat', role: 'button', tabindex: '0', 'data-beat': beat,
              'aria-label': `${formatChord(event.symbol === 'N' ? 'Silence' : event.symbol)}, ${stamp(grid.boundaries[beat])}, temps ${beat - bar.from + 1}` });
            hit.dataset.segmentId = event.segmentId;
            hit.addEventListener('click', () => onSeek?.(grid.boundaries[beat], event.segmentId));
            hit.addEventListener('dblclick', () => onEdit?.(event.segmentId));
            hit.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSeek?.(grid.boundaries[beat], event.segmentId); }
              const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -(group.at(-1).to - group[0].from), ArrowDown: group.at(-1).to - group[0].from }[e.key];
              if (step) { e.preventDefault(); e.stopPropagation(); hitAreas[beat + step]?.focus(); }
            });
            noteGroups[beat] = notes.map((note) => note.getSVGElement()).filter(Boolean);
            chordLabels[beat] = currentLabel;
            hitAreas[beat] = hit; systems[beat] = line; svg.appendChild(hit);
          }
          previousNotes = { notes, line, context, silence: event.voicing.silence };
        }
      }
    }
    if (!bars.length) host.textContent = 'Aucun accord à afficher.';
  }
  function update(time, follow = true) {
    if (!model) return;
    const beat = beatAtTime(model.boundaries, time);
    if (beat === activeBeat) return;
    hitAreas[activeBeat]?.removeAttribute('aria-current');
    noteGroups[activeBeat]?.forEach((el) => el.classList.remove('score-note-current'));
    chordLabels[activeBeat]?.classList.remove('is-playing');
    activeBeat = beat; hitAreas[beat]?.setAttribute('aria-current', 'true');
    noteGroups[beat]?.forEach((el) => el.classList.add('score-note-current'));
    chordLabels[beat]?.classList.add('is-playing');
    const line = systems[beat];
    if (line !== activeSystem) {
      activeSystem = line;
      if (follow && line) {
        const bounds = host.getBoundingClientRect(), rect = line.getBoundingClientRect();
        if (rect.top < bounds.top || rect.bottom > bounds.bottom) host.scrollTo({ top: host.scrollTop + rect.top - bounds.top - 28, behavior: 'auto' });
      }
    }
  }
  return { render, update };
}

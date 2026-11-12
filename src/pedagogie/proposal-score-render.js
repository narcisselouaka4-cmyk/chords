// [Claude] — 2026-11-11 — Dessin de la partition d'une prise ou d'une proposition (VexFlow).
// Chargé seulement quand le pianiste ouvre « Partition » (proposal-score-view.js) : le modèle
// (proposal-score-model.js) décide des notes et des durées, ce fichier ne fait que les graver.
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector, StaveTie, Beam, Dot } from 'vexflow/bravura';
import { UNITS_PER_BAR } from './proposal-score-model.js';

const NS = 'http://www.w3.org/2000/svg';
const REST_KEY = { treble: 'b/4', bass: 'd/3' };

function staveNote(event, clef) {
  const dotted = event.code.endsWith('d');
  const duration = `${dotted ? event.code.slice(0, -1) : event.code}${dotted ? 'd' : ''}${event.rest ? 'r' : ''}`;
  const note = new StaveNote({
    clef,
    keys: event.rest ? [REST_KEY[clef]] : event.keys.map((k) => `${k.name.toLowerCase()}/${k.octave}`),
    duration,
    auto_stem: true,
  });
  if (dotted) Dot.buildAndAttach([note], { all: true });
  return note;
}

/**
 * Grave la partition dans `host`.
 * @param {HTMLElement} host
 * @param {object} score modèle de buildProposalScore
 * @param {{formatChord?: (name: string) => string}} [options]
 * @returns {{highlight: (unit: number|null) => void}}
 */
export function drawProposalScore(host, score, { formatChord = (name) => name } = {}) {
  host.replaceChildren();
  const byUnit = new Map();
  if (!score || score.empty) return { highlight() {} };
  // [Claude] — 2026-11-12 — Narcisse : « la partition doit se lire de façon horizontale et pas
  // verticale, et ça prend trop de place ». Une seule ligne, qui défile de gauche à droite (et suit
  // la lecture), plus basse ; chaque mesure a la largeur que demandent ses notes.
  const barWidthOf = (bar) => { const n = Math.max(bar.treble.length, bar.bass.length); return n > 10 ? 330 : n > 6 ? 260 : n > 3 ? 200 : 160; };
  const perSystem = score.bars.length;
  const SCALE = 0.72;
  const describe = (bar) => ['treble', 'bass'].map((clef) => `${clef === 'treble' ? 'clé de sol' : 'clé de fa'} ${bar[clef].map((e) => (e.rest ? 'silence' : e.keys.map((k) => `${k.name.replace('b', '♭').replace('#', '♯')}${k.octave}`).join('+'))).join(' ')}`).join(' ; ');
  let carry = { treble: null, bass: null };
  for (let start = 0; start < score.bars.length; start += perSystem) {
    const group = score.bars.slice(start, start + perSystem);
    const line = document.createElement('div');
    line.className = 'copilot-score-system';
    host.appendChild(line);
    const widths = group.map(barWidthOf);
    const width = 24 + 70 + widths.reduce((a, b) => a + b, 0);
    const height = 212;
    const renderer = new Renderer(line, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    const svg = line.querySelector('svg');
    svg.style.width = `${Math.round(width * SCALE)}px`;
    svg.style.height = `${Math.round(height * SCALE)}px`;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    // Description lisible sans la vue : les notes de chaque mesure, altérations comprises.
    svg.setAttribute('aria-label', `Partition. ${group.map((bar) => `Mesure ${bar.index + 1} : ${describe(bar)}`).join('. ')}`);
    let x = 12;
    group.forEach((bar, index) => {
      // La première mesure porte les clés et la signature : un peu plus large.
      const barWidth = widths[index] + (index === 0 ? 70 : 0);
      const top = new Stave(x, 30, barWidth);
      const bottom = new Stave(x, 118, barWidth);
      x += barWidth;
      if (index === 0) { top.addClef('treble'); bottom.addClef('bass'); }
      if (start === 0 && index === 0) { top.addTimeSignature('4/4'); bottom.addTimeSignature('4/4'); }
      top.setContext(context).draw();
      bottom.setContext(context).draw();
      if (index === 0) new StaveConnector(top, bottom).setType(StaveConnector.type.BRACE).setContext(context).draw();
      new StaveConnector(top, bottom).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
      new StaveConnector(top, bottom).setType(StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();
      bottom.setNoteStartX(top.getNoteStartX());
      const staves = { treble: top, bass: bottom };
      const drawn = {};
      const voices = [];
      const beams = [];
      for (const clef of ['treble', 'bass']) {
        const notes = bar[clef].map((event) => staveNote(event, clef));
        drawn[clef] = notes;
        const voice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false).addTickables(notes);
        // Pas d'armure : altérations écrites devant les notes, annulées à chaque mesure.
        Accidental.applyAccidentals([voice], 'C');
        voices.push(voice);
        beams.push(...Beam.generateBeams(notes.filter((n) => !n.isRest())));
      }
      new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]).format(voices, Math.max(90, top.getNoteEndX() - top.getNoteStartX() - 16));
      voices[0].draw(context, top);
      voices[1].draw(context, bottom);
      beams.forEach((beam) => beam.setContext(context).draw());
      for (const clef of ['treble', 'bass']) {
        bar[clef].forEach((event, i) => {
          const note = drawn[clef][i];
          const element = note.getSVGElement?.();
          if (element && !event.rest) {
            if (!byUnit.has(event.from)) byUnit.set(event.from, []);
            byUnit.get(event.from).push(element);
          }
          // Liaisons : une note qui continue n'est pas réattaquée.
          const previous = i > 0 ? { note: drawn[clef][i - 1], event: bar[clef][i - 1], line } : carry[clef];
          if (previous && !event.rest && !previous.event.rest) {
            const pairs = event.keys.map((k, to) => ({ to, from: previous.event.keys.findIndex((p) => p.midi === k.midi && p.tiedToNext) })).filter((p) => p.from >= 0 && event.keys[p.to].tiedFromPrevious);
            if (pairs.length) {
              const first_indices = pairs.map((p) => p.from);
              const last_indices = pairs.map((p) => p.to);
              if (previous.line === line) new StaveTie({ first_note: previous.note, last_note: note, first_indices, last_indices }).setContext(context).draw();
              else {
                new StaveTie({ first_note: previous.note, first_indices, last_indices: first_indices }).setContext(previous.context).draw();
                new StaveTie({ last_note: note, first_indices: last_indices, last_indices }).setContext(context).draw();
              }
            }
          }
        });
        const lastIndex = bar[clef].length - 1;
        carry[clef] = lastIndex >= 0 ? { note: drawn[clef][lastIndex], event: bar[clef][lastIndex], line, context } : null;
      }
      // Accords au-dessus de la portée, à l'endroit où ils arrivent.
      for (const chord of bar.chords) {
        const offset = (chord.at - bar.from) / UNITS_PER_BAR;
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', String(top.getNoteStartX() + offset * (top.getNoteEndX() - top.getNoteStartX())));
        text.setAttribute('y', '26');
        text.setAttribute('class', 'copilot-score-chord');
        text.textContent = formatChord(chord.name);
        svg.appendChild(text);
      }
    });
  }
  let current = [];
  return {
    highlight(unit) {
      current.forEach((el) => el.classList.remove('copilot-score-current'));
      current = unit == null ? [] : byUnit.get(unit) || [];
      current.forEach((el) => el.classList.add('copilot-score-current'));
      // La ligne défile pour garder la note en cours à l'écran (sans faire défiler la conversation).
      const sheet = host.closest?.('.copilot-score-sheet') || host;
      if (current[0] && sheet.scrollWidth > sheet.clientWidth) {
        const box = current[0].getBoundingClientRect?.(), frame = sheet.getBoundingClientRect?.();
        if (box && frame && (box.left < frame.left + 40 || box.right > frame.right - 40)) sheet.scrollLeft += box.left - frame.left - frame.width / 3;
      }
    },
  };
}

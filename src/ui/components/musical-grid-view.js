import { buildMusicalGrid, beatAtTime } from '../../analyzer/musical-grid.js';

const timeLabel = (time) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
function element(tag, className, text) {
  const el = document.createElement(tag); el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

export function createMusicalGridView(host, { onSeek, onEdit } = {}) {
  let model = null, activeBeat = -1, activeRow = -1, beatElements = [], rowElements = [], timeCells = [], timeRows = [];
  function render(analysis, { settings, rhythm, detailed = false } = {}) {
    model = buildMusicalGrid(analysis, { settings, rhythm });
    activeBeat = -1; activeRow = -1; beatElements = []; rowElements = []; timeCells = []; timeRows = [];
    host.replaceChildren();
    for (const section of model.sections) {
      // On conserve les respirations entre groupes, sans leur attribuer un nom de partie.
      const block = element('div', 'mg-section');
      for (const row of section.rows) {
        const line = element('div', 'mg-row'); rowElements[row.index] = line;
        const label = element('div', 'mg-row-label');
        // [Claude] — 2026-10-28 — Plus de numéro de mesure à gauche (« m. 92 ») : Narcisse,
        //   « je ne sais pas à quoi ça sert, on peut clairement enlever ». Restent l'instant,
        //   et le tempo quand il change nettement.
        label.appendChild(element('span', 'mg-row-time', timeLabel(row.startTime)));
        if (row.index && Math.abs(row.bpm / model.rows[row.index - 1].bpm - 1) > 0.06 && !model.estimated) {
          label.appendChild(element('span', 'mg-tempo-change', `≈ ${Math.round(row.bpm)} BPM`));
        }
        line.appendChild(label);
        const track = element('div', 'mg-row-track mg-capsule-track');
        // Quatre mesures irrégulières peuvent dépasser le nombre nominal de temps.
        track.style.setProperty('--row-beats', String(Math.max(model.settings.beatsPerBar * 4, row.to - row.from)));
        for (const cell of row.cells) {
          const button = element('button', 'mg-cell'); button.type = 'button';
          button.style.gridColumn = `${cell.from - row.from + 1} / span ${cell.to - cell.from}`;
          button.style.setProperty('--cell-beats', String(cell.to - cell.from));
          button.dataset.segmentId = cell.segmentId;
          button.dataset.start = String(cell.startTime);
          button.dataset.end = String(cell.endTime);
          button.dataset.symbol = cell.symbol;
          button.dataset.fromBeat = String(cell.from);
          button.dataset.toBeat = String(cell.to);
          if (cell.symbol === 'N') button.classList.add('is-silence');
          const chord = cell.symbol === 'N' ? 'Silence' : cell.symbol;
          button.setAttribute('aria-label', `${chord}, ${cell.to - cell.from} temps, ${timeLabel(cell.startTime)}, mesure ${row.bars.find((b) => cell.from < b.to)?.number}`);
          button.title = `${chord} · ${cell.to - cell.from} temps${cell.passages.length ? ` · Passages : ${cell.passages.map((p) => p.symbol).join(', ')}` : ''}\nClic : écouter ici · Double-clic : corriger l’accord`;
          const surface = element('span', 'mg-surface');
          const fill = element('span', 'mg-fill');
          fill.setAttribute('aria-hidden', 'true');
          surface.appendChild(fill);
          for (let i = cell.from; i < cell.to; i++) {
            const beat = element('span', 'mg-beat'); beat.setAttribute('aria-hidden', 'true');
            beat.dataset.beat = String(i); beatElements[i] = beat;
            if (row.bars.some((b) => !b.pickup && b.from === i)) beat.classList.add('mg-downbeat');
            button.appendChild(beat);
          }
          const content = element('span', 'mg-cell-content');
          const symbol = cell.symbol === 'N' ? '—' : cell.symbol;
          content.appendChild(element('span', cell.continued ? 'mg-continuation' : 'mg-symbol', symbol));
          if (detailed && cell.passages.length) {
            const names = cell.passages.filter((p, i, all) => !i || all[i - 1].symbol !== p.symbol).map((p) => p.symbol);
            content.appendChild(element('span', 'mg-passages', names.join(' · ')));
          }
          surface.appendChild(content);
          button.appendChild(surface);
          button.addEventListener('click', (event) => {
            let beat = cell.from;
            if (event.detail) {
              // Les zones de temps restent cliquables, sans repères visuels sous les capsules.
              const pulses = [...button.querySelectorAll('.mg-beat')];
              const index = pulses.findIndex((pulse) => event.clientX < pulse.getBoundingClientRect().right);
              beat += index < 0 ? pulses.length - 1 : index;
            }
            onSeek?.(model.boundaries[beat], cell.segmentId);
          });
          button.addEventListener('dblclick', () => onEdit?.(cell.segmentId));
          button.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            const all = [...host.querySelectorAll('.mg-cell')], index = all.indexOf(button);
            const target = event.key === 'ArrowUp' || event.key === 'ArrowDown'
              ? rowElements[row.index + (event.key === 'ArrowUp' ? -1 : 1)]?.querySelector('.mg-cell')
              : all[index + (event.key === 'ArrowLeft' ? -1 : 1)];
            target?.focus();
          });
          track.appendChild(button);
        }
        // Traits superposés : restent visibles même si un accord traverse une mesure.
        const bars = element('div', 'mg-bar-lines'); bars.setAttribute('aria-hidden', 'true');
        for (const bar of row.bars) {
          const mark = element('span', 'mg-bar-line');
          mark.style.gridColumn = `${bar.from - row.from + 1} / span ${bar.to - bar.from}`;
          bars.appendChild(mark);
        }
        track.appendChild(bars); line.appendChild(track);

        // Vue à cases : de vrais boutons indépendants, un par temps, même sans nouvelle attaque.
        const classic = element('div', 'mg-row-track mg-classic-track');
        classic.style.setProperty('--row-beats', String(Math.max(model.settings.beatsPerBar * 4, row.to - row.from)));
        timeRows[row.index] = [];
        for (const cell of row.cells) for (let i = cell.from; i < cell.to; i++) {
          const button = element('button', 'mg-time-cell'); button.type = 'button';
          button.style.gridColumn = String(i - row.from + 1);
          button.dataset.beat = String(i); button.dataset.segmentId = cell.segmentId;
          button.dataset.symbol = cell.symbol; button.dataset.start = String(model.boundaries[i]);
          const chord = cell.symbol === 'N' ? 'Silence' : cell.symbol;
          button.setAttribute('aria-label', `${chord}, temps ${i - row.from + 1}, ${timeLabel(model.boundaries[i])}`);
          button.title = `${chord} · ${model.boundaries[i].toFixed(2)} s\nClic : écouter ici · Double-clic : corriger l’accord`;
          if (i === cell.from && !cell.continued) button.textContent = cell.symbol === 'N' ? '—' : cell.symbol;
          if (row.bars.some((bar) => !bar.pickup && bar.from === i)) button.classList.add('mg-measure-start');
          button.addEventListener('click', () => onSeek?.(model.boundaries[i], cell.segmentId));
          button.addEventListener('dblclick', () => onEdit?.(cell.segmentId));
          button.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation?.();
            const adjacent = timeRows[row.index + (event.key === 'ArrowUp' ? -1 : 1)];
            const target = event.key === 'ArrowUp' || event.key === 'ArrowDown'
              ? adjacent?.[Math.min(i - row.from, adjacent.length - 1)]
              : timeCells[i + (event.key === 'ArrowLeft' ? -1 : 1)];
            target?.focus();
          });
          timeCells[i] = button; timeRows[row.index].push(button); classic.appendChild(button);
        }
        line.appendChild(classic); block.appendChild(line);
      }
      host.appendChild(block);
    }
    if (!model.rows.length) host.appendChild(element('p', 'mg-empty', 'Aucun accord à afficher.'));
    return model;
  }
  function update(time, follow = true) {
    if (!model) return;
    const beat = beatAtTime(model.boundaries, time);
    // Le remplissage suit les intervalles réels des temps, y compris au retour arrière.
    const currentCell = beatElements[beat]?.parentElement;
    if (currentCell) {
      const from = Number(currentCell.dataset.fromBeat), to = Number(currentCell.dataset.toBeat);
      const start = model.boundaries[beat], end = model.boundaries[beat + 1];
      const fraction = end > start ? Math.max(0, Math.min(1, (time - start) / (end - start))) : 0;
      const position = (beat - from + fraction) / (to - from);
      currentCell.style.setProperty('--playhead', position.toFixed(8));
    }
    if (beat === activeBeat) return;
    beatElements[activeBeat]?.classList.remove('is-current');
    beatElements[activeBeat]?.parentElement?.removeAttribute('aria-current');
    timeCells[activeBeat]?.classList.remove('is-current');
    timeCells[activeBeat]?.removeAttribute('aria-current');
    activeBeat = beat;
    beatElements[beat]?.classList.add('is-current');
    beatElements[beat]?.parentElement?.setAttribute('aria-current', 'true');
    timeCells[beat]?.classList.add('is-current');
    timeCells[beat]?.setAttribute('aria-current', 'true');
    const row = model.rows.findIndex((r) => r.from <= beat && beat < r.to);
    if (row !== activeRow) {
      rowElements[activeRow]?.classList.remove('is-current'); activeRow = row;
      const line = rowElements[row]; line?.classList.add('is-current');
      if (follow && line) {
        const bounds = host.getBoundingClientRect(), rect = line.getBoundingClientRect();
        if (rect.top < bounds.top + 4 || rect.bottom > bounds.bottom - 4) {
          host.scrollTo({ top: Math.max(0, host.scrollTop + rect.top - bounds.top - 28), behavior: 'auto' });
        }
      }
    }
  }
  return { render, update };
}

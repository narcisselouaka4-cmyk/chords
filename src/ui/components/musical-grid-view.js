import { buildMusicalGrid, beatAtTime } from '../../analyzer/musical-grid.js';

const timeLabel = (time) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
function element(tag, className, text) {
  const el = document.createElement(tag); el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

export function createMusicalGridView(host, { onSeek, onEdit } = {}) {
  let model = null, activeBeat = -1, activeRow = -1, beatElements = [], rowElements = [];
  function render(analysis, { settings, rhythm, detailed = false } = {}) {
    model = buildMusicalGrid(analysis, { settings, rhythm });
    activeBeat = -1; activeRow = -1; beatElements = []; rowElements = [];
    host.replaceChildren();
    for (const section of model.sections) {
      const block = element('section', 'mg-section');
      block.style.setProperty('--section-color', `var(--mg-section-${section.id % 6})`);
      block.setAttribute('aria-label', section.label);
      block.appendChild(element('h3', 'mg-section-title', section.label));
      for (const row of section.rows) {
        const line = element('div', 'mg-row'); rowElements[row.index] = line;
        const label = element('div', 'mg-row-label');
        label.appendChild(element('span', 'mg-row-time', timeLabel(row.startTime)));
        label.appendChild(element('span', 'mg-row-number', row.bars[0].pickup ? 'Levée' : `m. ${row.bars[0].number}`));
        if (row.index && Math.abs(row.bpm / model.rows[row.index - 1].bpm - 1) > 0.06 && !model.estimated) {
          label.appendChild(element('span', 'mg-tempo-change', `≈ ${Math.round(row.bpm)} BPM`));
        }
        line.appendChild(label);
        const track = element('div', 'mg-row-track');
        track.style.setProperty('--row-beats', String(model.settings.beatsPerBar * 4));
        for (const cell of row.cells) {
          const button = element('button', 'mg-cell'); button.type = 'button';
          button.style.gridColumn = `${cell.from - row.from + 1} / span ${cell.to - cell.from}`;
          button.style.setProperty('--cell-beats', String(cell.to - cell.from));
          button.dataset.segmentId = cell.segmentId;
          button.dataset.start = String(cell.startTime);
          button.dataset.end = String(cell.endTime);
          button.dataset.symbol = cell.symbol;
          const chord = cell.symbol === 'N' ? 'Silence' : cell.symbol;
          button.setAttribute('aria-label', `${chord}, ${cell.to - cell.from} temps, ${timeLabel(cell.startTime)}, mesure ${row.bars.find((b) => cell.from < b.to)?.number}`);
          button.title = `${chord} · ${cell.to - cell.from} temps${cell.passages.length ? ` · Passages : ${cell.passages.map((p) => p.symbol).join(', ')}` : ''}\nClic : écouter ici · Double-clic : corriger l’accord`;
          for (let i = cell.from; i < cell.to; i++) {
            const beat = element('span', 'mg-beat'); beat.setAttribute('aria-hidden', 'true');
            beat.dataset.beat = String(i); beatElements[i] = beat;
            if (row.bars.some((b) => !b.pickup && b.from === i)) beat.classList.add('mg-downbeat');
            button.appendChild(beat);
          }
          const content = element('span', 'mg-cell-content');
          const symbol = cell.symbol === 'N' ? '—' : cell.symbol;
          content.appendChild(element('span', cell.continued ? 'mg-continuation' : 'mg-symbol', cell.continued ? `${symbol} · tenu` : symbol));
          if (detailed && cell.passages.length) {
            const names = cell.passages.filter((p, i, all) => !i || all[i - 1].symbol !== p.symbol).map((p) => p.symbol);
            content.appendChild(element('span', 'mg-passages', names.join(' · ')));
          }
          button.appendChild(content);
          button.addEventListener('click', (event) => {
            let beat = cell.from;
            if (event.detail && button.getBoundingClientRect().width) {
              const rect = button.getBoundingClientRect();
              beat += Math.max(0, Math.min(cell.to - cell.from - 1, Math.floor((event.clientX - rect.left) / rect.width * (cell.to - cell.from))));
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
        track.appendChild(bars); line.appendChild(track); block.appendChild(line);
      }
      host.appendChild(block);
    }
    if (!model.rows.length) host.appendChild(element('p', 'mg-empty', 'Aucun accord à afficher.'));
    return model;
  }
  function update(time, follow = true) {
    if (!model) return;
    const beat = beatAtTime(model.boundaries, time);
    if (beat === activeBeat) return;
    beatElements[activeBeat]?.classList.remove('is-current');
    beatElements[activeBeat]?.parentElement?.removeAttribute('aria-current');
    activeBeat = beat;
    beatElements[beat]?.classList.add('is-current');
    beatElements[beat]?.parentElement?.setAttribute('aria-current', 'true');
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

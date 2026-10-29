import { createMusicalGridView } from './musical-grid-view.js';
import { buildMusicalGrid } from '../../analyzer/musical-grid.js';

// Charge le graveur uniquement lorsqu'on demande la partition.
export function createAnalysisMusicView(host, callbacks) {
  const grid = createMusicalGridView(host, callbacks);
  let score, loading, generation = 0, time = 0, lastFollow = false, lastInput;
  function render(analysis, options = {}) {
    const ticket = ++generation;
    lastInput = { analysis, options };
    host.dataset.presentation = options.presentation || 'cases';
    if (options.presentation !== 'score') return grid.render(analysis, options);
    const model = buildMusicalGrid(analysis, options);
    const draw = () => {
      if (ticket !== generation) return;
      score.render(model, options);
      score.update(time, lastFollow);
    };
    if (score) draw();
    else {
      host.textContent = 'Préparation de la partition…';
      loading ??= import('./chord-score-view.js');
      loading.then(({ createChordScoreView }) => {
        score ??= createChordScoreView(host, callbacks);
        draw();
      }).catch((error) => {
        if (ticket !== generation) return;
        console.error('[Partition]', error);
        host.textContent = 'Impossible d’afficher la partition. La vue Cases reste disponible.';
      });
    }
    return model;
  }
  // Recompose deux mesures par système sur écran étroit, quatre sur grand écran.
  let width = Math.round(host.clientWidth);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    const next = Math.round(host.clientWidth);
    if (next > 0 && next !== width) {
      width = next;
      if (lastInput?.options.presentation === 'score') render(lastInput.analysis, lastInput.options);
    }
  }).observe(host);
  return { render, update(value, follow = true) {
    time = value; lastFollow = follow;
    if (lastInput?.options.presentation === 'score') score?.update(value, follow);
    else grid.update(value, follow);
  } };
}

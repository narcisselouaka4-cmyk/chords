import { playingChangesAt } from '../pedagogie/playing-diff.js';

const CLASSES = ['is-copilot-source', 'is-copilot-change'];

/** Couche visuelle uniquement : aucune note supplémentaire envoyée au piano. */
export function createPlayingHighlights(root) {
  function clear() {
    root.querySelectorAll('.is-copilot-source, .is-copilot-change').forEach((key) => key.classList.remove(...CLASSES));
  }
  function show(comparison, at, options) {
    if (!comparison) { clear(); return; }
    const { changed } = playingChangesAt(comparison, at, options);
    root.querySelectorAll('.note').forEach((key) => {
      const note = Number(key.dataset.midi);
      const sounding = key.classList.contains('active') && key.classList.contains('is-app');
      key.classList.toggle('is-copilot-source', sounding && !changed.has(note));
      key.classList.toggle('is-copilot-change', sounding && changed.has(note));
    });
  }
  return { show, clear };
}

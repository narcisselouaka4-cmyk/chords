// [Claude] — 2026-11-11 — « Partition » sous une prise, une proposition ou un exemple du Copilote.
//
// Pour les pianistes lecteurs : deux portées, les accords au-dessus, ce qui est joué et pas une
// simple liste d'accords. Repliée par défaut ; la gravure (VexFlow) n'est chargée qu'à l'ouverture.
// Ce qui est estimé est dit sous la partition (pulsation, barres de mesure, arrondi, portées) :
// une prise libre n'est jamais présentée comme une partition certaine. La lecture, elle, garde
// le rythme exact et la partition la suit par le temps réel.
import { buildProposalScore, scorePositionAt } from './proposal-score-model.js';
import { proposalChordGrid } from './proposal-chord-grid.js';

const openScores = new Set();
const views = new WeakMap();

const node = (tag, className = '', text = '') => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };

/**
 * Les partitions disponibles pour un résultat : le jeu d'origine, puis chaque proposition ;
 * à défaut, l'exemple seul (accord ou progression nommés).
 * @returns {{label: string, playbackId: string, events: object[], chordLabels: {at: number, name: string}[], key: string}[]}
 */
export function scoreSources(result, { originalId = '', variantIds = [], id = '', notation = 'english' } = {}) {
  if (!result) return [];
  const grid = proposalChordGrid(result, { notation });
  const labelsOf = (rowIndex) => (grid ? grid.columns.map((c) => c.cells[rowIndex]).filter(Boolean).map((cell) => ({ at: cell.at, name: cell.name })) : []);
  const key = result.originalTake?.key || result.example?.source?.key || '';
  const sources = [];
  const variants = Array.isArray(result.variants) && result.variants.length ? result.variants : null;
  if (result.originalTake?.events?.length) {
    const row = grid ? grid.rows.findIndex((r) => r.original) : -1;
    sources.push({ label: 'Ton jeu', playbackId: originalId, events: result.originalTake.events, chordLabels: row >= 0 ? labelsOf(row) : [], key });
  }
  if (variants) {
    variants.forEach((variant, index) => {
      if (!variant?.example?.events?.length) return;
      const row = grid ? grid.rows.findIndex((r) => !r.original && r.variantIndex === index) : -1;
      sources.push({ label: variants.length > 1 ? `Proposition ${index + 1}` : 'Proposition', playbackId: variantIds[index] || '', events: variant.example.events, chordLabels: row >= 0 ? labelsOf(row) : [], key });
    });
  } else if (result.example?.events?.length) {
    // Exemple nommé : son nom au-dessus de la première mesure.
    const first = result.example.events.find((e) => e.type === 'noteOn');
    // Ses temps sont en battues, à un tempo connu : rien n'est estimé, et le lecteur (en secondes) est converti.
    const tempo = Number(result.example.tempo) || 60;
    sources.push({ label: result.example.title || 'Exemple', playbackId: id, events: result.example.events, chordLabels: result.example.title && first ? [{ at: first.time, name: result.example.title }] : [], key, writtenTempo: result.example.kind === 'playing' ? null : tempo, unitsPerSecond: tempo / 60 });
  }
  // Le rejeu de la prise porte le même nom que la prise : une seule partition, pas deux onglets jumeaux.
  const seen = new Set();
  return sources.filter((source) => { const twin = `${source.label}|${source.events.length}`; if (seen.has(twin)) return false; seen.add(twin); return true; });
}

/**
 * Le bloc « Partition » (replié), ou null s'il n'y a rien à écrire.
 * @param {object} result toolResult d'une réponse du Copilote
 * @param {{id?: string, originalId?: string, variantIds?: string[], notation?: string, formatChord?: Function}} options
 */
export function renderProposalScore(result, options = {}) {
  const sources = scoreSources(result, options).map((source) => ({ ...source, score: buildProposalScore({ events: source.events, chordLabels: source.chordLabels, key: source.key, writtenTempo: source.writtenTempo ?? null }) })).filter((s) => !s.score.empty);
  if (!sources.length) return null;
  const details = node('details', 'copilot-score');
  details.append(node('summary', '', 'Partition'));
  const body = node('div', 'copilot-score-body');
  const tabs = node('div', 'copilot-score-tabs');
  tabs.setAttribute('role', 'tablist');
  const sheet = node('div', 'copilot-score-sheet');
  const caption = node('p', 'copilot-score-caption');
  body.append(tabs, sheet, caption);
  details.append(body);
  const state = { sources, selected: Math.min(sources.length - 1, sources.findIndex((s) => s.label.startsWith('Proposition')) >= 0 ? sources.findIndex((s) => s.label.startsWith('Proposition')) : 0), drawing: null, drawnFor: -1 };
  views.set(details, state);

  const describe = (score) => `${score.limits.join(' ')} La lecture garde le rythme exact.`;
  async function draw() {
    const source = state.sources[state.selected];
    caption.textContent = describe(source.score);
    caption.classList.toggle('is-uncertain', !source.score.meter.certain);
    [...tabs.children].forEach((button, index) => { button.setAttribute('aria-selected', String(index === state.selected)); button.classList.toggle('is-active', index === state.selected); });
    details.dataset.playbackId = source.playbackId || '';
    try {
      const { drawProposalScore } = await import('./proposal-score-render.js');
      state.drawing = drawProposalScore(sheet, source.score, { formatChord: options.formatChord });
      state.drawnFor = state.selected;
    } catch (err) {
      console.warn('[Copilot] Partition non affichée :', err);
      sheet.replaceChildren(node('p', 'copilot-score-caption', 'La partition n’a pas pu être affichée. La lecture et la grille restent disponibles.'));
      state.drawing = null;
    }
  }
  state.sources.forEach((source, index) => {
    const button = node('button', 'copilot-score-tab', source.label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => { state.selected = index; draw(); });
    tabs.append(button);
  });
  if (state.sources.length < 2) tabs.hidden = true;
  details.addEventListener('toggle', () => {
    if (options.id) (details.open ? openScores.add(options.id) : openScores.delete(options.id));
    if (details.open && state.drawnFor !== state.selected) draw();
  });
  if (options.id && openScores.has(options.id)) { details.open = true; queueMicrotask(draw); }
  return details;
}

/** Suit la lecture : la note en cours est mise en valeur, d'après le temps réel du lecteur. */
export function refreshProposalScores(root, playingId, progress) {
  if (!root) return;
  for (const details of root.querySelectorAll('.copilot-score')) {
    const state = views.get(details);
    if (!state?.drawing) continue;
    const source = state.sources[state.selected];
    const playing = Boolean(playingId) && source.playbackId === playingId && Number.isFinite(progress?.position);
    // La position du lecteur est dans le même repère que les évènements (secondes de la prise).
    const position = playing ? scorePositionAt(source.score, progress.position * (source.unitsPerSecond || 1)) : null;
    state.drawing.highlight(position ? position.unit : null);
  }
}

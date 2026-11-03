import { takeEnvelope, takeExample } from './take-attachment.js';

const time = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const dispatch = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

export function createTakePlayer(take, { id, title = 'Ton jeu', onDelete, onRedo } = {}) {
  const example = takeExample(take, title);
  if (!example) return document.createElement('span');
  const card = document.createElement('div');
  card.className = 'copilot-take-player';
  card.dataset.takePlayer = id;
  card.dataset.duration = example.beats;
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'copilot-take-play';
  play.setAttribute('aria-label', `Écouter : ${title}`);
  play.setAttribute('aria-pressed', 'false');
  play.textContent = '▶';
  play.addEventListener('click', () => {
    if (card.dataset.playing === 'true') {
      dispatch('copilot-example-control', { id, action: card.dataset.paused === 'true' ? 'resume' : 'pause' });
    } else dispatch('copilot-play-example', { id, example, pedal: true, rate: 1 });
  });
  const body = document.createElement('div');
  body.className = 'copilot-take-body';
  const label = document.createElement('strong');
  label.textContent = title;
  const wave = document.createElement('div');
  wave.className = 'copilot-take-wave';
  wave.setAttribute('role', 'img');
  wave.setAttribute('aria-label', 'Aperçu de ton jeu MIDI et de ses silences');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 384 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  takeEnvelope(take).forEach((value, i) => {
    const bar = document.createElementNS(ns, 'rect');
    const height = Math.max(2, value * 36);
    for (const [key, val] of Object.entries({ x: i * 4, y: (40 - height) / 2, width: 2, height, rx: 1 })) bar.setAttribute(key, val);
    svg.appendChild(bar);
  });
  wave.append(svg);
  const cursor = document.createElement('i');
  cursor.className = 'copilot-take-cursor';
  wave.append(cursor);
  const duration = document.createElement('span');
  duration.className = 'copilot-take-time';
  duration.textContent = time(example.beats);
  body.append(label, wave);
  card.append(play, body, duration);
  for (const [text, action] of [['Recommencer', onRedo], ['Supprimer', onDelete]]) {
    if (!action) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copilot-take-action';
    button.title = text;
    button.setAttribute('aria-label', text);
    button.innerHTML = text === 'Recommencer'
      ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7"/></svg>'
      : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
    button.addEventListener('click', action);
    card.append(button);
  }
  return card;
}

/** Le marqueur reçoit la position réelle du lecteur à chaque image ; les libellés restent moins fréquents. */
export function refreshTakeCursor(root, id, position) {
  root?.querySelectorAll('[data-take-player]').forEach((card) => {
    if (card.dataset.takePlayer !== id) return;
    const duration = Number(card.dataset.duration);
    card.style.setProperty('--take-progress', `${duration ? Math.min(100, Math.max(0, position / duration * 100)) : 0}%`);
  });
}

export function refreshTakePlayers(root, id, progress, paused = false) {
  root?.querySelectorAll('[data-take-player]').forEach((card) => {
    const active = card.dataset.takePlayer === id;
    card.dataset.playing = String(active);
    card.dataset.paused = String(active && paused);
    const position = active && progress?.id === id ? progress.position : 0;
    const duration = Number(card.dataset.duration);
    card.style.setProperty('--take-progress', `${duration ? Math.min(100, position / duration * 100) : 0}%`);
    const button = card.querySelector('.copilot-take-play');
    button.textContent = active && !paused ? 'Ⅱ' : '▶';
    button.setAttribute('aria-pressed', String(active && !paused));
    const title = card.querySelector('strong').textContent;
    button.setAttribute('aria-label', `${active && !paused ? 'Mettre en pause' : 'Écouter'} : ${title}`);
    card.querySelector('.copilot-take-time').textContent = active ? `${time(position)} / ${time(duration)}` : time(duration);
  });
}

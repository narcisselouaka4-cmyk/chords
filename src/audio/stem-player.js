import { resumeAudio } from './simple-synth.js';

const tracks = new Map();

export function initStemPlayer(fileInput, container) {
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    await resumeAudio();
    container.innerHTML = '';
    tracks.clear();

    for (const file of files) {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.loop = true;

      const gainNode = createGainNode(audio);
      const trackName = guessTrackName(file.name);

      tracks.set(file.name, { audio, gainNode, pan: 0, muted: false, solo: false });

      const row = createTrackRow(file.name, trackName, audio, gainNode);
      container.appendChild(row);
    }

    // Start all tracks together
    for (const { audio } of tracks.values()) {
      audio.play().catch(() => {});
    }
  });
}

function createGainNode(audio) {
  const ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaElementSource(audio);
  const gain = ctx.createGain();
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(ctx.destination);
  return gain;
}

function guessTrackName(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('drum') || lower.includes('batterie')) return 'Batterie';
  if (lower.includes('bass') || lower.includes('basse')) return 'Basse';
  if (lower.includes('piano') || lower.includes('keys')) return 'Piano';
  if (lower.includes('vocal') || lower.includes('voix') || lower.includes('chant')) return 'Voix';
  if (lower.includes('melody') || lower.includes('mélodie')) return 'Mélodie';
  return filename.replace(/\.[^.]+$/, '');
}

function createTrackRow(fileName, trackName, audio, gainNode) {
  const row = document.createElement('div');
  row.className = 'stem-track';

  const label = document.createElement('label');
  label.textContent = trackName;

  const muteBtn = document.createElement('button');
  muteBtn.textContent = 'M';
  muteBtn.title = 'Mute';
  muteBtn.style.minWidth = '30px';

  const soloBtn = document.createElement('button');
  soloBtn.textContent = 'S';
  soloBtn.title = 'Solo';
  soloBtn.style.minWidth = '30px';

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.01';
  volume.value = '1';

  muteBtn.addEventListener('click', () => {
    const track = tracks.get(fileName);
    track.muted = !track.muted;
    muteBtn.style.background = track.muted ? '#bf3a2b' : '';
    applyTrackState();
  });

  soloBtn.addEventListener('click', () => {
    const track = tracks.get(fileName);
    track.solo = !track.solo;
    soloBtn.style.background = track.solo ? '#44ffaa' : '';
    applyTrackState();
  });

  volume.addEventListener('input', () => {
    const track = tracks.get(fileName);
    track.volume = Number(volume.value);
    applyTrackState();
  });

  row.appendChild(label);
  row.appendChild(muteBtn);
  row.appendChild(soloBtn);
  row.appendChild(volume);
  return row;
}

function applyTrackState() {
  const anySolo = Array.from(tracks.values()).some((t) => t.solo);

  for (const track of tracks.values()) {
    const { gainNode, muted, solo, volume = 1 } = track;
    let target = volume;
    if (muted) target = 0;
    else if (anySolo && !solo) target = 0;

    gainNode.gain.setTargetAtTime(target, gainNode.context.currentTime, 0.02);
  }
}

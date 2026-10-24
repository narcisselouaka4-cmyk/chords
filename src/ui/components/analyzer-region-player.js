import { globalAudioFocusManager } from '../../audio/audio-focus-manager.js';
import { REGION_MIN_SECONDS, REGION_MAX_SECONDS } from '../analyzer-workflow.js';

const format = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** Audio natif : navigation libre dans le morceau et écoute bornée de la sélection. */
export function createRegionPlayer(root, { duration, start, end, onChange }) {
  const controller = new AbortController();
  const query = (id) => root.querySelector(`#analyzer-region-${id}`);
  const status = query('player-status');
  const startInput = query('start');
  const endInput = query('end');
  const preview = query('preview');
  const markStart = query('mark-start');
  const markEnd = query('mark-end');
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.setAttribute('aria-label', 'Écouter le morceau pour choisir un passage');
  query('audio').replaceChildren(audio);
  let blobUrl = null;
  let excerptPlaying = false;
  const on = (target, event, callback) => target.addEventListener(event, callback, { signal: controller.signal });
  const sync = () => {
    startInput.value = format(start);
    endInput.value = format(end);
    startInput.removeAttribute('aria-invalid');
    endInput.removeAttribute('aria-invalid');
  };
  const enable = (ready) => {
    preview.disabled = markStart.disabled = markEnd.disabled = !ready;
  };
  const pause = () => { excerptPlaying = false; audio.pause(); };
  const change = (which, seconds) => {
    pause();
    // Le repère déplacé est prioritaire ; l'autre suit si la durée sort des limites.
    const min = Math.min(duration, REGION_MIN_SECONDS);
    if (which === 'start') {
      start = Math.max(0, Math.min(seconds, duration - min));
      end = Math.max(start + min, Math.min(end, start + REGION_MAX_SECONDS, duration));
    } else {
      end = Math.max(min, Math.min(seconds, duration));
      start = Math.min(end - min, Math.max(start, end - REGION_MAX_SECONDS, 0));
    }
    sync();
    status.textContent = 'Passage mis à jour.';
    onChange(start, end);
  };
  for (const [which, input] of [['start', startInput], ['end', endInput]]) {
    on(input, 'change', () => {
      const match = input.value.trim().match(/^(\d+):([0-5]\d)$/);
      if (!match) {
        input.setAttribute('aria-invalid', 'true');
        status.textContent = 'Saisissez un temps au format min:sec, par exemple 02:30.';
        input.value = format(which === 'start' ? start : end);
        return;
      }
      change(which, Number(match[1]) * 60 + Number(match[2]));
    });
  }
  on(markStart, 'click', () => change('start', Math.floor(audio.currentTime)));
  on(markEnd, 'click', () => change('end', Math.floor(audio.currentTime)));
  on(preview, 'click', async () => {
    audio.currentTime = start;
    excerptPlaying = true;
    try { await audio.play(); } catch { fail(); }
  });
  on(audio, 'timeupdate', () => {
    if (excerptPlaying && audio.currentTime >= end) {
      pause();
      audio.currentTime = end;
    }
  });
  on(audio, 'play', () => globalAudioFocusManager.requestFocus('analysis-region'));
  on(audio, 'pause', () => { excerptPlaying = false; });
  on(audio, 'ended', () => { excerptPlaying = false; });
  on(audio, 'loadedmetadata', () => {
    enable(true);
    status.textContent = 'Écoutez et utilisez « Définir à l’écoute » pour placer vos repères.';
  });
  const fail = () => {
    pause();
    enable(false);
    status.textContent = 'Écoute indisponible. Vous pouvez saisir les temps du passage ou analyser le morceau entier.';
  };
  on(audio, 'error', fail);
  globalAudioFocusManager.register('analysis-region', {
    play: () => audio.play().catch(fail), pause, isPlaying: () => !audio.paused,
  });
  sync();
  enable(false);
  return {
    load(url) { blobUrl = url; audio.src = url; },
    fail, pause,
    destroy() {
      pause();
      controller.abort();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      globalAudioFocusManager.unregister('analysis-region');
    },
  };
}

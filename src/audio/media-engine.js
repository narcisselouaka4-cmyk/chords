// [Claude] — 2026-07-08 — Service audio minimal partagé entre Studio et Analyse.
// Pour l'instant, ce service encapsule l'import d'un fichier media et la lecture audio simple.
// Il est conçu pour évoluer vers un moteur complet commun aux deux onglets.

const SUPPORTED_FORMATS = ['mp3', 'wav', 'mp4', 'm4a', 'ogg', 'flac', 'aac', 'webm'];

export function isSupportedMediaFile(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  return SUPPORTED_FORMATS.includes(ext);
}

export async function selectMediaFile() {
  if (!window.electronAPI?.studio?.selectFile) {
    throw new Error('Sélection de fichier non disponible');
  }
  return window.electronAPI.studio.selectFile();
}

/**
 * Crée un lecteur audio simple dans un conteneur DOM.
 * Retourne un objet { element, play, pause, seek, getCurrentTime, getDuration, destroy }.
 */
export function createAudioPlayer(container, wavPath, { onTimeUpdate, onEnded } = {}) {
  if (!container) {
    throw new Error('Conteneur de lecteur manquant');
  }

  const audio = document.createElement('audio');
  audio.controls = true;
  audio.src = wavPath;
  audio.style.width = '100%';
  container.innerHTML = '';
  container.appendChild(audio);

  let rafId = null;

  function notifyTime() {
    onTimeUpdate?.(audio.currentTime, audio.duration);
  }

  function startLoop() {
    stopLoop();
    function loop() {
      notifyTime();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  audio.addEventListener('play', startLoop);
  audio.addEventListener('pause', stopLoop);
  audio.addEventListener('ended', () => {
    stopLoop();
    onEnded?.();
  });

  return {
    element: audio,
    play() {
      audio.play().catch((err) => console.warn('[media-engine] play failed:', err));
    },
    pause() {
      audio.pause();
    },
    seek(time) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
    },
    getCurrentTime() {
      return audio.currentTime;
    },
    getDuration() {
      return audio.duration || 0;
    },
    destroy() {
      stopLoop();
      audio.pause();
      audio.src = '';
      try { audio.remove(); } catch (_) {}
    },
  };
}

export { SUPPORTED_FORMATS };

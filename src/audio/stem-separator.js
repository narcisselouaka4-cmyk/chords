const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];

function getElectronAPI() {
  return window.electronAPI;
}

export async function separateStems(trackId, originalPath, onProgress) {
  const api = getElectronAPI();
  if (!api?.studio?.separate) {
    throw new Error('Studio IPC non disponible');
  }
  if (onProgress && api.studio.onSeparationProgress) {
    const cleanup = api.studio.onSeparationProgress((event) => {
      if (event.trackId === trackId) onProgress(event.percent, event.fallback);
    });
    try {
      return await api.studio.separate(trackId, originalPath);
    } finally {
      cleanup?.();
    }
  }
  return await api.studio.separate(trackId, originalPath);
}

export async function isSeparated(trackId) {
  const api = getElectronAPI();
  if (!api?.studio?.isSeparated) return false;
  return await api.studio.isSeparated(trackId);
}

export async function getStems(trackId) {
  const api = getElectronAPI();
  if (!api?.studio?.getStems) return {};
  return await api.studio.getStems(trackId);
}

export { STEMS };

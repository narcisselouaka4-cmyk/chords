// [Claude] — 2026-08-08 — AudioFocusManager : arbitrage de sortie audio entre
// workspaces indépendants. Ce module ne fusionne PAS les transports : chaque
// lecteur conserve son propre currentTime, sa position et sa lecture. Il
// garantit simplement qu’un seul workspace à la fois produit du son.

/**
 * Crée un gestionnaire d’audio focus.
 *
 * @returns {{
 *   register: (id: string, callbacks: { play: () => void, pause: () => void, isPlaying: () => boolean }) => void,
 *   unregister: (id: string) => void,
 *   requestFocus: (id: string) => boolean,
 *   getCurrentFocus: () => string | null,
 *   isRegistered: (id: string) => boolean,
 * }}
 */
export function createAudioFocusManager() {
  /** @type {Map<string, { play: () => void, pause: () => void, isPlaying: () => boolean }>} */
  const workspaces = new Map();
  let currentFocus = null;

  function register(id, callbacks) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('AudioFocusManager.register() attend un id string');
    }
    if (
      !callbacks
      || typeof callbacks.play !== 'function'
      || typeof callbacks.pause !== 'function'
      || typeof callbacks.isPlaying !== 'function'
    ) {
      throw new TypeError('AudioFocusManager.register() attend { play, pause, isPlaying }');
    }
    workspaces.set(id, callbacks);
  }

  function unregister(id) {
    workspaces.delete(id);
    if (currentFocus === id) {
      currentFocus = null;
    }
  }

  /**
   * Demande l’audio focus pour un workspace.
   * Si un autre workspace est en train de jouer, il est mis en pause.
   * Le currentTime et les positions ne sont JAMAIS synchronisés.
   *
   * @param {string} id
   * @returns {boolean} true si l’id est enregistré et a obtenu le focus
   */
  function requestFocus(id) {
    const ws = workspaces.get(id);
    if (!ws) return false;

    for (const [otherId, otherWs] of workspaces.entries()) {
      if (otherId === id) continue;
      if (otherWs.isPlaying()) {
        otherWs.pause();
      }
    }

    currentFocus = id;
    return true;
  }

  function getCurrentFocus() {
    return currentFocus;
  }

  function isRegistered(id) {
    return workspaces.has(id);
  }

  return {
    register,
    unregister,
    requestFocus,
    getCurrentFocus,
    isRegistered,
  };
}

/**
 * Instance globale partagée par l’application.
 * Studio et Analyse s’enregistrent tous les deux au démarrage.
 */
export const globalAudioFocusManager = createAudioFocusManager();

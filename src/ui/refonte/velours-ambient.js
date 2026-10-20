// [Codex] — 2026-10-20 — Phase 2 de Velours.
// Pilote uniquement la profondeur du décor : aucune donnée musicale ni aucun
// composant interactif ne dépend de ce module.

function activeSurface() {
  const activeTab = document.querySelector('#tab-nav .tab-btn.active')?.dataset.tab;
  if (activeTab === 'analysis' || activeTab === 'studio') return activeTab;
  if (activeTab === 'practice') {
    const view = document.getElementById('practice-tab')?.dataset.trainingView;
    return !view || view === 'realtime' ? 'realtime' : 'none';
  }
  return 'none';
}

export function initVeloursAmbient() {
  const root = document.documentElement;
  const ambient = document.getElementById('velours-ambient');
  if (!ambient) return;

  const refreshSurface = () => {
    root.dataset.veloursSurface = activeSurface();
  };

  // Electron désactive actuellement l'accélération graphique pour éviter des
  // crashes Linux. Velours reste donc volontairement statique : aucun suivi
  // du pointeur et aucune boucle requestAnimationFrame ne doivent concurrencer
  // le rendu du clavier MIDI.
  const refreshAfterNavigation = () => requestAnimationFrame(refreshSurface);
  document.addEventListener('app-switch-tab', refreshAfterNavigation);
  document.addEventListener('app-switch-training-view', refreshAfterNavigation);
  document.getElementById('tab-nav')?.addEventListener('click', refreshAfterNavigation);
  window.addEventListener('app-skin-changed', refreshSurface);

  refreshSurface();

  return () => {
    document.removeEventListener('app-switch-tab', refreshAfterNavigation);
    document.removeEventListener('app-switch-training-view', refreshAfterNavigation);
    document.getElementById('tab-nav')?.removeEventListener('click', refreshAfterNavigation);
    window.removeEventListener('app-skin-changed', refreshSurface);
  };
}

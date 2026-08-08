const TAB_NAMES = ['practice', 'analysis', 'studio'];

// La navigation ne choisit pas le moteur de mise en page d'un onglet.
// L'onglet actif retrouve son display CSS naturel ; seuls les autres sont masqués.
export function applyTabVisibility(tabs, activeTab) {
  if (!TAB_NAMES.includes(activeTab)) {
    throw new Error(`Unknown tab: ${activeTab}`);
  }

  for (const tabName of TAB_NAMES) {
    const element = tabs[tabName];
    if (!element) continue;
    if (tabName === activeTab) {
      element.style.removeProperty('display');
    } else {
      element.style.display = 'none';
    }
  }

  return activeTab;
}

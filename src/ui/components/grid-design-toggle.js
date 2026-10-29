const STORAGE_KEY = 'pjc.analysis.grid-design';

/** Préférence visuelle commune aux morceaux, indépendante du calage et du lecteur. */
export function initGridDesignToggle(button, host, storage) {
  let design = 'classic';
  try {
    storage ??= globalThis.localStorage;
    if (storage?.getItem(STORAGE_KEY) === 'capsules') design = 'capsules';
  } catch (_) { /* Le bouton reste utilisable si le stockage est indisponible. */ }

  const apply = () => {
    host.dataset.gridDesign = design;
    button.textContent = `Design : ${design === 'classic' ? 'Cases' : 'Capsules'}`;
    button.title = `Afficher le design ${design === 'classic' ? 'Capsules' : 'Cases'}`;
  };
  apply();
  button.addEventListener('click', () => {
    design = design === 'classic' ? 'capsules' : 'classic';
    apply();
    try { storage?.setItem(STORAGE_KEY, design); } catch (_) { /* Préférence de séance. */ }
  });
}

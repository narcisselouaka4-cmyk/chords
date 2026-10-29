// Variante de comparaison mise de côté le 29/10/2026 : non importée par Analyse.
// Le rendu Cases est fixé dans index.html ; conserver ce module pour un éventuel retour.
const STORAGE_KEY = 'pjc.analysis.grid-design';

/** Préférence visuelle commune aux morceaux, indépendante du calage et du lecteur. */
export function initGridDesignToggle(button, host, storage) {
  let design = 'classic';
  try {
    storage ??= globalThis.localStorage;
    if (storage?.getItem(STORAGE_KEY) === 'capsules') design = 'capsules';
  } catch (_) { /* Le bouton reste utilisable si le stockage est indisponible. */ }

  const apply = () => {
    const currentRow = host.querySelector('.mg-row.is-current');
    const previousTop = currentRow?.getBoundingClientRect().top;
    host.dataset.gridDesign = design;
    // Les cases sont plus compactes : garder la ligne lue au même endroit à l'écran.
    if (currentRow) host.scrollTop += currentRow.getBoundingClientRect().top - previousTop;
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

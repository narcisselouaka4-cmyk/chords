// [Claude] — 2026-10-13 — Recherche dans les bibliothèques (Narcisse : « une barre de recherche dans
// chaque bibliothèque pour que l'on puisse trouver ce qu'on cherche »).
//
// Les listes (morceaux du Studio et de l'Analyse, répertoire du Coach, conversations du Copilote)
// sont redessinées de l'extérieur, à chaque changement : plutôt que de réécrire chaque rendu, la
// barre FILTRE ce qui est affiché. Un observateur ré-applique le filtre dès que la liste est
// redessinée. Les listes qui ont déjà leur propre recherche (Sessions MIDI, Pédagogie IA,
// mouvements) ne passent pas par ici.
//
// Partie pure : `matchesQuery` (sans accents, sans casse, tous les mots doivent s'y trouver).

/** Texte comparable : sans accents ni casse, espaces réduits. */
export function normalizeSearchText(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Tous les mots de la recherche se trouvent-ils dans le texte ? Une recherche vide laisse tout passer. */
export function matchesQuery(text, query) {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearchText(text);
  return words.every((w) => haystack.includes(w));
}

const IGNORED = '.tr-empty, .detail-hint, .analyzer-library-empty, [data-search-empty]';

/**
 * Branche une barre de recherche sur une liste.
 * @param {{input: HTMLInputElement, list: HTMLElement}} elements
 * @returns {{apply: () => void, clear: () => void}|null}
 */
export function attachListSearch({ input, list }) {
  if (!input || !list) return null;
  let observer = null;

  const apply = () => {
    try {
      list.querySelector(':scope > [data-search-empty]')?.remove();
      const items = [...list.children].filter((c) => !c.matches(IGNORED));
      const query = input.value;
      let shown = 0;
      for (const item of items) {
        const ok = matchesQuery(item.textContent, query);
        item.hidden = !ok;
        item.style.display = ok ? '' : 'none'; // une règle CSS « display » l'emporterait sur [hidden]
        if (ok) shown += 1;
      }
      if (items.length && !shown && normalizeSearchText(query)) {
        const empty = document.createElement('p');
        empty.className = 'library-search-empty';
        empty.dataset.searchEmpty = '';
        empty.textContent = `Aucun résultat pour « ${query.trim()} ».`;
        list.appendChild(empty);
      }
    } finally {
      // Les mutations qu'on vient de faire ne doivent pas relancer le filtre (celles de l'application,
      // elles, arrivent après et le relancent).
      observer?.takeRecords();
    }
  };

  observer = new MutationObserver(() => apply());
  observer.observe(list, { childList: true });
  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; apply(); }
  });
  return { apply, clear: () => { input.value = ''; apply(); } };
}

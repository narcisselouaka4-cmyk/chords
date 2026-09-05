// [Cowork] — 2026-08-31 — Panneau de suggestions pour l'onglet Entraînement.
//
// Rôle V1 (décision du 31/08) : réactiver l'historique des accords (qui ne
// servait à rien : il listait sans exploiter) en lui donnant un vrai rôle —
// alimenter un panneau de suggestions sur 4 catégories définies par Narcisse :
//   1. quel mouvement utiliser avant d'aller au 6e degré,
//   2. quel voicing choisir pour les notes du dessus (top notes),
//   3. comment intégrer des mouvements internes,
//   4. ce que doit faire la basse.
//
// PÉRIMÈTRE VOLONTAIREMENT RESTREINT : le contenu harmonique précis (les règles
// jazz à appliquer) n'est PAS encore défini — il sera affiné dans une
// conversation dédiée, comme pour la spec Pédagogie IA. Cette V1 construit le
// branchement structurel (historique → panneau) avec un contenu simple par
// catégorie, dérivé uniquement de ce que l'historique sait déjà dire (dernier
// accord, notes hautes, basse). AUCUN moteur de règles jazz complet ici.
//
// ARCHITECTURE OUVERTE : le panneau consomme une liste d'entrées d'historique
// génériques ({ name, result, notes, timestamp }) sans coupler chord-history à
// un seul consommateur — la future Pédagogie IA (roadmap) pourra réutiliser le
// même historique en parallèle.

const MAX_SUGGESTION_ITEMS = 8;

// Placeholder par catégorie — remplacé par le moteur de règles quand il sera
// spécifié. Chaque entrée décrit ce que la catégorie suggérera une fois les
// règles définies, et ce que la V1 peut déjà montrer.
const CATEGORY_DEFS = [
  {
    id: 'approach-sixth',
    title: 'Avant le 6e degré',
  },
  {
    id: 'top-notes-voicing',
    title: 'Voicing des notes du dessus',
  },
  {
    id: 'inner-movements',
    title: 'Mouvements internes',
  },
  {
    id: 'bass-role',
    title: 'Rôle de la basse',
  },
];

function createSuggestionsPanel(history) {
  function build() {
    const entries = history?.getAll() ?? [];
    return CATEGORY_DEFS.map((cat) => {
      const body = buildCategoryBody(cat.id, entries);
      return `
        <div class="pedagogy-item">
          <strong>${cat.title}</strong>
          <div class="suggestion-body">${body}</div>
        </div>
      `;
    }).join('');
  }

  // Contenu V1 par catégorie : observation factuelle de l'historique récent.
  // Les règles harmoniques précises viendront remplacer ces corps de texte.
  function buildCategoryBody(categoryId, entries) {
    if (!entries.length) {
      return 'Jouez quelques accords pour alimenter les suggestions.';
    }
    const recent = entries.slice(0, MAX_SUGGESTION_ITEMS);
    switch (categoryId) {
      case 'approach-sixth': {
        const last = recent[0];
        return `Dernier accord joué : ${last.name}. Le mouvement vers le 6e degré sera suggéré ici (règles à venir).`;
      }
      case 'top-notes-voicing': {
        const top = recent
          .map((e) => ({ name: e.name, top: e.notes ? Math.max(...e.notes) : null }))
          .filter((e) => e.top !== null)
          .slice(0, 3);
        const tops = top.map((e) => `${e.name} (note haute : ${e.top})`).join(' · ');
        return `Notes hautes récentes : ${tops || '—'}. Le choix de voicing sera suggéré ici (règles à venir).`;
      }
      case 'inner-movements': {
        const count = recent.length;
        return `${count} accord${count > 1 ? 's' : ''} dans l'historique récent. Les mouvements internes (2e→1re, approches chromatiques) seront suggérés ici (règles à venir).`;
      }
      case 'bass-role': {
        const bass = recent
          .map((e) => (e.result && e.result.bassPc !== undefined) ? { name: e.name, bassPc: e.result.bassPc } : null)
          .filter(Boolean)
          .slice(0, 3);
        const basses = bass.map((b) => `${b.name} (basse ${b.bassPc})`).join(' · ');
        return `Basses récentes : ${basses || '—'}. Le rôle de la basse (tenue, walking, pédale) sera suggéré ici (règles à venir).`;
      }
      default:
        return 'Suggestions à venir.';
    }
  }

  return { build };
}

export { createSuggestionsPanel };
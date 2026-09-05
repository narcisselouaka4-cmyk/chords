// [Claude] — 2026-09-05 — Pédagogie IA : glossaire déterministe.
//
// Contenu pur, séparé du moteur — même principe que src/ui/onboarding-content.js :
// le contenu est ce qui vieillit le plus vite, il doit se relire seul, et il
// devient testable.
//
// DEUX RÈGLES QUI GOUVERNENT CE FICHIER.
//
// 1. Aucune IA n'intervient. La correspondance concept → fiche est une table,
//    pas une génération. C'est ce qui permet à la partie « pourquoi ça marche »
//    de fonctionner sur une source SANS narration parlée — un extrait de réseau
//    social, par exemple — où il n'y a rien à transcrire. Le jour où une couche
//    IA facultative viendra reformuler ces fiches, elle suivra le patron de
//    src/ai/ai-client.js (clé personnelle, repli déterministe) : elle enrichira
//    la formulation, jamais la mesure.
//
// 2. On n'invente aucun contenu musical. Les fiches ci-dessous couvrent
//    UNIQUEMENT ce que le fichier de référence contient réellement et ce que la
//    vérité terrain documente. Un concept rencontré sans fiche n'est pas
//    expliqué au jugé : il est remonté comme dette de contenu (voir
//    `collectMissing`), visible dans le rapport, à écrire par une personne.

export const GLOSSARY_VERSION = 1;

/**
 * Fiches disponibles.
 *
 * Chaque fiche note sa `source` : ce qui autorise sa présence ici. « définition »
 * = énoncé de solfège élémentaire, directement instancié par le fichier de
 * référence ; « vérité terrain » = repris de tests/corpus/gt/*.json.
 */
export const GLOSSARY = [
  {
    id: 'accord-parfait-majeur',
    title: 'Accord parfait majeur',
    short: 'Fondamentale, tierce majeure, quinte juste.',
    body: 'Trois notes : la fondamentale, la note située quatre demi-tons au-dessus '
      + '(tierce majeure) et celle située sept demi-tons au-dessus (quinte juste). '
      + 'C\'est l\'accord de ré, de la et de mi de ce tutoriel.',
    source: 'définition',
  },
  {
    id: 'accord-parfait-mineur',
    title: 'Accord parfait mineur',
    short: 'Fondamentale, tierce mineure, quinte juste.',
    body: 'Même construction que l\'accord majeur, mais la tierce est abaissée d\'un '
      + 'demi-ton (trois demi-tons au-dessus de la fondamentale). Dans ce tutoriel, '
      + 'fa dièse mineur est le seul accord mineur de la grille.',
    source: 'vérité terrain',
  },
  {
    id: 'quinte-a-vide',
    title: 'Quinte à vide (accord sans tierce)',
    short: 'Fondamentale et quinte seules : ni majeur ni mineur.',
    body: 'Quand seules la fondamentale et la quinte sont jouées, l\'accord n\'a pas '
      + 'de tierce et ne dit donc ni majeur ni mineur. C\'est fréquent à la main '
      + 'gauche : la tierce est laissée à la mélodie ou simplement sous-entendue. '
      + 'L\'application l\'affiche tel quel plutôt que de compléter une tierce '
      + 'qu\'elle n\'a pas vue.',
    source: 'définition',
  },
  {
    id: 'degres-diatoniques',
    title: 'Degrés d\'une tonalité',
    short: 'Numéroter les accords par leur place dans la gamme.',
    body: 'On numérote les accords d\'après le degré de la gamme sur lequel ils sont '
      + 'construits : I sur la tonique, IV sur la sous-dominante, V sur la dominante. '
      + 'Les chiffres romains en majuscules désignent les accords majeurs, en '
      + 'minuscules les mineurs (vi). Cette écriture permet de reconnaître la même '
      + 'progression dans n\'importe quelle tonalité.',
    source: 'définition',
  },
  {
    id: 'progression-diatonique',
    title: 'Progression diatonique',
    short: 'Tous les accords appartiennent à la même tonalité.',
    body: 'Une progression est diatonique quand tous ses accords se construisent sur '
      + 'les notes de la gamme, sans emprunt ni altération. Le tutoriel de référence '
      + 'est entièrement diatonique en la majeur : IV-I-V-vi à l\'intro, V-IV-I au '
      + 'refrain.',
    source: 'vérité terrain',
  },
];

/**
 * Règles de reconnaissance : à partir de ce que le pipeline a réellement lu,
 * quels concepts sont en jeu. Déterministe et vérifiable, sans IA.
 *
 * Chaque règle dit sur quelle OBSERVATION elle s'appuie, pour que le rapport
 * puisse citer la raison de la présence d'une fiche.
 */
export const CONCEPT_RULES = [
  {
    concept: 'accord-parfait-majeur',
    test: (seg) => seg.chord?.resolved && seg.chord.symbol === '' && !seg.chord.thirdMissing,
    because: 'un accord parfait majeur a été lu',
  },
  {
    concept: 'accord-parfait-mineur',
    test: (seg) => seg.chord?.resolved && /^m(?!aj)/.test(seg.chord.symbol || ''),
    because: 'un accord parfait mineur a été lu',
  },
  {
    concept: 'quinte-a-vide',
    test: (seg) => Boolean(seg.chord?.thirdMissing),
    because: 'un accord sans tierce a été lu',
  },
];

/**
 * Récupère une fiche par identifiant.
 * @param {string} id
 * @returns {object|null}
 */
export function getEntry(id) {
  return GLOSSARY.find((e) => e.id === id) || null;
}

/**
 * Déduit les concepts en jeu dans une grille lue.
 *
 * @param {object[]} segments - segments étiquetés (chord-labeling.js)
 * @param {object} [context]
 * @param {string} [context.key] - tonalité, si elle est connue
 * @returns {{ id: string, entry: object|null, because: string, occurrences: number }[]}
 */
export function collectConcepts(segments, context = {}) {
  const hits = new Map();
  for (const seg of segments || []) {
    for (const rule of CONCEPT_RULES) {
      let matched = false;
      try { matched = Boolean(rule.test(seg)); } catch (_) { matched = false; }
      if (!matched) continue;
      const prev = hits.get(rule.concept);
      if (prev) prev.occurrences++;
      else hits.set(rule.concept, { id: rule.concept, because: rule.because, occurrences: 1 });
    }
  }

  // La tonalité, quand elle est connue, met en jeu la lecture par degrés.
  if (context.key) {
    hits.set('degres-diatoniques', {
      id: 'degres-diatoniques',
      because: `la tonalité (${context.key}) permet de numéroter les accords`,
      occurrences: 1,
    });
  }

  return [...hits.values()].map((h) => ({ ...h, entry: getEntry(h.id) }));
}

/**
 * Concepts repérés SANS fiche disponible.
 *
 * C'est la dette de contenu : elle est remontée telle quelle au lieu d'être
 * comblée par une explication improvisée. Un vide visuel assumé vaut mieux
 * qu'un texte inventé.
 *
 * @param {{id: string, entry: object|null}[]} concepts
 * @returns {string[]}
 */
export function collectMissing(concepts) {
  return (concepts || []).filter((c) => !c.entry).map((c) => c.id);
}

/**
 * État du panneau glossaire quand la source ne comporte aucune narration
 * parlée — cas explicitement dans le périmètre (extraits de réseaux sociaux).
 *
 * @returns {{ available: false, message: string }}
 */
export function noNarrationState() {
  return {
    available: false,
    message: 'Cette source ne comporte pas de commentaire parlé : il n\'y a rien à citer. '
      + 'Les explications ci-dessous viennent du glossaire de l\'application, pas de la vidéo.',
  };
}

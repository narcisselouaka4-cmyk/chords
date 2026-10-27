// Jumeau JS de la version du moteur d'analyse (electron/audio-processor.py).
// Les deux doivent évoluer ensemble : dès que le moteur change sa sortie
// (accords, tonalités locales, modulations…), il réécrit sa version ici en
// miroir.
//
// [Claude] — 2026-10-27 — Il y a maintenant DEUX moteurs. La grille vient de
// lv-chordia quand il est installé, et du moteur chroma + HMM en repli. Une
// analyse enregistrée par l'un ou par l'autre est donc légitime : on ne la
// recalcule plus de force, on signale seulement qu'une lecture plus récente
// existe, et le pianiste décide.
//
// Narcisse : « tant que l'utilisateur n'a pas cliqué sur le bouton relancer,
// il faut laisser le message là où il est […] il se peut que l'utilisateur ait
// juste le dos tourné et qu'il ne voie pas ce message, et quand il arrive sur
// l'analyse et qu'il voit qu'il y a des soucis, tout de suite il fait remonter
// un problème qui a déjà été réglé. »
//
// [Claude] — 2026-10-27 — CETTE CHAÎNE DOIT CHANGER À CHAQUE FOIS QUE LE
// MOTEUR CHANGE DE COMPORTEMENT, et pas seulement de bibliothèque. L'oubli
// s'est produit le jour même : l'égalisation du niveau a été ajoutée sans
// toucher la version, si bien qu'une analyse d'AVANT ce correctif passait pour
// à jour. Narcisse a rouvert son live, vu 1 min 17 de silence, et rien ne lui
// disait que c'était déjà réglé — exactement ce qu'il voulait éviter. Même
// discipline que READING_REVISION côté Pédagogie.

/** Version produite par le moteur actuel, la plus récente. */
export const ANALYSIS_ENGINE_VERSION = 'lv-chordia-1.1.0+niveau';

/** Versions connues, de la plus récente à la plus ancienne. */
export const KNOWN_ENGINE_VERSIONS = [
  'lv-chordia-1.1.0+niveau',
  'lv-chordia-1.1.0',
  'ADR-061-triades-6',
];

/** Un nom lisible par version, pour le bandeau d'avertissement. */
export const ENGINE_LABELS = {
  'lv-chordia-1.1.0+niveau': 'moteur actuel',
  'lv-chordia-1.1.0': 'moteur sans égalisation du niveau',
  'ADR-061-triades-6': 'ancien moteur (chroma)',
};

/**
 * Une analyse enregistrée avec cette version est-elle dépassée ?
 * Vrai seulement si une version PLUS RÉCENTE existe dans la liste connue.
 */
export function isEngineOutdated(engine) {
  if (!engine) return true;
  const rang = KNOWN_ENGINE_VERSIONS.indexOf(engine);
  return rang !== 0;   // inconnue, ou pas la plus récente
}

/** Nom lisible d'une version, pour l'affichage. */
export function engineLabel(engine) {
  return ENGINE_LABELS[engine] || 'moteur inconnu';
}

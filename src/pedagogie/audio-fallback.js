// [Claude] — 2026-09-06 — Pédagogie IA : normalisation du repli audio.
//
// Le repli audio réutilise `analyzer:process-file`, le moteur de l'onglet
// Analyse. Ce module traduit ce qu'il renvoie vers la forme attendue par
// `buildAudioOnlyAnalysis` et par `crossCheck` : { start, end, label }.
//
// POURQUOI UN MODULE À PART plutôt qu'une fonction privée du contrôleur.
// La panne corrigée ici était SILENCIEUSE. Le moteur nomme ses bornes
// `startTime` et `endTime` (electron/audio-processor.py, `chord_entry`) ; le
// contrôleur lisait `start` / `end` / `time`, obtenait `undefined` partout,
// repliait sur 0, puis filtrait sur `end > start` — et jetait ainsi la
// TOTALITÉ des accords. L'écran affichait une grille vide sans le moindre
// message d'erreur, et le recoupement image / son ne se déclenchait jamais.
// Une fonction pure exportée se teste ; une fonction privée de contrôleur DOM
// ne se teste pas. C'est la seule raison d'être de ce fichier.

/**
 * Première valeur numérique finie de la liste.
 *
 * On ne replie PAS sur 0 : une borne absente doit rester non finie pour que le
 * filtre l'écarte franchement, au lieu de fabriquer un segment de durée nulle
 * qui aurait l'air d'un vrai relevé.
 *
 * @param {...unknown} values
 * @returns {number} la première valeur finie, ou NaN
 */
function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * Traduit le résultat de `analyzer:process-file` en segments d'accords.
 *
 * Les noms alternatifs (`start`, `end`, `time`, `label`, `name`) sont conservés
 * en second rang : ils ne coûtent rien et couvrent les moteurs de test ou une
 * évolution du mapper de `src/analyzer/audio-analyzer.js`. Mais le nom qui fait
 * foi vient en premier, et c'est celui que le moteur produit réellement.
 *
 * @param {object} result - retour brut de l'IPC
 * @returns {{start: number, end: number, label: string}[]}
 */
export function normalizeAnalyzerChords(result) {
  const raw = result?.chords || result?.segments || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => ({
      start: firstFinite(c?.startTime, c?.start, c?.time),
      end: firstFinite(c?.endTime, c?.end),
      label: c?.chord ?? c?.label ?? c?.name ?? null,
    }))
    .filter((c) => c.label
      && Number.isFinite(c.start)
      && Number.isFinite(c.end)
      && c.end > c.start);
}

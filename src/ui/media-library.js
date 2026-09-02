import {
  listTracks,
  loadMetadata,
  getOriginalPath,
  readOriginalAsBlobUrl,
  getNextTrackId,
  createTrackDir,
  saveOriginal,
  saveMetadata,
  deleteTrack,
  renameTrack,
  findExistingTrack,
  registerInIndex,
  findTrackByName,
} from '../recorder/studio-storage.js';

export {
  listTracks,
  loadMetadata,
  getOriginalPath,
  readOriginalAsBlobUrl,
  deleteTrack,
  renameTrack,
};

/**
 * Importe un fichier dans la bibliothèque persistante avec dédoublonnage.
 *
 * - Même fichier (même chemin + taille + mtime) → retrouve l'entrée existante,
 *   conserve toutes ses modifications, ne crée PAS de doublon.
 * - Même nom mais fichier différent → ajoute un suffixe "(2)", "(3)" etc.
 *   pour éviter deux lignes visuellement identiques.
 * - Nouveau fichier → crée une nouvelle entrée normalement.
 *
 * @param {string} filePath - chemin absolu du fichier source
 * @returns {{ id: string, metadata: object, originalPath: string, isReimport: boolean }}
 */
export async function importToLibrary(filePath) {
  const files = window.electronAPI?.files;
  if (!files) throw new Error('Système de fichiers non disponible');

  // 0. Le fichier est-il DÉJÀ un original de la bibliothèque ?
  //
  // Analyser un morceau choisi dans la bibliothèque passe par le chemin de son
  // original (…/Studio/Track_004/original.m4a). Sans cette garde, la fin de
  // l'analyse le réimportait : nouvelle entrée « original.m4a », nouvelle copie
  // du fichier sur le disque (18 Mo dans le cas observé), et un doublon dans la
  // liste. L'identité par (chemin, taille, mtime) ne le rattrapait pas, puisque
  // le chemin d'origine était celui du fichier importé, pas celui de la copie.
  const asLibraryOriginal = filePath.match(/\/(Track_\d+)\/original\.[^/]+$/);
  if (asLibraryOriginal) {
    const trackId = asLibraryOriginal[1];
    const metadata = await loadMetadata(trackId).catch(() => null);
    if (metadata) {
      return { id: trackId, metadata, originalPath: filePath, isReimport: true };
    }
  }

  // 1. Vérifier si ce fichier exact a déjà été importé (identité stable).
  const existing = await findExistingTrack(filePath);
  if (existing) {
    // Même fichier : réutiliser l'entrée existante, conserver toutes les modifs.
    return { id: existing.trackId, metadata: existing.metadata, originalPath: filePath, isReimport: true };
  }

  // 2. Nouveau fichier : créer une entrée.
  const trackId = await getNextTrackId();
  await createTrackDir(trackId);

  const bytes = await files.readBinary(filePath);
  const originalPath = await saveOriginal(trackId, filePath, bytes);

  let name = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  const ext = filePath.split('.').pop()?.toLowerCase() || 'mp3';

  // 3. Dédoublonnage par nom : si un autre fichier porte déjà ce nom, suffixer.
  const conflictId = await findTrackByName(name);
  if (conflictId) {
    // Trouver un suffixe disponible : "nom (2)", "nom (3)", etc.
    let suffix = 2;
    let candidate;
    do {
      const baseName = name.replace(/\.[^.]+$/, '');
      candidate = `${baseName} (${suffix}).${ext}`;
      suffix++;
    } while (await findTrackByName(candidate));
    name = candidate;
  }

  const metadata = {
    name,
    sourcePath: filePath,
    originalPath,
    sourceType: 'import',
    duration: 0,
    importedAt: new Date().toISOString(),
    format: ext,
  };
  await saveMetadata(trackId, metadata);

  // 4. Enregistrer dans l'index pour les futures recherches.
  await registerInIndex(trackId, filePath);

  return { id: trackId, metadata, originalPath, isReimport: false };
}

// [Claude] — 2026-09-06 — Pédagogie IA : bibliothèque de tutoriels indépendante.
//
// Pédagogie IA a sa PROPRE bibliothèque, sans lien avec le magasin Studio
// (~/PianoJazzChords/Studio/Track_XXX). Un tutoriel EST un fichier .mp4 à son
// emplacement réel sur le disque : pas de copie au moment de lister, pas de
// Track_ID, pas de metadata.json. La conséquence directe du retour d'usage du
// 06/09 : l'ancien écran listait aussi des .mp3 du magasin partagé, qui ne sont
// pas des tutoriels vidéo.
//
// DEUX RESPONSABILITÉS :
//   1. `listTutorialFiles` — lire un dossier réel (via window.electronAPI.files)
//      et ne retenir que les fichiers .mp4, insensible à la casse.
//   2. `copyTutorialIntoFolder` — copier un .mp4 choisi dans le dossier
//      configuré, avec un nom de fichier libre si le nom est déjà pris.
//
// Le dossier configuré est un réglage persisté par l'appelant (localStorage),
// pas par ce module : il ne connaît ni stockage ni préférences, juste des
// chemins. studio-storage.js et media-library.js ne sont PAS touchés.

const MP4_EXTENSION = '.mp4';

function getElectronFiles() {
  return window.electronAPI?.files;
}

/** Un nom se termine-t-il par .mp4, quelle que soit la casse ? */
export function isMp4Name(name) {
  return typeof name === 'string' && name.toLowerCase().endsWith(MP4_EXTENSION);
}

/**
 * Nom affichable d'un tutoriel : le nom de fichier, sans l'extension.
 * @param {string} fileName
 * @returns {string}
 */
export function tutorialDisplayName(fileName) {
  return isMp4Name(fileName) ? fileName.slice(0, -MP4_EXTENSION.length) : fileName;
}

/**
 * Liste les tutoriels .mp4 d'un dossier réel.
 *
 * Un dossier absent ou illisible donne une liste VIDE avec un statut distinct :
 * l'écran doit pouvoir dire « ce dossier n'existe pas (ou plus) » plutôt que
 * « aucun tutoriel », qui laisserait croire à un constat sur le contenu.
 *
 * @param {string} folderPath - chemin absolu du dossier à lire
 * @returns {Promise<{ok: boolean, reason: string|null, files: {name: string, path: string}[]}>}
 *          reason vaut 'no-folder' quand aucun dossier n'est configuré,
 *          'missing' quand le dossier configuré n'existe pas sur le disque.
 */
export async function listTutorialFiles(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return { ok: false, reason: 'no-folder', files: [] };
  }

  const files = getElectronFiles();
  if (!files?.readDir) {
    // Environnement sans IPC (test navigateur, preload ancien) : on ne
    // prétend pas que le dossier est vide, on dit qu'on n'a pas pu le lire.
    return { ok: false, reason: 'unreadable', files: [] };
  }

  let entries;
  try {
    entries = await files.readDir(folderPath);
  } catch (err) {
    console.warn('[Tutoriels] lecture du dossier échouée :', err);
    return { ok: false, reason: 'unreadable', files: [] };
  }

  // readDir renvoie [] sur ENOENT : un dossier configuré mais disparu doit se
  // dire comme tel, pas comme un dossier vide que l'on vient de peupler.
  if (!Array.isArray(entries) || entries.length === 0) {
    const exists = await files.exists(folderPath).catch(() => false);
    if (!exists) return { ok: false, reason: 'missing', files: [] };
  }

  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e?.isFile && isMp4Name(e.name))
    .map((e) => ({ name: e.name, path: `${folderPath.replace(/\/+$/, '')}/${e.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

  return { ok: true, reason: null, files: list };
}

/**
 * Copie un fichier .mp4 dans le dossier des tutoriels.
 *
 * Seuls les .mp4 sont acceptés : c'est la conséquence du cahier des charges de
 * cette bibliothèque, pas une répétition du filtre de la boîte de dialogue —
 * la boîte peut être contournée (glisser-déposer un jour), la copie, non.
 *
 * Si un fichier de même nom existe déjà, un suffixe « (2) », « (3) »… est
 * cherché plutôt que d'écraser quoi que ce soit.
 *
 * @param {string} sourcePath - chemin absolu du .mp4 choisi
 * @param {string} folderPath - dossier de destination (dû exister)
 * @returns {Promise<{ok: boolean, fileName: string|null, alreadyThere: boolean, error: string|null}>}
 *          alreadyThere vaut true quand le fichier source est DÉJÀ dans le
 *          dossier (même chemin) : il n'y a alors rien à copier, et le dire
 *          évite de fabriquer un doublon « nom (2).mp4 » du même fichier.
 */
export async function copyTutorialIntoFolder(sourcePath, folderPath) {
  if (!isMp4Name(sourcePath)) {
    return { ok: false, fileName: null, alreadyThere: false, error: 'Seuls les fichiers .mp4 peuvent être importés.' };
  }
  if (!folderPath) {
    return { ok: false, fileName: null, alreadyThere: false, error: 'Aucun dossier de tutoriels n\'est configuré.' };
  }

  const files = getElectronFiles();
  if (!files?.readBinary || !files?.writeBinary || !files?.exists) {
    return { ok: false, fileName: null, alreadyThere: false, error: 'Système de fichiers non disponible.' };
  }

  const folder = folderPath.replace(/\/+$/, '');
  const baseName = sourcePath.split('/').pop() || sourcePath;

  // Le fichier choisi est déjà DANS le dossier configuré : le réimporter
  // créerait un doublon de lui-même. On le dit, la liste est inchangée.
  if (sourcePath === `${folder}/${baseName}`) {
    return { ok: true, fileName: baseName, alreadyThere: true, error: null };
  }

  // Nom libre : ne jamais écraser un tutoriel existant.
  let targetName = baseName;
  let suffix = 2;
  while (await files.exists(`${folder}/${targetName}`).catch(() => false)) {
    const stem = baseName.slice(0, -MP4_EXTENSION.length);
    targetName = `${stem} (${suffix})${MP4_EXTENSION}`;
    suffix++;
  }

  try {
    const bytes = await files.readBinary(sourcePath);
    await files.writeBinary(`${folder}/${targetName}`, bytes);
  } catch (err) {
    return { ok: false, fileName: null, alreadyThere: false, error: `Copie impossible : ${err.message}` };
  }

  return { ok: true, fileName: targetName, alreadyThere: false, error: null };
}
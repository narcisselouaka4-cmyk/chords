const STUDIO_DIR_NAME = 'PianoJazzChords/Studio';
const MEDIA_INDEX_FILE = 'media_index.json';

function getElectronFiles() {
  return window.electronAPI?.files;
}

// ── Identité stable d'un média ──
// Combine le chemin normalisé, la taille et la date de modification.
// Permet de reconnaître qu'un fichier déjà importé est réimporté,
// sans calculer de hash coûteux sur des fichiers volumineux.

/**
 * Construit une clé d'identité pour un fichier média.
 * @param {string} sourcePath - chemin absolu du fichier source
 * @param {{ size: number, mtimeMs: number }} [stat] - résultats de fs.stat
 * @returns {string} clé unique
 */
export function buildMediaIdentity(sourcePath, stat) {
  const normalized = sourcePath.replace(/\\/g, '/');
  const size = stat?.size ?? 0;
  const mtime = stat?.mtimeMs ?? 0;
  return `${normalized}::${size}::${mtime}`;
}

/**
 * Récupère le stat d'un fichier via l'IPC Electron.
 */
export async function statFile(filePath) {
  const files = getElectronFiles();
  if (!files?.stat) return null;
  try {
    return await files.stat(filePath);
  } catch {
    return null;
  }
}

// ── Index des médias (media_index.json) ──
// Fichier JSON dans le répertoire Studio qui mappe identity_key → trackId.
// Évite de scanner tous les dossiers Track_XXX à chaque import.

async function loadMediaIndex() {
  const files = getElectronFiles();
  if (!files) return {};
  const studioDir = await ensureStudioDir();
  const indexPath = `${studioDir}/${MEDIA_INDEX_FILE}`;
  try {
    if (await files.exists(indexPath)) {
      const raw = await files.readFile(indexPath);
      return raw ? JSON.parse(raw) : {};
    }
  } catch (e) {
    console.warn('[media-index] load failed:', e);
  }
  return {};
}

async function saveMediaIndex(index) {
  const files = getElectronFiles();
  if (!files) return;
  const studioDir = await ensureStudioDir();
  const indexPath = `${studioDir}/${MEDIA_INDEX_FILE}`;
  await files.writeFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Recherche une piste existante par identité de média.
 * @returns {{ trackId: string, metadata: object } | null}
 */
export async function findExistingTrack(sourcePath) {
  const stat = await statFile(sourcePath);
  if (!stat) return null;
  const identity = buildMediaIdentity(sourcePath, stat);
  const index = await loadMediaIndex();
  const trackId = index[identity];
  if (!trackId) return null;
  // Vérifier que la piste existe toujours
  const metadata = await loadMetadata(trackId);
  if (!metadata) {
    // Entrée orpheline : nettoyer l'index
    delete index[identity];
    await saveMediaIndex(index);
    return null;
  }
  return { trackId, metadata };
}

/**
 * Enregistre une piste dans l'index des médias.
 */
export async function registerInIndex(trackId, sourcePath) {
  const stat = await statFile(sourcePath);
  if (!stat) return;
  const identity = buildMediaIdentity(sourcePath, stat);
  const index = await loadMediaIndex();
  index[identity] = trackId;
  await saveMediaIndex(index);
}

/**
 * Supprime une entrée de l'index des médias.
 */
export async function unregisterFromIndex(trackId) {
  const index = await loadMediaIndex();
  for (const [key, id] of Object.entries(index)) {
    if (id === trackId) {
      delete index[key];
    }
  }
  await saveMediaIndex(index);
}

/**
 * Vérifie si un nom est déjà utilisé par une autre piste (conflit de nom).
 * @returns {string|null} le trackId existant, ou null
 */
export async function findTrackByName(displayName, excludeTrackId = null) {
  const tracks = await listTracks();
  for (const track of tracks) {
    if (excludeTrackId && track.id === excludeTrackId) continue;
    try {
      const meta = await loadMetadata(track.id);
      if (meta?.name === displayName) return track.id;
    } catch {}
  }
  return null;
}

export async function ensureStudioDir() {
  const files = getElectronFiles();
  if (!files) return null;
  const homeDir = await files.homeDir();
  const dir = `${homeDir}/${STUDIO_DIR_NAME}`;
  await files.ensureDir(dir);
  return dir;
}

export async function createTrackDir(trackId) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const dir = `${studioDir}/${trackId}`;
  await files.ensureDir(dir);
  await files.ensureDir(`${dir}/stems`);
  return dir;
}

export async function listTracks() {
  const files = getElectronFiles();
  if (!files) return [];
  const studioDir = await ensureStudioDir();
  const entries = await files.readDir(studioDir);
  const tracks = [];
  for (const entry of entries) {
    if (entry.isDirectory && entry.name.startsWith('Track_')) {
      tracks.push({
        id: entry.name,
        path: `${studioDir}/${entry.name}`,
      });
    }
  }
  return tracks.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getNextTrackId() {
  const tracks = await listTracks();
  let max = 0;
  for (const track of tracks) {
    const match = track.id.match(/Track_(\d+)/);
    if (match) {
      const num = Number(match[1]);
      if (num > max) max = num;
    }
  }
  const next = String(max + 1).padStart(3, '0');
  return `Track_${next}`;
}

export async function saveOriginal(trackId, sourcePath, bytes) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const ext = sourcePath.split('.').pop() || 'mp3';
  const originalPath = `${studioDir}/${trackId}/original.${ext}`;
  await files.writeFile(originalPath, bytes);
  return originalPath;
}

export async function saveMetadata(trackId, metadata) {
  const files = getElectronFiles();
  if (!files) return false;
  const studioDir = await ensureStudioDir();
  await files.writeFile(`${studioDir}/${trackId}/metadata.json`, JSON.stringify(metadata, null, 2));
  return true;
}

export async function loadMetadata(trackId) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const json = await files.readFile(`${studioDir}/${trackId}/metadata.json`);
  return json ? JSON.parse(json) : null;
}

export async function originalFileExists(trackId, filename) {
  const files = getElectronFiles();
  if (!files) return false;
  const studioDir = await ensureStudioDir();
  const ext = filename.split('.').pop() || 'mp3';
  return await files.exists(`${studioDir}/${trackId}/original.${ext}`);
}

export async function getOriginalPath(trackId) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const entries = await files.readDir(`${studioDir}/${trackId}`);
  for (const entry of entries) {
    if (entry.isFile && entry.name.startsWith('original.')) {
      return `${studioDir}/${trackId}/${entry.name}`;
    }
  }
  return null;
}

export async function stemExists(trackId, stem) {
  const files = getElectronFiles();
  if (!files) return false;
  const studioDir = await ensureStudioDir();
  return await files.exists(`${studioDir}/${trackId}/stems/${stem}.wav`);
}

export async function getStemPath(trackId, stem) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const path = `${studioDir}/${trackId}/stems/${stem}.wav`;
  return (await files.exists(path)) ? path : null;
}

export async function writeStem(trackId, stem, bytes) {
  const files = getElectronFiles();
  if (!files) return false;
  const studioDir = await ensureStudioDir();
  await files.ensureDir(`${studioDir}/${trackId}/stems`);
  await files.writeFile(`${studioDir}/${trackId}/stems/${stem}.wav`, bytes);
  return true;
}

export async function listStems(trackId) {
  const stems = ['bass', 'drums', 'vocals', 'other', 'piano', 'guitar'];
  const result = {};
  for (const stem of stems) {
    result[stem] = await getStemPath(trackId, stem);
  }
  return result;
}

export async function readOriginalAsBlobUrl(trackId) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const entries = await files.readDir(`${studioDir}/${trackId}`);
  let originalPath = null;
  let ext = 'mp3';
  for (const entry of entries) {
    if (entry.isFile && entry.name.startsWith('original.')) {
      originalPath = `${studioDir}/${trackId}/${entry.name}`;
      ext = entry.name.split('.').pop();
      break;
    }
  }
  if (!originalPath) return null;
  const bytes = await files.readBinary(originalPath);
  const mime = ext === 'mp4'
    ? 'video/mp4'
    : ext === 'm4a'
      ? 'audio/mp4'
      : ext === 'wav'
        ? 'audio/wav'
        : ext === 'flac'
          ? 'audio/flac'
          : ext === 'ogg'
            ? 'audio/ogg'
            : 'audio/mpeg';
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

export async function readStemAsBlobUrl(trackId, stem) {
  const files = getElectronFiles();
  if (!files) return null;
  const studioDir = await ensureStudioDir();
  const path = `${studioDir}/${trackId}/stems/${stem}.wav`;
  if (!(await files.exists(path))) return null;
  const bytes = await files.readBinary(path);
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export async function readAllStemsAsBlobUrls(trackId) {
  const files = getElectronFiles();
  if (!files) return {};
  const studioDir = await ensureStudioDir();
  const stems = ['bass', 'drums', 'vocals', 'other', 'piano'];
  const result = {};
  for (const stem of stems) {
    const path = `${studioDir}/${trackId}/stems/${stem}.wav`;
    if (await files.exists(path)) {
      const bytes = await files.readBinary(path);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      result[stem] = URL.createObjectURL(blob);
    }
  }
  return result;
}

export async function deleteTrack(trackId) {
  const files = getElectronFiles();
  if (!files) throw new Error('File system IPC unavailable');
  const studioDir = await ensureStudioDir();
  const dirPath = `${studioDir}/${trackId}`;
  if (await files.exists(dirPath)) {
    await files.deleteDir(dirPath);
  }
  // Nettoyer l'index des médias
  await unregisterFromIndex(trackId);
  return true;
}

export async function renameTrack(trackId, newName) {
  const files = getElectronFiles();
  if (!files) throw new Error('File system IPC unavailable');
  const metadata = await loadMetadata(trackId);
  if (!metadata) throw new Error('Métadonnées introuvables');
  metadata.name = newName;
  await saveMetadata(trackId, metadata);
  return true;
}

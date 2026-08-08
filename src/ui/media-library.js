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
} from '../recorder/studio-storage.js';

export {
  listTracks,
  loadMetadata,
  getOriginalPath,
  readOriginalAsBlobUrl,
  deleteTrack,
};

export async function importToLibrary(filePath) {
  const files = window.electronAPI?.files;
  if (!files) throw new Error('Système de fichiers non disponible');

  const trackId = await getNextTrackId();
  await createTrackDir(trackId);

  const bytes = await files.readBinary(filePath);
  const originalPath = await saveOriginal(trackId, filePath, bytes);

  const name = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  const ext = filePath.split('.').pop()?.toLowerCase() || 'mp3';
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

  return { id: trackId, metadata, originalPath };
}

const SESSIONS_DIR_NAME = 'PianoJazzChords/Sessions';

// [OpenCode] — 2026-07-04 — Couche de stockage des sessions.
// En Electron natif, on écrit via le processus principal dans le home utilisateur.

function getElectronFiles() {
  return window.electronAPI?.files;
}

export async function ensureSessionsDir() {
  const files = getElectronFiles();
  if (!files) return null;
  const homeDir = await files.homeDir();
  const sessionsDir = `${homeDir}/${SESSIONS_DIR_NAME}`;
  await files.ensureDir(sessionsDir);
  return sessionsDir;
}

export async function listSessionDirs() {
  const files = getElectronFiles();
  if (!files) return [];
  const sessionsDir = await ensureSessionsDir();
  const entries = await files.readDir(sessionsDir);
  const dirs = [];
  for (const entry of entries) {
    if (entry.isDirectory && entry.name.startsWith('Session_')) {
      dirs.push({
        id: entry.name,
        path: `${sessionsDir}/${entry.name}`,
      });
    }
  }
  return dirs.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getNextSessionId() {
  const dirs = await listSessionDirs();
  let max = 0;
  for (const dir of dirs) {
    const match = dir.id.match(/Session_(\d+)/);
    if (match) {
      const num = Number(match[1]);
      if (num > max) max = num;
    }
  }
  const next = String(max + 1).padStart(3, '0');
  return `Session_${next}`;
}

export async function createSessionDir(sessionId) {
  const files = getElectronFiles();
  if (!files) {
    console.error('[Storage] No electron files API available');
    return null;
  }
  const sessionsDir = await ensureSessionsDir();
  if (!sessionsDir) {
    console.error('[Storage] Could not ensure sessions directory');
    return null;
  }
  const dir = `${sessionsDir}/${sessionId}`;
  await files.ensureDir(dir);
  await files.ensureDir(`${dir}/analysis`);
  return dir;
}

export async function writeSessionFile(sessionId, filename, content) {
  const files = getElectronFiles();
  if (!files) return false;
  const sessionsDir = await ensureSessionsDir();
  const path = `${sessionsDir}/${sessionId}/${filename}`;
  await files.writeFile(path, content);
  return true;
}

export async function readSessionFile(sessionId, filename) {
  const files = getElectronFiles();
  if (!files) return null;
  const sessionsDir = await ensureSessionsDir();
  const path = `${sessionsDir}/${sessionId}/${filename}`;
  return await files.readFile(path);
}

export async function deleteSessionDir(sessionId) {
  const files = getElectronFiles();
  if (!files) return false;
  const sessionsDir = await ensureSessionsDir();
  const dir = `${sessionsDir}/${sessionId}`;
  await files.deleteDir(dir);
  return true;
}

export async function sessionExists(sessionId) {
  const files = getElectronFiles();
  if (!files) return false;
  const sessionsDir = await ensureSessionsDir();
  return await files.exists(`${sessionsDir}/${sessionId}`);
}

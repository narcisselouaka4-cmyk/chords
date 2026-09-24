import {
  ensureSessionsDir,
  getNextSessionId,
  createSessionDir,
  writeSessionFile,
  readSessionFile,
  listSessionDirs,
  deleteSessionDir,
} from './storage.js';
import { serializeEventsJson, parseEventsJson, buildMidiFile } from './serializer.js';

// [OpenCode] — 2026-07-04 — Gestionnaire central des sessions d'enregistrement.

const APP_VERSION = '0.1.0';

export async function createSession(metadata) {
  const sessionId = await getNextSessionId();
  const dir = await createSessionDir(sessionId);
  if (!dir) {
    console.error('[SessionManager] createSessionDir returned null for', sessionId);
    throw new Error('Unable to create session directory');
  }

  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    name: metadata.name || sessionId,
    date: now,
    duration: 0,
    key: metadata.key || '',
    // null : tempo inconnu (prise du Studio), affiché « — BPM » plutôt qu'inventé.
    tempo: metadata.tempo === null ? null : metadata.tempo || 120,
    comments: metadata.comments || '',
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    sourceType: metadata.sourceType || 'midi',
    noteCount: 0,
    chordCount: 0,
    appVersion: APP_VERSION,
  };

  const fileMetadata = {
    name: session.name,
    key: session.key,
    tempo: session.tempo,
    comments: session.comments,
    tags: session.tags,
    createdAt: now,
  };

  await Promise.all([
    writeSessionFile(sessionId, 'session.json', JSON.stringify(session, null, 2)),
    writeSessionFile(sessionId, 'metadata.json', JSON.stringify(fileMetadata, null, 2)),
    writeSessionFile(sessionId, 'events.json', '[]'),
    writeSessionFile(sessionId, 'markers.json', '[]'),
    writeSessionFile(sessionId, 'analysis/.gitkeep', ''),
  ]);

  return session;
}

export async function saveSessionEvents(sessionId, events, stats) {
  const json = serializeEventsJson(events);

  const midi = buildMidiFile(events);
  const midiBlob = new Blob([midi], { type: 'audio/midi' });
  const midiBuffer = await midiBlob.arrayBuffer();
  const midiBytes = new Uint8Array(midiBuffer);

  await Promise.all([
    writeSessionFile(sessionId, 'events.json', json),
    writeSessionFile(sessionId, 'events.mid', midiBytes),
  ]);

  if (stats) {
    const sessionJson = await readSessionFile(sessionId, 'session.json');
    const session = JSON.parse(sessionJson);
    session.duration = stats.duration || 0;
    session.noteCount = stats.noteCount || 0;
    session.chordCount = stats.chordCount || 0;
    await writeSessionFile(sessionId, 'session.json', JSON.stringify(session, null, 2));
  }
}

export async function loadSession(sessionId) {
  const [sessionJson, eventsJson, metadataJson] = await Promise.all([
    readSessionFile(sessionId, 'session.json'),
    readSessionFile(sessionId, 'events.json'),
    readSessionFile(sessionId, 'metadata.json').catch(() => '{}'),
  ]);

  return {
    session: JSON.parse(sessionJson),
    events: eventsJson ? parseEventsJson(eventsJson) : [],
    metadata: JSON.parse(metadataJson),
  };
}

const PREVIEW_BUCKETS = 40;

// [Astra round 6] — Aperçu MIDI de la bibliothèque : densité de jeu normalisée,
// calculée à partir des vraies notes enregistrées. Les événements sont déjà lus
// par loadSession() lors du listage, donc l'aperçu ne coûte aucune I/O
// supplémentaire. Il n'est pas persisté : il est recalculé à chaque listage.
export function buildEventsPreview(events, duration) {
  const notes = (events || []).filter((e) => e.type === 'note_on' && (e.velocity ?? 0) > 0);
  if (notes.length === 0) return [];

  const span = Number(duration) > 0
    ? Number(duration)
    : Math.max(...notes.map((e) => Number(e.time) || 0)) || 1;

  const buckets = new Array(PREVIEW_BUCKETS).fill(0);
  for (const note of notes) {
    const ratio = (Number(note.time) || 0) / span;
    const index = Math.min(PREVIEW_BUCKETS - 1, Math.max(0, Math.floor(ratio * PREVIEW_BUCKETS)));
    buckets[index] += (Number(note.velocity) || 0) / 127;
  }

  const peak = Math.max(...buckets);
  return peak > 0 ? buckets.map((v) => v / peak) : buckets;
}

export async function listSessions() {
  const dirs = await listSessionDirs();
  const sessions = [];
  for (const dir of dirs) {
    try {
      const data = await loadSession(dir.id);
      sessions.push({
        ...data.session,
        preview: buildEventsPreview(data.events, data.session.duration),
      });
    } catch (err) {
      console.warn('Failed to load session', dir.id, err);
    }
  }
  return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function deleteSession(sessionId) {
  return await deleteSessionDir(sessionId);
}

export async function renameSession(sessionId, newName) {
  const [sessionJson, metadataJson] = await Promise.all([
    readSessionFile(sessionId, 'session.json'),
    readSessionFile(sessionId, 'metadata.json').catch(() => '{}'),
  ]);

  const session = JSON.parse(sessionJson);
  session.name = newName;
  await writeSessionFile(sessionId, 'session.json', JSON.stringify(session, null, 2));

  const metadata = JSON.parse(metadataJson);
  metadata.name = newName;
  metadata.updatedAt = new Date().toISOString();
  await writeSessionFile(sessionId, 'metadata.json', JSON.stringify(metadata, null, 2));
}

export async function updateSessionMetadata(sessionId, metadata) {
  const [sessionJson, metadataJson] = await Promise.all([
    readSessionFile(sessionId, 'session.json'),
    readSessionFile(sessionId, 'metadata.json').catch(() => '{}'),
  ]);

  const session = JSON.parse(sessionJson);
  session.key = metadata.key ?? session.key;
  session.tempo = metadata.tempo ?? session.tempo;
  session.comments = metadata.comments ?? session.comments;
  session.tags = metadata.tags ?? session.tags;

  const fileMetadata = {
    ...JSON.parse(metadataJson),
    name: session.name,
    key: session.key,
    tempo: session.tempo,
    comments: session.comments,
    tags: session.tags,
    updatedAt: new Date().toISOString(),
  };

  await Promise.all([
    writeSessionFile(sessionId, 'session.json', JSON.stringify(session, null, 2)),
    writeSessionFile(sessionId, 'metadata.json', JSON.stringify(fileMetadata, null, 2)),
  ]);
}

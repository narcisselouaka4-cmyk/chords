// [Claude] — 2026-10-03 — Pédagogie IA, lot 5 : la mémoire des tutoriels.
//
// Narcisse a choisi « Analyse gardée en mémoire » et « Accueil en vignettes ». Le relevé
// d'un tuto (accords, notes du prof, parole, tonalité) est gardé dans un fichier à côté
// des données de l'application : rouvrir un tuto déjà lu est instantané, sans refaire
// la lecture des images ni l'écoute du son. Une petite fiche par tuto (vignette, durée,
// date du relevé) nourrit l'accueil en cartes.
//
//   ~/PianoJazzChords/Pedagogie/memoire/index.json   fiches de l'accueil, par chemin
//   ~/PianoJazzChords/Pedagogie/memoire/<clé>.json   relevé complet d'un tuto
//
// La conversation du Copilote sur un tuto est déjà gardée par le Copilote lui-même
// (copilot-history.js, reprise par resumeOrStartConversation) : rien à faire ici.
//
// Un relevé n'est rendu que s'il est encore celui du fichier (même taille, même date de
// modification) : un tuto remplacé sur le disque est relu.
//
// Les accès au disque passent par l'API `files` d'Electron (preload), injectée : le
// module se teste sans Electron (test-tutorial-memory.js). Refaire le relevé d'un tuto
// réécrit simplement son fichier.

export const MEMORY_VERSION = 1;

// [Claude] — 2026-10-09 — Révision de la LECTURE du clavier dessiné. Narcisse a refait son test du
// lick de « Gospel Piano Harmony Secrets » (0:20–0:22) : « Copilot ne joue que 4 ou 5 des 19 à 26
// notes ». Un tuto déjà lu revient de la mémoire sans relire la vidéo : son relevé à 8 images/s,
// fait avant la relecture fine des passages rapides, revenait tel quel. Un relevé lu à l'image
// d'une révision plus ancienne est donc relu (une fois) ; les relevés au son, inchangés, restent.
//   1 : 8 images/s
//   2 : + relecture à 30 images/s des passages rapides (fine-reading.js)
//   3 : [Claude] — 2026-10-14 — clavier sous les mains du prof, touches allumées seulement à la
//       frappe (flash-notes.js), noire voisine qui déborde. Un tuto relevé AU SON faute de clavier
//       reconnu est aussi relu une fois : son clavier peut l'être maintenant (« Next Level Worship »).
//   4 : [Claude] — 2026-10-16 — noires allumées en rouge (saturation franche ≠ peau), et surtout
//       clavier TEINTÉ : la couleur du clavier au repos est apprise par image, au lieu de supposer
//       qu'elle est grise. Sans cette révision, un relevé déjà gardé garderait sa lecture fausse —
//       « Passing chords… Drop 2 » restait à 52 touches allumées, et le Copilote continuait de dire
//       qu'aucune note n'avait été lue. Voir bugs/open/pedagogie-clavier-teinte-tout-lu-comme-allume.
//   5 : [Claude] — 2026-10-16 — Relevés de la révision 4 à jeter. Narcisse : « le Copilote fait très
//       clairement n'importe quoi » en rejouant « Amazing Grace ». Mesuré : le relevé gardé de cette
//       vidéo (relu le 16/10 à 12:22) ne contient que 127 notes, dont 90 en octave 2, là où celui du
//       4 octobre en avait 603, en octaves 3 et 4. Or le code actuel, rejoué hors Electron exactement
//       comme l'application le lance (8 i/s + relecture fine à 30 i/s, mêmes modules), rend 603 notes
//       en octaves 3 et 4 : la lecture est bonne, c'est le relevé ENREGISTRÉ qui est abîmé. Cette
//       révision le fait relire. Si une vidéo revient encore abîmée, la cause est dans ce que seul
//       Electron fait (sondes de géométrie, fenêtres de relecture) : la chercher là, pas dans la
//       couleur des touches (vérifiée identique à l'ancienne lecture, 575 touches lues sur 176 images).
//   6 : [Claude] — 2026-10-28 — La cause de la révision 5 était bien dans les SONDES de géométrie.
//       « Amazing Grace » montre deux claviers de même étendue (le clavier dessiné qui s'allume, en
//       haut ; le vrai piano sous les mains, en bas). Depuis le 14/10, le vrai piano est aussi reconnu
//       (stratégie « bande ») : 5 sondes sur 24 le voyaient, et l'une d'elles, avec une noire de plus,
//       l'emportait. Plus rien ne s'allumait : 97 notes rejouées de 0:03 à 2:55 au lieu de 562.
//       format-detector.js fait voter d'abord sur l'EMPLACEMENT du clavier ; les relevés lus avec
//       l'ancienne règle sont relus.
export const READING_REVISION = 6;
/** Révision à partir de laquelle un relevé au son (clavier non reconnu) n'est plus relu. */
const AUDIO_RECHECK_REVISION = 3;

/** Lu à l'image (clavier dessiné), ou au son faute de clavier, avec une lecture plus ancienne. */
export function staleImageReading(analysis) {
  if (!analysis) return false;
  const drawn = analysis.source === 'video' || /clavier dessiné/.test(String(analysis.notesSource || ''));
  const revision = Number(analysis.readingRevision) || 1;
  if (drawn) return revision < READING_REVISION;
  return analysis.source === 'audio' && revision < AUDIO_RECHECK_REVISION;
}

/** Clé courte et stable d'un chemin de tuto : FNV-1a 32 bits, en hexadécimal. */
export function memoryKey(path) {
  let hash = 0x811c9dc5;
  for (const ch of String(path || '')) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Dossier de la mémoire, sous le dossier personnel. */
export function memoryDir(home) {
  return `${String(home || '').replace(/\/+$/, '')}/PianoJazzChords/Pedagogie/memoire`;
}

const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/**
 * Le relevé à garder : ce que l'écran recalculerait à la lecture.
 * @param {{path: string, stat?: {size: number, mtimeMs: number}|null, analysis: object,
 *   comparison?: object|null, narration?: object[], key?: string|null,
 *   notesUnavailable?: string|null, status?: {message: string, details?: string}|null}} entry
 * @param {Date} [now]
 */
export function packAnalysis({ path, stat = null, analysis, comparison = null, narration = [], key = null, notesUnavailable = null, status = null }, now = new Date()) {
  return {
    version: MEMORY_VERSION,
    path,
    size: Number.isFinite(stat?.size) ? stat.size : null,
    mtimeMs: Number.isFinite(stat?.mtimeMs) ? stat.mtimeMs : null,
    savedAt: now.toISOString(),
    analysis: clone(analysis),
    comparison: clone(comparison),
    narration: clone(narration) || [],
    key,
    notesUnavailable,
    status: clone(status),
  };
}

/**
 * Le relevé gardé, s'il est encore celui de ce fichier ; null sinon (autre version de
 * la mémoire, fichier remplacé, contenu illisible).
 * @param {object|null} saved
 * @param {{size: number, mtimeMs: number}|null} stat - état actuel du fichier
 */
export function unpackAnalysis(saved, stat = null) {
  if (!saved || typeof saved !== 'object' || saved.version !== MEMORY_VERSION) return null;
  if (!saved.analysis || !Array.isArray(saved.analysis.segments)) return null;
  if (staleImageReading(saved.analysis)) return null;
  if (stat && saved.size != null && (saved.size !== stat.size || Math.round(saved.mtimeMs) !== Math.round(stat.mtimeMs))) return null;
  return saved;
}

/**
 * Instant de la vignette : un peu après le début (les tutos s'ouvrent souvent sur un
 * titre ou un visage), 12 % de la durée, entre 1 s et 60 s, avant la fin.
 */
export function thumbnailTime(duration) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.round(Math.min(Math.max(1, d * 0.12), 60, Math.max(0, d - 0.5)) * 10) / 10;
}

/**
 * Arguments ffmpeg de la vignette (electron/main.js, « pedagogie:thumbnail ») : une
 * seule image JPEG sur la sortie standard, prise à `at` secondes, large de `width`, de
 * la vraie piste vidéo (jamais l'image de couverture d'une vidéo YouTube).
 */
export function thumbnailArgs(filePath, at, width = 360) {
  return ['-v', 'error', '-ss', String(at), '-i', filePath, '-map', '0:V:0', '-frames:v', '1',
    '-vf', `scale=${Math.round(width)}:-2`, '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
}

/** Durée « 12:05 » d'une fiche (ou ''). */
export function cardDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * La mémoire, sur le disque. `files` : l'API d'Electron (readFile, writeFile, ensureDir,
 * exists) ; `home` : le dossier personnel.
 */
export function createTutorialMemory(files, home) {
  const dir = memoryDir(home);
  const indexPath = `${dir}/index.json`;
  const analysisPath = (path) => `${dir}/${memoryKey(path)}.json`;
  let ready = null;
  let index = null;
  // Les écritures de l'index se suivent (lire, changer, écrire) : jamais deux à la fois.
  let queue = Promise.resolve();

  const ensure = () => {
    if (!ready) ready = Promise.resolve(files?.ensureDir?.(dir)).catch(() => null);
    return ready;
  };
  const readJson = async (path) => {
    try {
      if (files?.exists && !(await files.exists(path))) return null;
      const text = await files.readFile(path);
      return text ? JSON.parse(text) : null;
    } catch (_) {
      return null;
    }
  };

  /** Les fiches de l'accueil : { [chemin]: { duration, thumb, analyzedAt } }. */
  async function readIndex() {
    if (index) return index;
    const saved = await readJson(indexPath);
    index = saved && typeof saved === 'object' && saved.cards && typeof saved.cards === 'object' ? saved.cards : {};
    return index;
  }

  /** Complète la fiche d'un tuto (vignette, durée, date du relevé). */
  function updateCard(path, patch) {
    queue = queue.then(async () => {
      await ensure();
      const cards = await readIndex();
      cards[path] = { ...(cards[path] || {}), ...patch };
      await files.writeFile(indexPath, JSON.stringify({ version: MEMORY_VERSION, cards }));
      return cards[path];
    }).catch((err) => {
      console.warn('[Pedagogie] fiche non enregistrée :', err?.message || err);
      return null;
    });
    return queue;
  }

  /** Garde le relevé d'un tuto, et note sur sa fiche qu'il est lu. */
  async function saveAnalysis(entry) {
    await ensure();
    const packed = packAnalysis(entry);
    await files.writeFile(analysisPath(entry.path), JSON.stringify(packed));
    await updateCard(entry.path, { analyzedAt: packed.savedAt });
    return packed;
  }

  /** Le relevé gardé d'un tuto, s'il est encore celui du fichier. */
  async function loadAnalysis(path, stat = null) {
    return unpackAnalysis(await readJson(analysisPath(path)), stat);
  }

  /** Oublie un tuto : sa fiche et son relevé (la vidéo n'est pas touchée ici). */
  function forget(path) {
    queue = queue.then(async () => {
      await ensure();
      const cards = await readIndex();
      delete cards[path];
      await files.writeFile(indexPath, JSON.stringify({ version: MEMORY_VERSION, cards }));
      try { await files.deleteFile?.(analysisPath(path)); } catch (_) { /* pas de relevé gardé */ }
      return true;
    }).catch((err) => {
      console.warn('[Pedagogie] fiche non effacée :', err?.message || err);
      return false;
    });
    return queue;
  }

  return { dir, readIndex, updateCard, saveAnalysis, loadAnalysis, analysisPath, forget };
}

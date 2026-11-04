// [Claude] — 2026-11-04 — Boucle de batterie des démonstrations.
//
// Deuxième version. La première synthétisait les percussions (oscillateurs +
// bruit filtré) ; Narcisse : « les boucles de batterie sont catastrophiques […]
// prends plutôt des boucles qui existent déjà sur Internet ». Il avait raison :
// fabriquer un clave ou une conga à l'oreille quand on n'entend rien ne pouvait
// pas donner un résultat écoutable.
//
// On joue donc de vraies boucles enregistrées, en CC0, rangées dans
// `assets/drum-loops/` (provenance et licence : LICENCE.md du même dossier).
// Elles sont chargées comme les échantillons de piano — par l'IPC Electron,
// pas par fetch : la CSP de l'application bloque la lecture d'un fichier local.
//
// Chaque boucle fait exactement 8 temps (2 mesures à 4/4), vérifié fichier par
// fichier. Du coup la lecture n'a plus besoin de planificateur : un seul
// AudioBufferSourceNode en `loop = true` suffit, et c'est Web Audio qui tient
// la boucle au sample près — bien plus régulier que des minuteurs.

/** Toutes les boucles de la bibliothèque font 2 mesures à 4/4. */
export const LOOP_BEATS = 8;

/**
 * Fichiers disponibles : nom → tempo d'origine. Le tempo sert à calculer la
 * vitesse de lecture (`playbackRate`) pour caler la boucle sur la démo.
 */
export const DRUM_FILES = {
  'son-clave_104bpm': 104,
  'conga-tumbao_100bpm': 100,
  'shaker-16ths_100bpm': 100,
  'cajon-groove_96bpm': 96,
  'cowbell-groove_120bpm': 120,
  'bongo-martillo_112bpm': 112,
  'boom-bap_88bpm': 88,
  'one-drop_76bpm': 76,
  'shuffle_96bpm': 96,
  'rock-beat_90bpm': 90,
};

/**
 * Ce que chaque style entend. Une entrée = une ou plusieurs boucles
 * superposées, comme une vraie section de percussions (le clave et la conga se
 * jouent ensemble en salsa, ils ne s'excluent pas).
 *
 * `gain` équilibre les couches entre elles. `tempo` (facultatif) impose le
 * tempo de la démo pour ce genre, quand l'étude existante tombait trop loin de
 * toute boucle disponible : étirer un enregistrement de plus de ~25 % le rend
 * faux (la hauteur part avec la vitesse). Les deux cas sont signalés ci-dessous.
 *
 * TABLE À RETOUCHER EN PREMIER si le rendu ne plaît pas : tout le choix
 * esthétique est ici, et nulle part ailleurs. Je n'ai entendu aucune de ces
 * boucles — le choix vient du genre annoncé et du tempo, pas de l'oreille.
 */
export const DRUM_KITS = {
  // --- Latin -------------------------------------------------------------
  salsa: { layers: [['son-clave_104bpm', 0.8], ['conga-tumbao_100bpm', 0.9]] },
  guajira: { layers: [['son-clave_104bpm', 0.75], ['shaker-16ths_100bpm', 0.5]] },
  habanera: { layers: [['son-clave_104bpm', 0.8]] },
  // Danzón : l'étude était à 72, soit 0,69× la boucle de clave — trop lent,
  // les claves y perdaient leur claquement. 88 reste un danzón plausible.
  danzon: { tempo: 88, layers: [['son-clave_104bpm', 0.75], ['cajon-groove_96bpm', 0.6]] },
  // Merengue : l'étude était à 144, soit 1,2× à 1,29× les boucles disponibles.
  // 132 reste rapide et ramène l'étirement sous 1,2×.
  merengue: { tempo: 132, layers: [['cowbell-groove_120bpm', 0.7], ['bongo-martillo_112bpm', 0.8]] },
  // --- Styles de démo libres ---------------------------------------------
  gospel: { layers: [['boom-bap_88bpm', 0.8]] },
  ballade: { layers: [['one-drop_76bpm', 0.6]] },
  swing: { layers: [['shuffle_96bpm', 0.8]] },
  plaque: { layers: [['rock-beat_90bpm', 0.7]] },
};

/** Genres et styles qui partagent un même kit. */
const ALIASES = {
  montuno: 'salsa', 'latin-jazz': 'salsa', jazz: 'swing', worship: 'gospel',
};

/** Kit d'un genre d'étude (salsa, danzon…) ou d'un style de démo (gospel…). */
export function drumKitFor(name) {
  return DRUM_KITS[ALIASES[name] || name] || null;
}

/** Tempo imposé par le kit d'un genre, ou null si le tempo de l'étude convient. */
export function drumTempoFor(name) {
  return drumKitFor(name)?.tempo ?? null;
}

/**
 * Étirement d'une boucle pour atteindre `tempo`. Au-delà de ±25 %, le timbre
 * part trop : on le signale plutôt que de le cacher (voir les tests).
 */
export function stretchFor(file, tempo) {
  const natural = DRUM_FILES[file];
  return natural ? tempo / natural : 1;
}

/**
 * Lecteur de boucles.
 *
 * `getContext` rend l'AudioContext partagé ; `readFile(name)` doit rendre un
 * ArrayBuffer (l'IPC Electron), ou null si les fichiers sont hors de portée —
 * dans ce cas il n'y a simplement pas de batterie, jamais de synthèse de
 * remplacement : mieux vaut rien qu'un faux clave.
 */
export function createDrumLoop({ getContext, readFile, getOutput = null }) {
  const buffers = new Map();   // nom de fichier → AudioBuffer décodé
  let master = null;
  let sources = [];
  let current = null;          // { kitName, tempo, rate }
  let volume = 0.7;
  let loadToken = 0;

  function output() {
    const ctx = getContext();
    if (!master || master.context !== ctx) {
      master = ctx.createGain();
      const target = getOutput?.();
      master.connect(target && target.context === ctx ? target : ctx.destination);
    }
    master.gain.value = volume;
    return master;
  }

  /** Décode une boucle, une seule fois, et la garde. */
  async function load(file) {
    if (buffers.has(file)) return buffers.get(file);
    if (!readFile) return null;
    try {
      const bytes = await readFile(`${file}.mp3`);
      if (!bytes) return null;
      const array = bytes.buffer
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        : bytes;
      const buffer = await getContext().decodeAudioData(array);
      buffers.set(file, buffer);
      return buffer;
    } catch (e) {
      // Un fichier manquant ne casse pas la démo : elle joue sans batterie.
      buffers.set(file, null);
      return null;
    }
  }

  function stopSources() {
    for (const source of sources) {
      try { source.stop(); } catch (e) { /* déjà arrêtée */ }
      try { source.disconnect(); } catch (e) { /* déjà partie */ }
    }
    sources = [];
  }

  return {
    /**
     * Démarre la boucle d'un genre ou d'un style. `fromBeat` = position de la
     * démo, pour que la boucle reparte en phase après un saut ou une reprise.
     */
    async start({ kit = null, tempo = 100, rate = 1, fromBeat = 0 } = {}) {
      const found = typeof kit === 'string' ? drumKitFor(kit) : kit;
      stopSources();
      if (!found) { current = null; return false; }
      const token = ++loadToken;
      const ctx = getContext();
      // Un kit peut imposer son tempo (voir DRUM_KITS) ; sinon celui de la démo.
      const target = (found.tempo || tempo) * (rate || 1);
      const loaded = await Promise.all(found.layers.map(([file]) => load(file)));
      // Une autre démo a démarré pendant le décodage : on abandonne celle-ci.
      if (token !== loadToken) return false;
      const out = output();
      const startAt = ctx.currentTime + 0.03;
      let any = false;
      found.layers.forEach(([file, gain], i) => {
        const buffer = loaded[i];
        if (!buffer) return;
        const natural = DRUM_FILES[file] || 100;
        const playbackRate = target / natural;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = 0;
        // Durée exacte de 8 temps au tempo d'origine : on ne boucle pas sur la
        // longueur du fichier (l'encodage MP3 ajoute un silence au bout), mais
        // sur la durée musicale, sinon la boucle traîne à chaque tour.
        source.loopEnd = Math.min(buffer.duration, (LOOP_BEATS * 60) / natural);
        source.playbackRate.value = playbackRate;
        const g = ctx.createGain();
        g.gain.value = gain;
        source.connect(g).connect(out);
        // `offset` place la boucle là où en est la démo : la batterie ne
        // redémarre pas à zéro après une reprise ou un saut.
        const offset = (((fromBeat % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS) * (60 / natural);
        source.start(startAt, offset);
        sources.push(source);
        any = true;
      });
      current = any ? { kit: found, tempo: target, rate } : null;
      return any;
    },
    stop() {
      loadToken += 1;
      stopSources();
      current = null;
    },
    isRunning: () => sources.length > 0,
    /** Nuance de la batterie (0 = muette). */
    setVolume(value) {
      volume = Math.max(0, Math.min(1, Number(value) || 0));
      if (master) master.gain.value = volume;
    },
    volume: () => volume,
    /** Boucles déjà décodées (pour les tests et le diagnostic). */
    loaded: () => [...buffers.keys()].filter((k) => buffers.get(k)),
  };
}

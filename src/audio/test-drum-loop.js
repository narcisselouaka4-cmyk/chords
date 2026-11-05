// Contrat des boucles de batterie : chaque genre a son kit, l'étirement reste
// dans des limites audibles, et la boucle repart en phase avec la démo.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDrumLoop, drumKitFor, drumTempoFor, stretchFor, DRUM_KITS, DRUM_FILES, LOOP_BEATS,
  setDrumManifest, drumStyles, drumKitById,
  drumBeatsFor,
  naturalTempoOf,
} from './drum-loop.js';

let passed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[32m✓[0m' : '[31m✗[0m'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed += 1; else process.exitCode = 1;
};

// --- Les kits pointent tous sur des fichiers qui existent vraiment.
const missing = [];
for (const [name, kit] of Object.entries(DRUM_KITS)) {
  for (const [file] of kit.layers) if (!DRUM_FILES[file]) missing.push(`${name}:${file}`);
}
check('Chaque couche de kit désigne une boucle connue', missing.length === 0, missing.join(', '));

// --- Les genres latins des études trouvent tous un kit.
const genres = ['salsa', 'montuno', 'latin-jazz', 'guajira', 'habanera', 'danzon', 'merengue',
  'gospel', 'ballade', 'swing', 'plaque', 'jazz', 'worship'];
const sansKit = genres.filter((g) => !drumKitFor(g));
check('Tous les genres et styles joués ont un kit', sansKit.length === 0, sansKit.join(', '));
check('Un genre inconnu n\'invente pas de batterie', drumKitFor('polka') === null);

// --- L'étirement reste écoutable : au-delà d'un quart, le timbre part.
const tempos = {
  salsa: 96, montuno: 96, 'latin-jazz': 86, guajira: 92, habanera: 88,
  danzon: 88, merengue: 132, gospel: 76, ballade: 60, swing: 132, plaque: 72,
};
const trop = [];
for (const [genre, demoTempo] of Object.entries(tempos)) {
  const kit = drumKitFor(genre);
  const tempo = drumTempoFor(genre) || demoTempo;
  for (const [file] of kit.layers) {
    const rate = stretchFor(file, tempo);
    if (rate < 0.75 || rate > 1.4) trop.push(`${genre}/${file} ×${rate.toFixed(2)}`);
  }
}
check('Aucune boucle n\'est étirée hors de 0,75×–1,4×', trop.length === 0, trop.join(' ; '));

// --- Les deux genres recalés imposent bien leur tempo, les autres non.
check('Danzón et merengue imposent leur tempo', drumTempoFor('danzon') === 88 && drumTempoFor('merengue') === 132);
check('La salsa garde le tempo de l\'étude', drumTempoFor('salsa') === null);

// --- Lecture : AudioContext simulé, on observe ce qui est réellement démarré.
function fakeContext() {
  const started = [];
  let now = 0;
  const gain = () => ({ gain: { value: 1 }, connect(n) { return n; }, disconnect() {}, context: ctx });
  const ctx = {
    get currentTime() { return now; },
    advance(s) { now += s; },
    started,
    createGain: gain,
    createBufferSource: () => {
      const node = {
        buffer: null, loop: false, loopStart: 0, loopEnd: 0,
        playbackRate: { value: 1 }, context: ctx,
        connect(n) { return n; }, disconnect() {}, stop() { node.stopped = true; },
        start(when, offset) { started.push({ when, offset, node }); },
      };
      return node;
    },
    decodeAudioData: async () => ({ duration: 9.99, sampleRate: 44100 }),
  };
  return ctx;
}

const ctx = fakeContext();
const read = async (name) => new Uint8Array(8).fill(1) && { buffer: new ArrayBuffer(8), byteOffset: 0, byteLength: 8, name };
const loop = createDrumLoop({ getContext: () => ctx, readFile: read });

await loop.start({ kit: 'salsa', tempo: 96 });
check('Salsa superpose ses deux couches', ctx.started.length === 2, `${ctx.started.length} source(s)`);
const rates = ctx.started.map((s) => Number(s.node.playbackRate.value.toFixed(3)));
check('Clave et conga sont étirées chacune selon SON tempo d\'origine',
  rates[0] === Number((96 / 104).toFixed(3)) && rates[1] === Number((96 / 100).toFixed(3)), rates.join(' / '));
const ends = ctx.started.map((s) => Number(s.node.loopEnd.toFixed(3)));
check('La boucle se referme sur 8 temps musicaux, pas sur la fin du fichier',
  ends[0] === Number(((LOOP_BEATS * 60) / 104).toFixed(3)) && ends[1] === Number(((LOOP_BEATS * 60) / 100).toFixed(3)),
  ends.join(' / '));
check('Toutes les sources bouclent', ctx.started.every((s) => s.node.loop === true));

// --- Phase : une reprise au milieu ne fait pas repartir la boucle à zéro.
ctx.started.length = 0;
await loop.start({ kit: 'salsa', tempo: 96, fromBeat: 5 });
const offsets = ctx.started.map((s) => Number(s.offset.toFixed(3)));
check('Une reprise au 5e temps entre au 5e temps de la boucle',
  offsets[0] === Number((5 * (60 / 104)).toFixed(3)), offsets.join(' / '));

ctx.started.length = 0;
await loop.start({ kit: 'salsa', tempo: 96, fromBeat: 11 });
check('Au-delà de 8 temps, la position se replie dans la boucle',
  Number(ctx.started[0].offset.toFixed(3)) === Number((3 * (60 / 104)).toFixed(3)));

// --- Arrêt, et absence de batterie sans fichiers.
loop.stop();
check('stop() libère toutes les sources', loop.isRunning() === false);

const muet = createDrumLoop({ getContext: () => fakeContext(), readFile: async () => null });
check('Sans fichiers lisibles, aucune batterie n\'est jouée',
  (await muet.start({ kit: 'salsa', tempo: 96 })) === false && muet.isRunning() === false);

const sansIPC = createDrumLoop({ getContext: () => fakeContext(), readFile: null });
check('Hors Electron, la démo tourne simplement sans batterie',
  (await sansIPC.start({ kit: 'salsa', tempo: 96 })) === false);

// --- Les trois défauts du 04/11/2026, signalés par Narcisse (« je ne l'entends pas »).
check('Un silence est toujours expliqué', typeof sansIPC.lastError() === 'string' && sansIPC.lastError().length > 0,
  sansIPC.lastError());
check('Un kit inconnu dit pourquoi', (await sansIPC.start({ kit: 'polka' })) === false && /polka/.test(sansIPC.lastError()));

// Un échec ne doit PAS condamner la séance : dès que la lecture remarche, ça joue.
let marche = false;
const ctx2 = fakeContext();
const capricieux = createDrumLoop({
  getContext: () => ctx2,
  readFile: async () => {
    if (!marche) throw new Error('IPC pas encore prêt');
    return { buffer: new ArrayBuffer(8), byteOffset: 0, byteLength: 8 };
  },
});
check('Premier essai raté : pas de batterie, et la raison est gardée',
  (await capricieux.start({ kit: 'salsa', tempo: 96 })) === false && /pas encore prêt/.test(capricieux.lastError()));
marche = true;
check('Second essai : la batterie repart (l\'échec n\'est pas gardé pour la séance)',
  (await capricieux.start({ kit: 'salsa', tempo: 96 })) === true && capricieux.lastError() === null);

// La phase est relue APRÈS le décodage, pas avant.
const ctx3 = fakeContext();
const tardif = createDrumLoop({
  getContext: () => ctx3,
  readFile: async () => {
    await new Promise((r) => setTimeout(r, 5));
    return { buffer: new ArrayBuffer(8), byteOffset: 0, byteLength: 8 };
  },
});
let position = 0;
const demarrage = tardif.start({ kit: 'salsa', tempo: 96, getBeat: () => position });
position = 2;                       // la démo a avancé pendant le décodage
await demarrage;
const offsetTardif = Number(ctx3.started[0].offset.toFixed(3));
check('La position est relue après décodage, donc la batterie entre à l\'heure',
  offsetTardif === Number((2 * (60 / 104)).toFixed(3)), `offset ${offsetTardif}`);

// Préchauffage : après warm(), plus rien à décoder.
check('warm() décode le kit à l\'avance', (await tardif.warm('salsa')) === true && tardif.loaded().length === 2);

// Le JSON public est lu à l'exécution, jamais importé comme un module Vite.
const editable = JSON.parse(await readFile(new URL('../public/drum-loops/kits.json', import.meta.url), 'utf8'));
check('Le manifeste public s’installe après le démarrage du module', setDrumManifest(editable));
check('Les styles du métronome viennent du fichier éditable, avec leurs libellés',
  drumStyles().length === editable.styles.length
  && ['bossa', 'jazz', 'gospel', 'worship', 'rnb', 'funk'].every(id => drumStyles().some(s => s.id === id))
  && editable.styles.every(style => drumStyles().some(s => s.id === style.id && s.label === (style.label || style.id))));
check('Le kit choisi et la correspondance des démos utilisent le manifeste chargé',
  drumKitById('gospel').layers[0][0] === 'motown-beat_104bpm'
  && drumKitFor('gospel').layers[0][0] === 'boom-bap_88bpm');
check('Un manifeste illisible ne remplace pas les styles déjà chargés',
  !setDrumManifest(null) && drumStyles().length === editable.styles.length);

// Boucles personnelles longues : fin ET reprise respectent le cycle entier.
for (const [id, file, tempo, beats] of [
  ['salsa-montuno', 'drum-montuno_118bpm', 118, 16],
  ['salsa-latin', 'salsa-latin-drums_100bpm', 100, 32],
  ['salsa-coupe-4s', 'salsa-latin-drums_100bpm', 100, 20 / 3],
]) {
  // Fixtures indépendantes des choix personnels dans le manifeste éditable.
  const kit = { layers: [[file, 0.85]], tempo, beats };
  assert.equal(kit.layers.length, 1);
  assert.equal(kit.layers[0][0], file);
  await readFile(new URL(`../public/drum-loops/${file}.mp3`, import.meta.url));
  const longCtx = fakeContext();
  longCtx.decodeAudioData = async () => ({ duration: beats * 60 / tempo + 0.04 });
  const player = createDrumLoop({ getContext: () => longCtx, readFile: read });
  await player.start({ kit, fromBeat: beats - 1 });
  check(`${id} joue seul et boucle sur ${beats} temps`,
    longCtx.started.length === 1 && longCtx.started[0].node.loopEnd === beats * 60 / tempo
    && longCtx.started[0].node.playbackRate.value === 1);
  check(`${id} reprend dans la dernière mesure, sans se replier sur 8 temps`,
    longCtx.started[0].offset === (beats - 1) * (60 / tempo));
  await player.start({ kit, fromBeat: beats + 3 });
  check(`${id} replie la reprise après un cycle complet`,
    Math.abs(longCtx.started[1].offset - 3 * (60 / tempo)) < 1e-9);
  player.stop();
}
check('Une durée absente ou invalide conserve les 8 temps historiques',
  [undefined, 0, -4, NaN, Infinity, '16'].every(beats => drumBeatsFor({ beats }) === 8));
check('Une coupe de 4 secondes à 100 BPM accepte un nombre de temps fractionnaire',
  Math.abs(drumBeatsFor({ beats: 20 / 3 }) * 60 / 100 - 4) < 1e-9);

// Le WAV est lu directement et son cycle réel reste calé sur les 8 temps.
const wavCtx = fakeContext();
wavCtx.decodeAudioData = async () => ({ duration: 233184 / 44100 });
const requestedFiles = [];
const wavLoop = createDrumLoop({ getContext: () => wavCtx, readFile: async filename => {
  requestedFiles.push(filename);
  return readFile(new URL(`../public/drum-loops/${filename}`, import.meta.url));
} });
const wavKit = { layers: [['salsa-coro_90bpm.wav', 0.85]], beats: 8, fitToBeats: true };
check('Le tempo se lit aussi dans un nom WAV explicite', naturalTempoOf('salsa-coro_90bpm.wav') === 90);
for (const tempo of [90, 110]) {
  await wavLoop.start({ kit: wavKit, tempo, fromBeat: 11 });
  const started = wavCtx.started.at(-1);
  check(`WAV à ${tempo} BPM : tout le fichier boucle en exactement 8 temps`,
    started.node.loopEnd === 233184 / 44100
    && Math.abs(started.node.loopEnd / started.node.playbackRate.value - 8 * 60 / tempo) < 1e-9);
  check(`WAV à ${tempo} BPM : reprise au bon endroit du cycle ajusté`,
    Math.abs(started.offset - 3 * (233184 / 44100) / 8) < 1e-9);
}
check('Le WAV est chargé directement, sans suffixe MP3 ajouté et une seule fois',
  requestedFiles.length === 1 && requestedFiles[0] === 'salsa-coro_90bpm.wav');
wavLoop.stop();

console.log(`\n=== ${passed} vérifications de boucle de batterie ===`);

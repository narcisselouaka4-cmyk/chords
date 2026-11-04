// Contrat des boucles de batterie : chaque genre a son kit, l'étirement reste
// dans des limites audibles, et la boucle repart en phase avec la démo.
import assert from 'node:assert/strict';
import {
  createDrumLoop, drumKitFor, drumTempoFor, stretchFor, DRUM_KITS, DRUM_FILES, LOOP_BEATS,
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

console.log(`\n=== ${passed} vérifications de boucle de batterie ===`);

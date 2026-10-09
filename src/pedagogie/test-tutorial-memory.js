// [Claude] — 2026-10-03 — Pédagogie IA, lot 5 : la mémoire des tutoriels
// (tutorial-memory.js), avec un faux disque. Sans DOM ni Electron.
import { memoryKey, memoryDir, packAnalysis, unpackAnalysis, cardDuration, createTutorialMemory, MEMORY_VERSION, thumbnailTime, thumbnailArgs, READING_REVISION, staleImageReading } from './tutorial-memory.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

function fakeFiles() {
  const store = new Map();
  const dirs = new Set();
  const writes = [];
  return {
    store,
    writes,
    ensureDir: async (p) => { dirs.add(p); return true; },
    exists: async (p) => store.has(p) || dirs.has(p),
    readFile: async (p) => { if (!store.has(p)) throw new Error(`ENOENT ${p}`); return store.get(p); },
    writeFile: async (p, c) => { writes.push(p); store.set(p, c); return true; },
  };
}

const ANALYSIS = {
  source: 'audio',
  segments: [{ start: 0, end: 4, chord: { label: 'Dm9', resolved: true, noteNames: [] } }],
  stats: { segmentCount: 1 },
  noteEvents: [{ midi: 50, start: 0, end: 3.8, hand: 'lh' }],
  notesSource: 'son',
};
const PATH = '/home/test/tutos/Gospel chords — leçon.mp4';
const STAT = { size: 123456, mtimeMs: 1727900000123.4 };

console.log('Clés et fichiers');
check('clé courte, stable, différente d\'un chemin à l\'autre', memoryKey(PATH) === memoryKey(PATH) && /^[0-9a-f]{8}$/.test(memoryKey(PATH)) && memoryKey(PATH) !== memoryKey(`${PATH}x`));
check('dossier sous les données de l\'application', memoryDir('/home/test/') === '/home/test/PianoJazzChords/Pedagogie/memoire');
check('durée d\'une fiche', cardDuration(725) === '12:05' && cardDuration(3725) === '1:02:05' && cardDuration(0) === '' && cardDuration(NaN) === '');

console.log('La vignette');
check('un peu après le début : 12 % de la durée, entre 1 s et 60 s, avant la fin', thumbnailTime(600) === 60 && thumbnailTime(100) === 12
  && thumbnailTime(5) === 1 && thumbnailTime(1.2) === 0.7 && thumbnailTime(0) === 0 && thumbnailTime(NaN) === 0);
const args = thumbnailArgs('/t/a b.mp4', 12, 360);
check('ffmpeg : une image JPEG de la vraie piste vidéo, sur la sortie standard', args.join(' ') === '-v error -ss 12 -i /t/a b.mp4 -map 0:V:0 -frames:v 1 -vf scale=360:-2 -q:v 5 -f image2pipe -vcodec mjpeg -'
  && args.indexOf('-ss') < args.indexOf('-i'), args.join(' '));

console.log('Le relevé gardé');
const packed = packAnalysis({ path: PATH, stat: STAT, analysis: ANALYSIS, narration: [{ start: 1, text: 'Ici le Dm9.' }], key: 'C major', status: { message: 'Lu au son.' } }, new Date('2026-10-03T12:00:00Z'));
check('tout ce que l\'écran recalculerait', packed.version === MEMORY_VERSION && packed.analysis.noteEvents.length === 1 && packed.narration[0].text === 'Ici le Dm9.'
  && packed.key === 'C major' && packed.size === STAT.size && packed.savedAt === '2026-10-03T12:00:00.000Z');
check('une copie, pas l\'objet de l\'écran', packed.analysis !== ANALYSIS && packed.analysis.segments !== ANALYSIS.segments);
check('rendu s\'il est encore celui du fichier', unpackAnalysis(JSON.parse(JSON.stringify(packed)), STAT)?.analysis.segments[0].chord.label === 'Dm9');
check('fichier remplacé (autre taille ou autre date) : relu', unpackAnalysis(packed, { ...STAT, size: 1 }) === null && unpackAnalysis(packed, { ...STAT, mtimeMs: STAT.mtimeMs + 5000 }) === null);
// [Claude] — 2026-10-09 — Un clavier dessiné lu avant la relecture fine (révision 1) est relu.
const drawnOld = packAnalysis({ path: PATH, stat: STAT, analysis: { ...ANALYSIS, source: 'video', notesSource: 'image (clavier dessiné)' } });
const drawnNew = packAnalysis({ path: PATH, stat: STAT, analysis: { ...ANALYSIS, source: 'video', notesSource: 'image (clavier dessiné)', readingRevision: READING_REVISION } });
check('clavier dessiné lu avant la relecture fine : relu', staleImageReading(drawnOld.analysis) && unpackAnalysis(drawnOld, STAT) === null);
check('clavier dessiné lu avec la relecture fine : gardé', unpackAnalysis(drawnNew, STAT)?.analysis.readingRevision === READING_REVISION);
check('relevé au son ou V2N : gardé (lecture inchangée)', unpackAnalysis(packed, STAT) !== null && !staleImageReading({ source: 'v2n', notesSource: 'image (V2N)' }));
check('autre version de la mémoire ou contenu illisible : relu', unpackAnalysis({ ...packed, version: 0 }, STAT) === null && unpackAnalysis({ version: MEMORY_VERSION }, STAT) === null && unpackAnalysis(null) === null);

console.log('Sur le disque');
const files = fakeFiles();
const memory = createTutorialMemory(files, '/home/test');
await memory.saveAnalysis({ path: PATH, stat: STAT, analysis: ANALYSIS, key: 'C major' });
check('le relevé est écrit dans son fichier, la fiche dit « lu »', files.store.has(memory.analysisPath(PATH)) && JSON.parse(files.store.get(`${memory.dir}/index.json`)).cards[PATH].analyzedAt);
const again = createTutorialMemory(files, '/home/test');
check('rouvrir : le relevé revient tel quel', (await again.loadAnalysis(PATH, STAT))?.analysis.noteEvents[0].midi === 50);
check('rouvrir un fichier remplacé : rien', (await again.loadAnalysis(PATH, { size: 9, mtimeMs: 1 })) === null);
check('tuto jamais lu : rien', (await again.loadAnalysis('/home/test/tutos/autre.mp4', STAT)) === null);
await Promise.all([
  again.updateCard(PATH, { thumb: 'data:image/jpeg;base64,AAAA', duration: 725 }),
  again.updateCard('/home/test/tutos/autre.mp4', { duration: 61 }),
]);
const cards = await createTutorialMemory(files, '/home/test').readIndex();
check('fiches complétées sans s\'écraser (vignette, durée, « lu »)', cards[PATH].thumb && cards[PATH].duration === 725 && cards[PATH].analyzedAt && cards['/home/test/tutos/autre.mp4'].duration === 61, JSON.stringify(cards));
const broken = fakeFiles();
broken.store.set('/home/test/PianoJazzChords/Pedagogie/memoire/index.json', '{pas du json');
check('index illisible : fiches vides, pas d\'erreur', JSON.stringify(await createTutorialMemory(broken, '/home/test').readIndex()) === '{}');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);

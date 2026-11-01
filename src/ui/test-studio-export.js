// Export du Studio : fonctions pures (le rendu audio, lui, est vérifié dans le navigateur).
import { effectiveGain, encodeWav, transcriptionToEvents, exportFileName } from './studio-export.js';
import { buildMidiFile } from '../recorder/serializer.js';

let passed = 0; let failed = 0;
const check = (ok, label) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };

const state = { bass: { muted: false, solo: false, volumeDb: 0 }, drums: { muted: true, solo: false, volumeDb: 0 }, piano: { muted: false, solo: false, volumeDb: -6 } };
check(effectiveGain('bass', state) === 1, 'piste à 0 dB : gain 1');
check(effectiveGain('drums', state) === 0, 'piste muette : gain 0');
check(Math.abs(effectiveGain('piano', state) - 10 ** (-6 / 20)) < 1e-9, 'piste à −6 dB');
check(Math.abs(effectiveGain('bass', state, -6) - 10 ** (-6 / 20)) < 1e-9, 'le volume général s\'ajoute');
const solo = { ...state, piano: { ...state.piano, solo: true } };
check(effectiveGain('bass', solo) === 0 && effectiveGain('piano', solo) > 0, 'un solo coupe les autres pistes');

const wav = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 0])], 44100);
const v = new DataView(wav.buffer);
const txt = (o, n) => String.fromCharCode(...wav.slice(o, o + n));
check(txt(0, 4) === 'RIFF' && txt(8, 4) === 'WAVE' && txt(36, 4) === 'data', 'en-tête WAV');
check(v.getUint16(22, true) === 2 && v.getUint32(24, true) === 44100 && v.getUint16(34, true) === 16, 'stéréo, 44,1 kHz, 16 bits');
check(wav.length === 44 + 3 * 2 * 2 && v.getInt16(44 + 4, true) === 32767 && v.getInt16(44 + 8, true) === -32768, 'échantillons entrelacés et bornés');

const notes = [{ midi: 60, onset: 1, offset: 2, velocity: 90 }, { midi: 64, onset: 5, offset: 6, velocity: 70 }, { midi: 67, onset: 10, offset: 11 }];
const ev = transcriptionToEvents(notes, { shift: 2 });
check(ev.filter((e) => e.type === 'note_on').map((e) => e.note).join() === '62,66,69', 'transposition appliquée aux notes (+2)');
const cut = transcriptionToEvents(notes, { from: 4, to: 8 });
check(cut.length === 2 && cut[0].time === 1 && cut[0].note === 64, 'plage de la région : ramenée à 0, notes hors plage écartées');
const ped = transcriptionToEvents([], { pedals: [{ onset: 0.5, offset: 1.5 }] });
check(ped.length === 2 && ped[0].controller === 64 && ped[0].value === 127 && ped[1].value === 0, 'pédale de sustain');
const mid = buildMidiFile(ev, { name: 'Test' });
check(String.fromCharCode(...mid.slice(0, 4)) === 'MThd', 'fichier MIDI valide');
check(exportFileName('Autumn: Leaves?', 'piano', 'mid') === 'Autumn Leaves - piano.mid', 'nom de fichier sûr');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exit(failed ? 1 : 0);

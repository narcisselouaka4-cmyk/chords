// [Claude] — 2026-11-11 — Écoutes comparatives hors réseau : prise d'origine et proposition du
// moteur LOCAL, en fichiers MIDI aux nuances identiques, sur des prises jamais vues par le projet.
//
// Ce paquet ne mesure PAS le modèle connecté (aucun appel réseau : `fetch` est interdit pendant la
// génération) : il fige ce que l'application propose hors réseau, pour qu'un pianiste puisse
// l'écouter et le juger. Les prises sont synthétiques (écrites ici), pas jouées par un pianiste.
//   node scripts/copilot-listening-pack.mjs DOSSIER_NEUF

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

globalThis.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
globalThis.CustomEvent ||= class { constructor(type) { this.type = type; } };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { sendCopilotMessage } = await import('../src/pedagogie/copilot-client.js');
const { buildMidiFile, parseMidiFile } = await import('../src/recorder/serializer.js');

const output = process.argv[2];
if (!output) throw new Error('Usage : node scripts/copilot-listening-pack.mjs DOSSIER_NEUF');
if (fs.existsSync(output)) throw new Error('Choisir un dossier neuf : une écoute figée ne se remplace pas.');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const on = (note, time, len, velocity = 0.62) => [{ type: 'note_on', note, time, velocity, channel: 0 }, { type: 'note_off', note, time: time + len, velocity: 0, channel: 0 }];
const sorted = (events) => events.sort((a, b) => a.time - b.time || (a.type === 'note_off' ? -1 : 1));
// Quatre prises écrites pour cet essai : aucune ne vient des sessions ni des références du projet.
const TAKES = [
  { id: 'p1-accords-plaques', label: 'Accords plaqués, en Fa (Gm7 – C7 – Fmaj7 – Dm7)', request: 'Rends mes accords plus beaux.',
    events: sorted([[55, 62, 65, 70], [48, 58, 64, 67], [53, 60, 64, 69], [50, 60, 65, 69]].flatMap((ns, i) => ns.flatMap((n) => on(n, i * 2, 1.85)))) },
  { id: 'p2-arpeges', label: 'Arpèges montants, en Sol (G – Em – C – D)', request: 'Rends mes accords plus beaux.',
    events: sorted([[43, 59, 62, 67], [40, 59, 64, 67], [48, 60, 64, 67], [50, 57, 62, 66]].flatMap((ns, i) => ns.flatMap((n, k) => on(n, i * 2 + k * 0.22, 1.8 - k * 0.22)))) },
  { id: 'p3-melodie-seule', label: 'Mélodie seule, en Do', request: 'Fais-moi entendre un accompagnement sous ma mélodie.',
    events: sorted([[76, 0, 0.9], [74, 1, 0.45], [72, 1.5, 0.45], [74, 2, 0.9], [76, 3, 0.9], [79, 4, 1.4], [77, 5.5, 0.45], [76, 6, 0.9], [74, 7, 0.9], [72, 8, 1.8]].flatMap(([n, t, l]) => on(n, t, l, 0.7))) },
  { id: 'p4-main-gauche-et-chant', label: 'Basse et chant, en Si bémol', request: 'Rends mes accords plus beaux.',
    events: sorted([...[[46, 0], [43, 2], [48, 4], [41, 6]].flatMap(([n, t]) => on(n, t, 1.9, 0.55)), ...[[74, 0, 0.9], [77, 1, 0.9], [74, 2, 0.9], [70, 3, 0.9], [72, 4, 0.9], [75, 5, 0.9], [72, 6, 0.9], [69, 7, 0.9]].flatMap(([n, t, l]) => on(n, t, l, 0.72))]) },
];

fs.mkdirSync(output, { recursive: true });
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls += 1; throw new Error('Aucun appel réseau autorisé pour cette écoute.'); };
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };
const toSession = (events) => events.filter((e) => ['noteOn', 'noteOff', 'sustain'].includes(e.type)).map((e) => (e.type === 'sustain'
  ? { type: 'control', controller: 64, value: e.value ? 127 : 0, time: e.time, channel: 0 }
  : { type: e.type === 'noteOn' ? 'note_on' : 'note_off', note: e.note, time: e.time, velocity: e.type === 'noteOn' ? e.velocity : 0, channel: 0 }));
const writeMidi = (file, events, name) => {
  const bytes = Buffer.from(buildMidiFile(events, { name }));
  // Relecture de contrôle : mêmes notes, mêmes durées (les sessions d'avant le 09/10 avaient un MIDI à demi-durée).
  const back = parseMidiFile(bytes);
  const notesIn = events.filter((e) => e.type === 'note_on' && e.velocity > 0).length;
  const notesBack = (back?.events || back || []).filter((e) => e.type === 'note_on' && e.velocity > 0).length;
  if (notesBack !== notesIn) throw new Error(`MIDI relu différent pour ${name} : ${notesBack} notes contre ${notesIn}.`);
  fs.writeFileSync(file, bytes);
  return { fichier: path.basename(file), sha256: sha(bytes), notes: notesIn, duree: Math.round(Math.max(...events.map((e) => e.time)) * 100) / 100 };
};

const manifest = { date: new Date().toISOString(), code: git('rev-parse', 'HEAD'), moteur: 'local (hors réseau, aucun appel au modèle)', statut: 'en attente d’écoute — aucune validation musicale', prises: [] };
try {
  for (const sample of TAKES) {
    const take = { name: sample.label, duration: Math.max(...sample.events.map((e) => e.time)), events: sample.events };
    const before = JSON.stringify(take);
    const response = await quiet(() => sendCopilotMessage({ generationMode: 'local', skipHarmonyBrief: true, message: sample.request, messages: [{ role: 'user', content: sample.request, take }], context: { type: 'autonomous', playing: { passage: take } } }));
    if (JSON.stringify(take) !== before) throw new Error(`La prise ${sample.id} a été modifiée par la génération.`);
    const entry = { id: sample.id, description: sample.label, demande: sample.request, original: writeMidi(path.join(output, `${sample.id}-original.mid`), sample.events, `${sample.label} — original`), reponse: String(response.content || response.error || '').replace(/\s+/g, ' ').slice(0, 600) };
    const variant = response.toolResult?.variants?.[0];
    if (response.ok && variant?.example?.events?.length) {
      entry.proposition = { titre: variant.title || '', ...writeMidi(path.join(output, `${sample.id}-proposition.mid`), toSession(variant.example.events), `${sample.label} — proposition`), accords: (variant.example.chords || []).map((c) => c.name || c.label).filter(Boolean) };
      entry.provenance = response.toolResult.generation?.engine || 'non précisée';
    } else {
      entry.proposition = null;
      entry.limite = 'Aucune proposition : la réponse ci-dessus dit pourquoi.';
    }
    manifest.prises.push(entry);
  }
} finally { globalThis.fetch = realFetch; }
manifest.appelsReseau = calls;
if (calls) throw new Error('Un appel réseau a été tenté : écoute invalide.');
fs.writeFileSync(path.join(output, 'manifeste.json'), JSON.stringify(manifest, null, 2));
for (const p of manifest.prises) console.log(`${p.id} : ${p.proposition ? `proposition « ${p.proposition.titre} » (${p.proposition.notes} notes, original ${p.original.notes})` : 'pas de proposition'} — ${p.reponse.slice(0, 110)}`);
console.log(`Paquet figé : ${output} (code ${manifest.code.slice(0, 7)}, ${calls} appel réseau)`);

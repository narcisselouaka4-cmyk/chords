// Tests — la force des notes rejouées (dynamics.js).
//
// Usage : node src/pedagogie/test-dynamics.js

import { velocitiesFromLoudness, shapeDynamics, withMeasuredVelocity } from './dynamics.js';
import { passageExample } from './teacher-notes.js';

let failed = 0;
let passed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Un son simulé : silence à −60 dB, quatre accords à 0, 1, 2 et 3 s, plaqués à −30, −18, −10 et
// −24 dB (le troisième fort, le premier doux), qui décroissent ensuite.
const hop = 0.01;
const db = new Array(450).fill(-60);
const hits = [[0, -30], [1, -18], [2, -10], [3, -24]];
for (const [t, level] of hits) {
  for (let i = 0; i < 80; i += 1) {
    const k = Math.round((t + 0.02) / hop) + i;
    if (k < db.length) db[k] = Math.max(db[k], level - i * 0.3);
  }
}
const loudness = { hop, db };
const chord = (t) => [48, 55, 64, 67].map((midi) => ({ midi, start: t, end: t + 0.9 }));
const notes = [...chord(0), ...chord(1), ...chord(2), ...chord(3)];
const measured = velocitiesFromLoudness(notes, loudness);
const v = (t) => measured.get(notes.find((n) => n.start === t));
check('Chaque accord reçoit une force mesurée', measured.size === notes.length);
check(`L'ordre des forces suit le son : 2 s (${v(2)}) > 1 s (${v(1)}) > 3 s (${v(3)}) > 0 s (${v(0)})`, v(2) > v(1) && v(1) > v(3) && v(3) > v(0));
check('Toutes les notes d\'un accord partagent la force mesurée de l\'attaque', chord(0).length === 4 && new Set(notes.filter((n) => n.start === 1).map((n) => measured.get(n))).size === 1);
check('Écart réel entre le plus doux et le plus fort (≥ 0,4)', v(2) - v(0) >= 0.4, `${v(0)} → ${v(2)}`);
check('Un son au volume uniforme ne donne aucune mesure (rien à en tirer)',
  velocitiesFromLoudness(notes, { hop, db: new Array(450).fill(-20) }).size === 0);
check('Sans son, aucune mesure', velocitiesFromLoudness(notes, null).size === 0);

// Règles de pianiste.
const triad = [{ midi: 48, start: 5, hand: 'lh' }, { midi: 60, start: 5, hand: 'rh' }, { midi: 64, start: 5, hand: 'rh' }, { midi: 72, start: 5, hand: 'rh' }];
const grace = { midi: 75, start: 6, hand: 'rh' };
const target = { midi: 76, start: 6.06, hand: 'rh' };
const shaped = shapeDynamics([...triad, grace, target], { light: new Set([grace]) });
check('Dans un accord, la note du dessus chante plus fort que les voix intérieures',
  shaped.get(triad[3]) > shaped.get(triad[1]) && shaped.get(triad[3]) > shaped.get(triad[2]));
check('La basse reste ferme (au-dessus des voix intérieures)', shaped.get(triad[0]) > shaped.get(triad[1]));
check('Une grace note est plus légère que sa note d\'arrivée', shaped.get(grace) < shaped.get(target) - 0.05);
const again = shapeDynamics([...triad, grace, target], { light: new Set([grace]) });
check('La variation humaine est stable (même note, même force)', [...shaped.values()].join() === [...again.values()].join());
const flat = shapeDynamics(Array.from({ length: 12 }, (_, i) => ({ midi: 60 + (i % 3), start: i * 0.5 })));
const values = [...flat.values()];
check(`Une ligne de notes égales n'est plus jouée à force constante (${Math.min(...values)} → ${Math.max(...values)})`,
  new Set(values).size > 6 && Math.max(...values) - Math.min(...values) <= 0.061);
check('Une force mesurée est prioritaire sur la base',
  shapeDynamics([{ midi: 60, start: 0, velocity: 0.9 }]).get(undefined) === undefined
  && Math.abs(shapeDynamics([{ midi: 60, start: 0, velocity: 0.9 }]).values().next().value - 0.9) <= 0.031);

// Relevés : au son, la vélocité du modèle de transcription est gardée ; à l'image, mesurée.
const fromSound = notes.map((n, i) => ({ ...n, velocity: 0.3 + (i % 5) * 0.12 }));
check('Relevé au son (vélocités déjà nuancées) : gardé tel quel', withMeasuredVelocity(fromSound, loudness) === fromSound);
const fromImage = withMeasuredVelocity(notes, loudness);
check('Relevé à l\'image : chaque note reçoit sa force mesurée', fromImage.every((n) => Number.isFinite(n.velocity)) && fromImage[8].velocity > fromImage[0].velocity);

// Le rejeu du Copilote : les forces arrivent jusqu'aux attaques jouées.
const ex = passageExample(fromImage.map((n) => ({ ...n, hand: n.midi < 60 ? 'lh' : 'rh' })), { start: 0, end: 4 });
const ons = ex.events.filter((e) => e.type === 'noteOn');
const at = (t) => ons.filter((e) => Math.abs(e.time - t) < 0.02);
const avg = (list) => list.reduce((a, e) => a + e.velocity, 0) / list.length;
check(`Rejeu : l'accord plaqué fort (2 s, ${avg(at(2)).toFixed(2)}) sonne plus fort que le doux (0 s, ${avg(at(0)).toFixed(2)})`, avg(at(2)) > avg(at(0)) + 0.25);
check('Rejeu : dans chaque accord, la note du dessus est la plus forte de la main droite',
  [0, 1, 2, 3].every((t) => { const rh = at(t).filter((e) => e.note >= 60); const top = rh.reduce((a, e) => (e.note > a.note ? e : a)); return rh.every((e) => e === top || e.velocity < top.velocity); }));
check(`Rejeu : plus de force unique (${new Set(ons.map((e) => e.velocity)).size} forces différentes pour ${ons.length} attaques)`, new Set(ons.map((e) => e.velocity)).size >= 8);

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);

// Tests de sound-reconcile.js : recouper l'image avec le son (octaves, lacunes, glissandos, garde-fou).
import { reconcileWithSound, normalizeSoundNotes, findRuns, soundCheckSentence } from './sound-reconcile.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

const img = (midi, start, end = start + 0.5, hand = 'rh') => ({ midi, start, end, hand });
const snd = (midi, onset, offset = onset + 0.5, velocity = 80) => ({ midi, onset, offset, velocity });

// Un petit morceau : 8 accords de 2 notes, une note toutes les 0,6 s.
const phrase = (shift = 0) => Array.from({ length: 10 }, (_, i) => img(60 + (i % 5) * 2 + shift, 1 + i * 0.6));
const heard = () => Array.from({ length: 10 }, (_, i) => snd(60 + (i % 5) * 2, 1.03 + i * 0.6));

{
  const r = reconcileWithSound(phrase(), heard());
  check('tout confirmé : rien ne change', r.report.reliable && r.report.confirmed === 10 && r.report.octaveFixed === 0 && r.notes.length === 10);
  check('les notes gardent leur main', r.notes.every((n) => n.hand === 'rh'));
}
{
  // Une seule note vue une octave trop haut.
  const imageNotes = phrase();
  imageNotes[4] = { ...imageNotes[4], midi: imageNotes[4].midi + 12 };
  const r = reconcileWithSound(imageNotes, heard());
  check('une octave fausse est corrigée', r.report.octaveFixed === 1 && r.notes.find((n) => Math.abs(n.start - 3.4) < 0.01).midi === 68);
  check('l\'ancienne hauteur est gardée (octaveFrom)', r.notes.find((n) => Math.abs(n.start - 3.4) < 0.01).octaveFrom === 80);
}
{
  // Tout l'écran décalé d'une octave (clavier dessiné mal calé) : tout est corrigé, le son est cru.
  const r = reconcileWithSound(phrase(12), heard());
  check('toute la lecture décalée d\'une octave : toutes les notes sont corrigées', r.report.reliable && r.report.octaveFixed === 10 && r.report.confirmed === 0);
  check('… et retrouvent les bonnes hauteurs', r.notes.every((n, i) => n.midi === 60 + (i % 5) * 2));
  const r2 = reconcileWithSound(phrase(-24), heard());
  check('décalage de deux octaves : corrigé aussi', r2.report.octaveFixed === 10);
  const r3 = reconcileWithSound(phrase(36), heard());
  check('au-delà de deux octaves : pas de correction (le son est jugé peu fiable)', !r3.report.reliable && r3.report.octaveFixed === 0);
}
{
  // Lacune : l'image ne voit rien de 4 s à 8 s, le son entend un passage.
  const imageNotes = [img(60, 1), img(62, 1.6), img(64, 2.2), img(65, 9), img(67, 9.6)];
  const soundNotes = [snd(60, 1.02), snd(62, 1.62), snd(64, 2.22), snd(72, 5), snd(71, 5.5), snd(69, 6), snd(65, 9.02), snd(67, 9.62)];
  const r = reconcileWithSound(imageNotes, soundNotes);
  check('une lacune de l\'image est comblée par le son', r.report.addedGap === 3 && r.notes.length === 8);
  check('les notes ajoutées sont marquées « son »', r.notes.filter((n) => n.from === 'son').length === 3 && r.notes.filter((n) => n.from === 'son').every((n) => n.kind === 'gap'));
  check('les notes ajoutées gardent leur force', r.notes.filter((n) => n.from === 'son').every((n) => n.velocity > 0 && n.velocity <= 1));
  check('les notes restent triées dans le temps', r.notes.every((n, i, a) => i === 0 || a[i - 1].start <= n.start));
}
{
  // Glissando : une gamme de Do montante, 12 notes en 0,6 s ; l'image n'en voit qu'une sur deux.
  const scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];
  const soundNotes = scale.map((m, i) => snd(m, 2 + i * 0.05, 2.9));
  const imageNotes = scale.filter((_, i) => i % 2 === 0).map((m, k) => img(m, 2 + k * 0.1, 2.9, 'rh'));
  // + du contexte confirmé avant et après
  const ctx = [img(48, 0.5), img(50, 1.0), img(52, 4.0), img(53, 4.5)];
  const ctxSound = [snd(48, 0.52), snd(50, 1.02), snd(52, 4.02), snd(53, 4.52)];
  const r = reconcileWithSound([...ctx, ...imageNotes].sort((a, b) => a.start - b.start), [...ctxSound, ...soundNotes]);
  check('un glissando vu à moitié est complété', r.report.addedSlide === 6 && r.notes.length === ctx.length + 12);
  check('les notes ajoutées à un glissando prennent la main de la note voisine', r.notes.filter((n) => n.kind === 'slide').every((n) => n.hand === 'rh'));
  check('la gamme complète est là', JSON.stringify(r.notes.filter((n) => n.start >= 2 && n.start < 3).map((n) => n.midi).sort((a, b) => a - b)) === JSON.stringify(scale));
  check('findRuns reconnaît la montée', findRuns(imageNotes).length === 1);
}
{
  // Au milieu d'un accord, une note entendue en trop (résonance) n'est PAS ajoutée.
  const imageNotes = [img(48, 1, 3, 'lh'), img(55, 1, 3, 'lh'), img(64, 1, 3, 'rh'), img(60, 4, 6, 'lh'), img(67, 4, 6, 'rh')];
  const soundNotes = [snd(48, 1.02, 3), snd(55, 1.02, 3), snd(64, 1.02, 3), snd(59, 1.1, 2), snd(60, 4.02, 6), snd(67, 4.02, 6)];
  const r = reconcileWithSound(imageNotes, soundNotes);
  check('une note entendue en trop dans un accord est comptée, pas ajoutée', r.report.heardOnly === 1 && r.notes.length === 5);
}
{
  // Son peu fiable (rien à voir avec l'image) : rien ne change.
  const r = reconcileWithSound(phrase(), Array.from({ length: 30 }, (_, i) => snd(30 + ((i * 7) % 20), 0.5 + i * 0.3)));
  check('un son qui ne recoupe pas l\'image n\'est pas cru', !r.report.reliable && r.report.reason === 'unreliable' && r.notes.length === 10 && r.report.octaveFixed === 0);
  check('… et aucune note n\'est ajoutée', r.report.addedGap === 0 && r.report.addedSlide === 0);
}
{
  check('sans son : l\'image seule', reconcileWithSound(phrase(), []).report.reason === 'no-sound');
  check('sans image : rien à recouper', reconcileWithSound([], heard()).report.reason === 'no-image');
  const n = normalizeSoundNotes([snd(60, 1, 1.01), snd(61, 2, 3, 5), snd(20, 3), snd(62, 4, 5, 90)]);
  check('le bruit est écarté (trop court, trop faible, hors du piano)', n.length === 1 && n[0].midi === 62);
  check('la force 0-127 est ramenée entre 0 et 1', Math.abs(n[0].velocity - 90 / 127) < 1e-9);
}
{
  const input = phrase(); const copy = JSON.stringify(input);
  reconcileWithSound(input, heard());
  check('les notes de l\'image passées en entrée ne sont pas modifiées', JSON.stringify(input) === copy);
  const s = soundCheckSentence(reconcileWithSound(phrase(12), heard()).report);
  check('la phrase pour l\'écran dit ce qui a été corrigé', /10 octaves corrigées/.test(s));
  check('la phrase dit aussi quand le son n\'a pas servi', /image seule/.test(soundCheckSentence({ reason: 'unreliable' })));
}

{
  // Décalage d'octave GÉNÉRAL (mesuré sur « Above All » : 85 % des notes retrouvées étaient à +12).
  // Les notes que le son ne confirme pas suivent le même décalage.
  const imageNotes = [...phrase(12), img(72 + 12, 20), img(74 + 12, 21), img(76 + 12, 22)];
  const r = reconcileWithSound(imageNotes, heard());
  check('le décalage général est repéré', r.report.reliable && r.report.globalShift === -12);
  check('les notes non confirmées sont ramenées avec les autres', r.report.octaveInferred === 3
    && [72, 74, 76].every((m) => r.notes.some((n) => n.midi === m && n.start >= 20)));
  check('… et gardent leur hauteur d\'origine', r.notes.filter((n) => n.start >= 20).every((n) => n.octaveFrom === n.midi + 12));
}
{
  // Trop peu de notes retrouvées : un décalage ne se généralise pas sur 4 notes.
  const heardFew = Array.from({ length: 4 }, (_, i) => snd(60 + (i % 5) * 2, 1.03 + i * 0.6));
  const imageNotes = [...Array.from({ length: 4 }, (_, i) => img(72 + (i % 5) * 2, 1 + i * 0.6)), img(90, 30), img(91, 31), img(92, 32), img(93, 33), img(94, 34), img(95, 35)];
  const r = reconcileWithSound(imageNotes, heardFew, { minReliable: 0.2 });
  check('peu de notes retrouvées : pas de généralisation', r.report.globalShift === 0 && r.report.octaveInferred === 0);
}
{
  // Moitié des notes juste, moitié décalée : ce n'est pas un défaut de calage, on ne généralise pas.
  const imageNotes = phrase().map((n, i) => (i < 5 ? n : { ...n, midi: n.midi + 12 }));
  imageNotes.push(img(100, 40), img(101, 41));
  const r = reconcileWithSound(imageNotes, heard());
  check('moitié juste, moitié décalée : pas de généralisation', r.report.globalShift === 0 && r.report.octaveInferred === 0);
}
{
  // Jamais hors du clavier : une note qui sortirait de 21–108 est laissée.
  const imageNotes = [...phrase(12), img(105, 20), img(107, 21)];
  const r = reconcileWithSound(imageNotes, heard());
  check('le décalage général reste dans le clavier', r.report.globalShift === -12 && r.notes.every((n) => n.midi >= 21 && n.midi <= 108));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

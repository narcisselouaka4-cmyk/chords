// Tests de sound-sampling.js : choisir les extraits à faire écouter au modèle de transcription.
import { pickSoundWindows, windowsArgument, windowsToSpans } from './sound-sampling.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

// Notes régulières : une toutes les 0,5 s sur toute la durée.
const dense = (duration) => Array.from({ length: Math.floor(duration * 2) }, (_, i) => ({ start: i * 0.5 }));

{
  const w = pickSoundWindows(dense(40), 40);
  check('vidéo courte (≤ 60 s) : on écoute tout', w.length === 1 && w[0].start === 0 && w[0].duration === 40);
}
{
  const w = pickSoundWindows(dense(1134), 1134);
  check('vidéo de 19 min : 4 extraits, un par quart', w.length === 4);
  check('… de 20 s chacun, soit 80 s au lieu de 1134 s', w.every((x) => x.duration === 20) && w.reduce((s, x) => s + x.duration, 0) === 80);
  check('… sans chevauchement, dans l\'ordre', w.every((x, i) => i === 0 || x.start >= w[i - 1].start + w[i - 1].duration));
  check('… chacun dans son quart', w.every((x, i) => x.start >= (i * 1134) / 4 - 1e-6 && x.start + x.duration <= ((i + 1) * 1134) / 4 + 1e-6));
}
{
  // Un tuto où le prof ne joue pas dans le 1er quart (il parle) : ce quart est sauté, pas inventé.
  const notes = dense(400).filter((n) => n.start >= 100);
  const w = pickSoundWindows(notes, 400);
  check('un quart où l\'image ne voit rien est sauté', w.length === 3 && w.every((x) => x.start >= 100));
}
{
  // La fenêtre choisie est la plus dense du quart : un passage chargé entre 150 et 170 s.
  const notes = [...dense(400).filter((n) => n.start % 2 === 0), ...Array.from({ length: 200 }, (_, i) => ({ start: 150 + i * 0.1 }))];
  const w = pickSoundWindows(notes, 400);
  const second = w.find((x) => x.start < 200 && x.start >= 100);
  check('la fenêtre se cale sur le passage le plus chargé', second && second.start >= 148 && second.start <= 152);
}
{
  check('aucune note vue : aucun extrait (l\'appelant décide)', pickSoundWindows([], 600).length === 0);
  check('durée inconnue : aucun extrait', pickSoundWindows(dense(100), NaN).length === 0 && pickSoundWindows(dense(100), 0).length === 0);
  check('--windows : « début:durée » séparés par des virgules', windowsArgument([{ start: 12.04, duration: 20 }, { start: 300, duration: 20 }]) === '12:20,300:20');
  const spans = windowsToSpans([{ start: 10, duration: 20 }]);
  check('plages de temps pour le recoupement', spans[0].start === 10 && spans[0].end === 30);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

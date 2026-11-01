// Tests de la partie pure du métronome : temps, mesure, planification suivant la vidéo.
import { beatsInWindow, beatKind, planFollowClicks, isSeek, BEATS_PER_BAR } from './metronome.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

{
  const b = beatsInWindow({ from: 0, to: 2.01, offset: 0, bpm: 120 });
  check('120 BPM : un temps toutes les 0,5 s', b.length === 5 && near(b[1].time, 0.5) && near(b[4].time, 2));
  check('les temps se comptent dans la mesure (1 2 3 4 1)', b.map((x) => x.beatInBar).join('') === '01230');
  check('le 1 est fort, les autres faibles', b[0].kind === 'strong' && b[1].kind === 'weak');
}
{
  const b = beatsInWindow({ from: 10, to: 12, offset: 0.2, bpm: 90 });
  const p = 60 / 90;
  check('le décalage (« le 1 est ici ») place la grille', b.every((x) => near((x.time - 0.2) / p, Math.round((x.time - 0.2) / p), 1e-6)));
  check('seuls les temps de la fenêtre sont donnés', b.every((x) => x.time >= 10 - 1e-6 && x.time < 12));
  const idx = b.map((x) => x.index);
  check('les indices se suivent', idx.every((v, i) => i === 0 || v === idx[i - 1] + 1));
}
{
  const b = beatsInWindow({ from: 0, to: 1.2, offset: 5, bpm: 100 });
  check('avant le « 1 » posé, la grille continue (indices négatifs, mesure juste)', b.length === 2 && b[0].index < 0 && b[0].beatInBar === ((b[0].index % 4) + 4) % 4);
}
{
  check('mesure à 3 temps', beatsInWindow({ from: 0, to: 3.5, offset: 0, bpm: 100, beatsPerBar: 3 }).map((x) => x.beatInBar).join('') === '012012');
  const six = beatsInWindow({ from: 0, to: 6, offset: 0, bpm: 120, beatsPerBar: 6 }).map((x) => x.kind);
  check('à 6 temps : fort, faible, faible, moyen, faible, faible', six.slice(0, 6).join(',') === 'strong,weak,weak,medium,weak,weak');
  check('mesures proposées : 2, 3, 4, 6', JSON.stringify(BEATS_PER_BAR) === '[2,3,4,6]');
  check('beatKind', beatKind(0, 4) === 'strong' && beatKind(3, 4) === 'weak' && beatKind(3, 6) === 'medium');
}
{
  check('tempo nul : aucun temps', beatsInWindow({ from: 0, to: 5, bpm: 0 }).length === 0 && beatsInWindow({ from: 5, to: 5, bpm: 100 }).length === 0);
}
{
  // Lecture continue : chaque temps est planifié UNE seule fois, même si on appelle toutes les 25 ms.
  let last = null; const heard = [];
  for (let t = 0; t < 10; t += 0.025) {
    const r = planFollowClicks({ videoTime: t, rate: 1, lastIndex: last, offset: 0.1, bpm: 120 });
    last = r.lastIndex;
    for (const c of r.clicks) heard.push(+(t + c.delay).toFixed(3));
  }
  check('lecture continue : 20 temps en 10 s, chacun une seule fois', heard.length === 20 && new Set(heard).size === 20);
  check('… et chacun tombe pile sur son temps (à 1 ms)', heard.every((h, i) => Math.abs(h - (0.1 + i * 0.5)) < 0.001));
}
{
  // Vitesse 0,5× : les temps de la vidéo sont deux fois plus espacés dans le temps réel.
  let last = null; const heard = [];
  for (let real = 0; real < 6; real += 0.025) {
    const vt = real * 0.5;
    const r = planFollowClicks({ videoTime: vt, rate: 0.5, lastIndex: last, offset: 0, bpm: 120 });
    last = r.lastIndex;
    for (const c of r.clicks) heard.push(+(real + c.delay).toFixed(3));
  }
  const gaps = heard.slice(1).map((h, i) => +(h - heard[i]).toFixed(3));
  check('à 0,5× : un clic toutes les 1 s réelles', gaps.length > 3 && gaps.every((g) => Math.abs(g - 1) < 0.002));
}
{
  // Saut : après un saut, on repart de zéro, sans rejouer ni sauter de temps.
  check('un saut est reconnu', isSeek({ videoTime: 40, expectedTime: 12.3 }) && !isSeek({ videoTime: 12.31, expectedTime: 12.3 }));
  check('sans position attendue, c\'est un saut', isSeek({ videoTime: 1, expectedTime: NaN }));
  const first = planFollowClicks({ videoTime: 10, rate: 1, lastIndex: null, offset: 0, bpm: 120 });
  const afterSeek = planFollowClicks({ videoTime: 3.45, rate: 1, lastIndex: null, offset: 0, bpm: 120 });
  check('après un saut en arrière, les temps de la nouvelle position sonnent', first.lastIndex === 20 && afterSeek.clicks.length > 0 && afterSeek.clicks[0].index === 7);
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

// Tests de tempo-estimate.js sur des enveloppes sonores synthétiques (dB toutes les 10 ms).
import { estimateTempo, onsetStrength, tempoConfidenceLabel } from './tempo-estimate.js';

let pass = 0; let fail = 0;
const check = (label, ok, extra = '') => { if (ok) { pass += 1; console.log('  ✓', label, extra); } else { fail += 1; console.log('  ✗', label, extra); } };

// Générateur pseudo-aléatoire reproductible.
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * Niveau sonore d'un morceau : bruit de fond à -50 dB, une attaque (montée brusque puis déclin de 150 ms)
 * à chaque temps ; `sub` = force relative des croches ; `accent` = temps 1 de chaque mesure plus fort.
 */
function env({ bpm, seconds = 30, first = 0.2, sub = 0, accentEvery = 0, noise = 1.5, jitter = 0, seed = 1 }) {
  const hop = 0.01;
  const rand = rng(seed);
  const n = Math.round(seconds / hop);
  const amp = new Float64Array(n).fill(10 ** (-50 / 20));
  const period = 60 / bpm;
  const burst = (t, a) => {
    const i0 = Math.round(t / hop);
    for (let k = 0; k < 40 && i0 + k < n; k += 1) if (i0 + k >= 0) amp[i0 + k] += a * Math.exp(-k * hop / 0.05);
  };
  let beat = 0;
  for (let t = first; t < seconds; t += period, beat += 1) {
    const a = 0.1 * (accentEvery && beat % accentEvery === 0 ? 1.6 : 1);
    burst(t + (rand() - 0.5) * 2 * jitter, a);
    if (sub) burst(t + period / 2 + (rand() - 0.5) * 2 * jitter, 0.1 * sub);
  }
  return Array.from(amp, (a) => 20 * Math.log10(a) + (rand() - 0.5) * noise);
}

for (const bpm of [60, 72, 80, 90, 100, 110, 120, 132, 140]) {
  const r = estimateTempo(env({ bpm, seed: bpm }));
  check(`${bpm} BPM, pulsation nette`, r && Math.abs(r.bpm - bpm) <= 1.2 && r.confidence >= 0.6, `→ ${r?.bpm} (confiance ${r?.confidence})`);
}
{
  // Une pulsation pure à 160 est la même que celle d'un 80 dont chaque temps est doublé : le
  // tempo peut sortir en « moitié ». C'est pour cela que l'écran propose « ÷ 2 » et « × 2 ».
  const r = estimateTempo(env({ bpm: 160, seed: 160 }));
  check('160 BPM pur : 160, ou sa moitié (80)', r && (Math.abs(r.bpm - 160) <= 1.5 || Math.abs(r.bpm - 80) <= 0.8), `→ ${r?.bpm}`);
}
{
  const r = estimateTempo(env({ bpm: 120, sub: 0.6 }));
  check('120 BPM avec des croches presque aussi fortes : on garde le temps, pas la croche', r && Math.abs(r.bpm - 120) <= 1.2, `→ ${r?.bpm}`);
}
{
  const r = estimateTempo(env({ bpm: 100, accentEvery: 4, seed: 7 }));
  check('100 BPM avec le premier temps de chaque mesure accentué : 100, pas 25', r && Math.abs(r.bpm - 100) <= 1.2, `→ ${r?.bpm}`);
}
{
  const r = estimateTempo(env({ bpm: 96, jitter: 0.02, noise: 6, seed: 3 }));
  check('96 BPM joué à la main (±20 ms) et bruité', r && Math.abs(r.bpm - 96) <= 2 && r.confidence >= 0.6, `→ ${r?.bpm} (confiance ${r?.confidence})`);
}
{
  const r = estimateTempo(env({ bpm: 90, first: 0.37 }));
  const period = 60 / 90;
  const off = ((r.firstBeat - 0.37) % period + period) % period;
  check('le premier temps est placé au bon endroit (±40 ms)', Math.min(off, period - off) <= 0.04, `→ premier temps ${r.firstBeat}`);
}
{
  const hop = 0.01;
  const base = env({ bpm: 100, seconds: 40 });
  const r = estimateTempo(base, hop, { from: 10, to: 30 });
  check('on peut regarder une plage seulement (from / to)', r && Math.abs(r.bpm - 100) <= 1.2 && r.firstBeat >= 10, `→ ${r?.bpm}, premier temps ${r?.firstBeat}`);
}
{
  const rand = rng(11);
  const noise = Array.from({ length: 3000 }, () => -50 + (rand() - 0.5) * 6);
  const r = estimateTempo(noise);
  check('un bruit sans pulsation donne une confiance nulle ou faible', !r || r.confidence < 0.15, `→ ${r ? `${r.bpm} BPM, confiance ${r.confidence}` : 'rien'}`);
}
{
  check('trop court (3 s) : pas d\'estimation', estimateTempo(env({ bpm: 100, seconds: 3 })) === null);
  check('silence complet : pas d\'estimation', estimateTempo(new Array(3000).fill(-90)) === null);
  check('entrée absurde : pas d\'estimation', estimateTempo(null) === null && estimateTempo('x') === null);
}
{
  const o = onsetStrength(env({ bpm: 120, seconds: 10 }), 0.01);
  const peaks = [...o].filter((v) => v > 2).length;
  check('la force des attaques est nulle hors des attaques', o.length === 1000 && peaks > 0 && peaks < 100);
  check('les mots de confiance', tempoConfidenceLabel(0.8) === 'sûr' && tempoConfidenceLabel(0.4) === 'probable' && tempoConfidenceLabel(0.1) === 'incertain' && tempoConfidenceLabel(NaN) === 'incertain');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

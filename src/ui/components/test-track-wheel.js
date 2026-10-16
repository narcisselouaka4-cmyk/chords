// Tests Node de la géométrie de la roue des morceaux (track-wheel.js) : pas de DOM ici.
import fs from 'node:fs';
import {
  WHEEL_STEP_DEG, WHEEL_MAX_DEG, clampOffset, snapOffset, dragToOffset, settleOffset, easeOutBack, unfoldProgress, itemPose,
  KEY_STEP_DEG, KEY_COUNT, hasBlackAfter, annulusSector, keyboardKeys, pressedKeyIndex, buildKeyboardSvg,
} from './track-wheel.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const R = 300;

// — pose —
const mid = itemPose(4, 4, { radius: R });
check('le morceau du milieu est à 3 h (x = rayon, y = 0)', near(mid.x, R) && near(mid.y, 0) && mid.angle === 0);
check('le morceau du milieu est le plus grand et opaque', mid.scale === 1 && mid.opacity === 1);
const below = itemPose(5, 4, { radius: R });
const above = itemPose(3, 4, { radius: R });
check('le suivant est en dessous (y > 0), le précédent au-dessus (y < 0), symétriques', below.y > 0 && above.y < 0 && near(below.y, -above.y) && near(below.x, above.x));
check('un morceau voisin est un peu plus petit et plus pâle', below.scale < 1 && below.opacity < 1 && below.opacity > 0.5);
check('l\'écart angulaire est WHEEL_STEP_DEG', near(below.angle, WHEEL_STEP_DEG));
const far = itemPose(4 + Math.ceil(WHEEL_MAX_DEG / WHEEL_STEP_DEG) + 1, 4, { radius: R });
check('un morceau trop loin sur la roue n\'est plus affiché', !far.visible && far.opacity === 0);
check('les morceaux restent sur le cercle (x² + y² = R²)', [0, 1, 2, 3, 5, 6].every((i) => { const p = itemPose(i, 3.4, { radius: R }); return near(Math.hypot(p.x, p.y), R, 1e-6); }));
const folded = itemPose(7, 2, { radius: R, spread: 0 });
check('déploiement 0 : tous les morceaux sont au milieu, invisibles', near(folded.x, R) && near(folded.y, 0) && folded.opacity === 0);
const half = itemPose(6, 2, { radius: R, spread: 0.5 });
check('déploiement 0,5 : à mi-chemin de l\'éventail', near(half.angle, 4 * WHEEL_STEP_DEG * 0.5));
check('la roue fractionnaire déplace tout d\'un même angle', near(itemPose(3, 2.5, { radius: R }).angle, 0.5 * WHEEL_STEP_DEG));

// — positions —
check('clampOffset borne dans [0, n-1]', clampOffset(-3, 5) === 0 && clampOffset(9, 5) === 4 && clampOffset(2.4, 5) === 2.4);
check('clampOffset d\'une liste vide', clampOffset(3, 0) === 0);
check('snapOffset arrondit au plus proche', snapOffset(2.4, 6) === 2 && snapOffset(2.6, 6) === 3 && snapOffset(99, 6) === 5 && snapOffset(-2, 6) === 0);

// — glissé —
check('glisser vers le haut fait avancer dans la liste', dragToOffset(2, -90, 90, 10) === 3);
check('glisser vers le bas fait reculer', dragToOffset(2, 90, 90, 10) === 1);
check('au début de la liste, la roue résiste puis plafonne', dragToOffset(0, 500, 90, 10) < 0 && dragToOffset(0, 500, 90, 10) >= -0.6);
check('à la fin de la liste, la roue résiste puis plafonne', dragToOffset(9, -500, 90, 10) > 9 && dragToOffset(9, -500, 90, 10) <= 9.6);

// — inertie —
check('lâcher sans vitesse : on s\'arrête sur le morceau le plus proche', settleOffset(3.3, 0, 10) === 3);
check('lâcher en lançant : la roue va plus loin, dans le sens du geste', settleOffset(3.3, 12, 10) > 3 && settleOffset(3.3, -12, 10) < 3);
check('l\'inertie ne sort jamais de la liste', settleOffset(8.8, 100, 10) === 9 && settleOffset(0.2, -100, 10) === 0);

// — déploiement —
check('easeOutBack : 0 → 0, 1 → 1, dépasse 1 en route', near(easeOutBack(0), 0) && near(easeOutBack(1), 1) && easeOutBack(0.7) > 1);
check('le déploiement part du morceau choisi : les proches partent avant les lointains', unfoldProgress(100, 0) > unfoldProgress(100, 6));
check('le déploiement finit', unfoldProgress(5000, 20) === 1 && unfoldProgress(0, 0) === 0);
check('le retard est plafonné (la roue ne met pas des secondes à s\'ouvrir)', unfoldProgress(1000, 500) === 1);

// [Claude] — 2026-10-16 (soir) — Le vinyle a laissé place à un CLAVIER en éventail (Narcisse :
// « le vinyle ne me plaît pas… pourquoi ne pas tenter autre chose en rapport avec la musique ? »).
// Une touche blanche par pas de roue (15°) : au posé, une touche est toujours PILE sous le repère.
// Les étiquettes de morceaux redeviennent teintées pour la page (celles d'avant le vinyle).
{
  // — clavier : géométrie pure —
  check('une touche blanche par pas de roue, le cercle entier couvert (24 touches)',
    KEY_STEP_DEG === WHEEL_STEP_DEG && KEY_COUNT === 24);
  check('les noires suivent le motif d\'octave (après 1re, 2e, 4e, 5e, 6e touche)',
    [0, 1, 3, 4, 5].every((k) => hasBlackAfter(k)) && !hasBlackAfter(2) && !hasBlackAfter(6) && !hasBlackAfter(13));
  check('24 blanches et 17 noires (5 noires par octave de 7 blanches)',
    (() => { const ks = keyboardKeys(); return ks.filter((k) => k.kind === 'white').length === 24 && ks.filter((k) => k.kind === 'black').length === 17 && ks.length === 41; })());
  check('le secteur annulaire est le bon chemin (M extérieur → arc → L intérieur → arc → Z)',
    annulusSector(0, 0, 1, 2, 0, 90) === 'M 2.00 0.00 A 2 2 0 0 1 0.00 2.00 L 0.00 1.00 A 1 1 0 0 0 1.00 0.00 Z');
  check('la touche blanche k rayonne de son centre k × 15°, avec son interstice',
    (() => {
      const w = keyboardKeys().filter((k) => k.kind === 'white');
      return w[3].d === annulusSector(100, 100, 47, 87, 3 * 15 - 6.9, 3 * 15 + 6.9)
        && w[11].d === annulusSector(100, 100, 47, 87, 11 * 15 - 6.9, 11 * 15 + 6.9);
    })());
  check('les noires sont posées sur les frontières, plus courtes que les blanches',
    (() => {
      const b = keyboardKeys().find((k) => k.kind === 'black');
      return b.d === annulusSector(100, 100, 47, 47 + (87 - 47) * 0.62, 15 - 3.1, 15 + 3.1);
    })());
  check('au posé, la touche `pressedKeyIndex` arrive PILE sous le repère, quelle que soit la position',
    [0, 3, 23, 26, 49].every((o) => ((pressedKeyIndex(o) - o) * KEY_STEP_DEG) % 360 === 0
      && pressedKeyIndex(o) >= 0 && pressedKeyIndex(o) < KEY_COUNT));
  check('pressedKeyIndex(26) revient au début du clavier (26 mod 24 = 2)', pressedKeyIndex(26) === 2 && pressedKeyIndex(-3) === 21);
  check('le clavier est un SVG : fond de clavier + 41 touches',
    (() => {
      const svg = buildKeyboardSvg();
      return svg.startsWith('<svg') && (svg.match(/track-wheel-key-white/g) || []).length === 24
        && (svg.match(/track-wheel-key-black/g) || []).length === 17 && svg.includes('track-wheel-keybed');
    })());

  // — le vinyle a bien disparu ; les étiquettes sont teintées pour la page —
  const css = fs.readFileSync(new URL('./track-wheel.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const js = fs.readFileSync(new URL('./track-wheel.js', import.meta.url), 'utf8');
  check('plus de matière vinyle (ni galette noire, ni étiquette, ni reflet, ni graduations)',
    !/conic-gradient\(from 10deg/.test(css) && !css.includes('.track-wheel-label') && !css.includes('.track-wheel-shine') && !css.includes('.track-wheel-ticks'));
  check('le disque est le demi-disque sobre teinté pour le thème',
    /\.track-wheel-disc \{[\s\S]{0,400}var\(--tr-surface/.test(css) && !/\.track-wheel-disc \{[\s\S]{0,400}conic-gradient/.test(css));
  check('le clavier est stylé : touches blanches/noires, touche enfoncée au repère',
    css.includes('.track-wheel-key-white {') && css.includes('.track-wheel-keybed') && css.includes('.track-wheel-key-white.is-pressed'));
  check('les étiquettes de morceaux sont teintées pour la page, dans les deux thèmes (retour à l\'avant-vinyle)',
    /\.track-wheel-item \{[\s\S]{0,700}var\(--tr-surface/.test(css) && !/\.track-wheel-item \{[\s\S]{0,700}linear-gradient\(#211e2ae6/.test(css));
  check('c\'est le calque tournant qui porte le clavier, et la touche posée s\'enfonce',
    js.includes('spin.innerHTML = buildKeyboardSvg()') && js.includes("spin.style.transform = `rotate(")
      && js.includes("classList.add('is-pressed')") && js.includes('pressedKeyIndex(offset)'));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

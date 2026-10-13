// Tests Node de la géométrie de la roue des morceaux (track-wheel.js) : pas de DOM ici.
import {
  WHEEL_STEP_DEG, WHEEL_MAX_DEG, clampOffset, snapOffset, dragToOffset, settleOffset, easeOutBack, unfoldProgress, itemPose,
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

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);

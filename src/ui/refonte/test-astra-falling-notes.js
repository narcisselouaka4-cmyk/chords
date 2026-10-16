// Angle « Cascade » du paysage harmonique : géométrie pure (le dessin lui-même est vérifié dans le navigateur).
import { readFileSync } from 'node:fs';
import { fallbackKeyLayout, windowNotes, noteBox, isBlackKey, noteLetter, LOOKAHEAD } from './astra-falling-notes.js';

let passed = 0; let failed = 0;
const check = (ok, label) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };

// Touches noires / blanches
check(!isBlackKey(60) && isBlackKey(61) && isBlackKey(70) && !isBlackKey(71), 'do blanc, do# noir, la# noir, si blanc');

// Clavier de secours : 88 touches, 52 blanches égales couvrant la largeur
const layout = fallbackKeyLayout(1040, 21, 108);
check(layout.size === 88, '88 touches');
const whites = [...layout.values()].filter((k) => !k.black);
check(whites.length === 52 && Math.abs(whites[0].w - 20) < 1e-9, '52 touches blanches de 20 px (1040 / 52)');
check(Math.abs(whites.at(-1).x + whites.at(-1).w - 1040) < 1e-6, 'la dernière blanche finit au bord droit');
check(layout.get(61).black && layout.get(61).w < layout.get(60).w, 'une touche noire est plus étroite');
const c4 = layout.get(60); const d4 = layout.get(62); const cs4 = layout.get(61);
check(cs4.x > c4.x && cs4.x + cs4.w < d4.x + d4.w && Math.abs((cs4.x + cs4.w / 2) - d4.x) < 1e-9, 'do# à cheval entre do et ré');

// Fenêtre de notes
const notes = [
  { midi: 60, start: 0, duration: 1 }, { midi: 62, start: 2, duration: 1 },
  { midi: 64, start: 5, duration: 1 }, { midi: 65, start: 9, duration: 1 },
];
check(windowNotes(notes, 2, 4).map((n) => n.midi).join() === '62,64', 'à t=2 : les notes de t=2 à t=6 (la première est passée)');
check(windowNotes(notes, 0, 4).map((n) => n.midi).join() === '60,62', 'à t=0 : pas de note après t=4');
check(windowNotes(notes, 2, 4, 4).map((n) => n.midi).join() === '60,62,64', 'avec du passé (enregistrement) : la note de t=0 reste');

// Position des rectangles : le bas d'une note qui commence « maintenant » est sur la ligne
const geo = { height: 300, lineY: 297, ahead: LOOKAHEAD };
const now = noteBox({ start: 10, duration: 1 }, 10, geo);
check(Math.abs(now.bottom - 297) < 1e-9, 'une note qui commence maintenant touche la ligne');
const soon = noteBox({ start: 12, duration: 1 }, 10, geo);
const pps = 297 / LOOKAHEAD;
check(Math.abs(soon.bottom - (297 - 2 * pps)) < 1e-9 && Math.abs((soon.bottom - soon.top) - pps) < 1e-9, 'une note dans 2 s est 2 s plus haut, sa hauteur = sa durée');
const held = noteBox({ start: 9.5, duration: 1.5 }, 10, geo);
check(held.bottom === 297 && held.top < 297, 'une note en cours est coupée à la ligne, il reste ce qui n\'est pas joué');
const gone = noteBox({ start: 5, duration: 1 }, 10, geo);
check(gone.bottom - gone.top < 1 || gone.top >= 297, 'une note passée a quitté la zone');
// Enregistrement : les notes montent depuis la ligne
const rec = noteBox({ start: 8, duration: 1 }, 10, { ...geo, recording: true });
check(Math.abs(rec.top - (297 - 2 * pps)) < 1e-9 && Math.abs(rec.bottom - (297 - pps)) < 1e-9, 'enregistrement : une note jouée de il y a 2 s à il y a 1 s occupe de 2 s à 1 s au-dessus de la ligne');
const recHeld = noteBox({ start: 9, duration: 5 }, 10, { ...geo, recording: true });
check(recHeld.bottom === 297 && recHeld.top < 297, 'enregistrement : une note encore tenue part de la ligne et s\'allonge vers le haut');

// Lettres sur les notes : dans la notation du clavier, sans octave
check(noteLetter(60, false) === 'C' && noteLetter(62, false) === 'D' && noteLetter(66, false) === 'F#', 'lettres anglaises : C, D, F#');
check(noteLetter(60, true) === 'Do' && noteLetter(62, true) === 'Ré' && noteLetter(67, true) === 'Sol', 'notes latines : Do, Ré, Sol');
check(noteLetter(72, false) === noteLetter(60, false) && noteLetter(-1, false) === 'B', 'la lettre ne dépend pas de l\'octave');

// Source : plus de brouillard ni de halo à la ligne d'arrivée ; la cascade suit la transposition
const src = readFileSync(new URL('./astra-falling-notes.js', import.meta.url), 'utf8');
check(!/shadowBlur\s*=/.test(src) && !/lineGrad/.test(src), 'aucun halo ni brouillard à la ligne d\'arrivée');
check(/note\.midi \+ shift/.test(src) && /keyboard-settings-changed/.test(src), 'les notes sont décalées de la transposition et la vue écoute le clavier');

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
process.exit(failed ? 1 : 0);

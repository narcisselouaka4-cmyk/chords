/**
 * Tests de non-régression — Lisibilité de la timeline et navigation du lecteur.
 *
 * Trois points issus du retour utilisateur du 2026-08-23 :
 *   · un symbole d'accord ne doit jamais être tronqué en « F... » ;
 *   · au dézoom, les accords non structurels se replient sans disparaître ;
 *   · revenir de quelques secondes ne doit pas obliger à repartir du début.
 *
 * Usage : node src/ui/test-timeline-readability.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  fitChordLabel,
  labelVariants,
  splitChordSymbol,
  LABEL_MAX_FONT_PX,
  LABEL_MIN_FONT_PX,
} from './chord-label-fit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(projectRoot, rel), 'utf-8');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    failures++;
  } else {
    console.log(`  ✅ ${message}`);
  }
}

function runTest(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ❌ Exception: ${err.message}`);
    failures++;
  }
}

// ── A. Découpage des symboles ──

runTest('A. Symboles — fondamentale et suffixe correctement séparés', () => {
  const cases = [
    ['F#m', 'F#', 'm'], ['C', 'C', ''], ['Bbmaj7', 'Bb', 'maj7'],
    ['Adim7', 'A', 'dim7'], ['G7', 'G', '7'], ['Dm7', 'D', 'm7'],
  ];
  for (const [symbol, root, suffix] of cases) {
    const got = splitChordSymbol(symbol);
    assert(got.root === root && got.suffix === suffix,
           `${symbol} → « ${got.root} » + « ${got.suffix} »`);
  }
});

runTest("A. Repli — l'ordre d'abandon est musical, la fondamentale part en dernier", () => {
  assert(JSON.stringify(labelVariants('F#m7')) === JSON.stringify(['F#m7', 'F#m', 'F#', '']),
         'F#m7 → F#m → F# → (rien) : la couleur mineure survit à la septième');
  assert(JSON.stringify(labelVariants('Cmaj7')) === JSON.stringify(['Cmaj7', 'C', '']),
         'Cmaj7 → C → (rien)');
  assert(labelVariants('Adim7')[1] === 'Adim', 'Adim7 conserve « dim » avant de tomber sur A');
  const variants = labelVariants('G7');
  assert(variants[variants.length - 2] === 'G',
         'la fondamentale est toujours l’avant-dernière forme');
});

// ── B. Aucune troncature ──

runTest('B. Aucune forme affichée n’est une troncature du symbole', () => {
  const symbols = ['F#m', 'Cmaj7', 'A#dim7', 'Bbm7', 'G', 'D7'];
  for (const symbol of symbols) {
    for (let width = 0; width <= 90; width += 3) {
      const { text } = fitChordLabel(symbol, width);
      if (text === '') continue;
      assert(labelVariants(symbol).includes(text),
             `${symbol} à ${width}px → « ${text} » est une forme prévue, pas un tronçon`)
        || null;
      if (!labelVariants(symbol).includes(text)) return;
    }
  }
  console.log('  ✅ toutes largeurs de 0 à 90 px, six symboles : aucune troncature');
});

runTest('B. La forme rendue tient réellement dans la place disponible', () => {
  for (const symbol of ['F#m7', 'Cmaj7', 'A', 'Bbdim7']) {
    for (let width = 6; width <= 120; width += 2) {
      const { text, fontPx } = fitChordLabel(symbol, width);
      if (!text) continue;
      const estimated = text.length * fontPx * 0.62;
      if (estimated > width - 6 + 0.001) {
        assert(false, `${symbol} à ${width}px : « ${text} » déborde (${estimated.toFixed(1)}px)`);
        return;
      }
    }
  }
  console.log('  ✅ la largeur estimée du texte ne dépasse jamais la pastille');
});

runTest('B. Plus il y a de place, plus la forme est complète', () => {
  const large = fitChordLabel('F#m7', 120);
  const moyen = fitChordLabel('F#m7', 34);
  const etroit = fitChordLabel('F#m7', 20);
  const minuscule = fitChordLabel('F#m7', 4);
  assert(large.text === 'F#m7' && !large.truncated, `120px → « ${large.text} » complet`);
  assert(moyen.text.length <= large.text.length, `34px → « ${moyen.text} »`);
  assert(etroit.text.length <= moyen.text.length, `20px → « ${etroit.text} »`);
  assert(minuscule.text === '', '4px → rien plutôt qu’un fragment illisible');
  assert(minuscule.truncated, 'le drapeau signale que le nom complet est ailleurs');
});

runTest('B. La taille de police reste dans les bornes annoncées', () => {
  for (let width = 4; width <= 200; width += 7) {
    const { fontPx } = fitChordLabel('Cmaj7', width);
    if (fontPx > LABEL_MAX_FONT_PX || fontPx < LABEL_MIN_FONT_PX) {
      assert(false, `${width}px → police ${fontPx}px hors bornes`);
      return;
    }
  }
  console.log(`  ✅ police toujours entre ${LABEL_MIN_FONT_PX} et ${LABEL_MAX_FONT_PX} px`);
});

// ── C. Le nom complet reste accessible ──

runTest('C. Le symbole complet reste dans l’infobulle et l’aria-label', () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(js.includes('block.title = `${effectiveChordStr}'),
         'l’infobulle porte le symbole complet, pas la forme réduite');
  assert(js.includes('`${effectiveChordStr}, ${ROLE_LABELS[segmentRole(chord)]'),
         'l’aria-label porte le symbole complet');
  assert(js.includes("block.classList.add('label-reduced')"),
         'une forme réduite est signalée par une classe dédiée');
  const css = read('src/ui/components/analyzer-workspace.css');
  assert(css.includes('.analyzer-timeline-block.label-reduced'),
         'la forme réduite a un style qui la signale');
});

// ── D. Plus aucune case vide ──
//
// Le « repli progressif » a été retiré le 25/10/2026. Un accord non structurel
// plus étroit que 26 px se réduisait à un trait pâle sans étiquette, et sur
// « Saint Esprit » un segment sur cinq se lisait comme un blanc. Narcisse :
// « les cases vides, tu me les enlèves. Je préfère avoir une étiquette parasite
// plutôt que de voir une case vide. »

runTest('D. Aucun accord ne se replie plus en marqueur muet', () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(!js.includes('const collapsed = detailedChords'),
         'la condition de repli a disparu');
  assert(!js.includes('COLLAPSE_MIN_WIDTH_PX'),
         'son seuil a disparu avec elle');
  assert(js.includes('LABEL_MIN_BLOCK_PX'),
         'une largeur minimale garantit à la place qu’une fondamentale tienne');
});

runTest('D. La frise est continue : chaque pastille rejoint la suivante', () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(js.includes('const nextStart = chords[index + 1]?.startTime ?? duration'),
         'la largeur se mesure jusqu’au début de la pastille suivante');
  assert(js.includes('const spanStart = index === 0 ? 0 : chord.startTime'),
         'la première pastille part de zéro');
  const minBlock = /const LABEL_MIN_BLOCK_PX = (\d+)/.exec(js);
  assert(minBlock !== null, 'la largeur minimale est déclarée');
  // Elle doit suffire à une fondamentale de deux caractères (« D# », « Bb »)
  // à la plus petite police : 2 × 10 × 0,62 + 6 px de marge intérieure.
  assert(Number(minBlock[1]) >= 19,
         `${minBlock[1]} px ne suffit pas à écrire « D# » à 10 px`);
  const fitted = fitChordLabel('D#m7', Number(minBlock[1]));
  assert(fitted.text !== '', 'à la largeur minimale, une étiquette s’affiche encore');
});

runTest('E. Lecteur — saut arrière court, indépendant du retour au début', () => {
  const html = read('src/index.html');
  assert(html.includes('id="analyzer-skip-back-btn"'), 'le bouton de saut arrière existe');
  assert(html.includes('id="analyzer-prev-btn"'), 'le retour au début existe toujours');

  const js = read('src/ui/analyzer-tab.js');
  assert(js.includes('function seekBy('), 'seekBy centralise le déplacement relatif');
  assert(js.includes('seekBy(-SKIP_SECONDS)'), 'le bouton recule d’un pas');
  const start = js.indexOf('function seekBy(');
  const body = js.slice(start, js.indexOf('\n}', start));
  assert(body.includes('Math.max(0'), 'le saut ne passe jamais avant le début');
  assert(body.includes('Math.min('), 'le saut ne dépasse jamais la fin');
  assert(!body.includes('play()') && !body.includes('pause()'),
         'sauter ne change pas l’état de lecture : on ne relance ni n’interrompt');
  assert(body.includes('updatePlaybackPosition'),
         'la timeline et l’accord courant suivent immédiatement');
});

runTest('E. Lecteur — les flèches ne volent pas le focus de la timeline', () => {
  const js = read('src/ui/analyzer-tab.js');
  const start = js.indexOf("if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')");
  assert(start > 0, 'les flèches sont câblées');
  const body = js.slice(start, js.indexOf('\n    }', start));
  assert(body.includes("classList?.contains('analyzer-timeline-block')"),
         'quand un bloc de la timeline a le focus, les flèches lui restent');
  assert(body.includes("tag === 'INPUT'"), 'les champs de saisie gardent les flèches');
});

// ── Bilan ──

console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('✅ Tous les tests de lisibilité et de navigation sont passés.');
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) en échec.`);
  process.exit(1);
}

// [Claude] — 2026-09-25 — Tests de la règle des couleurs du clavier (key-colors.js) :
// bleu = tes doigts, jaune = l'application (exemples, démos, relecture).
//
// Lancer : node src/ui/test-key-colors.js

import { lightKeyElement, unlightKeyElement, APP_KEY_CLASS, resolveAppKeyColor, DEFAULT_APP_KEY_COLOR } from './key-colors.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Touche factice : juste une liste de classes, comme classList. */
function fakeKey() {
  const set = new Set(['note', 'white']);
  return {
    set,
    classList: {
      add: (...names) => names.forEach((n) => set.add(n)),
      remove: (...names) => names.forEach((n) => set.delete(n)),
      toggle: (name, force) => (force ? set.add(name) : set.delete(name)),
    },
  };
}

const mine = fakeKey();
lightKeyElement(mine, false);
check('Touche jouée par le pianiste : allumée, sans le jaune', mine.set.has('active') && !mine.set.has(APP_KEY_CLASS));

const app = fakeKey();
lightKeyElement(app, true);
check('Touche jouée par l\'application : allumée en jaune', app.set.has('active') && app.set.has(APP_KEY_CLASS));

lightKeyElement(app, false);
check('Le pianiste rejoue une touche jaune : elle repasse en bleu', app.set.has('active') && !app.set.has(APP_KEY_CLASS));

lightKeyElement(app, true);
unlightKeyElement(app);
check('Touche relâchée : plus allumée, plus jaune', !app.set.has('active') && !app.set.has(APP_KEY_CLASS));
check('Les autres classes de la touche restent', app.set.has('note') && app.set.has('white'));

lightKeyElement(null, true);
unlightKeyElement(undefined);
check('Touche absente (clavier réduit) : rien ne casse', true);

// [Claude] — 2026-10-13 — Couleur de ce que joue l'application : choix personnel > couleur de l'application > jaune.
{
  const a = resolveAppKeyColor({ custom: null, accent: null });
  check('Aucune couleur choisie : le jaune d\'origine', a.color === DEFAULT_APP_KEY_COLOR && a.source === 'default');
  const b = resolveAppKeyColor({ custom: null, accent: '#ec4899' });
  check('Application en rose : ce que joue l\'application est rose', b.color === '#ec4899' && b.source === 'accent');
  const c = resolveAppKeyColor({ custom: '#2563eb', accent: '#ec4899' });
  check('Choix personnel (bleu) : il gagne sur le rose de l\'application', c.color === '#2563eb' && c.source === 'custom');
  const d = resolveAppKeyColor({ custom: 'bleu', accent: '#ec4899' });
  check('Valeur personnelle invalide ignorée', d.color === '#ec4899');
  check('Sans argument : jaune', resolveAppKeyColor().color === DEFAULT_APP_KEY_COLOR);
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} tests passés ===`);
process.exit(failed === 0 ? 0 : 1);

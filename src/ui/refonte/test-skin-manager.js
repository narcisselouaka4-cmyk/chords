/**
 * Tests — Infrastructure de bascule de thème v2 / Global.
 *
 * Vérifie le comportement décrit dans le document de mission (§2, §4) :
 *   · le sélecteur de thème bascule réellement entre v2 et Global ;
 *   · le choix est persisté et re-synchronise le sélecteur ;
 *   · une valeur invalide retombe sur le défaut sans casser ;
 *   · le câblage statique (index.html + theme.css) est en place.
 *
 * Pas de jsdom dans ce dépôt : on stube document / window / localStorage
 * à la main, comme src/ui/test-voicing-preview.js.
 *
 * Usage : node src/ui/refonte/test-skin-manager.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../..');
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
    console.error(`  ❌ exception : ${err && err.stack ? err.stack : err}`);
    failures++;
  }
}

/* ------------------------------------------------------------------ *
 *  Stubs navigateur minimalistes                                      *
 * ------------------------------------------------------------------ */
function makeElement(attrs = {}) {
  const store = { ...attrs };
  const listeners = {};
  return {
    _store: store,
    _listeners: listeners,
    dataset: {},
    getAttribute: (k) => (k in store ? store[k] : null),
    setAttribute: (k, v) => {
      store[k] = String(v);
    },
    addEventListener: (type, cb) => {
      (listeners[type] = listeners[type] || []).push(cb);
    },
    _emit: (type, evt) => {
      (listeners[type] || []).forEach((cb) => cb(evt));
    },
    querySelectorAll: () => [],
  };
}

function installBrowserStubs() {
  const htmlEl = makeElement({ 'data-skin': 'global' });
  const lsData = {};
  const winListeners = {};

  globalThis.document = {
    documentElement: htmlEl,
    getElementById: () => null,
  };
  globalThis.localStorage = {
    getItem: (k) => (k in lsData ? lsData[k] : null),
    setItem: (k, v) => {
      lsData[k] = String(v);
    },
    removeItem: (k) => {
      delete lsData[k];
    },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = (init && init.detail) || null;
    }
  };
  globalThis.window = {
    dispatchEvent: (evt) => {
      (winListeners[evt.type] || []).forEach((cb) => cb(evt));
      return true;
    },
    addEventListener: (type, cb) => {
      (winListeners[type] = winListeners[type] || []).push(cb);
    },
  };

  return { htmlEl, lsData, winListeners };
}

function cleanupBrowserStubs() {
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.CustomEvent;
}

/* ------------------------------------------------------------------ *
 *  Tests comportementaux                                              *
 * ------------------------------------------------------------------ */
const ctx = installBrowserStubs();
const { getSkin, setSkin, initSkin, SKINS, DEFAULT_SKIN } = await import('./skin-manager.js');

runTest('Défaut = global quand rien n\'est persisté', () => {
  assert(DEFAULT_SKIN === 'global', 'DEFAULT_SKIN vaut "global"');
  assert(getSkin() === 'global', 'getSkin() retourne "global" sans valeur stockée');
});

runTest('setSkin bascule réellement, persiste et notifie', () => {
  let notified = null;
  ctx.winListeners['app-skin-changed'] = [];
  globalThis.window.addEventListener('app-skin-changed', (e) => {
    notified = e.detail.skin;
  });

  const applied = setSkin('v2');
  assert(applied === 'v2', 'setSkin("v2") retourne "v2"');
  assert(ctx.htmlEl.getAttribute('data-skin') === 'v2', 'attribut data-skin passé à "v2" sur <html>');
  assert(ctx.lsData.skin === 'v2', 'choix persisté dans localStorage');
  assert(notified === 'v2', 'événement app-skin-changed émis avec le nouveau skin');

  setSkin('global');
  assert(ctx.htmlEl.getAttribute('data-skin') === 'global', 'retour à "global" fonctionne');
  assert(notified === 'global', 'événement émis à nouveau pour "global"');
});

runTest('getSkin relit la valeur persistée', () => {
  ctx.lsData.skin = 'v2';
  assert(getSkin() === 'v2', 'getSkin() relit "v2" depuis localStorage');
  ctx.lsData.skin = 'global';
});

runTest('Valeur invalide → repli sur le défaut, sans exception', () => {
  ctx.lsData.skin = 'neon-disco';
  assert(getSkin() === 'global', 'getSkin() ignore une valeur inconnue et retombe sur "global"');
  const applied = setSkin('neon-disco');
  assert(applied === 'global', 'setSkin() avec valeur inconnue applique "global"');
  assert(ctx.htmlEl.getAttribute('data-skin') === 'global', 'data-skin reste "global"');
});

runTest('SKINS contient exactement v2 et global', () => {
  assert(
    SKINS.length === 2 && SKINS.includes('v2') && SKINS.includes('global'),
    'SKINS = ["v2", "global"]',
  );
});

runTest('initSkin câble un sélecteur segmenté (aria-pressed + clic)', () => {
  setSkin('global');
  const buttons = [
    { dataset: { skinValue: 'global' }, _pressed: null, setAttribute(k, v) { if (k === 'aria-pressed') this._pressed = v; } },
    { dataset: { skinValue: 'v2' }, _pressed: null, setAttribute(k, v) { if (k === 'aria-pressed') this._pressed = v; } },
  ];
  let clickHandler = null;
  const selector = {
    querySelectorAll: (sel) => (sel === '[data-skin-value]' ? buttons : []),
    addEventListener: (type, cb) => {
      if (type === 'click') clickHandler = cb;
    },
  };

  initSkin({ selector });
  assert(buttons[0]._pressed === 'true', 'bouton "global" marqué aria-pressed=true au montage');
  assert(buttons[1]._pressed === 'false', 'bouton "v2" marqué aria-pressed=false au montage');

  // Simuler un clic sur "v2"
  clickHandler({ target: { closest: (sel) => (sel === '[data-skin-value]' ? buttons[1] : null) } });
  assert(ctx.htmlEl.getAttribute('data-skin') === 'v2', 'clic sur "v2" applique le skin v2');
  assert(buttons[1]._pressed === 'true' && buttons[0]._pressed === 'false', 'aria-pressed suit la sélection après clic');

  setSkin('global');
});

cleanupBrowserStubs();

/* ------------------------------------------------------------------ *
 *  Tests de câblage statique (le comportement ne suffit pas si le     *
 *  HTML / la CSS ne sont pas branchés)                                *
 * ------------------------------------------------------------------ */
runTest('index.html : data-skin sur <html> + boot script + <link> theme.css + sélecteur', () => {
  const html = read('src/index.html');
  assert(/<html[^>]*\sdata-skin="global"/.test(html), '<html> porte data-skin="global" par défaut');
  assert(
    html.includes("localStorage.getItem('skin')") && html.includes("setAttribute('data-skin'"),
    'le script inline lit localStorage.skin et pose data-skin avant les styles',
  );
  assert(
    html.includes('href="./ui/refonte/theme.css"'),
    'theme.css est chargé en <link> (cascade non-layered, la spécificité tranche)',
  );
  assert(html.includes('id="skin-selector"'), 'le sélecteur #skin-selector est présent dans Réglages');
  assert(
    html.includes('data-skin-value="global"') && html.includes('data-skin-value="v2"'),
    'les deux boutons de skin (global, v2) sont présents',
  );
});

runTest('theme.css : palette §1 + deux jeux de tokens de forme', () => {
  const css = read('src/ui/refonte/theme.css');
  assert(css.includes('--r-ground: #100c14') && css.includes('--r-accent: #8b6cf5'), 'palette §1 présente (--r-ground, --r-accent)');
  assert(/:root\[data-skin='v2'\]/.test(css), 'bloc de tokens :root[data-skin=\'v2\']');
  assert(/:root\[data-skin='global'\]/.test(css), 'bloc de tokens :root[data-skin=\'global\']');
  assert(
    css.includes('--r-radius-chip: 100px') && css.includes('--r-radius-chip: 5px'),
    'grammaire de forme divergente : pilule 100px (v2) vs 5px (Global)',
  );
  assert(css.includes('inset 3px 0 0 var(--r-accent)'), 'signature Global : filet d\'accent inséré à gauche (§5)');
});

runTest('main.js : polices + initSkin câblés', () => {
  const js = read('src/main.js');
  assert(js.includes("import './ui/refonte/refonte-fonts.js'"), 'polices importées');
  assert(js.includes('initSkin({ selector: document.getElementById(\'skin-selector\') })'), 'initSkin appelé avec le sélecteur');
});

/* ------------------------------------------------------------------ */
console.log('');
if (failures > 0) {
  console.error(`\n❌ ${failures} assertion(s) en échec.`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests skin-manager passent.');
}

// Les fonctions réelles du contrôleur sont exécutées sans ouvrir de dialogue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getTutorialFolder, saveTutorialFolder } from '../pedagogie/tutorial-folder-pref.js';

const source = readFileSync(new URL('./pedagogie-tab.js', import.meta.url), 'utf8');
function body(name) {
  const marker = source.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
}
function element(tag) {
  return {
    tag, attrs: {}, children: [], listeners: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(key, value) { this.listeners[key] = value; },
    appendChild(child) { this.children.push(child); },
    set innerHTML(value) { this.children = []; },
  };
}
function harness() {
  const store = new Map([['piano-jazz-tutorial-folder', '/old']]);
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const reads = [], notices = [], copies = [];
  const results = new Map([
    ['/old', { ok: false, reason: 'unapproved', files: [] }],
    ['/found', { ok: true, reason: null, files: [{ name: 'known.mp4', path: '/found/known.mp4' }, { name: 'new.mp4', path: '/found/new.mp4' }] }],
  ]);
  const context = vm.createContext({
    window: { electronAPI: { pedagogie: { selectTutorialFolder: async () => null } } },
    document: { createElement: element }, localStorage: storage,
    getTutorialFolder, saveTutorialFolder,
    legacy: null, legacyProblem: null, locatingLegacy: false,
    tutorials: [{ name: 'known.mp4' }], els: { legacyHint: element('div') },
    listTutorialFiles: async path => { reads.push(path); return results.get(path) || { ok: false, reason: 'missing', files: [] }; },
    getLibraryDir: async () => '/library',
    copyTutorialIntoFolder: async path => { copies.push(path); return { ok: true }; },
    importNotice: (...args) => notices.push(args),
  });
  vm.runInContext(['el', 'legacyFolder', 'detectLegacy', 'renderLegacyHint', 'locateLegacyFolder', 'importLegacy'].map(body).join('\n'), context);
  context.refreshTutorials = async () => { await context.detectLegacy('/library'); context.renderLegacyHint(); };
  return { context, store, reads, notices, copies, results };
}

{
  const h = harness(), c = h.context;
  await c.refreshTutorials();
  assert.equal(c.legacyProblem.reason, 'unapproved');
  const button = c.els.legacyHint.children[1];
  assert.equal(button.textContent, 'Retrouver le dossier');
  assert.equal('disabled' in button.attrs, false);
  await c.locateLegacyFolder(); // Annulation native.
  assert.equal(c.legacyFolder(), '/old');
  assert.equal(h.copies.length, 0);
  assert.equal(c.locatingLegacy, false);
  c.window.electronAPI.pedagogie.selectTutorialFolder = async () => '/found';
  await c.locateLegacyFolder();
  assert.equal(c.legacyFolder(), '/found');
  assert.equal(c.legacyProblem, null);
  assert.equal(c.legacy.files.length, 1); // La vidéo déjà présente est écartée.
  assert.equal(c.legacy.files[0].name, 'new.mp4');
  assert.equal(h.copies.length, 0); // La sélection seule n'importe rien.
  assert.match(c.els.legacyHint.children[0].textContent, /Reprendre mes 1 vidéo/);
  await c.importLegacy();
  assert.deepEqual(h.copies, ['/found/new.mp4']);
  assert.equal(c.legacyFolder(), ''); // Seulement après copie réussie.
}
{
  const h = harness(), c = h.context;
  await c.refreshTutorials();
  c.window.electronAPI.pedagogie.selectTutorialFolder = async () => '/missing';
  await c.locateLegacyFolder();
  assert.equal(c.legacyFolder(), '/old');
  assert.equal(h.notices.at(-1)[1], 'error');
  c.window.electronAPI.pedagogie.selectTutorialFolder = async () => { throw new Error('dialog failed'); };
  await c.locateLegacyFolder();
  assert.equal(c.legacyFolder(), '/old');
  assert.equal(c.locatingLegacy, false);
  assert.equal(h.copies.length, 0);
}
{
  const h = harness(), c = h.context;
  await c.refreshTutorials();
  let resolve, count = 0;
  c.window.electronAPI.pedagogie.selectTutorialFolder = () => { count++; return new Promise(done => { resolve = done; }); };
  const pending = c.locateLegacyFolder();
  await c.locateLegacyFolder();
  assert.equal(count, 1);
  assert.equal(c.els.legacyHint.children[1].attrs.disabled, '');
  resolve(null);
  await pending;
  assert.equal('disabled' in c.els.legacyHint.children[1].attrs, false);
}
{
  const h = harness(), c = h.context;
  await c.refreshTutorials();
  c.window.electronAPI.pedagogie.selectTutorialFolder = async () => '/found';
  await c.locateLegacyFolder();
  c.copyTutorialIntoFolder = async () => ({ ok: false });
  await c.importLegacy();
  assert.equal(c.legacyFolder(), '/found', 'une copie échouée ne fait pas oublier le dossier');
  assert.equal(h.notices.at(-1)[1], 'error');
}
{
  const h = harness(), c = h.context;
  h.store.clear();
  await c.refreshTutorials();
  assert.equal(c.legacyProblem, null);
  assert.equal(c.els.legacyHint.children.length, 0);
  assert.equal(h.reads.length, 0, 'pas de recherche externe sans ancien dossier');
}
console.log('Récupération : message, bouton actif, annulation, sélection, import explicite, erreurs, copie échouée et double clic OK.');

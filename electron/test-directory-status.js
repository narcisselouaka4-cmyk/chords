// Teste le vrai garde-fou et le vrai handler IPC, sans démarrer Electron.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
function body(name) {
  const start = source.indexOf(source.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
}
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pjc-directory-status-'));
try {
  const data = path.join(temp, 'data'), assets = path.join(temp, 'assets'), outside = path.join(temp, 'outside');
  for (const dir of [data, assets, outside]) await fs.mkdir(dir);
  await fs.writeFile(path.join(data, 'file.txt'), 'fixture');
  await fs.symlink(outside, path.join(data, 'escape'));
  let statCalls = 0;
  const approved = new Set(), handlers = new Map();
  const context = vm.createContext({
    path, APP_DATA_ROOT: data, APP_ASSETS_ROOT: assets, externallyApprovedPaths: approved,
    fs: { ...fs, stat: async p => { statCalls++; return fs.stat(p); } },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
  });
  const start = source.indexOf("ipcMain.handle('files:directory-status'");
  const end = source.indexOf("ipcMain.handle('files:ensure-dir'", start);
  assert.ok(start > 0 && end > start);
  vm.runInContext([body('isWithinRoot'), body('assertAllowedPath'), source.slice(start, end)].join('\n'), context);
  const status = async p => JSON.parse(JSON.stringify(await handlers.get('files:directory-status')(null, p)));
  assert.deepEqual(await status(data), { ok: true, reason: null });
  assert.deepEqual(await status(path.join(data, 'missing')), { ok: false, reason: 'missing' });
  assert.deepEqual(await status(path.join(data, 'file.txt')), { ok: false, reason: 'not-directory' });
  const before = statCalls;
  for (const p of [outside, path.join(data, 'escape'), path.join(data, 'escape/new'), '', null]) {
    assert.deepEqual(await status(p), { ok: false, reason: 'unapproved' });
  }
  assert.equal(statCalls, before, 'aucun stat après refus du garde-fou');
  assert.equal(approved.size, 0, 'le diagnostic ne crée aucune approbation');
  approved.add(outside); // Simule uniquement le résultat du sélecteur natif existant.
  assert.deepEqual(await status(outside), { ok: true, reason: null });
  assert.deepEqual(await status(path.join(temp, 'sibling')), { ok: false, reason: 'unapproved' });
  assert.equal(approved.size, 1);
  console.log('IPC : accès autorisé/refusé, absence, fichier, liens symboliques et aucune approbation implicite OK.');
} finally {
  await fs.rm(temp, { recursive: true, force: true }); // Seulement les fixtures de ce test.
}

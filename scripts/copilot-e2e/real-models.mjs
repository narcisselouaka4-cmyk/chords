// [Claude] — 2026-11-12 — Essai MANUEL avec les vraies clés de l'utilisateur (autorisé par Narcisse le
// 12/11/2026). Coûte de vrais appels chez les fournisseurs : ne pas lancer dans une suite automatique.
//
// Travaille sur une COPIE du profil Electron (les clés y restent chiffrées et ne sont jamais lues par
// ce script) et dans un dossier de données isolé. Pour chaque modèle : la même demande
// d'enrichissement sur une prise, la durée, et ce que l'application affiche.
//   node scripts/copilot-e2e/real-models.mjs DOSSIER_pjc-e2e-… SESSION_DIR provider|modele …
// Exemple de cible : "https://api.anthropic.com|claude-haiku-5-5"

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchIsolatedApp } from './isolated-electron.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const [root, sessionDir, ...targets] = process.argv.slice(2);
if (!root || !sessionDir || !targets.length) throw new Error('Usage : node scripts/copilot-e2e/real-models.mjs DOSSIER SESSION_DIR "baseUrl|modèle" …');
const REQUEST = 'Rends mes accords plus beaux.';
const events = JSON.parse(fs.readFileSync(path.join(sessionDir, 'events.json'), 'utf8'));
const take = { id: 'prise-essai', name: path.basename(sessionDir), duration: Math.max(...events.map((e) => e.time)), events };
const copilotDir = path.join(path.resolve(root), 'home', 'PianoJazzChords', 'PedagogieCopilot');
const report = [];
const out = path.join(path.resolve(root), 'rapport-vrais-modeles.json');
const save = () => fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), demande: REQUEST, prise: take.name, resultats: report }, null, 2));

const app = await launchIsolatedApp({ root, profileCopyFrom: path.join(os.userInfo().homedir, '.config', 'piano-jazz-chords'), devServer: true });
try {
  for (const [index, target] of targets.entries()) {
    const [baseUrl, model] = target.split('|');
    const id = `conv_${9000 + index}_essai`;
    fs.mkdirSync(copilotDir, { recursive: true });
    fs.writeFileSync(path.join(copilotDir, `${id}.json`), JSON.stringify({ version: 2, tutorialPath: '__copilot_autonomous__', updatedAt: new Date(Date.now() - 1000).toISOString(),
      messages: [{ role: 'user', content: `Essai ${model} : voici ma prise.`, take, timestamp: new Date().toISOString() }] }));
    // Le modèle à essayer devient actif DANS LA COPIE : la clé chiffrée du profil enregistré est reprise telle quelle.
    const switched = await app.page.evaluate(({ baseUrl, model, id }) => {
      const keys = JSON.parse(localStorage.getItem('piano-jazz-ai-keys') || '[]');
      const entry = keys.find((k) => new URL(k.baseUrl).origin === new URL(baseUrl).origin);
      if (!entry) return false;
      localStorage.setItem('piano-jazz-ai-config', JSON.stringify({ baseUrl: entry.baseUrl, apiKey: entry.apiKey, model, monthlyCap: 50 }));
      localStorage.setItem('pjc.copilot.conversations', JSON.stringify({ lastId: id, drafts: {} }));
      return true;
    }, { baseUrl, model, id });
    if (!switched) { report.push({ baseUrl, model, resultat: 'pas de clé enregistrée pour ce fournisseur' }); save(); continue; }
    await app.page.reload({ waitUntil: 'load' });
    await app.page.waitForFunction(() => Boolean(window.electronAPI?.files?.homeDir), { timeout: 30000 });
    await app.page.click('button[data-view="copilot"]');
    await sleep(1200);
    await app.page.click('#copilot-input');
    await app.page.keyboard.type(REQUEST, { delay: 3 });
    const started = Date.now();
    await app.page.keyboard.press('Enter');
    let reply = null;
    while (Date.now() - started < 240000) {
      await sleep(1000);
      reply = await app.page.evaluate(() => {
        const busy = document.getElementById('copilot-send-btn')?.getAttribute('aria-label') === 'Arrêter la réponse';
        const rows = [...document.querySelectorAll('#copilot-messages .tr-chat-message')];
        const last = rows.at(-1);
        return { busy, texte: (last?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600), carte: Boolean(last?.querySelector('.copilot-example-card, [class*="example"]')), partition: Boolean(last?.querySelector('.copilot-score')) };
      });
      // La dernière bulle doit être celle du Copilote (« V » d'avatar + « Vous » = la question).
      if (!reply.busy && reply.texte && !/^V?Vous/.test(reply.texte)) break;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    const ok = /préparée avec/.test(reply?.texte || '');
    report.push({ baseUrl, model, secondes: seconds, reussi: ok, carte: reply?.carte, partition: reply?.partition, reponse: reply?.texte });
    console.log(`${ok ? 'RÉUSSI' : 'ÉCHEC '} ${model.padEnd(36)} ${String(seconds).padStart(4)} s — ${(reply?.texte || '').slice(0, 150)}`);
    save();
    await app.page.screenshot({ path: path.join(path.resolve(root), `modele-${index + 1}.png`) }).catch(() => {});
  }
} finally {
  await app.stop();
  save();
  console.log(`Rapport : ${out}`);
}

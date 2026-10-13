// Tests — Réglages (13/10/2026) : ce qui a quitté le pied de page, l'en-tête, le clavier et le Studio.
//
// Usage : node src/ui/test-settings-layout.js

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');
const html = read('src/index.html');
const main = read('src/main.js');
const live = read('src/ui/live-reading.js');
let failed = 0;
let passed = 0;
function check(label, ok) {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}`); }
}
const inSettings = (id) => {
  const a = html.indexOf('id="app-settings-modal"');
  const b = html.indexOf('id="ai-settings-modal"');
  const at = html.indexOf(`id="${id}"`);
  return at > a && at < b;
};

check('Plus de pied de page', !html.includes('<footer class="app-footer">'));
check('Ports MIDI d\'entrée et de sortie, tolérance, couleur des notes, état : dans Réglages',
  ['midi-select', 'midi-output-select', 'tolerance', 'color-note', 'status-bar', 'midi-refresh'].every(inSettings));
check('« Couleur fondamentale » supprimée (champ et code)', !html.includes('color-tonic') && !main.includes("getElementById('color-tonic')") && !main.includes('els.colorTonic'));
check('La tolérance a quitté la barre du clavier', !/vk-toolbar[\s\S]*?id="tolerance"[\s\S]*?vk-status/.test(html));
check('Notation, Étendue et Transposition restent sur la barre du clavier', ['notation-select', 'keyboard-size', 'transpose'].every((id) => html.indexOf(`id="${id}"`) < html.indexOf('class="vk-status"')));
check('Plus de compteur « 1 note, 2 notes »', !html.includes('keyboard-note-count') && !read('src/ui/refonte/astra-shell.js').includes('keyboard-note-count'));
check('Le clavier virtuel sonne par défaut (Silencieux décoché)', /state\.silentMode = false;\s*els\.silentMode\.checked = false;/.test(main));
check('Plus de chiffre au centre de la roue', !/center\.textContent = active\.size/.test(live));
check('« Masquer » / « Afficher », « Afficher » par défaut', live.includes("hidden ? 'Afficher' : 'Masquer'") && /id="live-readouts-toggle"[^>]*>Afficher</.test(html) && /id="live-readouts" hidden/.test(html));
check('La clé API a quitté l\'en-tête ; elle s\'ouvre depuis Réglages',
  !html.includes('id="ai-settings-toggle"') && html.includes('id="app-settings-ai-btn"') && main.includes("getElementById('app-settings-ai-btn')"));
check('Le badge « Tutoriel » s\'appelle « Didacticiel »', html.includes('aria-label="Ouvrir le didacticiel"') && read('src/ui/onboarding.js').includes('>Didacticiel<'));
check('Studio : « Tout le traitement se fait sur votre ordinateur » retiré', !html.includes('Tout le traitement se fait sur votre ordinateur'));
check('Sessions MIDI : titre et sous-titre retirés', !html.includes('<h1>Sessions MIDI</h1>') && !html.includes('Le journal de votre jeu'));

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);

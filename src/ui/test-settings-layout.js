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
check('Ports MIDI d\'entrée et de sortie, tolérance, état : dans Réglages',
  ['midi-select', 'midi-output-select', 'tolerance', 'status-bar', 'midi-refresh'].every(inSettings));
check('« Couleur fondamentale » supprimée (champ et code)', !html.includes('color-tonic') && !main.includes("getElementById('color-tonic')") && !main.includes('els.colorTonic'));
check('La tolérance a quitté la barre du clavier', !/vk-toolbar[\s\S]*?id="tolerance"[\s\S]*?vk-status/.test(html));
check('Notation, Étendue et Transposition restent sur la barre du clavier', ['notation-select', 'keyboard-size', 'transpose'].every((id) => html.indexOf(`id="${id}"`) < html.indexOf('class="vk-status"')));
check('Plus de compteur « 1 note, 2 notes »', !html.includes('keyboard-note-count') && !read('src/ui/refonte/astra-shell.js').includes('keyboard-note-count'));
check('Le clavier virtuel sonne par défaut (Silencieux décoché)', /state\.silentMode = false;\s*els\.silentMode\.checked = false;/.test(main));
check('Plus de chiffre au centre de la roue', !/center\.textContent = active\.size/.test(live));
check('« Masquer » / « Afficher » ; caractéristiques VISIBLES par défaut (bouton « Masquer »)', live.includes("hidden ? 'Afficher' : 'Masquer'") && /id="live-readouts-toggle"[^>]*>Masquer</.test(html) && !/id="live-readouts" hidden/.test(html) && live.includes('let hidden = false;'));
check('Plus de lecture d\'accord sur la barre du clavier dans le Temps réel', read('src/ui/refonte/astra-keyboard.css').includes("[data-training-view='realtime']") && read('src/ui/refonte/astra-keyboard.css').includes('.vk-readout { display: none; }'));
check('PC → MIDI et Silencieux sont à droite de la barre du clavier (avec le bouton de repli)', /class="vk-group vk-right">\s*<!--[\s\S]*?class="vk-switches"/.test(html));
check('La clé API a quitté l\'en-tête ; elle s\'ouvre depuis Réglages',
  !html.includes('id="ai-settings-toggle"') && html.includes('id="app-settings-ai-btn"') && main.includes("getElementById('app-settings-ai-btn')"));
check('Le badge « Tutoriel » s\'appelle « Didacticiel »', html.includes('aria-label="Ouvrir le didacticiel"') && read('src/ui/onboarding.js').includes('>Didacticiel<'));
check('Studio : « Tout le traitement se fait sur votre ordinateur » retiré', !html.includes('Tout le traitement se fait sur votre ordinateur'));
check('Sessions MIDI : titre et sous-titre retirés', !html.includes('<h1>Sessions MIDI</h1>') && !html.includes('Le journal de votre jeu'));
check('Une barre de recherche dans chaque bibliothèque (Studio, Analyse, Coach, Copilote, Sessions MIDI, Pédagogie IA, Exercices)',
  ['studio-library-search', 'analyzer-library-search', 'coach-library-search', 'copilot-history-search', 'midi-session-search', 'pedagogie-library-search'].every((id) => html.includes(`id="${id}"`))
  && html.includes('exercise-library-search') && main.includes("attachListSearch({ input: document.getElementById(input)"));
check('« Couleur des notes » supprimée de Réglages et de partout ; la légende Toi / L\'app règle les couleurs d\'un clic',
  !html.includes('id="color-note"') && html.includes('id="color-you"') && html.includes('id="color-app"') && /vk-legend-pick[^>]*>[^<]*<i class="vk-dot vk-dot-you"/.test(html));
check('Couleur générale de l\'application : pastilles dans Réglages › Apparence, branchée au démarrage',
  html.includes('id="accent-presets"') && html.includes('id="accent-custom"') && main.includes('initAccentTheme'));

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);

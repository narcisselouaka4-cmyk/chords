// Tests — Réglages : page pleine + clés API (19/10/2026).
//
// Trois demandes de Narcisse, vérifiées ici :
//   1. Réglages est une page qui remplace l'onglet actif, pas une fenêtre flottante qui floute
//      le reste, et elle s'arrête au clavier virtuel sans le dépasser.
//   2. La clé API se déroule en accordéon sur cette même page, pas dans une fenêtre à part.
//   3. On choisit une clé déjà enregistrée dans une liste au lieu de la retaper, et des
//      fournisseurs présélectionnés proposent un vrai lien « Générer une clé ».
//
// Usage : node src/ui/test-ai-keys-settings.js

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');

let failed = 0;
let passed = 0;
function check(label, ok) {
  if (ok) { passed += 1; console.log(`✅ ${label}`); } else { failed += 1; console.error(`❌ ${label}`); }
}

// ── A. Réglages est une page, pas une fenêtre flottante ────────────────────

{
  const html = read('src/index.html');
  const settingsStart = html.indexOf('id="app-settings-modal"');
  const settingsTagStart = html.lastIndexOf('<div', settingsStart);
  const settingsOpenTag = html.slice(settingsTagStart, html.indexOf('>', settingsTagStart) + 1);

  check('#app-settings-modal n\'a plus la classe .modal-overlay (fenêtre flottante)',
    !/class="[^"]*\bmodal-overlay\b/.test(settingsOpenTag));
  check('#app-settings-modal porte .app-settings-page (page pleine, CSS dédié)',
    /class="[^"]*\bapp-settings-page\b/.test(settingsOpenTag));
  check('Plus de fenêtre séparée #ai-settings-modal', !html.includes('id="ai-settings-modal"'));
  check('Plus de .tr-overlay pour la clé API (ancienne fenêtre à part)',
    !/class="tr-overlay" id="ai-settings-modal"/.test(html));

  // Réglages doit vivre juste avant #keyboard-panel dans le DOM : comme les trois onglets, c'est
  // un enfant flex direct de #app, positionné pour occuper le même espace (sous l'en-tête,
  // au-dessus du clavier) sans jamais le recouvrir — voir theme.css et initAppSettings (main.js).
  const keyboardPanelIdx = html.indexOf('id="keyboard-panel"');
  const studioTabCloseIdx = html.indexOf('</main>', html.indexOf('id="studio-tab"'));
  check('#app-settings-modal est positionné après les trois onglets, juste avant #keyboard-panel',
    settingsStart > studioTabCloseIdx && settingsStart < keyboardPanelIdx);
}

// ── B. L'accordéon inline de la clé API ─────────────────────────────────────

{
  const html = read('src/index.html');
  check('app-settings-ai-btn contrôle ai-key-panel (aria-controls)',
    /id="app-settings-ai-btn"[^>]*aria-controls="ai-key-panel"/.test(html));
  check('app-settings-ai-btn a aria-expanded (état déplié/replié)',
    /id="app-settings-ai-btn"[^>]*aria-expanded="false"/.test(html));
  check('ai-key-panel est replié par défaut (hidden)',
    /id="ai-key-panel" hidden/.test(html));
  check('ai-key-panel a un unique enfant mesurable pour l\'animation grid-template-rows',
    /id="ai-key-panel" hidden>\s*<div class="ai-key-panel-inner">/.test(html));

  const css = read('src/ui/refonte/theme.css');
  check('.ai-key-panel anime sa hauteur (grid-template-rows 0fr → .is-open 1fr)',
    css.includes('.ai-key-panel {') && css.includes('grid-template-rows: 0fr')
    && css.includes('.ai-key-panel.is-open') && css.includes('grid-template-rows: 1fr'));
  check('L\'animation de l\'accordéon respecte prefers-reduced-motion',
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.ai-key-panel \{ transition: none; \}/.test(css));

  const mainJs = read('src/main.js');
  check('initSettingsAccordion (générique) bascule aria-expanded + hidden au clic sur le bouton',
    /function initSettingsAccordion\(toggleId, panelId[\s\S]*?setExpanded\(!expanded\)/.test(mainJs));
  check('initAISettings utilise l\'accordéon générique (app-settings-ai-btn, ai-key-panel)',
    mainJs.includes("initSettingsAccordion('app-settings-ai-btn', 'ai-key-panel'"));
  check('Plus de références aux ids de l\'ancienne fenêtre (aiPreset, aiCancelBtn, aiSettingsModal)',
    !mainJs.includes('aiPreset') && !mainJs.includes('aiCancelBtn') && !mainJs.includes('aiSettingsModal'));

  // [Claude] — 2026-10-20 — Narcisse : « masque Apparence à l'aide d'un bouton Apparence, et le
  // contenu de Clavier et MIDI aussi » — même accordéon que la clé API, généralisé aux trois
  // sections de Réglages. Le bouton EST le titre de la section (plus de <h4> séparé).
  for (const [label, toggleId, panelId] of [
    ['Apparence', 'settings-appearance-toggle', 'settings-appearance-panel'],
    ['Clavier et MIDI', 'settings-midi-toggle', 'settings-midi-panel'],
  ]) {
    check(`${label} : bouton-titre replié par défaut, contrôle son panneau`,
      new RegExp(`id="${toggleId}"[^>]*aria-expanded="false"[^>]*aria-controls="${panelId}"`).test(html)
      || new RegExp(`id="${toggleId}"[^>]*aria-controls="${panelId}"[^>]*aria-expanded="false"`).test(html));
    check(`${label} : panneau replié par défaut (hidden)`,
      new RegExp(`id="${panelId}" hidden`).test(html));
    check(`${label} : main.js câble l'accordéon générique sur ce bouton/panneau`,
      mainJs.includes(`initSettingsAccordion('${toggleId}', '${panelId}')`));
  }
  check('Plus de <h4> séparé pour Apparence / Clavier et MIDI (le bouton-titre les remplace)',
    !/<h4 class="settings-section-title">Apparence<\/h4>/.test(html)
    && !/<h4 class="settings-section-title">Clavier et MIDI<\/h4>/.test(html));
}

// ── C. Réglages masque l'onglet actif à l'ouverture, le restaure à la fermeture ─

{
  const mainJs = read('src/main.js');
  check('initAppSettings masque l\'onglet actif à l\'ouverture de Réglages',
    /const open = \(\{ focusAI = false \} = \{\}\) => \{[\s\S]*?activeTab\.style\.display = 'none'/.test(mainJs));
  check('initAppSettings restaure l\'onglet masqué à la fermeture',
    /const close = \(restoreFocus = true\) => \{[\s\S]*?hiddenTabEl\.style\.removeProperty\('display'\)/.test(mainJs));
  check('app-open-ai-settings (Copilote) ouvre Réglages ET déplie directement la clé API',
    /app-open-ai-settings', \(\) => open\(\{ focusAI: true \}\)\)/.test(mainJs));

  // [Claude] — 2026-10-19 — Bug réel signalé par Narcisse : ouvrir Réglages puis cliquer un
  // bouton de navigation (Analyse, Studio…) rendait l'onglet visible SANS fermer Réglages — les
  // deux se superposaient, chacun flex:1, se partageant l'espace au lieu de l'un remplaçant
  // l'autre. switchToTab est le point de passage unique (clic direct sur #tab-nav ET évènement
  // app-switch-tab) : il doit signaler à Réglages de se fermer avant de rendre l'onglet visible.
  check('switchToTab signale à Réglages de se fermer AVANT de rendre l\'onglet visible (applyTabVisibility)',
    /function switchToTab\(tab\) \{[\s\S]*?dispatchEvent\(new CustomEvent\('app-settings-force-close'\)\)[\s\S]*?applyTabVisibility\(/.test(mainJs));
  check('initAppSettings écoute app-settings-force-close et ferme si ouverte',
    /app-settings-force-close', \(\) => \{\s*if \(modal\.style\.display === 'flex'\) close\(false\);/.test(mainJs));
}

// ── D. Fournisseurs présélectionnés avec un vrai lien « Générer une clé » ──

{
  const cfg = read('src/ai/openai-config.js');
  check('PRESETS inclut Groq, OpenRouter, Google AI Studio et OpenAI',
    ['Groq', 'OpenRouter', 'Google AI Studio', 'OpenAI'].every((n) => cfg.includes(`name: '${n}'`)));
  check('Chaque préréglage a un genUrl (page où générer une clé chez le fournisseur)',
    (cfg.match(/genUrl: 'https:\/\//g) || []).length >= 5);
  check('EXTERNAL_PROVIDER_LINKS propose Anthropic (Claude) sans préréglage baseUrl inventé',
    cfg.includes('EXTERNAL_PROVIDER_LINKS') && cfg.includes("name: 'Anthropic (Claude)'"));

  const mainJs = read('src/main.js');
  check('renderProviders() construit une carte par préréglage avec un bouton « Générer une clé »',
    mainJs.includes("genBtn.textContent = 'Générer une clé →'"));
  check('Le clic sur une carte remplit baseUrl + model (sélection du fournisseur)',
    /card\.addEventListener\('click', \(\) => \{[\s\S]*?els\.aiBaseUrl\.value = preset\.baseUrl/.test(mainJs));
}

// ── E. Liens externes : liste fermée côté main, pas une URL arbitraire du renderer ──

{
  const preload = read('electron/preload.cjs');
  check('preload expose openExternal, relayé vers app:open-external',
    preload.includes("openExternal: (url) => ipcRenderer.invoke('app:open-external', url)"));

  const electronMain = read('electron/main.js');
  const allowlistMatch = electronMain.match(/ALLOWED_EXTERNAL_URLS = new Set\(\[([\s\S]*?)\]\);/);
  check('electron/main.js refuse une URL hors de la liste fermée (ALLOWED_EXTERNAL_URLS)',
    !!allowlistMatch && electronMain.includes('if (!ALLOWED_EXTERNAL_URLS.has(rawUrl))'));

  const cfg = read('src/ai/openai-config.js');
  const genUrls = [...cfg.matchAll(/genUrl: '(https:\/\/[^']+)'/g)].map((m) => m[1]);
  check('La liste fermée du processus principal contient exactement les genUrl du renderer (5)',
    !!allowlistMatch && genUrls.length === 5
    && genUrls.every((u) => allowlistMatch[1].includes(`'${u}'`)));
}

// ── F. Clés enregistrées — comportement réel (pas seulement du texte source) ──

await (async () => {
  globalThis.window = {};
  // saveAIConfig() dispatche un évènement sur `document` — toujours présent aux côtés de `window`
  // dans un vrai navigateur ; un simple témoin suffit ici.
  globalThis.document = { dispatchEvent: () => {} };
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  const mod = await import(`${pathToFileURL('src/ai/openai-config.js')}`);
  const { listSavedKeys, saveNamedKey, activateSavedKey, deleteSavedKey, getAIConfig } = mod;

  check('Aucune clé enregistrée au départ', listSavedKeys().length === 0);

  const id1 = await saveNamedKey({ label: 'Ma clé Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_test_1', model: 'openai/gpt-oss-20b' });
  check('saveNamedKey ajoute un profil', listSavedKeys().length === 1 && listSavedKeys()[0].id === id1);
  check('Le profil enregistré ne garde pas la clé en clair dans la liste (listSavedKeys)',
    !('apiKey' in listSavedKeys()[0]));

  // Même baseUrl qu'une entrée existante : mise à jour en place, pas de doublon.
  const id2 = await saveNamedKey({ label: 'Ma clé Groq (renommée)', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_test_2', model: 'openai/gpt-oss-120b' });
  check('Un deuxième enregistrement avec le même baseUrl met à jour le profil au lieu de dupliquer',
    id2 === id1 && listSavedKeys().length === 1 && listSavedKeys()[0].label === 'Ma clé Groq (renommée)');

  const id3 = await saveNamedKey({ label: 'Ma clé OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test', model: 'meta-llama/llama-3.1-8b-instruct:free' });
  check('Un baseUrl différent crée bien une deuxième entrée', listSavedKeys().length === 2 && id3 !== id1);

  const activated = await activateSavedKey(id3);
  check('activateSavedKey pose la clé choisie comme config active', activated.apiKey === 'sk-or-test' && activated.baseUrl === 'https://openrouter.ai/api/v1');
  check('getAIConfig() reflète bien l\'activation', getAIConfig().apiKey === 'sk-or-test');

  deleteSavedKey(id1);
  check('deleteSavedKey retire le profil visé', listSavedKeys().length === 1 && listSavedKeys()[0].id === id3);
  check('deleteSavedKey laisse les autres profils intacts', listSavedKeys()[0].id === id3);
})();

// ── G. Refonte 22/10 — clés enregistrées visibles, plus de champ Nom ──
// Narcisse : « je ne sais absolument pas où récupérer les clés API
// enregistrées » + « le nom, on n'en a pas besoin ».

{
  const html = read('src/index.html');
  check('Plus de champ "Nom" dans le formulaire de clé', !html.includes('id="ai-key-label"'));
  check('#ai-keys-list existe : la liste des clés enregistrées, pas un <select> caché',
    html.includes('id="ai-keys-list"'));
  check('Plus de <select> de clés enregistrées (remplacé par la liste)', !html.includes('id="ai-saved-keys"'));
  check('#ai-new-key-form regroupe le formulaire d’ajout, replié par défaut dans le markup statique',
    /id="ai-new-key-form" hidden/.test(html));
  {
    const formStart = html.indexOf('id="ai-new-key-form"');
    const formEnd = html.indexOf('class="ai-form-section"', formStart);
    const formSlice = html.slice(formStart, formEnd);
    check('Le formulaire d’ajout ne contient plus que Adresse + Modèle + Clé API (3 champs, pas 4)',
      (formSlice.match(/<input/g) || []).length === 3);
  }

  const mainJs = read('src/main.js');
  check('Plus de référence à aiKeyLabel dans main.js', !mainJs.includes('aiKeyLabel'));
  check('saveNamedKey est appelé sans label (déduit automatiquement du fournisseur)',
    /await saveNamedKey\(\{\s*baseUrl: gathered\.baseUrl/.test(mainJs));
  check('renderSavedKeys construit une ligne par clé avec activation au clic (ai-key-row-activate)',
    mainJs.includes('ai-key-row-activate') && mainJs.includes('activateSavedKey(k.id)'));
  check('Chaque ligne a un bouton de suppression dédié (ai-key-row-delete)',
    mainJs.includes('ai-key-row-delete') && mainJs.includes('deleteSavedKey(k.id)'));
  check('Le formulaire d’ajout s’ouvre seul quand aucune clé n’existe, se replie sinon',
    mainJs.includes('setNewKeyFormOpen(keys.length === 0)'));
  check('Un bouton "+ Ajouter une clé" permet de rouvrir le formulaire sans tout retaper',
    mainJs.includes('ai-key-add-btn') && mainJs.includes("setNewKeyFormOpen(newKeyForm?.hidden !== false)"));
}

function pathToFileURL(relPath) {
  return new URL(relPath, `file://${root}/`).href;
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);

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
  check('PRESETS inclut Groq, OpenRouter, Google AI Studio, OpenAI et Anthropic (Claude)',
    ['Groq', 'OpenRouter', 'Google AI Studio', 'OpenAI', 'Anthropic (Claude)'].every((n) => cfg.includes(`name: '${n}'`)));
  check('Chaque préréglage a un genUrl (page où générer une clé chez le fournisseur)',
    (cfg.match(/genUrl: 'https:\/\//g) || []).length >= 5);
  // [Claude] — 2026-11-10 — Anthropic a désormais un vrai préréglage : son schéma natif
  // (Messages API) est traduit par anthropic-adapter.js, transparent pour callChatCompletions.
  check('Le préréglage Anthropic (Claude) pointe vers api.anthropic.com avec de vrais modèles Claude',
    /name: 'Anthropic \(Claude\)',[\s\S]{0,200}?baseUrl: 'https:\/\/api\.anthropic\.com'/.test(cfg)
    && cfg.includes('models: ANTHROPIC_RECOMMENDED'));
  check('anthropic-adapter.js traduit requête (toAnthropicBody) et réponse (fromAnthropicResponse)',
    cfg.includes('toAnthropicBody') && cfg.includes('fromAnthropicResponse'));

  const mainJs = read('src/main.js');
  check('renderProviders() construit une carte par préréglage avec un bouton « Générer une clé »',
    mainJs.includes("genBtn.textContent = 'Générer une clé →'"));
  // [Claude] — 2026-11-10 — selectProviderPreset() factorise le remplissage (baseUrl + modèle) :
  // repris par le clic sur la carte ET par « Générer une clé » (voir plus bas), au lieu d'être
  // écrit en dur dans le seul listener de la carte.
  check('Le clic sur une carte remplit baseUrl + model (via selectProviderPreset)',
    /const selectProviderPreset = \(\) => \{[\s\S]*?els\.aiBaseUrl\.value = preset\.baseUrl/.test(mainJs)
    && /card\.addEventListener\('click', \(\) => \{\s*selectProviderPreset\(\);/.test(mainJs));
  // [Claude] — 2026-11-10 — Narcisse : « j'appuie sur générer une clé, ça me renvoie à la page,
  // mais il faudrait que l'adresse de l'API se remplisse automatiquement — pour un pianiste,
  // remplir l'adresse, c'est pas à sa portée ». « Générer une clé » faisait AVANT seulement
  // openExternal (e.stopPropagation() empêchait le remplissage du clic sur la carte) : il fait
  // maintenant aussi le remplissage, via la même fonction que le clic sur la carte.
  check('« Générer une clé » remplit aussi baseUrl + modèle (pas seulement ouvrir la page)',
    /genBtn\.addEventListener\('click', \(e\) => \{\s*e\.stopPropagation\(\);\s*selectProviderPreset\(\);\s*openExternal\(preset\.genUrl\);/.test(mainJs));
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
  const {
    listSavedKeys, saveNamedKey, activateSavedKey, activateSavedKeyModel, addModelToSavedKey,
    removeModelFromSavedKey, deleteSavedKey, getAIConfig,
  } = mod;

  check('Aucune clé enregistrée au départ', listSavedKeys().length === 0);

  const id1 = await saveNamedKey({ label: 'Ma clé Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_test_1', model: 'openai/gpt-oss-20b' });
  check('saveNamedKey ajoute un profil', listSavedKeys().length === 1 && listSavedKeys()[0].id === id1);
  check('Le profil enregistré ne garde pas la clé en clair dans la liste (listSavedKeys)',
    !('apiKey' in listSavedKeys()[0]));

  // [Claude] — 2026-11-10 — Narcisse : changer de modèle sur une clé déjà enregistrée ne doit
  // PAS obliger à tout retaper, ni perdre le modèle précédent — les deux doivent rester
  // proposables (c'est tout le problème qu'il a signalé avec sa clé Ollama : Nemotron, Beam,
  // GPT-OSS doivent tous les trois rester choisissables, pas écrasés l'un par l'autre).
  const id2 = await saveNamedKey({ label: 'Ma clé Groq (renommée)', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_test_2', model: 'openai/gpt-oss-120b' });
  check('Un deuxième enregistrement avec le même baseUrl met à jour le profil au lieu de dupliquer',
    id2 === id1 && listSavedKeys().length === 1 && listSavedKeys()[0].label === 'Ma clé Groq (renommée)');
  check('Le nouveau modèle s’ajoute à l’historique de la clé SANS effacer le précédent',
    listSavedKeys()[0].models.includes('openai/gpt-oss-20b') && listSavedKeys()[0].models.includes('openai/gpt-oss-120b'));

  const id3 = await saveNamedKey({ label: 'Ma clé OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test', model: 'fixture/model-a' });
  check('Un baseUrl différent crée bien une deuxième entrée', listSavedKeys().length === 2 && id3 !== id1);

  const activated = await activateSavedKey(id3);
  check('activateSavedKey pose la clé choisie comme config active', activated.apiKey === 'sk-or-test' && activated.baseUrl === 'https://openrouter.ai/api/v1');
  check('getAIConfig() reflète bien l\'activation', getAIConfig().apiKey === 'sk-or-test');

  const activatedModel = await activateSavedKeyModel(id1, 'openai/gpt-oss-20b');
  check('activateSavedKeyModel active un modèle précis de la clé, sans toucher à son adresse/sa clé',
    activatedModel.baseUrl === 'https://api.groq.com/openai/v1' && activatedModel.apiKey === 'gsk_test_2'
    && activatedModel.model === 'openai/gpt-oss-20b');

  addModelToSavedKey(id3, 'fixture/model-b');
  check('addModelToSavedKey ajoute un modèle à une clé existante sans créer de nouvelle entrée',
    listSavedKeys().length === 2 && listSavedKeys().find((k) => k.id === id3).models.includes('fixture/model-b'));
  addModelToSavedKey(id3, 'fixture/model-b');
  check('addModelToSavedKey n’ajoute pas de doublon si le modèle y est déjà',
    listSavedKeys().find((k) => k.id === id3).models.filter((m) => m === 'fixture/model-b').length === 1);

  // [Claude] — 2026-11-10 — Une clé enregistrée sur l'adresse d'un préréglage connu (Anthropic,
  // Groq…) propose tout de suite TOUS ses modèles connus, pas seulement celui utilisé au premier
  // enregistrement (Narcisse : « quand je clique sur api.anthropic.com, il doit y avoir un
  // modèle ou plusieurs »).
  const idAnthropic = await saveNamedKey({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-test', model: 'claude-haiku-4-5-20251001' });
  const anthropicEntry = listSavedKeys().find((k) => k.id === idAnthropic);
  check('Une clé sur l’adresse d’un préréglage connu propose directement ses 3 modèles, pas qu’un seul',
    // 12/11 : le préréglage ne propose plus que les modèles vérifiés ; celui enregistré reste.
    anthropicEntry.models.includes('claude-haiku-4-5-20251001')
    && anthropicEntry.models.includes('claude-sonnet-5')
    && anthropicEntry.models.includes('claude-opus-5-5'));

  // [Claude] — 2026-11-10 — Narcisse : « faut qu'on puisse supprimer des modèles aussi ».
  removeModelFromSavedKey(id3, 'fixture/model-b');
  check('removeModelFromSavedKey retire un modèle ajouté manuellement (fournisseur libre)',
    !listSavedKeys().find((k) => k.id === id3).models.includes('fixture/model-b'));
  check('…sans retirer les autres modèles de la même clé',
    listSavedKeys().find((k) => k.id === id3).models.includes('fixture/model-a'));
  removeModelFromSavedKey(idAnthropic, 'claude-opus-5');
  check('removeModelFromSavedKey masque aussi un modèle de PRÉRÉGLAGE (sinon la fusion PRESETS.models le ferait revenir)',
    !listSavedKeys().find((k) => k.id === idAnthropic).models.includes('claude-opus-5'));
  check('…les autres modèles du préréglage restent proposés',
    listSavedKeys().find((k) => k.id === idAnthropic).models.includes('claude-sonnet-5'));

  deleteSavedKey(id1);
  check('deleteSavedKey retire le profil visé', listSavedKeys().length === 2 && !listSavedKeys().some((k) => k.id === id1));
  check('deleteSavedKey laisse les autres profils intacts', listSavedKeys().some((k) => k.id === id3));

  // [Claude] — 2026-11-10 — Narcisse : « ça sert à rien de mettre une limite [...] ce qui
  // pourrait être utile, ce serait de mettre combien d'appels on a fait par mois ». Le
  // compteur existait déjà (usage-cap.js) mais incrementMonthlyUsage() n'était appelée
  // NULLE PART dans tout le code avant ce lot — « 0 / 50 ce mois » ne bougeait jamais.
  const usageMod = await import(`${pathToFileURL('src/ai/usage-cap.js')}`);
  check('getMonthlyUsage commence à 0', usageMod.getMonthlyUsage() === 0);
  usageMod.incrementMonthlyUsage();
  usageMod.incrementMonthlyUsage();
  check('incrementMonthlyUsage compte réellement les appels', usageMod.getMonthlyUsage() === 2);
  check('getMonthlyUsageHistory retrouve ce même mois avec son compte',
    usageMod.getMonthlyUsageHistory().some((h) => h.count === 2));

  const cfg = read('src/ai/openai-config.js');
  check('callChatCompletions incrémente le compteur réel sur un appel réussi (les deux chemins : IPC Electron et fetch direct)',
    (cfg.match(/incrementMonthlyUsage\(\)/g) || []).length >= 3);
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
  // [Claude] — 2026-11-10 — Narcisse : cliquer une clé enregistrée doit dérouler SES
  // modèles (un par modèle déjà utilisé sous cette adresse/clé), pas l'activer
  // silencieusement avec celui sauvé en dernier — sinon changer de modèle oblige à
  // tout retaper. « Ajouter une clé » redevient strictement une nouvelle clé API :
  // formulaire vierge (resetNewKeyForm), jamais une case d'ajout de modèle.
  check('renderSavedKeys déroule les modèles d’une clé au clic (pas une activation silencieuse)',
    mainJs.includes('ai-key-row-models') && mainJs.includes('expandedKeyId === k.id ? null : k.id'));
  check('Chaque modèle d’une clé s’active d’un clic (activateSavedKeyModel), sans rien retaper',
    mainJs.includes('ai-key-row-model') && mainJs.includes('activateSavedKeyModel(k.id, m)'));
  check('« + Ajouter un modèle » ajoute un modèle à LA CLÉ existante (addModelToSavedKey), pas une nouvelle clé',
    mainJs.includes('ai-key-row-model-add') && mainJs.includes('addModelToSavedKey(k.id, value)'));
  check('Chaque modèle d’une clé a son propre bouton de retrait (removeModelFromSavedKey), distinct de la suppression de la clé',
    mainJs.includes('ai-key-row-model-remove') && mainJs.includes('removeModelFromSavedKey(k.id, m)'));
  // [Claude] — 2026-11-10 — Deuxième refonte : le <datalist> natif posait sa liste comme une
  // fenêtre à part mal ancrée au défilement (Narcisse : « on a l'impression qu'elle est fixée sur
  // l'écran »), sans rien montrer tant qu'on n'avait pas commencé à taper. Remplacé par un menu
  // maison (attachModelCombobox) : un <div> frère du champ, positionné par rapport à lui — il
  // suit donc le champ au défilement — qui montre TOUS les modèles connus dès le clic (focus),
  // puis les filtre en tapant.
  check('Plus de <datalist> natif pour les modèles (remplacé par un menu maison)',
    !html.includes('id="ai-model-suggestions"') && !mainJs.includes('ai-model-suggestions'));
  check('Les suggestions sont limitées au fournisseur du champ concerné',
    mainJs.includes('getProviderModels(getBaseUrl())') && !mainJs.includes('allKnownModels'));
  check('Ajouter un modèle utilise le fournisseur de la clé, même si une autre clé est active',
    mainJs.includes('attachModelCombobox(input, () => k.baseUrl)'));
  check('attachModelCombobox montre tous les modèles dès le clic (focus), pas seulement en tapant',
    /input\.addEventListener\('focus', \(\) => render\(''\)\)/.test(mainJs));
  check('Le menu se filtre en tapant, dans une boîte ancrée au champ (ai-model-suggest-box)',
    mainJs.includes('ai-model-suggest-box') && /input\.addEventListener\('input', \(\) => render\(input\.value\)\)/.test(mainJs));
  check('Le champ Modèle du formulaire d’ajout ET « + Ajouter un modèle » utilisent ce même menu',
    (mainJs.match(/attachModelCombobox\(/g) || []).length >= 2);
  check('Chaque ligne a un bouton de suppression dédié (ai-key-row-delete)',
    mainJs.includes('ai-key-row-delete') && mainJs.includes('deleteSavedKey(k.id)'));
  check('Le formulaire d’ajout s’ouvre seul quand aucune clé n’existe, se replie sinon',
    mainJs.includes('setNewKeyFormOpen(keys.length === 0)'));
  check('"+ Ajouter une clé" réinitialise le formulaire à vide avant de l’ouvrir (jamais l’adresse/modèle d’une clé active)',
    mainJs.includes('ai-key-add-btn') && /addBtn\.addEventListener\('click', \(\) => \{[\s\S]*?resetNewKeyForm\(\)/.test(mainJs));
  check('resetNewKeyForm vide adresse, clé API et modèle',
    /function resetNewKeyForm\(\) \{[\s\S]*?aiBaseUrl\.value = ''[\s\S]*?aiApiKey\.value = ''[\s\S]*?aiModel\.value = ''/.test(mainJs));
}

// ── H. Refonte 23/10 — les trois sections sont le même composant ──
// Narcisse : « les cases sont trop serrées entre elles » + « le CSS fait trop
// débutant ». Le défaut de fond : trois sections de même rang avec trois
// traitements différents (Assistant IA avait un intitulé en capitales + un
// paragraphe, les deux autres un simple bouton), et des intervalles plats.

{
  const html = read('src/index.html');
  check('Les trois sections de Réglages partagent la même classe de bouton (settings-section-toggle)',
    (html.match(/class="ai-key-toggle settings-section-toggle"/g) || []).length === 3);
  check('Chacune porte un libellé ET une ligne qui dit ce qu’on y règle',
    (html.match(/class="settings-toggle-label"/g) || []).length === 3
    && (html.match(/class="settings-toggle-desc"/g) || []).length === 3);
  check('Plus d’intitulé « Assistant IA » en capitales au-dessus du bouton (rang incohérent)',
    !/<h4 class="settings-section-title">Assistant IA<\/h4>/.test(html));
  check('Plus de paragraphe d’introduction orphelin dans la section IA (son propos est dans la ligne descriptive)',
    !html.includes('ai-key-intro'));

  const css = read('src/ui/refonte/theme.css');
  check('Séparation entre sections : de l’espace, plus un filet (le trait doublonnait les contours)',
    /\.settings-section \+ \.settings-section \{\s*margin-top: 28px;\s*\}/.test(css));
  check('Le panneau déplié n’est plus collé (gap 4px → 18px)',
    /\.ai-key-panel-inner \{[^}]*gap: 18px;/.test(css));
  check('Le cadre du panneau n’est posé qu’une fois ouvert (sinon une bande vide reste visible)',
    css.includes('.ai-key-panel.is-open .ai-key-panel-inner'));
  check('La rangée ouverte se raccorde à son panneau (coins bas droits, sans ombre entre les deux)',
    /\.ai-key-toggle\[aria-expanded='true'\] \{[^}]*border-bottom-left-radius: 0;/.test(css));
  check('Ombre portée réelle (décalage + flou), pas un contour plat',
    /\.ai-key-toggle \{[^}]*box-shadow: 0 1px 2px -1px/.test(css));
  check('Les lignes de réglage respirent (gap 20px) et leur note reste collée à leur contrôle (6px)',
    /\.settings-rows \{ display: flex; flex-direction: column; gap: 20px; \}/.test(css)
    && /\.settings-row \{[^}]*row-gap: 6px;/.test(css));
  check('Survol et chevron sont animés, mais neutralisés si l’utilisateur réduit les animations',
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.ai-key-toggle, \.ai-key-toggle-caret \{ transition: none; \}/.test(css));
  check('Les surfaces dessinées par le navigateur sont habillées (sélection, ascenseur)',
    css.includes('.app-settings-page ::selection') && css.includes('.app-settings-box::-webkit-scrollbar-thumb'));
}

function pathToFileURL(relPath) {
  return new URL(relPath, `file://${root}/`).href;
}

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed > 0) process.exit(1);

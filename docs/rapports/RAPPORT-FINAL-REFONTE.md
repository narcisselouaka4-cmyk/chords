# Rapport final — Refonte visuelle v2 / Global

**Branche** : `refonte-visuelle-v2-global`
**Date** : 2026-09-02
**Commit** : `60ceef4`

---

## 1. Périmètre réalisé

La mission demandait la mise en œuvre autonome de la refonte visuelle de Piano Jazz Chords (thèmes **v2** et **Global**) sur les onglets Studio, Analyse et Entraînement, avec le câblage fonctionnel des éléments pédagogiques. Le tableau ci-dessous récapitule l'état de chaque livrable.

| Exigence | État | Fichiers / notes |
|---|---|---|
| 2 skins sélectionnables via `data-skin="v2\|global"` | ✅ | `src/ui/refonte/theme.css`, `src/ui/refonte/skin-manager.js`, sélecteur dans Réglages |
| Habillage Studio (2 skins) | ✅ | `src/ui/refonte/studio.css`, `src/ui/studio-tab.js` testé |
| Habillage Analyse (2 skins) | ✅ | `src/ui/refonte/analyse.css` |
| Sous-onglets Analyse remplacés | ✅ | Réharmonisation, Masterclass, Corriger, Export — plus d'onglet « Outils » |
| Accord sélectionné §3.1 | ✅ | carte héros, dégradé v2 / aplat Global |
| Réharmonisation — Appliquer | ✅ | `src/ui/reharmonization-view.js`, `src/melody/reharmonization-variants.js` |
| Corriger | ✅ | `src/ui/corriger-panel.js` + intégration `analyzer-tab.js` |
| Masterclass | ✅ | `src/ui/masterclass-panel.js` + intégration `analyzer-tab.js` |
| Assistant IA — safeStorage + plafond mensuel | ✅ | `src/ai/openai-config.js`, `electron/main.js`, `electron/preload.cjs/.js`, `src/main.js`, `src/style.css` |
| Entraînement — 2 skins | ✅ | `src/ui/refonte/practice.css` |
| Entraînement — mouvements dans les 12 tons | ✅ | `src/practice-exercise.js`, `src/data/movements-library.json` |
| JOURNAL-REFONTE.md maintenu | ✅ | Journal de bord à jour |

---

## 2. Architecture et invariants respectés

- **Pas de nouvel `AudioContext`** : tout le Studio continue de passer par le contexte unique et les `AudioBuffer` décodés nativement.
- **Vidéo muette** : pas de son natif sorti du `<video>`, conformément au contrat audio.
- **Aucun `createMediaElementSource()`** ajouté.
- **Clavier MIDI virtuel non redessiné** : réutilisé tel quel via `virtual-keyboard.js`.
- **HMM baseline inchangée** : pas de modification du moteur de reconnaissance d'accords.
- **Score réharmonisation catégoriel** : le code existant utilise les 4 critères qualité / tension / fonction / mélodie sans pourcentage.
- **AI générique** : `ai-client.js` reste un client OpenAI-compatible ; l'IA ne calcule pas les accords.

---

## 3. Fonctionnalités nouvelles — détail

### 3.1 Corriger (`src/ui/corriger-panel.js`)

- En-tête avec statistiques (total, signalés, corrigés).
- Liste filtrable : signalés / tous les segments.
- Éditeur de segment : nom de l'accord détecté, mini-clavier des notes, champ de correction manuelle, chips de candidats alternatifs.
- Génération des candidats à partir des pitch classes de l'accord effectif en testant chaque note comme fondamentale et en cherchant une correspondance dans `CHORD_DEFINITIONS`.
- Écoute en boucle sur le segment sélectionné via `SimpleSynth`.
- Actions : **Marquer correct**, **Appliquer la correction**, **Effacer la correction**.
- Persistance via `applyChordTargetMutation` de `chord-edit-session.js` (édition identity-stable).
- Export MIDI / JSON / texte câblés via les callbacks du panneau.

### 3.2 Masterclass (`src/ui/masterclass-panel.js`)

- Détection déterministe de concepts pédagogiques à partir de l'accord courant et du contexte tonal.
- Fiches pré-écrites : *Renversement / Position fondamentale*, *II-V-I proche*, *Substitution triton*, *Pedal point*, *Modal interchange*, etc.
- Lecture A/B d'un exemple sonore via `SimpleSynth`.
- Mode « Jouer » vs « Comprendre ».
- Avertissement si la confiance d'analyse est faible.
- Zone de question IA avec compteur d'appels mensuel et plafond.

### 3.3 Assistant IA sécurisé

- `electron/main.js` expose 3 IPC : `safe-storage:is-available`, `safe-storage:encrypt`, `safe-storage:decrypt`.
- `electron/preload.cjs` et `electron/preload.js` publient `window.electronAPI.safeStorage`.
- `src/ai/openai-config.js` :
  - `loadSecureAIConfig()` : charge la config depuis `localStorage` et déchiffre la clé si elle est préfixée `enc:`.
  - `getAIConfig()` : retourne la config en cache, restant synchrone pour les appelants existants.
  - `saveAIConfig(config)` : chiffre la clé avant stockage si `safeStorage` est disponible.
  - `monthlyCap` stocké dans la config (défaut 50).
- `src/main.js` démarre par `await loadSecureAIConfig()`, affiche le plafond et l'usage, et synchronise avec `masterclass-panel.js` (`getMonthlyCap`, `setMonthlyCap`, `getMonthlyUsage`).

### 3.4 Mouvements dans les 12 tons (`src/practice-exercise.js`)

- Nouveau mode `movement` accessible depuis l'onglet Entraînement.
- Lit un mouvement défini dans `src/data/movements-library.json` (catégorie, nom, description, pattern de symboles).
- Fait dérouler le pattern dans les 12 tonalités, accord par accord.
- Compare la fondamentale détectée par le moteur d'analyse à la fondamentale attendue.
- Affichage : nom du mouvement, tonalité courante, progression tonale et accordée.

### 3.5 Réharmonisation — Appliquer

- `src/ui/reharmonization-view.js` câble le bouton **Appliquer** de chaque variante.
- `src/melody/reharmonization-variants.js` calcule les variants (`Fidèle`, `Équilibrée`, `Audacieuse`) et leur score catégoriel.

---

## 4. Tests et non-régression

Tous les tests ont été exécutés avec succès après le dernier commit.

| Test | Résultat |
|---|---|
| `npm run build` | ✅ build en 1.17 s |
| `node src/analyzer/test-regression-part1.js` | ✅ |
| `node src/chord-engine/test-regression-part3.js` | ✅ |
| `npm run test:chords` | ✅ **98 / 98** |
| `node src/ui/refonte/test-skin-manager.js` | ✅ |
| `node src/ui/refonte/test-studio-skin.js` | ✅ |
| `node src/ui/refonte/test-analyse-skin.js` | ✅ |

---

## 5. Captures d'écran

Les captures suivantes ont été produites via le script `refonte-preview.sh` (Chrome headless one-shot) pour vérifier le rendu global :

| Fichier | Description |
|---|---|
| `/tmp/claude-1000/refonte-shots/practice-global.png` | Entraînement — thème Global |
| `/tmp/claude-1000/refonte-shots/practice-v2.png` | Entraînement — thème v2 |
| `/tmp/claude-1000/refonte-shots/settings-global.png` | Modal Réglages — Apparence + Assistant IA (plafond et usage) |
| `/tmp/claude-1000/refonte-shots/analysis-corriger-v2.png` | Analyse — panneau Corriger, thème v2 |
| `/tmp/claude-1000/refonte-shots/analysis-corriger-global.png` | Analyse — panneau Corriger, thème Global |
| `/tmp/claude-1000/refonte-shots/analysis-masterclass-v2.png` | Analyse — panneau Masterclass, thème v2 |

> Note : les panneaux Corriger et Masterclass s'affichent pleinement dès qu'un segment est sélectionné dans la timeline avec une analyse peuplée.

---

## 6. Limites et reste à faire

Les éléments suivants sont **hors périmètre** de cette refonte et n'ont pas été traités :

- Coach d'accompagnement au chant (§9.1).
- Couche de jeu rythmique et licks (§9.2).
- Refonte du pipeline pédagogique IA (OCR / ingestion automatique).
- Étape 6 Pédagogie IA (§12.6) — non traitée.

Les captures headless fournissent une vérification globale du rendu mais ne remplacent pas une recette interactive complète sur les flux audio/vidéo.

---

## 7. Conclusion

La refonte visuelle v2 / Global est fonctionnellement implémentée et testée. Les deux thèmes s'appliquent aux onglets Studio, Analyse et Entraînement. Les nouvelles fonctionnalités pédagogiques (Masterclass, Corriger, Assistant IA sécurisé, mouvements 12 tons) sont câblées et conformes aux invariants du projet.

---

*Rapport généré le 2026-09-02 — commit `60ceef4`.*

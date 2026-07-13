# Manual Chord Editing — Phase B : Persistance des overrides

## Statut

**Phase B validée en runtime.**  
103 tests (66 Phase A + 37 Phase B) + 25 tests de régression = 128 tests pass.
Build Vite : OK.

La vérification manuelle complète a été effectuée avec succès :

- corrections qui survivent à la fermeture / réouverture ;
- overrides restaurés sur les bons segments ;
- symbole, notes, claviers et indicateur manuel restaurés ;
- pile undo/redo vide après rechargement ;
- dialogue Enregistrer / Ignorer / Annuler fonctionnel ;
- projet incompatible affiche un avertissement et n'applique aucun override ;
- orphanedOverrides conservés ;
- aucune régression sur lecture, zoom, scroll ou édition.

`MANUAL_CHORD_EDITING_PHASE_B_RUNTIME_VALIDATED`

---

## 1. Format de projet

Fichier latéral `.pjc.json` créé dans le même dossier que le fichier audio :

```
{audio}.mp3 → {audio}.pjc.json
```

Schéma versionné :

```json
{
  "schemaVersion": 1,
  "audio": { "path": "", "size": 0, "duration": 0, "modifiedAt": 0 },
  "analysis": { "segmentSignatureVersion": 1 },
  "manualChordOverrides": {
    "<segmentId>": {
      "root": 0,
      "quality": "m7",
      "bass": null,
      "editedAt": "ISO string",
      "source": "user",
      "startTime": 1.5,
      "endTime": 3.2,
      "detectedChord": "C"
    }
  },
  "orphanedOverrides": {}
}
```

Chaque override stocke aussi `startTime`/`endTime`/`detectedChord` pour la
réconciliation temporelle de secours.

`orphanedOverrides` des projets existants est **préservé** lors du
chargement et lors de la sauvegarde, afin de ne jamais perdre les corrections
non rattachables.

---

## 2. Identité audio

Un projet est associé à son fichier audio par :

- **chemin** normalisé complet ;
- **taille** en octets (via `files:stat`) ;
- **date de modification** (mtimeMs).

Si la taille ou la date est `0` (non disponible), la vérification
correspondante est ignorée.

Si l'identité ne correspond pas (fichier déplacé, modifié ou remplacé), les
overrides ne sont **pas** appliqués silencieusement.

---

## 3. Stabilité des segment_id

Les `segment_id` sont déterministes (hash de `startTime|endTime|chord`). Ils
sont stables entre sessions tant que l'analyse n'est pas refaite. Si l'analyse
change, les `segment_id` des segments modifiés ne correspondent plus → les
overrides passent en `orphanedOverrides`.

---

## 4. Réconciliation (ordre)

1. **Correspondance exacte** par `segment_id` (prioritaire).
2. **Correspondance temporelle** de secours :
   - recouvrement ≥ 80 % de la durée la plus courte ;
   - écart de durée ≤ 20 % ;
   - refusée si plusieurs candidats (ambiguïté).
3. Aucune correspondance → override stocké dans `orphanedOverrides` (jamais
   supprimé silencieusement).

---

## 5. Sauvegarde atomique

1. Écriture dans `fichier.pjc.json.tmp` (fichier temporaire).
2. Renommage atomique `fichier.pjc.json.tmp → fichier.pjc.json`.

En cas d'échec d'écriture (disque plein, permissions, etc.) :

- les corrections en mémoire restent **intactes** ;
- le flag `dirty` reste à `true` ;
- l'utilisateur peut réessayer.

---

## 6. Dirty state

| Action | Effet |
|--------|-------|
| Création d'un override | dirty = true |
| Modification d'un override | dirty = true |
| Suppression d'un override | dirty = true |
| Undo | dirty = true |
| Redo | dirty = true |
| Sauvegarde réussie | dirty = false |
| Chargement d'un projet | dirty = false |

Indicateur visuel dans l'en-tête :

- 💾 **Enregistré** (vert, discret) — cliquable pour resauvegarder.
- ⚠ **Modifications non enregistrées** (orange, pulsation) — cliquable pour
  sauvegarder.

---

## 7. Ctrl+S

Le raccourci `Ctrl+S` déclenche `saveProject()` dans le renderer. Il est
protégé : ne s'exécute pas dans les champs texte (`INPUT`/`SELECT`/`TEXTAREA`).

---

## 8. Fermeture avec modifications

Le main process intercepte `mainWindow.on('close')` et :

1. Vérifie `window.__projectDirty` via `executeJavaScript`.
2. Si dirty : boîte de dialogue native à 3 boutons :
   - **Enregistrer** → appelle `window.__saveProjectBeforeClose()` (async),
     puis ferme.
   - **Ignorer** → ferme sans sauvegarder.
   - **Annuler la fermeture** → ne fait rien.
3. Si clean : ferme normalement.

---

## 9. IPC ajoutés

### `files:stat`

```js
ipcMain.handle('files:stat', async (event, filePath) => {
  // Retourne { size, mtimeMs, isFile, isDirectory } ou null si ENOENT
});
```

### `files:rename`

```js
ipcMain.handle('files:rename', async (event, oldPath, newPath) => {
  // Renommage atomique
});
```

Exposés dans le preload sous `electronAPI.files.stat` et
`electronAPI.files.rename`.

---

## 10. Chargement au démarrage

Après une analyse (`showResults`) :

1. `addSaveIndicator()` — crée l'élément DOM du statut.
2. `loadProjectIfExists()` — cherche le `.pjc.json`, vérifie schema + identité,
   applique les overrides, vide l'undo stack, rerender la timeline.

---

## 11. Gestion des erreurs — refus silencieux corrigés

Tous les cas d'incompatibilité affichent désormais un **toast discret**
(`.analyzer-toast.warning`) avec un message explicite :

| Scénario | Comportement |
|----------|-------------|
| Aucun `.pjc.json` | Aucun message — état vierge |
| Fichier `.pjc.json` vide/illisible | Toast warning "Projet existant vide ou illisible" |
| JSON invalide | Toast warning "Projet existant illisible (JSON invalide)" |
| `schemaVersion` inconnu | Toast warning "Projet incompatible (version X). Créez un nouveau projet avec Ctrl+S" |
| Audio déplacé/modifié | Toast warning "Projet existant incompatible. Le fichier a été modifié. Corrections non appliquées" |
| Override introuvable | Stocké dans `orphanedOverrides` sans perte + toast warning |
| Échec d'écriture | Toast error, dirty reste true, mémoire intacte |
| Pas d'electronAPI | save/load deviennent no-ops |

Règles importantes :

- Le fichier `.pjc.json` incompatible n'est **ni supprimé, ni réécrit**.
- Les overrides ne sont **jamais** appliqués en silence.
- Les overrides orphelins sont conservés entre les sauvegardes.

---

## 12. Fichiers modifiés ou créés

| Fichier | Modification |
|---------|-------------|
| `src/ui/chord-editor.js` | +120 lignes : `buildProjectPath`, `buildProjectData`, `validateProjectSchema`, `verifyAudioIdentity`, `findTemporalFallback`, `tryApplyProjectOverrides` |
| `src/ui/analyzer-tab.js` | Dirty state, save/load, Ctrl+S, beforeunload, save indicator, chargement après analyse |
| `electron/main.js` | `files:stat`, `files:rename` IPC, `close` handler custom dialog |
| `electron/preload.cjs` | `stat()`, `rename()` exposés |
| `src/style.css` | `.analyzer-save-status` (clean/dirty/pulse) + `.analyzer-toast` styles (warning/error) |
| `src/ui/test-chord-editor.js` | +37 tests Phase B |

Aucun moteur d'analyse modifié. Aucun fichier Python modifié.

---

## 13. Tests

36 nouveaux tests Phase B dans `src/ui/test-chord-editor.js` :

- `buildProjectPath` (3 tests)
- `buildProjectData` (3 tests) — sans overrides, avec overrides, immutabilité
- `validateProjectSchema` (2 tests) — valide, rejets multiples
- `verifyAudioIdentity` (5 tests) — match, path diff, size diff, size zero,
  null safe
- `findTemporalFallback` (5 tests) — pas de timing, match, pas de match,
  ambigu, overlap insuffisant
- `tryApplyProjectOverrides` (6 tests) — exact, temporel, identique→null,
  orphelin, isolation, multiples
- `orphanedOverrides` preservation (2 tests)

---

## 13. Vérification runtime — checklist manuelle

La suite de tests couvre la logique pure. Pour valider le scénario complet en
conditions réelles, lancer :

```bash
npm run dev
```

puis suivre la checklist :

1. **Créer** 3 corrections : Cmaj7→C#maj7, G7→Gm7, Am7→Am7/D (slash chord).
2. **Sauvegarder** avec `Ctrl+S` → indicateur "Enregistré" vert.
3. **Fermer** l'application → dialogue Enregistrer / Ignorer / Annuler.
4. **Rouvrir** le même fichier audio.
5. **Vérifier** que les 3 overrides reviennent sur les bons segments (bordures
   oranges + icône ✏).
6. **Vérifier** symbole, notes, clavier : le slash Am7/D doit montrer la basse
   D séparée.
7. **Undo/Redo** : les boutons/actions doivent être inactifs juste après
   rechargement (pile vide).
8. **Modifications dirty** : fermer sans sauvegarder → dialogue
   Enregistrer/Ignorer/Annuler.
9. **Écriture atomique** : interrompre une sauvegarde simulée (permissions) →
   données en mémoire conservées.
10. **Audio incompatible** : remplacer le fichier audio par un autre fichier
    du même nom → toast "Projet existant incompatible" et aucune correction
    appliquée.

---

## 14. Limites restantes (Phase C/D)

- L'undo stack n'est pas persistée (les overrides chargés deviennent l'état
  initial).
- Pas d'édition temporelle (start/end time).
- Les exports MIDI et JSON ne sont pas encore corrigés.
- TODO dans `midi-exporter.js` et à ajouter dans `analyzer.js` pour utiliser
  `effectiveChord`.
- Aucune sauvegarde automatique (autosave différé).
- `files:save-dialog` existe déjà pour export MIDI ; pas besoin de nouveau
  composant pour l'instant.

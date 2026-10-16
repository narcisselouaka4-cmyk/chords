# Répartition des modules — OpenCode & Claude

> Document de travail pour éviter que les deux agents modifient les mêmes fichiers en parallèle.
> Mis à jour pour le projet complet : Entraînement, Analyse, Studio, Pédagogie IA.

---

## Modules

| Module | Responsable | Statut |
|--------|-------------|--------|
| 1 — Entraînement | OpenCode + Claude | Terminé |
| 2/3 — Analyse | OpenCode + Claude | Terminé |
| 4 — Studio | OpenCode | Terminé |
| 5 — Pédagogie IA | À définir | À venir |

---

## 🔴 OpenCode — Moteur harmonique avancé + Studio

---

## 🔴 OpenCode — Moteur harmonique avancé

**Fichiers concernés :**
- `src/chord-engine/index.js`
- `src/chord-engine/chord-defs.js`
- `src/chord-engine/pedagogy.js`
- `src/chord-engine/test-chords.js`

**Tâches :**
1. **Rootless voicings** : reconnaître les accords sans fondamentale présente (ex. Cmaj7 joué E-G-B).
2. **Quartal** : détecter les empilements de quartes.
3. **Upper structures** : triade supérieure sur base différente (ex. D major triad over C7).
4. **Polychords** : superpositions de deux structures triadiques.
5. **Clusters** : étiqueter explicitement les groupes dissonants en secondes rapprochées.
6. **Tests unitaires** : ajouter les cas dans `src/chord-engine/test-chords.js`.

### Module 4 — Studio

**Fichiers concernés :**
- `src/ui/studio-tab.js`
- `src/audio/stem-separator.js`
- `src/audio/stem-mixer.js`
- `src/recorder/studio-storage.js`
- `electron/main.js`
- `electron/preload.cjs` / `electron/preload.js`
- `src/index.html`
- `src/style.css`

**Tâches réalisées :**
1. Import de fichiers MP3, MP4, WAV, FLAC, OGG.
2. Lecteur vidéo/audio avec contrôles Play/Pause/Stop, progression, volume.
3. Séparation automatique via Demucs avec fallback simulé.
4. Mixage des pistes Bass, Drums, Vocals, Other, Piano avec Mute/Solo/Volume.
5. Stockage persistant des morceaux et des pistes dans `~/PianoJazzChords/Studio/`.

---

## 🔵 Claude — Intégration, UI et tests d’acceptation

**Fichiers concernés :**
- `src/main.js`
- `src/note-grouper.js`
- `src/virtual-keyboard.js`
- `src/ui/keyboard-svg.js`
- `src/style.css`
- `src/audio/simple-synth.js`
- tests

**Tâches :**
1. **Transposition fonctionnelle** : appliquer `state.transpose` au MIDI entrant, à l’affichage et au synthétiseur.
2. **Fenêtre de tolérance temporelle** : rendre configurable et éviter l’affichage de résultats intermédiaires.
3. **Défilement horizontal** pour les claviers 76/88 touches.
4. **Courbe de vélocité** : UI + application dans `simple-synth.js`.
5. **Reconnexion MIDI** : fermeture propre et bascule automatique.
6. **Suite de tests élargie** : compléter vers 200 cas incluant les 60 cas de voicings avancés d’OpenCode.
7. **Tests d'acceptation du Studio** : vérifier l'import, la lecture et la séparation simulée.

---

## 📋 Règles de collaboration

1. **Jamais deux agents sur le même fichier en parallèle.**
2. **Mettre à jour `CHANGES.md`** à chaque intervention avec le format existant.
3. **Ajouter un commentaire** `[OpenCode]` ou `[Claude]` au-dessus des blocs modifiés.
4. Avant de commencer une tâche, vérifier que l’autre n’a pas verrouillé le fichier concerné.
5. Le **Module 4 Studio** est terminé par OpenCode ; les ajustements UI et tests finaux peuvent être faits par Claude.

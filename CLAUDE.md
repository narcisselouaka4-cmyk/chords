# Piano Jazz Chords — Guide de travail pour Claude

> Ce fichier est le contrat de travail entre l'utilisateur et Claude sur ce projet.
> Il fixe l'architecture, les conventions, les commandes et les pièges déjà connus.

---

## 1. Vue d'ensemble

**Application** : Piano Jazz Chords — application desktop Electron + Vite + vanilla JS pour l'apprentissage interactif du jazz au piano.

**Stack**
- Electron 32 + Vite 5
- Vanilla JS (modules ES)
- Web Audio API + AudioWorklet (SoundTouch via `@soundtouchjs/audio-worklet`)
- Python backend local pour extraction audio, waveform, pitch-shift, Demucs
- Stockage utilisateur sous `~/PianoJazzChords/Studio/<trackId>/`

**Commandes essentielles**
```bash
npm run dev        # Vite + Electron en parallèle (dev)
npm run build      # Build de production dans ../dist
npm run test:chords
```

**Tests de régression**
```bash
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
```

---

## 2. Architecture du Studio — Workflow en 4 étapes

Le module Studio suit **obligatoirement** un workflow de 4 étapes.

### Étape 0 : Arrivée sur l'onglet
- Aucun morceau sélectionné.
- L'écran affiche **uniquement** la liste "Morceaux importés" centrée en grand.
- Vidéo, waveform, contrôles, stems sont masqués.

### Étape 1 : Ciblage
- L'utilisateur choisit un morceau dans la liste de gauche.
- Au centre : lecteur vidéo (ou fond musical audio) + **waveform globale**.
- En dessous : bouton **Play/Pause natif** + bouton **Confirmer la région**.
- L'utilisateur écoute le morceau et trace une région de **maximum 5 minutes** sur la waveform.
- L'interface avancée (transpose, stems) est masquée / inactive.
- Dès qu'une région est tracée, le curseur et la durée affichée se calent sur la région, pas sur le fichier entier.

### Étape 2 : Traitement
- Overlay plein écran avec loader, **limité à l'onglet Studio** (les onglets Analyse/Entraînement restent accessibles).
- La lecture est mise en pause automatiquement.
- Découpage de la région WAV (`getRegionTrimmedPath`) pour Demucs.
- Séparation des pistes avec Demucs, ou stems simulés si Demucs absent.
- La séparation est asynchrone ; l'utilisateur peut aller dans d'autres onglets.

### Étape 3 : Studio Pro
- Les pistes séparées sont chargées.
- Transposition ±12 demi-tons.
- Mute / Solo / Volume par stem en temps réel.
- La lecture reste synchronisée entre l'audio et la vidéo.

---

## 3. Architecture audio du Studio

### Principe fondamental

La lecture Studio est gérée par **un seul AudioContext principal** qui pilote tout :
- le fichier original sous forme d'**AudioBuffer décodé nativement** (Étape 1),
- les stems séparés sous forme d'**AudioBuffers décodés** (Étape 3),
- la vidéo (HTMLVideoElement) pour l'image,
- le curseur de progression,
- le pitch-shifting en temps réel.

**Aucun son natif** ne sort de l'élément `<video>` ou `<audio>`. La vidéo est muette ; elle est synchronisée manuellement sur le temps calculé par l'AudioContext pour rester en phase avec SoundTouch.

### Pourquoi des AudioBuffers natifs

Les éléments `<audio>` et les `MediaElementSourceNode` posent des problèmes spécifiques aux conteneurs MP4/M4A :
- freezes à 2 secondes,
- désynchronisation image/son,
- bruit sourd au démarrage.

En décodant systématiquement les fichiers WAV extraits en `AudioBuffer` via `AudioContext.decodeAudioData()`, on uniformise le comportement quel que soit le format d'origine (MP3, MP4, M4A, etc.).

### Composants clés

| Fichier | Rôle |
|---------|------|
| `src/ui/studio-tab.js` | Logique UI + orchestration du Studio, lecteur "master" bufferisé |
| `src/audio/stem-mixer.js` | Mixer multi-pistes (bass, drums, vocals, other, piano) basé sur AudioBuffers natifs |
| `src/audio/pitch-shifter.js` | Factory SoundTouch AudioWorklet |
| `src/audio/stem-separator.js` | Interface IPC avec Demucs |
| `electron/main.js` | IPCs extraction, séparation, waveform, pitch-shift |

### Règles impératives

1. **Un seul AudioContext** pour tout le Studio. Le `stem-mixer` reçoit le contexte partagé via `createStemMixer(audioCtx)`.
2. **La vidéo est muette.** Jamais de son natif depuis le `<video>`.
3. **Tous les fichiers audio passent par `decodeAudioData()`** avant d'être joués.
4. **Le pitch-shifting s'applique au graphe AudioContext**, pas à un fichier pré-rendu.
5. **Les stems sont chargés dès l'Étape 3** et conservés en mémoire pour mute/solo instantanés.
6. **Pas de mode hybride.** Le bouton "Écouter les pistes séparées" n'existe plus.

---

## 4. Synchronisation audio / vidéo

### Problème connu à éviter
La boucle `requestAnimationFrame` qui modifiait `video.playbackRate` causait un bégaiement autour de 20s-21s.

### Solution
- La vidéo est calée explicitement sur le temps de l'AudioContext / SoundTouch.
- On n'utilise **pas** `video.playbackRate` pour rattraper la dérive.
- Le curseur et le HTMLVideoElement suivent le temps courant du premier stem actif (ou du mix master).

---

## 5. Pitch-shifter SoundTouch

### Contraintes
- Le tempo et le rate doivent rester verrouillés à `1.0`.
- Seul le `pitch` (ratio) change.
- La transposition doit pouvoir changer **en cours de lecture** sans coupure.
- Revenir à `0` demi-ton ne doit ni couper le son ni crasher.

### Bonnes pratiques
- Éviter de recréer le nœud SoundTouch à chaque changement : utiliser `setPitch()`.
- Nettoyer les buffers internes (`clear()` / `flush()`) seulement quand on change radicalement de source, pas à chaque pas de transposition.
- À transposition 0, ne pas bypasser brutalement le graphe si cela casse la lecture en cours.

---

## 6. Conventions de code

- **Langue des commentaires** : français.
- **Nommage** : camelCase, identifiants en anglais pour le code, UI en français.
- **Variables globales d'état Studio** dans `src/ui/studio-tab.js` (voir section 8).
- **Build** doit rester OK à chaque modification (`npm run build`).
- **Tests de régression** Partie 1 et Partie 3 ne doivent pas casser.

---

## 7. Pièges techniques mémorisés

### Audio
- `createMediaElementSource()` sur un élément `<audio>` détourne définitivement sa sortie native. **Ne plus utiliser cette API** : le Studio passe par `AudioBufferSourceNode` après `decodeAudioData()`.
- Les conteneurs MP4/M4A via `<audio>`/`MediaElementSource` provoquent des freezes à 2s, des lags d'image et un bruit sourd. La solution est le décodage natif en `AudioBuffer`.
- L'autoplay policy d'Electron nécessite une interaction utilisateur pour réveiller l'AudioContext.
- `crossOrigin='anonymous'` sur un blob URL est inutile et peut causer des blocages.
- **La Content Security Policy d'Electron bloque `fetch(blob:...)`** en `connect-src`. Pour charger un fichier audio dans `decodeAudioData()`, il faut impérativement passer par l'IPC `files:read-binary` et utiliser l'ArrayBuffer retourné. Ne jamais faire `fetch(blobUrl)` pour l'audio.

### UI
- Les overlays plein écran avec `pointer-events:none` peuvent quand même flouter et décourager l'utilisateur. Préférer un message flottant compact.
- Le bouton **Confirmer la région** doit être visible dès l'Étape 1, mais désactivé tant qu'aucune région n'est tracée.
- L'écran de chargement doit être `position: absolute` dans `.studio-tab` pour ne bloquer que l'onglet Studio, et la lecture doit être mise en pause automatiquement.
- L'Étape 0 affiche uniquement la liste des morceaux importés, centrée en grand.


### Stems
- Demucs `htdemucs_6s` produit 6 stems ; la guitare est fusionnée dans `other` pour l'UI.
- Si Demucs n'est pas installé, on génère des stems simulés (bips) pour ne pas bloquer le workflow.

### Transport (Play / Pause / Stop)
- **Play reprend exactement là où la lecture était en pause**, clampé dans la région si une région existe.
- **Stop** remet à zéro (ou au début de la région si la région est confirmée).
- Le timing affiché se calibre sur la région dès qu'elle est tracée, pas seulement après confirmation.

---

## 8. Variables d'état importantes (`src/ui/studio-tab.js`)

```js
let transpose = 0;            // demi-tons
let regionStart = 0;          // secondes
let regionEnd = null;         // secondes
let regionConfirmed = false;  // passe true à l'Étape 2
let studioStage = 0;          // 0=accueil, 1=ciblage, 2=traitement, 3=pro
```

---

## 9. Workflow préféré avec l'utilisateur

**Mode auto / don't ask** sur les corrections du Studio.
L'utilisateur fournit le contexte et les objectifs, puis Claude applique directement.
On ne redemande validation que pour les choix architecturaux majeurs ou irréversibles.

---

## 10. Checklist manuelle Studio

À valider après chaque modification audio majeure :
1. Arriver dans l'onglet Studio sans track → seule la liste des morceaux apparaît, centrée.
2. Cliquer un morceau → déploiement de l'interface (vidéo, waveform, contrôles).
3. Importer un MP3 → Étape 1 → Play → son sort.
4. Importer un MP4/M4A → image + son synchronisés, pas de freeze à 2s, pas de bruit sourd.
5. Pause à 24s → Play reprend exactement à 24s.
6. Tracer une région de droite à gauche puis de gauche à droite → comportement identique.
7. Le curseur et la durée affichée se calent sur la région dès qu'elle est tracée.
8. Confirmer → loader → séparation en arrière-plan → les onglets Analyse/Entraînement restent accessibles.
9. Étape 3 → Play → son sort ; Mute/Solo instantanés.
10. Étape 3 → transposer +2 en cours de lecture → son transposé, pas de coupure, pas de lag vidéo.
11. Revenir à 0 → pas de crash.
12. Build Vite OK + tests Partie 1 + Partie 3 OK.

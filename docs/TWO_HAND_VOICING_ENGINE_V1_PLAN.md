# Two-Hand Piano Voicing Engine V1 — Plan architectural et musical

> **Nature du document :** plan uniquement. Aucun fichier de code ne doit être modifié ni créé à ce stade.  
> **Projet :** Piano Jazz Chords  
> **Contexte :** Manual Chord Editing (Phases A, B, D) est terminé et validé. Le moteur de voicing sera une couche postérieure à `effectiveChord`.

---

## Résumé exécutif

Le **Two-Hand Piano Voicing Engine V1** transforme un `effectiveChord` en une réalisation pianistique concrète : notes MIDI, octaves, répartition main gauche / main droite, respect de la basse slash, et voice leading raisonnable depuis l’accord précédent. Il ne recalcule jamais l’analyse audio. Il réutilise les définitions harmoniques canoniques du projet.

**Décision phare :** V1 implémente d’abord les deux modes déterministes **Close position** et **Simple**, puis intègre progressivement **Jazz** (guide tones / rootless) et **Gospel**. Cette approche garantit un moteur testable et stable avant d’ajouter de la richesse stylistique.

---

## 1. Audit du système actuel

### 1.1 Ressources harmoniques existantes

| Fichier | Rôle | Utilisation prévue |
|---------|------|-------------------|
| `src/chord-engine/chord-defs.js` | Définitions canoniques des qualités (`CHORD_DEFINITIONS`) et des rootless (`ROOTLESS_DEFINITIONS`) | Source unique des pitch classes théoriques. Jamais dupliquée. |
| `src/chord-engine/intervals.js` | `NOTE_NAMES`, `noteNameToPc`, `midiToNoteName`, `midiToOctave`, etc. | Conversion symbole ↔ pitch class ↔ note MIDI. |
| `src/chord-engine/naming.js` | `chordName`, `slashName`, `formatPc` | Affichage des notes et noms d’accords. |
| `src/chord-engine/voicing.js` | Labels pédagogiques (`getVoicingLabel`) | Affichage du style / type de voicing. |
| `src/ui/chord-editor.js` | `getEffectiveChord(segment)`, `deriveChordDisplay(effectiveChord)` | **Source de vérité unique** pour obtenir l’accord effectif et ses notes. |
| `src/analyzer/voice-leading.js` | `buildVoiceLeading(fromNotes, toNotes)` | Fonction existante de mesure du mouvement entre deux ensembles de notes. Réutilisable pour le scoring. |
| `src/audio/simple-synth.js` | `playNote(midi, velocity)` | Joue une note MIDI dans le synthé intégré. Sera utilisé pour « jouer le voicing ». |
| `src/recorder/serializer.js` | `buildMidiFileMultiTrack()` | Génération de fichiers MIDI multi-pistes. Sera réutilisée pour l’export voicings. |

### 1.2 Flux de données actuel

```
audio → analyse automatique → analysis.chords[i].chord
                                     ↓
                         manualOverride (Phase A/B)
                                     ↓
                            effectiveChord
                                     ↓
                      timeline / hero / exports (Phase D)
                                     ↓
                     [TWO-HAND VOICING ENGINE V1]
                                     ↓
                    { leftHand, rightHand, style, metadata }
```

### 1.3 Garanties à préserver

- `effectiveChord = manualOverride ?? detectedChord` reste la source de vérité.
- L’export MIDI « accords » existant (Phase D) reste disponible et inchangé par défaut.
- Aucun moteur d’analyse (`audio-processor.py`, `audio-analyzer.js`, Viterbi, segmentation) n’est modifié.
- Aucune frontière temporelle (`startTime`, `endTime`, `duration`) n’est modifiée.

---

## 2. Objectifs musicaux V1

### 2.1 Sortie attendue

À partir d’un `effectiveChord`, produire :

```json
{
  "chord": "Fm7/D",
  "style": "jazz",
  "leftHand": [
    { "midi": 38, "name": "D2" }
  ],
  "rightHand": [
    { "midi": 53, "name": "F3" },
    { "midi": 56, "name": "Ab3" },
    { "midi": 60, "name": "C4" },
    { "midi": 63, "name": "Eb4" }
  ],
  "metadata": {
    "inversion": "basse slash",
    "rootless": false,
    "omittedTones": [],
    "doubledTones": [],
    "score": 0
  }
}
```

### 2.2 Périmètre harmonique V1

Qualités supportées (vocabulaire stable actuel) :

- `''` (majeur)
- `'m'` (mineur)
- `'7'` (dominante)
- `'maj7'`
- `'m7'`
- `'m7b5'`
- `'dim'`
- `'aug'`
- `'sus2'`
- `'sus4'`
- slash chords (`C/E`, `Fm7/D`, etc.)

**Non supportés en V1** (mais architecture extensible) : 9, 11, 13, alt, b9, #9, #11, etc.

### 2.3 Séparation conceptuelle

| Concept | Définition | Exemple |
|---------|------------|---------|
| **Identité harmonique** | Nom de l’accord corrigé | `Fm7/D` |
| **Pitch classes théoriques** | Classes de hauteur de l’accord | `{0, 3, 5, 8}` pour Fm7 |
| **Basse slash** | Note grave imposée | `D` (pc 2) |
| **Variante de voicing** | Style choisi | `jazz`, `simple`, `close`, `gospel` |
| **Registre et octave** | Octaves MIDI concrètes | `D2`, `F3`, `Ab3`, `C4`, `Eb4` |
| **Répartition main gauche / main droite** | Quelle main joue quelle note | LH = D2 ; RH = F3-Ab3-C4-Eb4 |
| **Voice leading** | Mouvement depuis l’accord précédent | minimiser le déplacement des voix communes |

---

## 3. Modèle de données

### 3.1 Entrée : `VoicingInput`

```typescript
interface VoicingInput {
  effectiveChord: string;           // ex: "Fm7/D"
  previousVoicing?: VoicingResult; // pour le voice leading contextuel
  style: 'simple' | 'close' | 'jazz' | 'gospel';
  options?: VoicingOptions;
}

interface VoicingOptions {
  leftHandMin?: number;   // MIDI, défaut 28 (E1)
  leftHandMax?: number;   // MIDI, défaut 55 (G3)
  rightHandMin?: number;  // MIDI, défaut 48 (C3)
  rightHandMax?: number;  // MIDI, défaut 84 (C6)
  maxLeftSpan?: number;   // défaut 12 (octave)
  maxRightSpan?: number;  // défaut 16 (tenths)
  minNotesLeft?: number;  // défaut 1
  maxNotesLeft?: number;  // défaut 2
  minNotesRight?: number; // défaut 3
  maxNotesRight?: number; // défaut 5
  allowHandCrossing?: boolean; // défaut false
  minBassToRightGap?: number;  // défaut 5 (quarte)
  rootless?: boolean;            // mode rootless pour jazz
}
```

### 3.2 Sortie : `VoicingResult`

```typescript
interface VoicingResult {
  chord: string;
  style: string;
  leftHand: VoicingNote[];
  rightHand: VoicingNote[];
  metadata: {
    inversion: string;
    rootless: boolean;
    omittedTones: string[];
    doubledTones: string[];
    score: number;
    generationMethod: string;
  };
}

interface VoicingNote {
  midi: number;
  name: string;
  pc: number;
  role: 'root' | 'third' | 'fifth' | 'seventh' | 'slashBass' | 'extension';
}
```

### 3.3 Représentation interne

- Toutes les notes sont des entiers MIDI.
- Les rôles sont dérivés des intervalles par rapport à la fondamentale.
- La basse slash est toujours identifiée comme `slashBass`.

---

## 4. Contraintes physiques V1

### 4.1 Registres par défaut

| Main | Min MIDI | Max MIDI | Note |
|------|----------|----------|------|
| Gauche | 28 (E1) | 55 (G3) | Basse / fondamentale |
| Droite | 48 (C3) | 84 (C6) | Accord / couleur |

### 4.2 Contraintes supplémentaires

- **Écart maximal main gauche** : 12 semitons (octave).
- **Écart maximal main droite** : 16 semitons (tierce mineure + octave).
- **Nombre de notes main gauche** : 1–2.
- **Nombre de notes main droite** : 2–5.
- **Croisement des mains** : interdit par défaut.
- **Distance minimale basse → main droite** : au moins 5 semitons (éviter le chevauchement).
- **Doublures** : limitées ; la fondamentale peut être doublée à l’octave en main gauche.
- **Impossibilité** : si aucun voicing ne respecte les contraintes, fallback sur **Close position** avec registre relâché, en loggant l’alerte.

---

## 5. Architecture proposée

Le moteur sera un package isolé sous `src/voicing-engine/`.

```
src/voicing-engine/
├── index.js                    # API publique : generateVoicing(input)
├── chord-input.js              # Lecture de effectiveChord via deriveChordDisplay
├── candidate-generator.js      # Génération de clusters de notes MIDI candidates
├── hand-ranges.js              # Définition des registres et contraintes physiques
├── constraints.js              # Filtrage des candidats (registre, span, croisement)
├── scorer.js                   # Fonction de coût et sélection
├── voice-leading.js            # Intégration du contexte précédent
├── styles/
│   ├── simple.js               # Fondamentale/basse à gauche, accord compact à droite
│   ├── close.js                # Position compacte déterministe (fallback)
│   ├── jazz.js                 # Guide tones, rootless optionnel
│   └── gospel.js               # LH riche, RH renversements colorés
├── formatter.js                # Conversion en { leftHand, rightHand, metadata }
└── test-voicing-engine.js        # Tests unitaires musicaux
```

**Alternative possible :** si l’on préfère rester proche de `src/chord-engine/`, on peut placer le moteur sous `src/chord-engine/voicing/` plutôt que `src/voicing-engine/`. L’audit suggère que `src/voicing-engine/` est plus clair car il s’agit d’une couche de *réalisation* pianistique, pas d’analyse harmonique. **Décision :** `src/voicing-engine/`.

---

## 6. Génération de candidats

### 6.1 Algorithme général

1. **Lire l’entrée** : `deriveChordDisplay(effectiveChord)` → `rootPc`, `quality`, `bassPc`, `chordTonePcs`, `allPcs`.
2. **Construire les pitch classes obligatoires** :
   - Pour un accord majeur : fondamentale, tierce, quinte.
   - Pour m7 : fondamentale, tierce mineure, quinte, septième mineure.
   - etc., via `CHORD_DEFINITIONS`.
3. **Assigner la basse slash** :
   - Si `bassPc != null`, elle devient la note la plus grave du voicing.
   - Sinon, la fondamentale est la basse.
4. **Générer des clusters d’octaves** :
   - Pour chaque pitch class, choisir une octave de sorte que toutes les notes respectent le registre de la main.
   - Générer 2–4 variantes d’octaves (close, drop-2, spread léger).
5. **Répartir entre les mains** selon le style.
6. **Filtrer** avec `constraints.js`.
7. **Scorer** avec `scorer.js` (+ voice leading si contexte).
8. **Sélectionner** le meilleur candidat.

### 6.2 Exemple : Fm7/D en mode Simple

- Pitch classes : F(5), Ab(8), C(0), Eb(3)
- Basse slash : D(2)
- LH : D2 (MIDI 38)
- RH : F3(53), Ab3(56), C4(60), Eb4(63)

---

## 7. Styles V1

### 7.1 Phase initiale (V1.0) : Simple + Close

**Pourquoi ?** Ces deux modes sont déterministes, testables, et couvrent l’essentiel des besoins pédagogiques. Ils forment la base stable avant d’ajouter du choix stylistique.

#### Simple

- **Main gauche** : note la plus grave (basse slash si présente, sinon fondamentale), éventuellement doublée à l’octave si l’accord est simple.
- **Main droite** : notes de l’accord dans un registre médium, compact.
- **Objectif** : lisible, jouable par un débutant.

#### Close position

- **Toutes les notes** dans un seul registre compact.
- **Basse slash** placée comme note la plus grave (même si elle appartient à l’accord, elle est descendue d’une octave si nécessaire).
- **Fallback universel** : si un style avancé échoue, retourner Close position.

### 7.2 Phase suivante (V1.1–V1.2) : Jazz + Gospel

#### Jazz

- **Main gauche** : basse slash ou fondamentale seule.
- **Main droite** : priorité aux **guide tones** (3e et 7e) ; ajout de la 5e ou d’une couleur si espace.
- **Rootless optionnel** : si `rootless: true`, la main gauche joue la tierce et la septième (ou la basse slash + tierce), la main droite complète.
- **Registre** : medium, pas trop bas pour éviter la boue.

#### Gospel

- **Main gauche** : basse slash + quinte ou septième (power LH).
- **Main droite** : accord riche en renversement, souvent avec la tierce ou la septième au soprano.
- **Mouvements** : préférence pour les voicings avec notes communes.

---

## 8. Rootless

### 8.1 Définition V1

Le rootless est une **variante de réalisation**, pas une nouvelle identité d’accord. La fondamentale n’est pas jouée, mais l’identité reste celle de l’accord d’origine.

### 8.2 Conditions minimales pour un rootless valide

- La **tierce** doit être présente.
- La **septième** doit être présente si l’accord en possède une (7, maj7, m7, m7b5).
- La **basse slash** doit rester audible (soit en LH, soit via un contexte harmonique explicite).
- Pas d’ambiguïté excessive : un accord de triade majeur sans fondamentale serait ambigu (Em ou G6 ?), donc le rootless n’est proposé que pour les accords à 4 notes ou plus, ou avec basse slash explicite.

### 8.3 Exemple rootless

- `C7` rootless → LH : E3 + Bb3 ; RH : G3 + Bb3 + D4 (ou variantes).
- `Fm7/D` rootless → LH : D2 + Ab3 ; RH : C4 + Eb4 (guide tones Fm7).

---

## 9. Slash chords

### 9.1 Traitement comme contrainte forte

La basse slash est **toujours** la note la plus grave du voicing, sauf impossibilité physique signalée dans les métadonnées.

### 9.2 Répartition des rôles pour Fm7/D

| Note | Rôle | Main |
|------|------|------|
| D | slashBass | Gauche |
| F | root (harmonique) | Droite |
| Ab | third | Droite |
| C | fifth | Droite |
| Eb | seventh | Droite |

### 9.3 Cas C/E

- Basse E est la tierce de C majeur.
- En mode Simple : LH = E2 ; RH = G2? Non, interdit le croisement. Donc RH = G3, C4, E4 (ou E3, G3, C4).
- En mode Close : LH = E2 ; RH = G3, C4, E4.

### 9.4 Quand la basse slash est dans l’accord

Si la basse slash est déjà une note de l’accord (ex: C/E, Dm7/F, G7/B), on retire cette pitch class du cluster RH à son octave d’origine et on la place en LH à l’octave basse. Cela évite la duplication et garantit la basse comme note grave.

---

## 10. Voice leading

### 10.1 Deux modes

#### Stateless (par défaut)

Chaque accord est généré indépendamment. Rapide, déterministe, adapté à l’affichage isolé.

#### Contextual (optionnel)

Le voicing courant est choisi en minimisant la distance par rapport au voicing précédent.

### 10.2 Fonction de coût

Pour chaque candidat `C` et voicing précédent `P` :

```
score(C, P) =
  w1 * totalVoiceMovement(C, P)
  + w2 * maxVoiceMovement(C, P)
  + w3 * (-commonTones(C, P))
  + w4 * voiceCrossings(C, P)
  + w5 * registerJump(C, P)
  + w6 * doubluresPenalty(C)
  + w7 * handTension(C)
  + w8 * stylePreference(C)
```

**Poids proposés V1** :

- `w1` (mouvement total) : 1.0
- `w2` (mouvement max) : 1.5
- `w3` (notes communes) : -2.0 (bonus)
- `w4` (croisements de voix) : 10.0 (forte pénalité)
- `w5` (saut de registre) : 1.0
- `w6` (doublures) : 0.5
- `w7` (tension des mains) : 0.5
- `w8` (préférence stylistique) : 0.2

### 10.3 Algorithme déterministe

1. Générer tous les candidats valides pour l’accord courant.
2. Si `previousVoicing` existe, calculer `score(C, previous)` pour chaque candidat.
3. Sinon, utiliser le score intrinsèque (régularité, compacité, style).
4. Sélectionner le candidat avec le score minimal.

---

## 11. Intégration UI

### 11.1 Affichage minimal V1

Dans l’onglet Analyse, ajouter une section compacte sous le panneau hero :

- **Style selector** : Simple / Close / Jazz / Gospel (V1.0 : Simple + Close ; Jazz/Gospel ultérieurement).
- **Voicing display** : deux mini-claviers empilés ou une vue en liste :
  - Main gauche : notes en bleu/gris.
  - Main droite : notes en orange/couleur vive.
- **Bouton play** : joue le voicing courant via `simple-synth.playNote()`.
- **Info metadata** : inversion, rootless oui/non, omittedTones.

### 11.2 Interaction avec les corrections manuelles

Dès qu’un accord est corrigé (override, undo, redo, rechargement projet), le voicing doit être recalculé automatiquement pour le segment actif.

### 11.3 Alternatives

Prévoir un bouton « alternative suivante » pour parcourir les 2–4 meilleurs candidats. Non obligatoire en V1.0.

---

## 12. Export MIDI voicings

### 12.1 Deux modes d’export distincts

1. **Export accords** (existant, Phase D) : une note par pitch class harmonique.
2. **Export voicings piano** (nouveau) : deux pistes ou deux canaux, LH et RH séparés.

### 12.2 Format proposé

```json
{
  "mode": "voicings",
  "tracks": [
    { "name": "Left Hand", "channel": 0, "program": 1 },
    { "name": "Right Hand", "channel": 1, "program": 1 }
  ]
}
```

Chaque segment génère des événements `note_on` / `note_off` sur les deux pistes, aux temps `startTime` / `endTime` du segment.

### 12.3 Non-régression

L’export voicings ne remplace pas l’export accords. L’utilisateur choisit explicitement le mode.

---

## 13. Phases de mise en œuvre

| Phase | Livrable | Validation |
|-------|----------|------------|
| **Phase 0** | Corpus de voicings attendus et invariants musicaux | Document validé avec les cas Fm7/D, C/E, Dm7–G7–Cmaj7, etc. |
| **Phase 1** | Générateur stateless Close/Simple | Tous les accords V1 produisent un voicing jouable, tests deterministes. |
| **Phase 2** | Séparation main gauche / main droite | Pas de croisement, basse slash respectée, registres respectés. |
| **Phase 3** | Voice leading contextual | Progressions II-V-I fluides, notes communes conservées. |
| **Phase 4** | Style Jazz + rootless | Guide tones, rootless optionnel, pas d’ambiguïté excessive. |
| **Phase 5** | Style Gospel | LH riche, RH couleur, mouvements liés. |
| **Phase 6** | Interface utilisateur | Sélecteur de style, affichage LH/RH, bouton play, recalcul sur correction. |
| **Phase 7** | Export MIDI voicings | Fichier MIDI avec LH/RH séparés, temps corrects, octaves exactes. |

**Décision :** seules les Phases 0–2 sont obligatoires pour déclarer V1 fonctionnelle. Les Phases 3–7 peuvent être livrées en itérations successives.

---

## 14. Tests musicaux bloquants

### 14.1 Corpus de test

| Accord | Attendu |
|--------|---------|
| `C` | LH=C2, RH=E3-G3-C4 |
| `Cm` | LH=C2, RH=Eb3-G3-C4 |
| `C7` | LH=C2, RH=E3-G3-Bb3-C4 |
| `Cmaj7` | LH=C2, RH=E3-G3-B3-C4 |
| `Cm7` | LH=C2, RH=Eb3-G3-Bb3-C4 |
| `Cm7b5` | LH=C2, RH=Eb3-Gb3-Bb3-C4 |
| `Cdim` | LH=C2, RH=Eb3-Gb3-C4 |
| `Caug` | LH=C2, RH=E3-G#3-C4 |
| `Csus2` | LH=C2, RH=D3-G3-C4 |
| `Csus4` | LH=C2, RH=F3-G3-C4 |
| `C/E` | LH=E2, RH=G3-C4-E4 |
| `Fm7/D` | LH=D2, RH=F3-Ab3-C4-Eb4 |

### 14.2 Tests supplémentaires

- Transposition dans les 12 tonalités (C, C#, D, … B).
- Registres extrêmes (bas trop bas, droite trop haute → fallback).
- Impossibilité physique → fallback Close position avec alerte.
- Maintien des notes communes entre Dm7 et G7.
- Progression Dm7 – G7 – Cmaj7.
- Accords répétés (doit produire le même voicing en mode stateless).
- Corrections manuelles (`Fmaj7` → `Fm7/D`) : basse D devient la note grave.
- Absence de croisement des mains.
- Déterminisme : même entrée → même sortie.

---

## 15. Décisions architecturales

### 15.1 Règles fixes vs génération combinatoire

**Décision :** génération combinatoire restreinte. Pour chaque accord, on génère 4–8 candidats d’octaves (positions proches et drop-2 légères), puis on filtre et on score. Pas de règle fixe unique, pas d’explosion combinatoire.

### 15.2 Nombre maximal de candidats

8 candidats par accord par style. Suffisant pour couvrir les positions utiles sans lenteur.

### 15.3 Fallback en cas d’accord impossible

1. Essayer le style demandé avec les contraintes par défaut.
2. Si échec, essayer le style Close avec les mêmes contraintes.
3. Si échec, relâcher `maxRightSpan` à 24 et `rightHandMax` à 96.
4. Si touche, retourner le résultat avec `metadata.fallback = true` et `metadata.warning`.

### 15.4 Fonctionnement sans accord précédent

Mode stateless. Le score se base uniquement sur la compacité et la conformité au style.

---

## 16. Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Complexité stylistique trop grande | V1.0 limité à Simple + Close. |
| Croisement des mains | Interdit par défaut, testé unitairement. |
| Doublures excessives | Pénalité dans le scorer ; limite 1 doublure par main. |
| Rootless ambigu | Interdit pour les triades ; rootless = false par défaut. |
| Performance | 8 candidats max, scoring O(n²) acceptable. |
| Non-régression export MIDI | Export voicings est un mode séparé, l’export accords reste par défaut. |

---

## 17. Critères de réussite V1

- [ ] Tout accord du périmètre V1 produit un voicing jouable avec LH et RH.
- [ ] La basse slash est la note la plus grave dans 100 % des cas possibles.
- [ ] Aucun croisement de main dans le mode par défaut.
- [ ] Le mode Close position est déterministe et sert de fallback universel.
- [ ] Les notes MIDI correspondent aux pitch classes de l’accord effectif (pas de détection audio recalculée).
- [ ] Les tests unitaires couvrent les 12 accords du corpus + transpositions + progressions.
- [ ] L’interface affiche LH/RH sans surcharger l’écran actuel.
- [ ] L’export MIDI voicings est disponible mais ne remplace pas l’export accords.
- [ ] Aucun moteur d’analyse, aucune frontière temporelle, aucun fichier de projet modifié.

---

## 18. Livrables immédiats attendus

1. Validation du présent plan.
2. Début de la Phase 0 (corpus de voicings attendus).
3. Implémentation Phase 1 (Close / Simple stateless).

---

TWO_HAND_VOICING_ENGINE_V1_PLAN_READY

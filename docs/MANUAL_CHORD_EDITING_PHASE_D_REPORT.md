# Manual Chord Editing — Phase D : Propagation aux exports et statistiques

## Statut

**Phase D implémentée et testée unitairement.**

- 103 tests Phase A/B + 19 tests Phase D + 25 régressions = 147 tests pass.
- Build Vite : OK.

`MANUAL_CHORD_EDITING_PHASE_D_VALIDATED`

---

## 1. Objectif

Tous les résultats destinés à l'utilisateur utilisent désormais :

```javascript
effectiveChord = manualOverride ?? detectedChord;
```

La détection originale reste intacte et disponible dans les métadonnées.

---

## 2. Source de vérité unique

Fonction canonique utilisée partout :

```js
getEffectiveChord(segment) // depuis src/ui/chord-editor.js
```

C'est la même fonction que la timeline et le panneau hero.

Les exports MIDI, JSON et texte, ainsi que les statistiques, n'utilisent **jamais**
directement `segment.chord`. Ils passent tous par `getEffectiveChord()`.

---

## 3. Fichiers modifiés ou créés

| Fichier | Rôle |
|---------|------|
| `src/analyzer/analysis-export.js` | **Nouveau** — export MIDI, export JSON, export texte, statistiques, tous basés sur `effectiveChord` |
| `src/analyzer/midi-exporter.js` | Réexporte `exportAnalysisToMidi` depuis `analysis-export.js` pour compatibilité |
| `src/ui/analyzer-tab.js` | Handlers MIDI/JSON/texte, affichage des statistiques, messages de confirmation avec compteur de corrections |
| `src/index.html` | Boutons Export JSON + Copier texte + section Statistiques |
| `src/analyzer/test-analysis-export.js` | **Nouveau** — 19 tests Phase D |

Aucun moteur d'analyse, aucune frontière temporelle, aucun rapport historique
modifié.

---

## 4. Export MIDI

### Contrat

- Utilise `getEffectiveChord(chord)` pour obtenir l'accord effectif.
- Les hauteurs sont calculées via `deriveChordDisplay()` et les définitions
  canoniques de `src/chord-engine/chord-defs.js`.
- Les slash chords placent la basse comme note la plus grave :
  - si la basse est déjà dans l'accord, l'instance existante est descendue
    d'une octave ;
  - si la basse est externe, elle est ajoutée une octave en dessous.
- Aucune nouvelle piste de basse n'est inventée silencieusement.

### Exemple bloquant : Fmaj7 → Fm7/D

Avant correction (Fmaj7) : F, A, C, E  
Après correction (Fm7/D) : F, Ab, C, Eb + D (basse la plus grave)

Aucun A naturel n'est exporté.

### Rétrocompatibilité

`exportAnalysisToMidi(analysis, options)` garde la même signature et les mêmes
options que l'ancienne version.

---

## 5. Export JSON

Structure du fichier exporté :

```json
{
  "schemaVersion": 1,
  "exportedAt": "ISO string",
  "title": "...",
  "duration": 120,
  "tempo": 120,
  "timeSignature": "4/4",
  "key": "C",
  "manuallyEditedCount": 2,
  "segments": [
    {
      "segmentId": "...",
      "startTime": 0,
      "endTime": 2,
      "duration": 2,
      "detectedChord": { "symbol": "Fmaj7", "root": 5, "quality": "maj7", "bass": null },
      "manualOverride": { "root": 5, "quality": "m7", "bass": 2 },
      "effectiveChord": { "symbol": "Fm7/D", "root": 5, "quality": "m7", "bass": 2 },
      "wasManuallyEdited": true
    }
  ]
}
```

- `symbol` principal = `effectiveChord.symbol`
- Provenance automatique conservée dans `detectedChord` et `manualOverride`

---

## 6. Export texte

Grille exportée avec le symbole effectif. Les corrections manuelles sont
marquées d'une astérisque `*`.

```
# Test Analysis
# Duration: 00:10.00
# Tempo: 120 BPM
# Key: unknown

00:00.00 - 00:02.00    Fm7/D *
00:02.00 - 00:04.00    C
```

---

## 7. Statistiques produit

Panel visible dans l'onglet Analyse. Utilise `effectiveChord`.

Métriques affichées :

- nombre de segments ;
- durée totale ;
- nombre de corrections manuelles ;
- nombre de slash chords (basse réellement différente des notes de l'accord) ;
- répartition par qualité ;
- accords les plus utilisés.

Les métriques techniques d'évaluation du moteur (non affichées ici) restent
fondées sur `detectedChord` car elles n'ont pas été modifiées.

---

## 8. Tests Phase D

Fichier `src/analyzer/test-analysis-export.js` — 19 tests :

- export sans correction identique au comportement précédent ;
- Fmaj7 → Fm7/D : pitch classes correctes, pas de A naturel ;
- Gm7b5 : G, Bb, Db, F ;
- Fsus4 : F, Bb, C ;
- suppression d'override : retour exact à la détection ;
- temps inchangés après correction ;
- slash chords (basse dans accord et basse externe) ;
- segment N ignoré ;
- plusieurs corrections sur un même projet ;
- fichier SMF généré parsable ;
- JSON : detected / manualOverride / effective / wasManuallyEdited ;
- JSON segment non corrigé : manualOverride null ;
- texte utilise le symbole corrigé ;
- texte marque les corrections ;
- statistiques utilisent effectiveChord ;
- Fm7/D compte comme slash chord ;
- C/E (basse dans accord) ne compte pas comme slash chord.

---

## 9. Comparaison MIDI avant / après correction

Les tests comparent les événements MIDI générés par
`buildAnalysisMidiEvents()`. Pour Fmaj7 → Fm7/D :

- **Avant** : pitch classes `{0, 5, 9}` (Fmaj7 : F-A-C-E)
- **Après** : pitch classes `{0, 2, 3, 5, 8}` (Fm7/D : F-Ab-C-Eb + D)
- **Temps** : identiques (startTime/endTime du segment)

Un script de génération de fichiers MIDI de comparaison peut être ajouté si
besoin ; les tests unitaires couvrent déjà la comparaison des pitch classes et
des temps.

---

## 10. Interface utilisateur

- Bouton "Exporter l'analyse en MIDI" → toast avec compteur de corrections.
- Bouton "Exporter en JSON" → sauvegarde `.json` avec métadonnées.
- Bouton "Copier la grille texte" → presse-papiers.
- Section "Statistiques" affichée après analyse.

Messages de confirmation :

```
MIDI exporté — 2 accord(s) corrigé(s) manuellement inclus(s) vers /chemin.mid
JSON exporté — 2 correction(s) manuelle(s) vers /chemin.json
Grille texte copiée — 2 correction(s) manuelle(s)
```

---

## 11. Limites restantes

- Édition temporelle (Phase C) non commencée.
- Générateur de voicings main gauche/main droite non commencé.
- Pour les slash chords, l'export MIDI place la basse comme note la plus grave
  dans la piste d'accords ; il n'y a pas encore de piste de basse dédiée
  séparée (le contrat actuel ne le prévoyait pas).
- Aucun export texte/JSON existait avant cette phase ; ils ont été créés ici.

---

## 12. Protection

- Aucun fichier Python modifié.
- Aucun algorithme de `structured_harmony_v1`, Viterbi, downgrade ou
  segmentation modifié.
- Corpus, rapports historiques et configurations gelées intacts.
- Frontières temporelles des segments préservées bit-à-bit.

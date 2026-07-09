# Independent Bass Detection — Design Document

> Conception d'un moteur de détection de basse indépendant pour enrichir la
> sortie harmonique avec des slash chords (C/E, G/B, D/F#, etc.).
> Phase ouverte le 2026-07-09 — baseline officielle du HMM déjà figée.

---

## 1. Problème posé

Le moteur HMM actuel détecte des accords avec fondamentale et qualité
(G, Cmaj7, Dm7, etc.) mais ne distingue pas la note de basse lorsque
celle-ci diffère de la fondamentale. Or, dans le jazz et le gospel,
les slash chords sont essentiels :

| Notation | Accord | Basse |
|---|---|---|
| G/B | Sol majeur | Si |
| D/F# | Ré majeur | Fa# |
| C/E | Do majeur | Mi |
| Am7/G | La mineur 7 | Sol |

Un slash chord n'est pas un changement d'accord — c'est un changement de
voicing. La basse peut être n'importe quelle note de l'accord (ou une note
étrangère) sans que la fonction harmonique change.

---

## 2. Approches envisagées

### Approche A — CQT basse plage + chroma replié (retenue pour le prototype)

**Principe :**
- Calculer une CQT complète sur le signal brut (pas de filtrage)
- Extraire uniquement le registre grave (C1–C5, ~32–523 Hz)
- Replier l'énergie CQT sur 12 pitch classes (somme par classe sur toutes
  les octaves du registre grave)
- Détecter le pic par frame → lisser temporellement → segmenter

**Avantages :**
- Aucun filtrage destructif du signal
- Utilise la même bibliothèque (librosa) que le HMM — pas de nouvelle
  dépendance
- Résolution de 3 bins/semi-ton (bins_per_octave=36) → bonne précision
  fréquentielle même dans le grave
- Indépendant du HMM par construction : peut être testé séparément
- Le repliement par pitch class permet de gérer les changements d'octave
  (basse qui passe de C2 à C3)

**Limites :**
- Confusion possible entre fondamentale et basse quand elles coïncident
  (c'est le cas le plus fréquent — pas de slash chord)
- Sensible au bruit dans le grave (grosse caisse, contrebasse en pizz,
  synthétiseurs sub-grave)
- Pas de connaissance harmonique (ne sait pas que D/F# est plus probable
  que D/F en tonalité de Sol majeur)
- La résolution d'octave est perdue par le repliement — on sait que c'est
  un "C" mais pas si c'est C2 ou C3

### Approche B — CQT + suivi multipitch (DIFFICILE)

**Principe :**
- Utiliser un estimateur multipitch (p. ex. CREPE, pYIN, ou un réseau
  pré-entraîné) pour détecter toutes les notes actives simultanément
- Isoler la plus grave des notes détectées comme candidate basse
- Suivi temporel + règles harmoniques

**Avantages :**
- Détection explicite de l'octave
- Théoriquement plus précis quand plusieurs notes sont jouées
- Peut distinguer la fondamentale de la basse quand elles sont
  simultanées (arpège à l'envers : basse jouée avant l'accord)

**Limites :**
- Dépendance lourde (modèle ML ou algorithme d'estimation de pitch)
- pYIN/CREPE sont conçus pour la mélodie, pas pour le registre grave
- Temps de calcul beaucoup plus long
- Surcharge de maintenance (modèle à télécharger, version à gérer)
- Peu adapté au temps réel / WAF

### Approche C — Sous-bande CQT + réseau de règles harmoniques

**Principe :**
- Même CQT que l'approche A
- Ajouter un post-traitement qui utilise la tonalité détectée et le
  degré de l'accord courant pour filtrer les candidats basse :
  - En Sol majeur, G/B est plausible (Si = tierce), mais G/C# ne l'est pas
  - D/F# est plausible (Fa# = tierce majeure de D), mais D/F ne l'est pas
- Pondérer les candidats basse par leur rôle diatonique dans la tonalité

**Avantages :**
- Meilleure discrimination sans ajouter de modèle ML
- Réutilise la détection de tonalité déjà présente
- Les règles sont simples et documentables

**Limites :**
- Dépend de la tonalité détectée (si la tonalité est fausse, la basse
  aussi)
- Ne couvre pas les emprunts modaux et altérations (fréquents en jazz)
- Nécessite une intégration avec le HMM (perd l'indépendance)

### Approche D — CQT + Viterbi autonome

**Principe :**
- Même CQT que l'approche A
- Remplacer le lissage médian par un petit HMM dédié à la basse
  (12 états = 12 pitch classes)
- Matrice de transition : quinte = −0.02, gamme = −0.05, chromatique = −0.10
- Observations : chroma replié normalisé
- Viterbi → segmentation

**Avantages :**
- Suivi temporel plus robuste que la médiane
- Promeut les mouvements de basse musicaux (quintes, degrés conjoints)
- Reste indépendant du HMM principal (son propre Viterbi)
- Paramétrable sans toucher au moteur HMM

**Limites :**
- Complexité supplémentaire par rapport à la médiane
- Deux Viterbi dans le projet (un pour les accords, un pour la basse)
- Risque de duplication de code

---

## 3. Choix retenu pour le prototype

**Approche A (CQT basse + chroma replié + lissage médian).**

Justification :
- Le prototype doit être simple, indépendant, et testable rapidement
- Approche D pourra être adoptée en phase 2 si le lissage médian s'avère
  insuffisant
- Les approches B et C sont prématurées avant d'avoir une référence de
  qualité sur les performances de A

**Décision différée :**
- Si la précision basse dépasse 80 % avec A → intégration directe
- Si elle est inférieure à 60 % → passage à D (Viterbi)
- Si elle est entre 60 et 80 % → A + C (règles harmoniques)

---

## 4. Architecture du prototype

```
scripts/bass-detector.py
├── CLI : analyze <wav> [--output <json>]
│   ├── load_audio(y, sr)
│   ├── compute_bass_chroma(y, sr) → CQT → fold → normalize
│   ├── detect_candidates(chroma) → per-frame peak picking
│   ├── track_bass(candidates) → median smooth → segment
│   └── export_json(bass_segments, wav, duration, tempo)
│
└── CLI : benchmark <reference.json>
    ├── parse_reference_bass(ref) → extract bass from slash chords
    ├── detect_bass() → run full pipeline
    ├── needleman_wunsch(ref_bass, det_bass) → alignment
    └── metrics(bass_acc, slash_acc, temporal_coherence, fragmentation)
```

### Paramètres CQT

| Paramètre | Valeur | Justification |
|---|---|---|
| `sr` | 22050 Hz | Identique au HMM |
| `hop_length` | 512 | Identique au HMM |
| `bins_per_octave` | 36 | 3 bins/semi-ton (identique au HMM) |
| `fmin` | 32.7 Hz | C1 — début du registre basse |
| `n_bins` | 144 | 4 octaves (→ C5) |
| `window` | `'hann'` | Fenêtre standard CQT |

### Paramètres de tracking

| Paramètre | Valeur | Rôle |
|---|---|---|
| `median_window` | 3 frames | Lissage temporel |
| `energy_threshold` | 0.05 | Seuil plancher de confiance |
| `min_segment_duration` | 0.2 s | Fusion des micro-segments |

---

## 5. Métriques du benchmark

| Métrique | Calcul |
|---|---|
| **Bass accuracy** | % d'accord entre basse détectée et basse référence (alignement NW) |
| **Slash chord accuracy** | Idem, restreint aux positions où la référence a un slash chord |
| **Temporal coherence** | `changements_basse / nombre_de_mesures` |
| **Fragmentation** | `segments_détectés / segments_référence` (1.0 = parfait) |
| **Segments/min** | `segments_détectés / durée * 60` |

---

## 6. Résultat attendu

Un prototype fonctionnel capable de :

```
$ python scripts/bass-detector.py analyze /chemin/vers/audio.wav
→ JSON timeline avec {startTime, endTime, bass, confidence}

$ python scripts/bass-detector.py benchmark tests/references/amazing_grace_gospel_piano.json
→ Tableau comparatif avec précision basse + slash chords + cohérence
```

Après validation du prototype, la stratégie d'intégration sera discutée :

1. **Séquence simple** : la sortie basse est ajoutée à la sortie HMM
   existante sans modification du HMM (fusion tardive)
2. **Intégration dans le Viterbi** : le HMM est étendu avec des états
   de basse (impact sur la matrice de transition — nécessite nouvelle
   phase d'expérimentation)
3. **Post-traitement** : slash chords générés par règles heuristiques
   entre la fondamentale HMM et la basse détectée

# Comparaison A/B — `_downgrade_advanced_segments`

## Méthode

- **Variante A** (`legacy_family_fix`) : ancienne comparaison par produit scalaire
  de templates normalisés, seuil global 0.03.
  Seule modification : `SIMPLE_TRIAD_FOR_SUFFIX['m7'] = [0,3,7]`.
- **Variante B** (`distinctive_interval`) : nouvelle mesure directe de l'énergie
  relative sur l'intervalle distinctif (7ème, 2nde, 4te), seuils par suffixe
  (`7`/`m7`:0.08, `maj7`:0.15, `sus`:0.20).

Même pipeline HMM (Viterbi, observation, transition) hors fonction de downgrade.
Même post-traitement (`_clean_segments`, min_duration=0.4s).

Commandes :
```
python electron/audio-processor.py analyze-chords <fichier> legacy legacy_family_fix
python electron/audio-processor.py analyze-chords <fichier> legacy distinctive_interval
```

## Fichiers synthétiques

`tests/audio/jazz_Dm7_G.wav`, `jazz_Cmaj9.wav`, `jazz_G13.wav` : **2 secondes chacun**.
Trop courts pour le pipeline beat-synchrone (tempo=null, chords=[]). Exclus de la comparaison. Leur format convient à des tests d'extraction de chromagramme ou de réseau, pas à la chaîne HMM complète.

## Fichier Autumn Leaves

`/home/visiteur/Musique/Bill Evans - Autumn Leaves - Piano Solo Transcription.mp3` (164 s, 51.7 BPM, détecté Gm).

---

## Résultats bruts

### Amazing Grace (G, 71.8 BPM, 123 s)

| Qualité | A (seg/dur) | B (seg/dur) | Différence |
|---------|:----------:|:----------:|:----------:|
| `(major)` | 40 / 49.8s (40.4%) | 41 / 50.8s (41.2%) | +1.0s |
| `sus4` | 31 / 26.4s (21.4%) | 29 / 25.0s (20.3%) | -1.4s |
| `m` | 21 / 19.6s (15.9%) | 21 / 19.6s (15.9%) | — |
| `m7` | **14 / 13.4s (10.9%)** | **14 / 13.4s (10.9%)** | — |
| `sus2` | 6 / 7.9s (6.4%) | 5 / 7.0s (5.7%) | -0.9s |
| `maj7` | 3 / 2.5s (2.0%) | 4 / 2.9s (2.4%) | +0.4s |
| `dim` | 3 / 1.7s (1.4%) | 3 / 1.7s (1.4%) | — |
| `7` | **2 / 1.6s (1.3%)** | **3 / 2.4s (2.0%)** | **+0.8s** |
| `aug` | 1 / 0.4s (0.3%) | 1 / 0.4s (0.3%) | — |
| Total segs | 121 | 121 | — |
| < 0.4s | 0 | 0 | — |

Différence clé : B conserve **D7 à t=109.2s** (segment II-V-I), A le downgrade en D.

### Gospel (D#, 129.2 BPM, 30 s)

| Qualité | A (seg/dur) | B (seg/dur) | Différence |
|---------|:----------:|:----------:|:----------:|
| `maj7` | 9 / 7.0s (23.3%) | 10 / 7.4s (24.8%) | +0.4s |
| `7` | 3 / 6.9s (23.1%) | 3 / 6.9s (23.1%) | — |
| `sus4` | 3 / 4.6s (15.3%) | 3 / 4.6s (15.3%) | — |
| `(major)` | 8 / 4.2s (14.0%) | 7 / 3.8s (12.5%) | -0.4s |
| `m7` | **5 / 4.1s (13.7%)** | **7 / 5.0s (16.8%)** | **+0.9s** |
| `m` | 4 / 1.8s (6.0%) | 2 / 0.9s (2.9%) | -0.9s |
| `sus2` | 2 / 1.4s (4.6%) | 2 / 1.4s (4.6%) | — |
| Total segs | 34 | 34 | — |

Différence clé : B conserve **2 segments m7 supplémentaires** (Dm→Dm7, etc.) qui
sont downgradés en m par le seuil global 0.03 de la variante A.

### Worship (A, 53.8 BPM, 60 s)

| Qualité | A (seg/dur) | B (seg/dur) | Différence |
|---------|:----------:|:----------:|:----------:|
| `(major)` | 15 / 23.0s (38.3%) | 20 / 29.2s (48.7%) | **+6.2s** |
| `sus4` | 18 / 13.0s (21.7%) | 16 / 9.6s (15.9%) | -3.4s |
| `sus2` | 9 / 8.0s (13.4%) | 6 / 5.2s (8.7%) | -2.8s |
| `m` | 9 / 7.3s (12.1%) | 9 / 7.3s (12.1%) | — |
| `m7` | 10 / 7.0s (11.6%) | 10 / 7.0s (11.6%) | — |
| Total segs | 63 | 63 | — |

B downgrade plus de sus2/sus4 vers major. Sans ground truth, difficile de conclure.
La musique worship utilise réellement beaucoup de sus ; B pourrait être trop agressif.

### Autumn Leaves (Gm, 51.7 BPM, 164 s)

| Qualité | A (seg/dur) | B (seg/dur) | Différence |
|---------|:----------:|:----------:|:----------:|
| `maj7` | 101 / 80.4s (49.0%) | 108 / 84.6s (51.6%) | +4.2s |
| `sus2` | 50 / 36.4s (22.2%) | 46 / 32.9s (20.1%) | -3.5s |
| `m7` | 25 / 15.2s (9.3%) | 26 / 15.8s (9.6%) | +0.6s |
| `sus4` | 16 / 10.7s (6.5%) | 15 / 10.1s (6.2%) | -0.6s |
| `(major)` | 12 / 7.9s (4.8%) | 8 / 6.4s (3.9%) | -1.5s |
| `m` | 7 / 4.7s (2.8%) | 6 / 4.1s (2.5%) | -0.6s |
| `aug` | 6 / 4.0s (2.4%) | 6 / 4.0s (2.4%) | — |
| `dim` | 4 / 2.4s (1.5%) | 4 / 2.4s (1.5%) | — |
| `m7b5` | 3 / 1.9s (1.1%) | 3 / 1.9s (1.1%) | — |
| `7` | **1 / 0.6s (0.4%)** | **3 / 1.8s (1.1%)** | **+1.2s** |
| Total segs | 225 | 225 | — |

15 segments différents sur 225 (6.7%).

Segments `7` (B seulement) :
- t=0.0s D7 (obs#1=Gsus2, D7 en #2)
- t=102.6s F7 (obs#1=Dm, F7 en #2)
- t=108.4s F7 (obs#1=F7)

Segments `maj7` conservés par B mais pas par A :
- F→Fmaj7 (t=20.2s), F#→F#maj7 (×3), D→Dmaj7 (t=76.5s), A#→A#maj7 (×2)

Segments suspendus downgradés par B mais pas par A :
- F#sus4→F#, Gsus2→G, Asus2→A, Dsus2→D (×1 chacun)

## Analyse

### Variante A — Correctif minimal
**Avantages** : changemet minimal, comportement connu, sus2/sus4 préservés.
**Inconvénients** : `7` reste sous-représenté (D7 perdu dans Amazing Grace, 1 seul dans Autumn Leaves). Le seuil global 0.03 ne distingue pas les suffixes.

### Variante B — Nouvelle heuristique
**Avantages** : D7 survit dans Amazing Grace (II-V-I). +1 m7 dans Gospel, +2 m7 dans Gospel, +2 `7` dans Autumn Leaves. Seuils par suffixe plus fins.
**Inconvénients** : plus de sus2/sus4 downgradés en major (Worship : -3.4s sus4, -2.8s sus2 ; Autumn Leaves : -3.5s sus2). Sans ground truth, difficile de savoir si ces sus étaient réels ou artefact.

### Points communs
- `m7` parfaitement préservé dans les deux variantes (le correctif [0,3,7] est le même).
- `m7b5` : 3 segments dans Autumn Leaves pour les deux (correct). Ni A ni B n'en perd.
- `dim` : identique partout.
- Même nombre total de segments (inchangé).
- Aucune augmentation de la fragmentation.

### Limitation commune aux deux variantes
`maj7` domine Autumn Leaves (~50%) — c'est une limitation du Viterbi en amont :
le template `maj7` (poids 0.9 sur la 7ème majeure) surpasse systématiquement `7`
(poids 0.4 sur la 7ème mineure). Ce biais n'est pas corrigé par le downgrade.

## Recommandation

Les deux variantes sont valables pour l'objectif visé (corriger la famille de `m7`).
Le choix dépend de la tolérance au changement :

- **Variante A** si la priorité est la stabilité et la prévisibilité.
- **Variante B** si l'on accepte plus de changements pour gagner des segments
  `7` supplémentaires, au risque de perdre quelques sus2/sus4 légitimes.
- **Ni l'une ni l'autre** si on veut d'abord corriger le biais `maj7` du Viterbi.

La différence réelle est modeste : 6.7% des segments changent dans Autumn Leaves,
5.8% dans Amazing Grace, 8.8% dans Gospel, 7.9% dans Worship.

## Fichiers JSON

- `/tmp/opencode/comparison/legacy_family_fix/` — Variante A
- `/tmp/opencode/comparison/distinctive_interval/` — Variante B

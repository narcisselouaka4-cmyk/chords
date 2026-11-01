# À reporter dans le vault — 2026-09-24

> Le vault Obsidian vit sur le PC (`/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord/`),
> hors d'atteinte de la session cloud qui a fait ce travail. Ce fichier contient les ajouts
> prêts à copier, fichier par fichier du vault. Une fois reportés, ce fichier peut être supprimé.
>
> Travail : commit `bec0236` sur la branche `fix/exercices-voicing-correctifs`.

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 — Exercices : mouvements réparés, Drop 3 recentrés, validation sur l'accord annoncé
- Session cloud Claude, branche fix/exercices-voicing-correctifs, commit bec0236.
- « II-V-I altéré en mineur » et « Cycle de tierces majeures » ne sont plus remplacés en silence ;
  « Tritone substitution V7 » (Db7) et « V/V vers I » (D7) jouent enfin le bon accord.
- Tout remplacement de mouvement ou de progression est annoncé dans la bulle de retour.
- Drop 3 : descendus d'une octave tant que le milieu du voicing dépasse Do5.
- Réponse d'exercice jugée sur l'accord annoncé (judgeAnswer), plus sur la lecture du voicing affiché.
- Progression tapée en symboles réparée (nom Tonal « major seventh » → qualité de l'app « maj7 »).
- Tests : exercices 404/404, catalogue 120 ✓, test:chords 98/98, Parties 1 et 3 OK, build OK.
```

## `state/current-state.md` — à fusionner

- **Exercices → Mouvement 12 tons** : les 12 mouvements de `src/data/movements-library.json` se
  construisent dans les 12 tons × 5 niveaux (test `checkMovementLibraryComplete`). Jeton = degré
  puis qualité (`2m7b5`, `5alt`, `1mMaj7`), ou `degré:qualité` quand la qualité commence par un
  chiffre (`b3:7` = bIII7). Le `b`/`#` altère le degré : `b5alt` = accord altéré sur bV.
- **Remplacements** : jamais silencieux. `progression.notice` est affichée par
  `showExerciseNotice` (`src/main.js`) dans la bulle de retour.
- **Validation d'une réponse** (`judgeAnswer`, `src/practice-exercise.js`) : la cible est l'accord
  annoncé. Réponse juste si (1) elle rejoue le voicing affiché (mêmes classes de hauteur, même
  basse, n'importe quelle octave), (2) `detectChord` nomme exactement l'accord annoncé, ou
  (3) `realizesChord` : notes qui définissent l'accord présentes, aucune note étrangère à l'accord
  ni au voicing affiché, au moins 3 notes avec fondamentale (4 sans), basse = 1, 3 ou 5 quand la
  fondamentale est jouée. Un accord juste que le détecteur ne sait pas nommer (« ? ») est validé.
- **Registre Drop 3** (`withPlayableRegister`) : octave abaissée tant que
  (note la plus grave + note la plus aiguë) / 2 > Do5 ; `voicing.octaveShift` ; info-bulle
  « une octave plus bas que VoicingLab ». Le référentiel `voicinglab-reference.json` est inchangé.

## `state/current-work.md` — à fusionner

- Fait le 24/09 : les 4 points demandés (II-V-I altéré en mineur, cycle de tierces majeures,
  registre des Drop 3, validation) + la progression tapée en symboles.
- À vérifier dans l'app :
  1. Bibliothèque → Mouvement 12 tons → « II-V-I altéré en mineur » : reste affiché, grille
     Dm7b5 → G7#9b13 → CmMaj7 en Do mineur (G7#9b13 = G7 altéré avec #9 et b13, l'accord
     d'exemple G7(#9#5)).
  2. « Cycle de tierces majeures » : Cmaj7 Eb7 Abmaj7 B7 Emaj7 G7 Cmaj7.
  3. Accord cible Bmaj7, technique Drop 3 : B3 | A#4 D#5 F#5 (avant : B4 | A#5 D#6 F#6).
  4. Accord cible C6, technique Shell (Do Mi La affiché) : jouer Do Mi Sol La → validé ;
     jouer La Do Mi → refusé avec « Vous avez joué Am ».

## `state/next-actions.md` — à ajouter

- **Décision à prendre : étendre le recentrage de registre aux autres familles ?** Même cause que
  pour Drop 3 (VoicingLab transpose Do vers le haut, jusqu'à +11 demi-tons) : Drop 2 (148 voicings
  au-dessus de Do6, main gauche jusqu'à Ré#5), Drop 2-4, Close, Block, 4-way close, Upper
  structure ; main gauche de Shell / Rootless / Stride jusqu'à Mi5–Sol#5 dans les tons aigus.
  Il faut un seuil par famille : la règle « milieu ≤ Do5 » déplacerait 82 % des Drop 2, y compris
  des voicings en Do.
- **Contenu de mouvements à arbitrer** (non modifié, `src/data/movements-library.json`) :
  - « IV-V-iii-vi pop » : le motif 4-5-6-2 joue IV V vi ii (exemples F G Am Dm), pas IV V iii vi.
  - « Turnaround chromatique 3-6-2-5 » : le VI sort en Am7, l'exemple indique A7(b9).
  - « Passing 2-5-1 ouvert » : motif 7-3-6-2-5 (B7 Em7 Am7 Dm7 G7), exemples Dm7 G7 Cmaj9.
  - « Montée diatonique en quartes » : exemples avec basses F/A et G/B, qui ne sont pas jouées.
  - « II-V-I altéré en mineur » : la description parle de « diminished scale », alors que le V
    est G7#9b13 (gamme altérée).
- **Parseur** : `parseChordSymbol('C6/9')` renvoie « sixth » (la 9e est perdue). Contourné pour la
  saisie de progression, pas corrigé dans `src/pedagogie/chord-parser-v2.js`.
- **Tests UI en échec, préexistants et inchangés** : `src/ui/test-training-dom.js` (47 éléments DOM
  absents depuis la refonte), `tests/ui/test-workspace-navigation-d2.js` (8/10).
- La saisie de progression en symboles n'a pas de champ dans l'interface : seule la saisie par
  degrés existe.

## `decisions/` — trois décisions (numéros à attribuer après ADR-013)

### Réponse d'exercice jugée sur l'accord annoncé

- **Contexte** : `check()` prenait pour cible `detectChord(voicing affiché)`. Mesure sur tous les
  voicings affichables : 4 859 sur 7 969 (61 %) sont lus comme un autre accord (Shell de C6 =
  Do Mi La → « Am » ; rootless de Cmaj7 → « Em7 »). Conséquence observée sur l'ancien code : un vrai
  C6 était refusé avec « ❌ Vous avez joué C6. Cible : C6 », un La mineur accepté comme C6.
- **Décision** : la cible est l'accord annoncé (fondamentale + qualité). Trois voies
  d'acceptation (voir l'état actuel). Le voicing affiché sert seulement à pouvoir être rejoué et à
  autoriser les tensions qu'il montre.
- **Mesures** : 100 % des voicings affichés restent validés quand on les rejoue ; l'accord annoncé en
  position fondamentale est accepté dans 100 % des cas. Sur les 4 859 lectures erronées rejouées
  en position fondamentale, 2 192 restent acceptées : 2 154 ont exactement les notes du voicing
  affiché, 14 sont des rootless de l'accord annoncé, 24 des clusters « 7 » dont le voicing
  affiché contient lui-même la #11. Aucun autre accord n'est accepté.

### Registre des Drop 3 dans l'Exercice

- **Contexte** : VoicingLab publie chaque ton en transposant Do vers le haut ; ses Drop 3 d'accords
  enrichis sont aigus dès Do (C9 : main gauche C5 D5, main droite E6 A#6). Dessus jusqu'à C7.
- **Décision** : le voicing entier descend d'une octave tant que son milieu dépasse Do5. Notes,
  écarts et mains inchangés ; référentiel non modifié ; seul Drop 3 est concerné.
- **Alternatives écartées** : voir `experiments/` ci-dessous.

### « Cycle de tierces majeures » = cycle de Coltrane

- **Contexte** : le nom, l'id (`coltrane-changes-frag-1`) et le contexte promettaient un cycle de
  tierces majeures ; le motif (`6b7`, illisible) et les exemples (Cmaj7 Em7 Eb7 Dm7) n'en
  formaient pas un.
- **Décision** : Cmaj7 Eb7 Abmaj7 B7 Emaj7 G7 Cmaj7 (Do, Lab, Mi, chacune amenée par sa dominante).
  Réversible si Narcisse préfère la descente iii – ♭III7 – ii des anciens exemples, sous un autre nom.

## `experiments/` — règles de registre pour Drop 3

1 092 voicings Drop 3 fidèles (12 tons, toutes les qualités de l'Exercice).

| Règle | Déplacés | Dessus (médiane / max) | Voix grave (min – max) | Verdict |
|---|---|---|---|---|
| VoicingLab brut | 0 | A#5 / C7 | D#3 – F5 | trop aigu |
| Dessus ≤ La5 | 582 | D#5 / A5 | E2 – F4 | écartée : C9 descend à C3 D3 (seconde sourde) |
| Grave ≤ Do4 | 656 | D#5 / F#6 | C#3 – C4 | écartée : dessus jusqu'à F#6 |
| Grave ≤ Do4 et dessus ≤ La5 (plancher Do3) | 674 | D5 / F6 | C3 – C4 | écartée : plus de déplacements, pas mieux |
| **Milieu ≤ Do5** | 535 | E5 / D#6 | A#2 – E4 | **retenue** : aucun accord de 4 sons en Do déplacé |

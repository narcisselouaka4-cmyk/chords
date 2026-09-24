# À reporter dans le vault — 2026-09-24 (suite)

> Suite du fichier `2026-09-24-exercices-mouvements-drop3-validation.md` (à reporter d'abord).
> Le vault vit sur le PC (`/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord/`), hors
> d'atteinte de la session cloud. Une fois reportés, ces deux fichiers peuvent être supprimés.
>
> Travail : branche `fix/exercices-voicing-correctifs`, commits de la session cloud du 24/09
> (voir `git log` : parseur 6/9, registre toutes familles, tests UI, vault).

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 (suite) — Registre toutes familles, parseur 6/9, tests UI remis à jour
- Registre recentré pour toutes les familles de voicings de l'Exercice (plafond du milieu
  par famille : Do4 Shell / Two-note shell / Stride, Mi4 Rootless, Mi5 4-way close, Do5 le reste).
- Parseur : C6/9 et Cm6/9 gardent leur 9e (le « / » était pris pour une basse).
- Tests UI : D2 10/10 ; test-training-dom remis sur l'interface réelle, 11 échecs voulus
  (Suggestions + historique des accords jamais branchés : décision attendue).
- Test instable corrigé (checkTechniqueSwitch). Exercices 414/414, parseur 51/51, build OK.
```

## `state/current-state.md` — à fusionner

- **Registre des voicings (Exercice)** : `withPlayableRegister` (`src/practice-exercise.js`)
  descend le voicing entier d'une octave tant que (note la plus grave + note la plus aiguë) / 2
  dépasse le plafond de sa famille (`REGISTER_CEILINGS`) :

  | Familles | Plafond du milieu | Raison |
  |---|---|---|
  | Shell, Two-note shell, Stride | Do4 (60) | main gauche seule avec la basse : basse autour de Do2–Do3 |
  | Rootless A / B | Mi4 (64) | sans fondamentale, autour du Do central (Do4 ferait tomber Gmaj7 à B2) |
  | 4-way close | Mi5 (76) | garde les renversements publiés en Do avec la mélodie à G5 |
  | Toutes les autres (Drop 2/3/2-4, Close, Block, Spread, Open, Quartal, So What, Upper structure, Cluster) | Do5 (72) | règle d'origine des Drop 3 |

  Le référentiel `voicinglab-reference.json` n'est pas modifié ; `voicing.octaveShift` et l'info-bulle
  « une octave plus bas que VoicingLab » signalent le décalage. Cluster : registre de sa main droite
  d'abord, puis main gauche ajoutée dessous.
- **Parseur d'accords** (`src/pedagogie/chord-parser-v2.js`) : seul un nom de note après « / » est une
  basse séparée ; `6/9` et `m6/9` sont normalisés en `69` / `m69` (Tonal).
- **Tests UI** : `tests/ui/test-workspace-navigation-d2.js` au vert (10/10) ;
  `src/ui/test-training-dom.js` décrit l'interface réelle (onglets, sous-navigation Entraînement,
  vues dédiées `#practice-view-exercices` / `#practice-view-midi-sessions`, panneau Techniques
  repliable, pédale testée par son comportement) ; 11 échecs restent **volontairement**.

## `state/current-work.md` — à fusionner

- Fait (suite du 24/09) : registre étendu à toutes les familles, parseur 6/9, tests UI remis à jour,
  test instable `checkTechniqueSwitch` corrigé.
- À vérifier dans l'app :
  1. Accord cible Bmaj7, Drop 2 : D#4 | A#4 B4 F#5 (avant D#5 | A#5 B5 F#6).
  2. Shell de B7 : B2 D#3 A3 (avant B3 D#4 A4) ; Rootless de Gmaj7 inchangé (B3 D4 F#4 A4).
  3. Copilot IA sur un accord 6/9 : la 9e est maintenant jouée.

## `state/next-actions.md` — à ajouter

- **Décision à prendre : panneau Suggestions et historique des accords.** Jamais branchés dans cette
  application : `src/ui/suggestions.js` (4 catégories : avant le 6e degré, voicing top notes,
  mouvements internes, rôle de la basse) n'est importé nulle part ; `chord-history.js` est alimenté à
  chaque accord détecté mais jamais affiché (depuis le premier commit ; VISION.md le prévoit au
  Module 1). Soit on les place dans l'interface Astra (fonctionnalité à construire), soit on les
  déclare abandonnés : on retire alors les 11 assertions de `src/ui/test-training-dom.js` (et le code
  orphelin).
- Le vault décrit peut-être encore le rail + tiroirs comme navigation finale (constat de
  JOURNAL-REFONTE.md du 02/09) : à vérifier et corriger.
- Contenu de mouvements toujours à arbitrer : voir le fichier précédent.

## `decisions/` — deux décisions (numéros à attribuer)

### Registre des voicings de l'Exercice, toutes familles

- **Contexte** : VoicingLab publie chaque ton en transposant Do vers le haut (+0 à +11 demi-tons).
  En Si : Drop 2 avec la main gauche à D#5, Close / Block jusqu'à G#6, Shell avec la basse à B3,
  Rootless jusqu'à G#5. Narcisse : « étends la règle [des Drop 3] aux autres familles ».
- **Décision** : même règle (octave abaissée tant que le milieu dépasse un plafond), plafond par
  famille selon la main qui joue (voir l'état actuel).
- **Conséquences** : dessus max D#6, main gauche max C#5, aucun chevauchement des mains ; en Do, seuls
  bougent 20 Drop 3 d'accords enrichis et 30 Stride à basse sur la quinte.

### Tests d'interface : contrat du rail + tiroirs abandonné

- **Contexte** : `src/ui/test-training-dom.js` est arrivé par la sauvegarde 59dcf3e (05/09) avec le
  contrat d'une refonte « Hub → modes » à rail + tiroirs jamais committée, révoquée le 02/09
  (JOURNAL-REFONTE.md). 47 échecs depuis son arrivée.
- **Décision** : assertions du rail / des tiroirs / des vues Hub retirées (commentaire à l'appui) ;
  fonctions encore présentes vérifiées sur l'élément réel ; Suggestions et historique laissés en
  échec en attendant la décision ci-dessus.

## `experiments/` — choix des plafonds de registre

Mesuré sur tous les voicings fidèles des 12 tons (toutes qualités de l'Exercice).

| Règle testée | Défaut constaté | Verdict |
|---|---|---|
| ±6 demi-tons autour de la même variante en Do | dessus encore jusqu'à D#6 (Close, Block) | écartée |
| Plafond = milieu le plus aigu publié en Do | tassement : Rootless B jusqu'à B1, Open / Spread jusqu'à C#2 | écartée |
| Octave au-dessus du milieu le plus grave publié en Do | Close / Block jusqu'à C#6, Spread descendu | écartée |
| Milieu ≤ Do5 partout | Shell / Rootless / Stride non corrigés (milieu déjà bas) ; 4-way close publiés en Do descendus | à adapter par famille |
| **Plafond par famille (Do4 / Mi4 / Mi5 / Do5)** | — | **retenue** |

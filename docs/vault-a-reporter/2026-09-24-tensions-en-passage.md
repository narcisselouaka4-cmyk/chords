# À reporter dans le vault — 2026-09-24 (nuit) : tensions en passage, bibliothèque enrichie

> Septième fichier du 24/09, après `2026-09-24-demo-realiste.md`. Commit `58361b2`.

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 (nuit) — Tensions réservées aux accords de passage ; 61 mouvements
- Narcisse : « les accords altérés ne seront utilisés que dans les accords de passage ; dans
  les accords principaux, il n'y aura aucune altération » ; « Ebmaj7#11 […] peut être un accord
  structurel » ; « il ne doit pas y avoir que des diminués 7 : les Fa 7 altérés, les #9, les
  7b9 » ; le niveau se lit « surtout avec les accords de passage » (Mi°7 : intermédiaire ;
  Fa#7b9, Fa7#5, Fa7b5 : intermédiaire ou semi-avancé).
- Puis : « ajoute du contenu dans bibliothèque des mouvements, beaucoup de contenu ».
- Fait (`58361b2`) : accords principaux sans tension, passages par niveau (étapes à jouer),
  démo qui joue les passages de l'exercice dans les 4 styles, Ma grille (tension = passage),
  bibliothèque de 12 à 61 mouvements (9 catégories).
```

## `decisions/` — ADR à créer : « Tensions en passage, niveau par les passages »

- **Contexte** : les niveaux 4-5 enrichissaient les accords principaux en 7#9 / 7alt ; les
  passages de la démo n'étaient que des diminués, calculés depuis les mains de la démo.
- **Décision (Narcisse)** : accord de tension = dominante altérée (b9, #9, b5, #5, b13, #11,
  alt), diminué, augmenté. Jamais en accord principal ; seulement en passage.
- **Choix faits par Claude, à valider** :
  - les passages sont des **étapes à jouer** (validées comme les accords), pas seulement
    entendus : sinon le niveau Avancé ne changerait rien à ce qu'on joue ;
  - 7#11 / 13#11 (dominante lydienne) comptés comme tensions (b5) ; maj7#11, m7b5 (II du
    mineur) et m(maj7) (tonique mineure) restent des accords principaux ;
  - une dominante qui mène à un accord mineur reste une 7e simple (E7 → Am : pas de E13) ;
  - niveaux : 1-2 aucun passage ; 3 diminués ; 4 dominantes 7b9 / 7#5 / 7b5 ; 5 altérés
    7alt / 7#9 (les qualités alternent d'un passage à l'autre) ;
  - un passage entre deux accords principaux au plus ; aucun quand la basse bouge d'un
    demi-ton, sur une dominante prolongée ou résolue sur place (G7sus4 → G7), ni diminué
    après une dominante qui mène déjà à l'accord suivant (G7 → C) ;
  - Ma grille / Perso : un accord de tension choisi devient le passage de l'accord qui le
    précède ; le niveau n'ajoute aucun passage à une grille perso (jouée telle quelle).
- **Alternative écartée** : passages seulement entendus dans la démo (ancien fonctionnement).

## `state/current-state.md` — à fusionner

- **Accords principaux** (`QUALITY_UPGRADE_PATHS`) : 7 → 9 → 13 (plus de #9 / alt) ; maj7 →
  maj9 → maj13 → maj7#11 ; m7 → m9 → m11. `isTensionQuality` classe les qualités.
- **Accords de passage** (`planPassingChord`, `PASSING_QUALITIES_BY_LEVEL`) : niveau 3 =
  diminué sur la sensible de l'accord suivant (C → C#dim7 → Dm, Dm → F#dim7 → G) ou
  descendant (Em → Ebdim7 → Dm) ; niveau 4 = dominante de l'accord suivant en 7b9 / 7#5 /
  7b5 (C → A7b9 → Dm ; sur la même fondamentale : Dm7 → D7b9 → G7, G13 → G7#5 → C) ;
  niveau 5 = 7alt / 7#9. Passages écrits par un mouvement (`passing` dans la bibliothèque)
  présents à tous les niveaux. Rangés sur l'accord qu'ils suivent (`passingChord`), enchaînés
  avec leurs voisins (`chainVoicings` sur la suite complète) ; si la technique choisie ne
  publie pas la qualité (7b9 en Drop 2), la technique qui s'enchaîne le mieux.
- **Exercice** : étapes = accords + passages (`prog.onPassing`, `goToPassing`) ; flèches
  (`passingAnchors` : technique + variante) et note du dessus (`passingTopIntervals`) propres
  à chaque passage ; « ACCORD 2 / 5 · PASSAGE » ; carte « ↳ Accord de passage, vers G13 ».
- **Liste ACCORDS** : les passages (↳) sont cliquables comme les accords (plus d'écoute au
  clic : « Écouter » de la carte le fait).
- **Démo** : joue les passages de l'exercice (voicings de la carte, mains du style) au 4e temps
  dans les quatre styles ; la carte suit ; `passingDiminished` / `passingName` supprimés.
- **Niveau (menu)** : « Débutant · 7e, sans passage », « Semi-intermédiaire · 9e, sans
  passage », « Intermédiaire · 13e, passages diminués », « Semi-avancé · passages 7b9, 7#5,
  7b5 », « Avancé · passages altérés (alt, #9) ».
- **Ma grille** : bouton « Ajouter en passage » pour une qualité de tension ; refus en tête de
  grille ou juste après un autre passage ; pastille ↳ en pointillés.
- **Bibliothèque** : 61 mouvements. Cadences II-V-I 8, Turnarounds 8, Progressions
  diatoniques 9, Gospel & worship 12, Dominantes & substitutions 6, Couleurs & chromatismes 4,
  Mineur 7, Blues 3, Modal & sus 4 (+ Perso). « II-V-I altéré en mineur » : G7 principal,
  G7alt en passage écrit ; Barry Harris : Cm6 dans ses 4 positions (dessus C, Eb, G, A)
  reliées par Bdim7 en passage ; ligne chromatique mineure : dessus C, B, Bb, A.

## `state/current-work.md` — à vérifier sur le PC

1. Mouvement « Cadence II-V-I majeur » en Do : niveau 1 → Dm7 G7 Cmaj7 sans passage ;
   niveau 3 → ↳ F#dim7 après Dm11 ; niveau 4 → ↳ D7b9, ↳ G7#5 ; niveau 5 → ↳ D7alt, ↳ G7#9.
2. Jouer Dm11 → l'étape suivante est D7b9 (carte « Accord de passage, vers G13 ») ; le jouer
   → G13 ; « Accord précédent » revient au passage.
3. Cliquer un passage dans la liste : la carte l'affiche ; flèches et menu « Dessus » dessus.
4. Démo (tous les styles) : les passages sonnent au 4e temps, la carte les suit.
5. Bibliothèque : 9 catégories + Perso ; en ouvrir plusieurs (Blues jazz, Cycle des quintes en
   mineur, Montée avec diminués, II-V-I gospel avec dominantes altérées).
6. Ma grille : C maj7, puis A 7b9 → « Ajouter en passage », pastille ↳ ; un 7b9 en premier
   est refusé.

## `state/next-actions.md` — à ajouter

- Faire valider les choix de l'ADR (passages à jouer, 7#11 = tension, m(maj7) principal).
- Option possible : passages « à écouter seulement » (réglage), si les jouer tous alourdit.
- Densité des passages au niveau 5 (un par changement d'accord) : à ajuster à l'usage.
- Question toujours en suspens : noms de mouvements renommés le 24/09.

# À reporter dans le vault — 2026-09-24 (soir)

> Troisième fichier du 24/09, à reporter après `2026-09-24-exercices-mouvements-drop3-validation.md`
> et `2026-09-24-suite-registre-parseur-tests-ui.md`. Le vault vit sur le PC
> (`/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord/`), hors d'atteinte de la session
> cloud. Une fois reportés, ces fichiers peuvent être supprimés.
>
> Travail : branche `fix/exercices-voicing-correctifs`, commits `8355a17` (voicings) et
> `f0b56f7` (Mouvement 12 tons), plus le commit de ce fichier.

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 (soir) — Voicings contrôlés d'après les manuels, Mouvement 12 tons refait
- Audit des voicings 11e / 13e / altérés : ~1 100 sur 3 643 ne respectaient pas la définition
  de leur famille (Close de Bmaj13 sur 21 demi-tons, upper structures avec la 11 contre la
  tierce…). Décision : reconstruire (mêmes notes, disposition des manuels).
- Mouvement 12 tons : bug de niveau corrigé (seul « Avancé » enrichissait), défaut
  Intermédiaire, saut direct à un accord / une tonalité, choix des tonalités, tonalité en
  cours bien en vue, bibliothèque en fenêtre Astra, textes des mouvements réécrits.
- Mode Progression retiré ; « Ma grille » (accords tapés) jouée dans les tonalités choisies.
- Exercices 438/438, build OK, essai Chromium sans erreur.
```

## `state/current-state.md` — à fusionner

- **Voicings de l'Exercice, accords de 11e / 13e / altérés** (#11, b9, #9, b13, #5, b5, alt ;
  hors add11, m7b5, dim7) : chaque voicing servi respecte la définition de sa famille et les règles
  des manuels. Module `src/voicing-engine/textbook-voicings.js` :
  - close = toutes les notes dans une octave ; drop 2 / 3 / 2-4 = close à 4 voix dont la 2e /
    la 3e / les 2e et 4e voix du haut descendent d'une octave ; four-way close = 4 notes dans une
    octave ; block = four-way close + mélodie doublée une octave plus bas ; rootless A / B = sans
    fondamentale, départ sur la tierce / la 7e, dans une octave ; spread = fondamentale à la basse,
    plus d'une octave ; open = plus d'une octave ; So What = 3 quartes justes + tierce majeure ;
    upper structure = triade majeure sur tierce + septième, dans l'échelle de l'accord ;
  - limites d'intervalle grave (Levine) ; pas de 9e mineure entre deux voix (sauf b9 sur la
    fondamentale d'un accord b9) ; pas de 11 juste avec une tierce majeure.
  - `practice-exercise.js` (`conformOrRebuild`) garde les voicings VoicingLab conformes et
    reconstruit les autres sur les mêmes notes. Upper structure barré pour les 13 simples.
  - **Aucune provenance à l'écran** (Narcisse : « nous on le sait mais les users n'ont pas
    besoin de savoir ça ») : ni VoicingLab, ni dérivé, ni reconstruit, ni octave déplacée, ni
    main gauche ajoutée. Ces informations restent dans l'état du voicing, pour le code.
  - Les autres qualités (7e, 9e, 6, add, m7b5, dim7) restent 100 % VoicingLab.
- **Registre** : la descente d'octave s'arrête avant une limite grave ; un voicing publié trop
  grave remonte ; main gauche des clusters entre Fa2 et Mi3.
- **Exercices** : deux modes, Accord cible et Mouvement 12 tons (Progression retiré).
  Mouvement : niveau par défaut Intermédiaire ; réglages du tour (Niveau, Tonalités, Ordre
  chromatique / quartes / quintes, Départ) ; tonalité en cours en tête du panneau de droite ;
  frise des tonalités et liste des accords cliquables ; « Ma grille » dans la bibliothèque.

## `state/current-work.md` — à fusionner

- Fait (soir du 24/09) : audit + reconstruction des voicings 11e / 13e / altérés ; Mouvement 12
  tons refait ; mode Progression retiré.
- À vérifier dans l'app (après `git pull origin fix/exercices-voicing-correctifs`) :
  1. Bmaj13, Close position : B3 D#4 G#4 A#4 (une main, dans l'octave), sans aucune mention
     de provenance ; plus de « (dérivé) » dans le menu des qualités de l'Accord cible.
  2. Mouvement 12 tons s'ouvre en Intermédiaire ; le Cycle de tierces majeures donne des maj13 /
     13 ; en Avancé, maj7#11 / 7alt.
  3. Clic sur le 6e accord de la liste → il s'affiche directement ; clic sur une tonalité de la
     frise → on y va.
  4. Tonalités : décocher Db, passer en Cycle des quartes, choisir le départ.
  5. Bibliothèque → « Ma grille » : `Dm11 G7#9b13 Cmaj13` → jouée telle quelle, ton par ton.

## `state/next-actions.md` — à ajouter

- Étendre le contrôle « manuels » aux autres qualités (7e, 9e, 6, add…) si Narcisse le souhaite
  (« pour le reste, on verra plus tard »).
- Upper structure des 13 simples : aucune triade standard ne donne un 13 sans b9 ni #11 ; à
  trancher (VIm sur la tierce et la 7e ?) si Narcisse la veut.
- Contenu des mouvements : noms corrigés, motifs inchangés ; « Montée diatonique en quartes » et
  « Passing 2-5-1 ouvert » gardent des noms flous (à renommer si Narcisse le souhaite).
- Échecs de tests UI préexistants, hors Exercices, inchangés : `src/ui/test-coach-dom.js` (2),
  `src/ui/test-load-session.js` (window absent sous Node), `src/ui/test-voicing-preview.js` (1),
  `src/ui/refonte/test-skin-manager.js` (2).

## `decisions/` — trois décisions (numéros à attribuer)

### Voicings des 11e / 13e / altérés contrôlés d'après les manuels

- **Contexte** : Narcisse doute des voicings (« Bmaj13 en close = B3 D#4 | A#4 G#5 ? ») et demande
  de regarder d'autres sites que VoicingLab, pour les 11e, 13e et altérés seulement. Audit :
  VoicingLab empile 1-3-7-13 dans l'ordre des tierces, d'où des Close / Drop 3 / Block qui ne
  respectent pas leur définition ; upper structures avec la 11 contre la tierce ; 5 + #5 dans
  des Open.
- **Options présentées** : reconstruire (retenue) ; retirer seulement ; renommer seulement.
- **Décision** : garder les voicings VoicingLab conformes, reconstruire les autres d'après les
  formules des manuels, avec les mêmes notes. Pas de signalement à l'écran : la provenance
  (VoicingLab, dérivé, reconstruit) ne regarde pas l'utilisateur (Narcisse, 24/09).
- **Conséquence** : l'ADR « l'Exercice ne génère plus de voicings » (ADR-013) connaît une
  exception pour ce périmètre.

### Mode Progression retiré

- **Contexte** : Narcisse : « la fonction Progression n'est pas très pertinente : comme c'est elle
  qui choisit les extensions, les enrichissements et les altérations, c'est assez compliqué sans
  connaître le contexte ».
- **Décision** : retirer le tirage automatique ; les grilles tapées en symboles restent
  possibles (« Ma grille », dans Mouvement 12 tons) : c'est l'utilisateur qui fixe les extensions.

### Mouvement 12 tons : tonalités choisies et navigation directe

- **Décision** : tonalités retenues (au moins une), ordre chromatique / quartes / quintes,
  départ au choix ou au hasard parmi les retenues ; clic sur un accord ou une tonalité = saut
  direct, sans essai ni point.

## `experiments/` — sources et règles du contrôle « manuels »

- Accès direct aux sites bloqué dans la session cloud (thejazzpianosite.com, piano.org,
  pianowithjonny.com, wikipedia.org…) : définitions recoupées via la recherche web (extraits de
  The Jazz Piano Site, Learn Jazz Standards, piano.org, PianoGroove, Piano With Jonny, Wikipedia,
  Evan Rogers).
- Limites d'intervalle grave retenues (note la plus basse de l'intervalle) : 2de m Mi3, 2de M
  Mib3, 3ce m Do3, 3ce M Sib2, 4te La2, triton Sib2, 5te Sib1, 6te et 7e Fa2, 9e m Mi2, 9e M
  Mib2, 10e m Do2, 10e M Sib1 (table de Levine, reprise de mémoire : les sources en ligne
  n'affichaient pas la table).
- Résultat de l'audit avant correction : close 120 / 216 non conformes, drop 3 204 / 456,
  block 120 / 216, drop 2-4 48 / 300, upper structure 12 structure + 48 musique / 192, open
  67 + 16 / 235, stride 164 (registre) / 372, rootless 84 + 47 / 516. Après : 0.

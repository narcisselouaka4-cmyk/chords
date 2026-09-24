# À reporter dans le vault — 2026-09-24 (soir) : démo réaliste, voicings de pianiste

> Sixième fichier du 24/09, après `2026-09-24-demo-styles.md`. Commits `d801a3c` (favoris),
> `631cd62` (voicings) et `fde2e1b` (démo).

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 (soir) — Démo jouable à deux mains, sans pédale ; voicings de pianiste
- Accord cible : favoris déplacés dans la colonne de gauche (sous la top note).
- Narcisse : « ça sonne pas réaliste du tout », « les voicings proposés sont absurdes »,
  « j'ai pas de pédale de sustain » + deux vidéos (son jeu ; un tutoriel gospel jazz).
- Diagnostic : la démo jouait avec trois mains (basse en octaves sous des voicings déjà à deux
  mains : Gm11 = G1 G2 + G3 C4 | Bb4 F5) et tenait tout à la pédale ; en Auto, close position
  sans renversements (sauts parallèles) ; familles à deux mains trop aiguës ; 7alt = 7b5.
- Moteur : registre de pianiste, mains jouables, close renversée, vrais 7alt.
- Démo : deux mains, aucune pédale, jeu gospel d'après les vidéos (procédés seulement).
- Accords de passage de la démo affichés dans la liste ACCORDS (« ↳ G#dim7 · passage »),
  allumés pendant la démo, cliquables pour les écouter (commit `65d5e77`).
```

## `experiments/` — relevé des deux vidéos (à créer : `experiments/2026-09-24-videos-jeu-reel.md`)

Relevé touche par touche (images extraites, touches allumées détectées à 10–20 images/s).

**Vidéo de Narcisse (Temps réel de l'app, en Fa, sans pédale)** : Gm11 → Cadd9/E → F → C/E → Dm7,
puis D#dim7 (drop 2) → Cdim7 (drop 2) → Gm11.
- Main gauche fondamentale + quinte (G2 D3, D3 A3) ou une basse seule, souvent la tierce (E3 sous C,
  A2 sous F) : la basse avance par degrés.
- Main droite de 3–4 notes entre Do4 et Do5, dessus doublé à l'octave (Bb3 C4 F4 Bb4 ; C4 D4 G4 C5).
- Accords égrenés du grave à l'aigu (le premier en ~0,8 s), tenus ; la voix du dessus bouge sur
  l'accord tenu (Bb4 → A4 sur Gm11, 4 → 3 sur F) ; montée finale F G C sur plusieurs octaves.

**Tutoriel gospel jazz (Amazing Grace, pédale enfoncée presque tout le temps)** — procédés relevés :
- Main gauche grave et large : C2 G2 E3, F2 C3 G3, D2 A2 F3, Bb2 F3 Bb3 ; dominantes G2 F3, F#2 E3.
- Main droite en cadre d'octave : C4 E4 G4 A4 C5, D4 F4 G#4 B4 D5, F4 G4 Bb4 D5 G5 ; triades
  mineures une tierce au-dessus de la fondamentale (Am/F = Fmaj9, Dm/Bb = Bbmaj9, Gm/Eb = Ebmaj9).
- Accords de passage : C6/E → Ddim7 → C6 (6e / diminué), B°7 → Ab°7, approches chromatiques
  (F#9#5 → F, C#maj7(13) → C, F#7#9b5 dans la basse A → G → F#).
- Mélodie qui bouge au-dessus d'un accord tenu (E5 D#5 D5 C5 sur C/G).
- Aucun arrangement n'est repris dans l'app : seulement ces procédés courants.

## `state/current-state.md` — à fusionner

- **Accord cible** : colonne de gauche = TOP NOTE puis FAVORIS ; colonne de droite = VOICINGS.
- **Registre des voicings** (`withPlayableRegister`, en plus du plafond du milieu) : dessus ≤ Sol5
  (Do6 pour 4-way close et block) ; basse d'un Spread / Open sous Mi3 si la main droite reste au
  milieu ; close de main droite pas sous Fa3. Mêmes règles pour les décalages de l'enchaînement.
- **Mains jouables** (`isHandPlayable`) : aucune main au-delà d'une 10e (stride excepté), main
  gauche seule sous La4.
- **Close position** : renversements ajoutés (basse = fondamentale, tierce ou quinte).
- **7alt** : 9e altérée (b9 / #9) ET quinte altérée (b5 / b13), sans 5, 9, 11, 13 naturelles ;
  quartal, So What, cluster, stride et shells barrés.
- **Démo** (`practice-demo.js`) :
  - deux mains : la carte main par main ; basse ajoutée seulement à une main gauche libre, ou si la
    main gauche la tient (une octave) ; rootless à une main joué à la main droite au-dessus de la
    basse ; stride en basse / accord ;
  - aucune pédale (aucun évènement CC64), notes tenues par les doigts ;
  - Gospel / worship (76) : main gauche fondamentale + quinte à l'octave 2 (7e sur les
    dominantes), main droite en cadre d'octave, accords égrenés et tenus, voix du dessus qui bouge
    au 3e temps, diminué de passage au 4e (basse qui monte d'un ton ou d'une quarte, jamais après
    une dominante), montée finale 1-2-5 ;
  - Ballade (60), Comping swing (132), Plaqué (72) : mêmes règles de mains, sans pédale.
  - Liste ACCORDS (vue Mouvement) : les diminués de passage du style Gospel / worship
    s'intercalent entre les accords (nom épelé sur la sensible de l'accord suivant : Ddim7 avant
    Eb), s'allument au 4e temps pendant la démo, se font entendre au clic ; ce ne sont pas des
    étapes de l'exercice. Rien en Ballade, Swing ou Plaqué. Même plan que la démo (`planGospel`).

## `state/current-work.md` — à vérifier sur le PC

1. Mouvement 12 tons → Montée diatonique en quartes, Sib, Avancé, Drop 2-4 → Démo : sur Gm11, le
   clavier montre G3 C4 F4 Bb4 F5 (plus de G1 G2) ; aucune touche ne reste allumée entre deux
   accords.
2. Même mouvement en Auto : main gauche Bb2 F3, main droite Bb3 D4 E4 A4, D°7 de passage au 4e
   temps vers Ebmaj7#11.
3. Turnaround III-VI-II-V-I en Do, niveau Intermédiaire : G#°7, C#°7, F#°7 de passage, montée
   finale sur Cmaj13.
4. Accord cible : favoris sous la top note, à gauche.
4 bis. Turnaround en Do, style « Selon le mouvement » : G#dim7, C#dim7, F#dim7 dans la liste de
   droite ; ils s'allument pendant la démo ; clic = écoute ; style Ballade = plus de lignes de passage.
5. Rejouer la démo à la main sans pédale : tout doit tenir sous les doigts.

## `state/next-actions.md` — à ajouter

- Proposer (option) les accords de passage aussi en Ballade, ou les couper en Gospel.
- Basse qui avance par degrés (renversements : C/E, F/A) comme dans la vidéo de Narcisse.
- Réglage du tempo de la démo.
- Question en suspens : garder ou non les noms de mouvements renommés le 24/09.

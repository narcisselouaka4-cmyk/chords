# Pédagogie IA — le transfert des voicings, fidèle au prof (03/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, et `experiments/` (ce qui
faisait échouer le transfert, et pourquoi).

## Demande de Narcisse
- Sur Amazing Grace (« Amazing Grace Gospel Jazz Chord Piano Tutorial »), passage 9:57 →
  10:57 : « je lui ai demandé d'appliquer les voicings que joue le pianiste dans une autre
  progression, et il a totalement bugué […] il a juste suivi les fondamentales (il a bien
  joué sur les quatrième et cinquième degrés, etc.), mais niveau voicing, ça n'a rien à
  voir avec ce que jouait le pianiste. »

## Causes trouvées (`src/pedagogie/tutorial-transfer.js`)
1. **Les rôles de ses notes étaient calculés d'après l'étiquette de la frise.** Or elle se
   trompe parfois (Narcisse : « parfois elles ne suivent même pas ce que joue le
   pianiste »), ou elle est décalée dans le temps.
   - Exemple : sous une étiquette « Am7 », sa basse Ré (il joue D7) devient la 11e.
   - Résultat : sur chaque accord de la progression, la main gauche jouait la 11e. Les
     fondamentales du texte restaient justes, les voicings n'avaient plus rien à voir.
2. **Seules les 30 premières secondes du passage étaient lues** (9:57 → 10:27 sur les 60 s
   choisies).
3. **Pour chaque famille d'accord, le premier voicing venu** était pris : parfois une
   forme qu'il ne joue qu'une fois.

## Fait
- **`chordForNotes(étiquette, notes)`** : l'accord qu'il joue vraiment.
  - L'étiquette est gardée si elle explique ses notes : toutes dans l'accord ou ses
    tensions, et la basse sur une note de l'accord (ou sur sa basse écrite).
  - Une basse seule au grave (main gauche : une note ou son octave) qui n'est pas la
    fondamentale de l'étiquette, absente de ses notes, la dément aussi.
  - Sinon, c'est l'accord que ses notes forment (`nameMidiChord`, celui des Sessions MIDI) ;
    à défaut, l'étiquette, marquée « incertaine ».
  - Restent tels quels :
    - un voicing sans fondamentale (Dm9 : Fa La Do Mi), même à la main gauche ;
    - un renversement (C avec Mi à la basse, Do au-dessus).
- **Les notes tenues** : une note posée sur l'accord n'est gardée que si c'est sa basse
  (main gauche) ou une note de l'accord ; une note de mélodie qui traîne ne fausse plus
  la lecture.
- **La forme la plus jouée** par famille (même répartition des mains, mêmes rôles), et
  non la première venue. Une forme « incertaine » ne compte presque pas.
- **Toute la plage choisie** est lue (10 min au plus, `MAX_PASSAGE_SECONDS`).
- **Le texte sous la réponse le dit**, par exemple : « 0:04 C (relu d'après ses notes ; la
  frise disait Am), joué 3 fois : main gauche 1 · 1 | main droite 3 · 5 · 1 ».

## Vérifié
`test-tutorial-transfer.js` : 99/99, dont 13 contrôles du lot. Le test principal est un
passage gospel modelé sur Amazing Grace, en Sol :
- main gauche en octaves, main droite en accord avec la mélodie dessus ;
- la frise se trompe trois fois (« Am » pour C, « G » pour Em7, « Am7 » pour D7).

Résultats :
- les trois accords sont relus d'après ses notes : C, Em7, D7. Sur D7, sa basse Ré est la
  fondamentale, pas une 11e ;
- sur 4-5-3-6-2-5-1 en Sol (Cmaj7 D7 Bm7 Em7 Am7 D7 Gmaj7) :
  - main gauche : son octave, sur la fondamentale de chaque accord ;
  - majeurs : sa forme la plus jouée (3 · 5 · 1, la fondamentale dessus), pas la
    première venue (5 · 1 · 3). Cmaj7 donne Do2 Do3 | Mi4 Sol4 Do5 ;
  - dominantes : 3 · b7 · 1. D7 donne Ré2 Ré3 | Fa♯4 Do5 Ré5 ;
  - mineurs : b3 · 5 · b7. Bm7 donne Si1 Si2 | Ré4 Fa♯4 La4 ;
- sa dominante jouée à 0:40 sert sur D7 : toute la plage est lue. Avant, D7 prenait sa
  forme majeure (Fa♯ La Ré).

Autres vérifications :
- `test-copilot-client.js` : 210/210.
- Scénarios Playwright `pedago-apply` (voicings, enchaînement, lick) sans erreur ; leurs
  exemples ont la barre de lecture du lot 5.

## À confirmer sur le PC de Narcisse
- Amazing Grace 9:57 → 10:57, puis « Appliquer à une progression… » › Voicings ›
  4-5-3-6-2-5-1 : ses voicings (répartition des mains, rôles) doivent se retrouver.
- Le texte sous la réponse dit quels accords ont été relus d'après ses notes.
- Son fichier de relevé (`~/PianoJazzChords/Pedagogie/memoire/*.json`) permettrait de
  faire du vrai passage un test.

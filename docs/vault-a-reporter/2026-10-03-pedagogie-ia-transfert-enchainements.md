# Pédagogie IA — appliquer les enchaînements du prof à une autre progression (Lot 3, 03/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `concepts/` : « accord de
passage décrit par rapport à l'accord d'arrivée »).

## Demande de Narcisse
Il veut reprendre « ses enchaînements / passages » : les accords de passage du prof,
sa façon d'aller d'un accord à l'autre, pour les mettre dans sa progression
(4-5-3-6-2-5-1…).

## Principe (décision)
Un accord de passage est décrit par rapport à l'accord qui le **suit** (l'accord
d'arrivée). Exemples :
- C#dim7 avant Dm7 = diminué un demi-ton sous l'arrivée (sur sa sensible) ;
- Db7 avant Cmaj7 = dominante un demi-ton au-dessus (substitution tritonique) ;
- Em7b5 A7 avant Dm7 = II-V de l'arrivée ;
- C/E avant F = la basse qui monte vers l'arrivée.

On glisse **le même accord, à la même distance**, devant les accords de la progression
demandée. On ne réécrit pas sa qualité dans la nouvelle tonalité : une version qui le
faisait changeait D/F# en Dm/F# et a été retirée.

## Fait
- `src/pedagogie/tutorial-transfer.js` :
  - **`passingMoves(grille, {start, end, key})`**. Dans la grille relevée, un accord est
    « de passage » s'il mène à un autre accord et qu'il est bref (≤ 60 % de l'accord
    suivant ou précédent). Il l'est aussi s'il est hors tonalité dans une relation connue :
    diminué, dominante, substitution tritonique, backdoor, IV mineur, glissement
    chromatique. On garde aussi sa part de durée.
  - **`relationLabel`** donne la relation en mots : « diminué un demi-ton sous l'accord
    d'arrivée (sur sa sensible) », « dominante un demi-ton au-dessus de l'arrivée
    (substitution tritonique) », « II du II-V… », « la basse marche vers elle »…
  - **`applyPassingMoves(moves, progression)`** place les passages **là où le prof s'en
    sert**, c'est-à-dire devant le même genre d'accord, ou quand la basse fait le même
    mouvement :
    - sa substitution tritonique de V → I va sur chaque quinte descendante :
      Em7 → Bb9 → Am7 → Eb9 → Dm7 → Ab9 → G7 → Db9 → Cmaj7 ;
    - son diminué sur la sensible va devant chaque accord mineur.
    - S'il n'y a nulle part où les placer, ils vont devant chaque accord, et le texte le
      dit.
  - **Garde-fous**, repris des accords de passage des Exercices (`planPassingChord`) :
    - rien entre deux accords de même fondamentale ;
    - rien quand la basse avance d'un demi-ton ;
    - pas de doublon de l'accord précédent (pas de G7 après G7) ;
    - pas de diminué après la dominante qui mène déjà à l'accord.
  - Les noms des accords de passage sont écrits sur la bonne lettre : C#dim7 avant Dm7,
    Db7 avant C, Gb9 avant F.
  - **Voicings.** Chaque accord de passage garde **sa** forme chez le prof (Db9 =
    gauche 1 | droite 3 · b7 · 9). Les accords principaux prennent les formes de ses
    accords principaux.
  - **Durées.** Le passage prend sur l'accord précédent la part qu'il avait chez le prof
    (accord 1,6 s + passage 0,4 s).
  - `what: 'auto'` (« ce qu'il vient de faire ») donne ses accords de passage s'il y en a
    dans le passage, sinon ses voicings. Sans accord de passage, le Copilote le dit et
    donne ses voicings.
- Deux améliorations valables pour tous les transferts :
  - **Orthographe dans l'accord** (`spellInChord`) : Sol♭ dans Ab7, Ré♯ dans Bmaj7, bb7
    d'un diminué. Une orthographe illisible (Mi♯, Do♭) est remplacée par le nom courant.
  - **« Jamais plus boueux que le prof ».** On calcule de combien les intervalles passent
    sous leur limite grave (limites de Levine, `textbook-voicings.js`). Une main ne peut
    pas être plus boueuse que celle du prof : plus de Sol1–Fa2 ni de Fa♯1–Fa2 quand il
    jouait Do2–Si2.

## Vérifié
- `src/pedagogie/test-tutorial-transfer.js` (68/68). Cas écrits à la main :
  - Cmaj7 → C#dim7 → Dm7 → Db7 → Cmaj7, appliqué à 4-5-3-6-2-5-1 en Do, donne
    Fmaj7 (F#dim7) G7 (D#dim7) Em7 (G#dim7) Am7 (C#dim7) Dm7 G7 (Db7) Cmaj7, avec ses
    voicings ;
  - le II-V (Am7b5 D7 devant G7) ;
  - la marche de basse (D/F# devant G) ;
  - les garde-fous ;
  - les durées.
- `src/pedagogie/test-copilot-client.js` (198/198) : apply_tutorial_passage avec `what:
  enchainement`.
- Scénario Playwright, tuto simulé avec Db9 glissé entre G13 et Cmaj9 : « Appliquer à
  une progression → son enchaînement → 4-5-3-6-2-5-1 → Do ». L'application répond avec
  4 accords de passage sur les quintes descendantes, sans erreur, en sombre et en clair.

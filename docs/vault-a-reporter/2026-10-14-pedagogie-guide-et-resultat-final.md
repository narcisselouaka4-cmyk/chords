# Pédagogie IA — le guide du tuto et le résultat final (14/10/2026)

**Déclencheur** : « Next Level Worship » — « entre 3:08 et 3:37, Copilot n'arrive pas à bien
reproduire ce qu'il fait ». Narcisse veut que le Copilote reconstitue le résultat final à partir des
explications du prof (qui montre souvent main par main), rattache chaque passage à un moment du
morceau, et ne propose que des mouvements **montrés dans le tuto**. Pour les débutants, les
intermédiaires et ceux qui ne comprennent pas la langue de la vidéo. Puis : animations, retrait de
« Accord relevé », sélection du passage par **région comme dans le Studio**, pas de petit texte gris.

## Pourquoi 3:08–3:37 était mal rejoué (diagnostic)
1. **Rendu « éclair »** : dans cette vidéo une touche n'est verte qu'à l'attaque (≈ 0,3 s), puis
   redevient blanche alors que le son tient. Le relevé voyait donc des accords de 2-3 notes qui
   changeaient sans cesse, au lieu de Ebm9 → Gbmaj9 → Bbm9 → Dbmaj9.
2. **Fausses voisines** : une blanche lue « en haut » à côté d'une noire allumée (le repère vert
   déborde) donnait des paires Si♭3 + Si3 → accords faux.

## Ce qui change
- `flash-notes.js` : rendu éclair détecté (`isFlashRendering`) ; notes tenues jusqu'au prochain
  changement d'harmonie (`holdFlashNotes`) ; accords groupés par harmonie (`flashSegments`).
- `key-detection.js` : blanche lue en haut seulement si aucune noire voisine n'est allumée.
  `tutorial-memory.js` : `READING_REVISION` 3 → les anciennes lectures sont refaites.
- `tutorial-guide.js` (`buildTutorialGuide`) :
  - **étapes** : deux mains / main gauche seule / main droite seule / ligne du dessus / il parle,
    avec ce qu'il dit (transcription) ;
  - **parties** : une par tonalité (ici Do majeur 0:00–1:08, Ré♭ majeur 1:08–3:52), même boucle
    en degrés (2–4–6–1) ;
  - **résultat final** : la boucle jouée d'un trait (ici « à 3:08 »), sinon rassemblée à partir
    des mains montrées séparément ; main gauche et main droite séparables ;
  - **mouvements** : passage, chromatisme, marche montante / descendante, ligne, modulation.
    `findMovements(1 → 6)` répond « pas directement » + les chemins par ses accords (1→2→4→6) :
    jamais inventé.
- `guide-summaries.js` : titres et phrases des étapes **en français** (une demande à l'IA, rien
  ajouté), gardés dans la mémoire du tuto.
- Copilote : le guide dans le contexte (`guideLines`), outil `play_final_result`, étiquette
  « Joue le résultat final », règle 22 (mouvements seulement depuis la liste).
- Interface :
  - **barre du tuto** sous la vidéo (`passage-timeline`) : étapes en couleurs qui se déploient,
    région à tracer / déplacer / étirer, double-clic sur une étape, éclat à la pose ;
  - plus de listes Début / Fin, plus de frise « Accords relevés » ;
  - panneau de droite à deux onglets : **Guide** (résultat final à écouter, étapes avec
    « Explique », mouvements avec « Aller du … au … ») et **Copilote**.

## Trouvé en vérifiant (corrigé)
- Tuto lu au son : barre vide et guide « en attente » pour toujours → la barre montre ses accords
  (bandes neutres) et le guide dit qu'il lui faut les notes vues à l'image.
- Le guide comptait comme « joué » un accord lu pendant que le prof parle → mêmes accords que le
  Copilote (`chordsWhilePlaying`).
- Tonalité : une boucle Ré m9 – Sol13 – Do maj9 – La7♯9 sortait en Ré mineur (« 1 – 4(7) – 7 –
  5 ») → `structureKey` compte un II-V-I complet : « 2 – 5 – 1 – 6(7) » en Do. NLW inchangé.

## Vérifié
- Sur les vraies données NLW : Together = Ebm9 → Gbmaj9 → Bbm9 → Dbmaj9 ; Gbmaj9 = MG Sol♭3
  Ré♭4 Fa4 | MD La♭4 Si♭4 Fa5 ; modulation Cmaj9 → Ebm9 relevée.
- Tests : flash-notes 16/16, tutorial-guide 38/38, guide-summaries 14/14, moteur 96/96,
  structure 41/41, DOM 176/176, test:chords 98/98, régressions Partie 1 et 3, build.
- Playwright (mock, sombre / clair, 1600 / 1280) : guide, écoute du résultat final, mouvements,
  région, « Explique » → Copilote. Anciens scénarios adaptés à la barre.

## Limites
- Pas vérifié dans le vrai Electron.
- Résumés français : il faut la clé IA et la transcription (Whisper) ; sinon les titres
  automatiques restent.
- Pour relire NLW : « Refaire l'analyse » (ou réimporter).

## Correctif après essai réel (14/10, soir)
- Log : « transcription piano échouée … piano.wav : No such file ». Cause : la parole et les notes
  du piano se transcrivent **en même temps** et partagent `.work-transcribe` ; `createTranscribeDir()`
  purgeait tous les autres dossiers, donc l'une effaçait le WAV de l'autre en plein calcul.
- Correctif (`electron/main.js`) : un dossier en cours d'utilisation n'est plus purgé
  (`activeTranscribeDirs`, `releaseTranscribeDir`) ; nom unique (suffixe aléatoire).
- Conséquence : sans ce correctif, la transcription du piano échouait souvent, donc le recoupement
  image/son (octaves, lacunes, glissandos) n'avait pas lieu.

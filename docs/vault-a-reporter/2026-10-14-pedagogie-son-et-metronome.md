# 2026-10-14 — Pédagogie IA : l'image recoupée par le son, et un métronome

## Question de Narcisse
« Est-ce que ça lit uniquement à l'image, ou à l'image et au son ? … l'image peut bugger alors que le
son est bon : pourquoi ne pas aussi se baser sur le son, notamment pour comparer les notes, surtout
les octaves, et les slides ? » + « un métronome, et même une boucle de batterie selon le style ; il
faut repérer le BPM. »

## Constat (avant)
`runReading` (pedagogie-tab.js) : les NOTES du prof viennent de l'image seule (`samplesToNoteEvents`,
ou V2N). Le son servait à : (1) comparer les ACCORDS (`crossCheck`, jamais arbitré), (2) la force des
attaques (`pedagogie:loudness` → `withMeasuredVelocity`), (3) la parole (Whisper), (4) la tonalité.
« Lu au son » n'arrive que si l'image ne donne rien (accords au son + notes `transcribePiano`).
Aucune note de l'image n'était corrigée par le son : octave fausse, note manquée, glissando mal vu
restaient dans le relevé.

## Fait
- `src/pedagogie/sound-reconcile.js` (+ `test-sound-reconcile.js`, 26 tests) : `reconcileWithSound`.
  1. OCTAVE : note vue non entendue à cette hauteur mais entendue (même note) à 1-2 octaves au même
     instant (±0,25 s) → hauteur entendue (`octaveFrom` garde l'ancienne). Décalage global d'un
     clavier mal calé : tout est corrigé.
  2. LACUNE : aucune note vue ±0,5 s alors que le son en fait entendre → ajoutées (`from:'son'`, `kind:'gap'`).
  3. GLISSANDO : notes entendues entre les notes d'une montée / descente rapide vue → ajoutées
     (`kind:'slide'`, main de la note voisine).
  Le reste est compté (`heardOnly`), pas ajouté (résonances, autre instrument).
  Garde-fou : < 30 % des notes vues retrouvées (hauteur ou octave) → son jugé peu fiable, RIEN ne change.
  Pédale entendue reprise si l'image n'en a pas.
- Câblage : `transcribePiano` lancée en parallèle dès le début du relevé (une seule fois, partagée avec
  le chemin « lu au son ») ; étape « Recoupement des notes avec le son… » ; `analysis.soundCheck` ;
  badge « Lu à l'image + son » et phrase d'explication ; le Copilote le sait (`sourceLabel`).
  Sans `piano_transcription_inference` installé : image seule, dit clairement.
- Métronome : `tempo-estimate.js` (BPM + place du 1er temps + confiance, depuis le niveau sonore ;
  test-tempo-estimate.js 21 tests sur des enveloppes synthétiques), `audio/metronome.js` (moteur Web
  Audio, planification en avance ; mode libre / suit la vidéo ; test-metronome.js 18 tests),
  `components/metronome-menu.{js,css}` (panneau : Démarrer, − / + / saisie / curseur, Tap, ÷2 / ×2,
  « Chercher dans la vidéo », mesure 2/3/4/6, « Suivre la vidéo » + « Le 1 est ici » + ±10 ms,
  volume, voyants). Réglages par tutoriel. Recherche du tempo automatique à la première ouverture.

## Limites connues
- Non vérifié sur de VRAIES vidéos : le recoupement a été testé sur des cas synthétiques ; la
  transcription réelle (piano_transcription_inference) n'est pas installée dans l'environnement de
  développement cloud. À essayer sur « L'Éternel est bon » / « Amazing Grace ».
- Les relevés déjà enregistrés ne sont pas relus (READING_REVISION inchangée) : « Refaire l'analyse ».
- Tempo : pulsation pure ambiguë 80 / 160 (d'où ÷2 / ×2) ; musique sans pulsation nette → confiance faible.
- Pas (encore) de boucle de batterie selon le style : nécessite de reconnaître le style, puis des
  patterns de batterie (synthétisés ou échantillons). Proposé comme étape suivante.

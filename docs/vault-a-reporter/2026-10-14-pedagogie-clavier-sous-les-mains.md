# Pédagogie IA — lire un clavier couvert par les mains du prof (14/10/2026)

**Déclencheur** : « Next Level Worship Chords Piano Chords & Reharmonization » partait toujours en
« Lu au son » : l'image n'était jamais reconnue.

## Ce que c'est comme vidéo
- 640×360. Un clavier 88 touches dessiné, posé sous le prof, avec ses vraies mains par-dessus.
- Touches jouées = **barres vertes** (noire allumée = noire verte ; blanche allumée = barre verte
  seulement sur sa **partie haute**, le bas reste blanc), avec le nom de la note écrit au-dessus.
- Le clavier est visible presque tout le long ; pas sur le titre, le panneau « FREE CLUB » et l'écran de fin.

## Pourquoi ça échouait (mesuré avec le vrai détecteur sur 22 images : 2 reconnues)
1. **Mains** : leur peau sombre se soude aux noires, le motif 2/3 casse au milieu de la rangée → la
   rangée entière était rejetée alors qu'il reste net de chaque côté.
2. **Bande des noires coupée trop tôt** (motif cassé sur les dernières rangées) → « NoWhiteZone ».
3. **Grille des blanches lue sur une seule rangée**, masquée par une main ou une touche verte →
   9 traits trouvés au lieu de 36, largeur de deux touches → « InconsistentAnchor ».

## Ce qui change
- `keyboard-geometry.js` : plus long tronçon valide de noires (`longestValidRun`, ≥ 10 noires, ≥ 4
  groupes, motif classable) ; zone des blanches cherchée plus bas (rangée à ≥ 85 % de clair) ; grille
  essayée sur six hauteurs, gardée si son pas colle à celui des noires (5 noires = 7 blanches) ; noires
  cachées complétées depuis la grille.
- `key-detection.js` : la **peau** n'est plus une touche allumée (`isSkinTone`) ; une teinte « autre »
  doit être claire (≥ 150) ; une noire verdâtre à 41/255 n'est pas allumée (`minValue` 80) ; blanche
  lue aussi **à hauteur des noires** (vert/bleu seulement, stratégie « bande » seulement) ;
  `keyboardPresence` : image sans clavier → aucune note lue.
- `format-detector.js` : pose `presenceMin` (score médian des images qui ont montré le clavier − 0,1,
  entre 0,6 et 0,9).

## Mesuré sur la vidéo
- Détection du clavier : 2/22 → 20/22 (les 2 autres : panneau publicitaire sans clavier).
- Format reconnu (24 sondages comme dans l'appli) : « piano-roll-keyboard », 22 sondages sur 24.
- À 1:22, lecture = Ré♭3 Ré♭4 Mi♭4 Fa4 Ré♭5 (les notes écrites à l'écran) ; à 2:07 Fa4 Sol♭4 Ré♭5 (« F, G♭, D♭ »).
- Présence du clavier : 0,93–0,98 avec les mains, 0,2–0,3 sans clavier → plus de notes fantômes
  (Si♭1 Si1 Do2 sur l'intro, onze touches d'affilée sur le panneau, Ab1/Ab2 à l'écran de fin).

## Limites connues
- Un doigt posé sur une barre verte la cache : la note est perdue sur cette image.
- Octave : calage par classe de hauteur + centrage (clavier 88 touches : correct ici, A0/B0 selon l'image).
- Non vérifié dans Electron réel (modules Python de transcription absents ici) : lecture faite avec
  les vrais modules de l'appli exécutés sous Node sur la vraie vidéo.

Tests : `test-pedagogie-engine.js` T84–T88 (95/95).

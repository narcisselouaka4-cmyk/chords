# Studio — architecture audio de l'étape 3 : un seul SoundTouch, neuf à chaque relance (09/10/2026)

À reporter dans le vault : **nouvel ADR** dans `decisions/` (prochain numéro libre), avec un
renvoi depuis `contracts/` si un contrat Studio y existe. Détail des mesures et du déroulé :
`2026-10-09-studio-etape1-region.md`, §9 et §10. Commits `326dd52` et `c0c2d0a`.

## Contexte
Narcisse : après la séparation, « micro-latences par-ci, par-là » (vidéo, voix, audio), surtout
quand il transpose et déplace la lecture en pleine musique ; parfois l'image « accélère un
instant puis ralentit » ; pause + lecture remet tout d'aplomb.

## Causes établies
1. **Cinq SoundTouch** (AudioWorklet), un par piste, même à transposition 0. Pire bloc mesuré
   ≈ 0,68 ms par nœud ; les cinq pics tombent au même bloc ≈ 3,4 ms > 2,9 ms de budget
   (128 échantillons à 44,1 kHz) → décrochages du rendu audio.
2. **Retard de SoundTouch** (128 à 142 ms) non compté dans l'horloge → image devant le son.
3. **Pas de vidage possible** : `clear()`/`flush()` n'existent pas dans
   @soundtouchjs/audio-worklet 2.x (ni message de vidage). Après un saut ou une transposition,
   ~0,13 s de l'ancienne position ressortait, avec un retard variable → recalages de l'image.
4. Chaque demi-ton relançait toutes les pistes ; glisser la barre de lecture provoquait des
   dizaines de sauts par seconde ; recalages vidéo en rafale.

## Décision
- Graphe de l'étape 3 : **pistes → volumes → bus → (un seul SoundTouch, ou sortie directe)**.
- SoundTouch n'est branché qu'à la première transposition non nulle ; ensuite il reste branché
  jusqu'au morceau suivant, et changer de transposition n'est qu'un `setPitch()` en direct.
- À chaque relance des pistes (saut, Play), un **SoundTouch neuf** remplace l'ancien
  (`createPitchShifterNow`, synchrone une fois le processeur enregistré).
- L'horloge du mixeur retire `PITCH_SHIFTER_LATENCY` (0,135 s) quand SoundTouch est branché ;
  `getWarmupRemaining()` dit combien de temps avant que le son relancé soit audible, et la
  vidéo attend ce délai sur la bonne image.
- Volume remonté après une relance par automation sur l'horloge audio (plus de `setTimeout`).
- Vidéo : recalage au-delà de 0,12 s de dérive, jamais pendant `seeking`, au plus un toutes les
  0,8 s ; jamais de `playbackRate` (CLAUDE.md §4).
- Barre de lecture : pendant le glisser, affichage seul ; un seul saut au lâcher.

## Conséquences
- À 0 demi-ton (cas courant) : aucun calcul SoundTouch, aucun retard.
- Après une transposition : un seul nœud ; revenir à 0 garde le nœud (coût d'un nœud) jusqu'au
  morceau suivant — accepté pour que les changements de transposition restent sans coupure.
- CLAUDE.md §5 : la règle « nettoyer les buffers avec clear()/flush() » ne peut pas s'appliquer
  avec cette bibliothèque ; c'est le remplacement du nœud qui en tient lieu.
- L'étape 1 (lecteur « master ») n'a pas été modifiée : SoundTouch n'y est branché qu'en cas de
  transposition.

## Rejeté
- Corriger la dérive vidéo par `playbackRate` : déjà rejeté (bégaiement, CLAUDE.md §4).
- Copier et modifier le processeur SoundTouch pour lui ajouter un vidage : 2 000 lignes de
  bibliothèque à maintenir, alors que remplacer le nœud suffit.
- Pré-rendre la transposition dans un fichier : contraire à CLAUDE.md §3 règle 4.

## Vérifié
- Simulation du processeur hors navigateur (coût par bloc, retard, tampons internes).
- Chromium, 5 pistes synthétiques : 441 → 877 Hz (+12) → 587 Hz (+5 en direct, sans relance,
  horloge continue) → saut : silence net à 60 ms puis 883 Hz → retour à 0 : 662 Hz en < 0,3 s.
- `test-studio-dom.js`, build, régressions Partie 1 et Partie 3.
- **Reste à vérifier sur sa machine** : la fluidité ressentie avec de vraies pistes Demucs.

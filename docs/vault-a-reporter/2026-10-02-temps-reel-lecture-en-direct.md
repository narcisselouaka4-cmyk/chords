# À reporter dans le vault — 2026-10-02 : Temps réel (Lecture en direct, portée), bibliothèque d'accords, MIDI fiable

> Suite de `2026-09-26-epure-etoiles-melodie-melody-chords.md`. Branche
> `fix/exercices-voicing-correctifs`, après les deux commits d'OpenCode Agent (refonte
> Analyse/Studio, `331813f`, `c46e827`). Cinq lots, un commit chacun :
> - `fc87268` : « Enregistrer » dans Sessions MIDI, Coach masqué ;
> - `ddc80da` : MIDI fiable ;
> - `a70aa33` : bibliothèque d'accords ;
> - `09a54bf` : Lecture en direct ;
> - `275223f` : la portée.

## `log.md` — entrée à ajouter

```markdown
## 2026-10-02 — Temps réel : Lecture en direct, portée, bibliothèque d'accords, MIDI fiable
- Narcisse, sous-onglet Temps réel :
  - intégrer la fenêtre « Lecture en direct » de sa maquette `designtempsréel.zip` (les
    12 notes en cercle, Do-Mi-Sol trace Do→Mi→Sol→Do, rendu high-tech), « pas sous forme
    de fenêtre ou de carte » ;
  - « la fenêtre manuscrit, tu ne la regardes pas et tu n'y touches pas (c'est
    abominable) », pareil pour le clavier de référence ;
  - une 3e notation sur une portée, façon Chordie, avec les clés de sol, d'ut et de fa,
    en bas à gauche, qui descend quand le clavier est masqué ;
  - déplacer « Enregistrer » dans Sessions MIDI ;
  - masquer « Coach d'accompagnement ».
- En cours de route :
  - « il faut revoir la bibliothèque d'accords du Temps réel, je ne suis pas sûr que
    tout est bon » ;
  - « mon synthé n'interagit plus alors qu'il y a marqué Connecté ; je dois le
    débrancher et le rebrancher ».
- Ses choix :
  - la roue au centre, à la place de l'ancien affichage ;
  - grande portée Sol + Fa par défaut, avec choix Sol / Fa / Ut 3e / Ut 4e, SANS
    mémorisation ;
  - « ● Enregistrer » remplace « + Nouvelle session ».
- Fait :
  - la Lecture en direct au centre (nom, « Aussi », roue, lectures, Réécouter) et la
    portée en bas à gauche ;
  - la bibliothèque revue (audit 52/73 → 73/73, renversements 0/7 → 7/7, orthographe
    jazz) ;
  - le MIDI suivi par son nom (synthé ré-énuméré rouvert, jamais notre propre port
    virtuel), avec une pastille « Reconnecter » ;
  - « Enregistrer » dans Sessions MIDI ;
  - le Coach masqué.
```

## `decisions/` — ADR : « Temps réel = Lecture en direct + portée »

**Contexte.** L'écran d'avant :
- un grand nom d'accord ;
- deux pastilles (voicing, « aussi ») ;
- une ligne anglaise (« Minor 7 (upper: Major D♯) ») ;
- des notes en pastilles, sur une carte.

La maquette de Narcisse (React) avait trois fenêtres ; il n'en garde qu'une.

**Décision.** La scène n'a plus de cadre. Grille en trois colonnes :
- **gauche** : la portée, calée en bas ;
- **centre** : le nom de l'accord, « Aussi » et la roue des 12 notes ;
- **droite** : les lectures — fondamentale, basse jouée, qualité en français, position,
  intervalles en degrés jazz, voicing, MIDI, fréquence — puis « Réécouter ».

Comportement :
- **Tailles** en unités de conteneur (`container: live / size`) : quand le clavier se
  replie, la scène grandit, la roue grandit, la portée descend.
- **Une note** affiche « C4 ». **Deux notes** affichent l'intervalle en français, plus
  jamais un faux accord majeur. **Un amas** affiche ses notes et « non identifié ».
- **« Réécouter »** rejoue tout le dernier accord, même relâché touche par touche. Il
  passe par `demoPlayer` : touches jaunes, VST si choisi, jamais enregistré.

Fichiers :
- `src/ui/live-reading.js` (pur + rendu) et `src/ui/live-staff.js` ;
- `src/ui/staff/staff-layout.js` (pur) et `src/ui/staff/staff-glyphs.js` (tracés Bravura
  1.392, SIL OFL 1.1, licence jointe) ;
- `src/ui/refonte/astra-realtime.css`.

Une seule détection : `display.js` appelle la roue et la portée. Les anciens identifiants
sont gardés : `#chord-name` (lu par le miroir du clavier), `#notes-display` (masqué).

**Portée.**
- **Orthographe** : celle de l'accord (E♭ dans Cm7, D♯ dans C7♯9, B𝄫 dans Cdim7).
- **Grande portée** : partage au Do central.
- **Rondes et altérations** : secondes en zigzag, altérations en colonnes.
- **Octave** : au-delà de 4 lignes supplémentaires (6 pour une seule clé), « 8va » / « 8vb ».
- **Hauteur fixe** par mode : la portée ne saute pas d'un accord à l'autre.
- **Choix de clé** : il vit dans le module, jamais en `localStorage`.

## `experiments/` — « Fenêtres de la maquette designtempsréel » (rejetées par Narcisse le 02/10)

- **« Manuscrit »** : la grand-portée de la maquette (`rv-manuscript`). Il la juge
  « abominable », elle n'a été ni regardée ni reprise. La portée de l'app est écrite à
  neuf (glyphes Bravura, règles de gravure SMuFL).
- **« Clavier de référence »** : il ne l'aime pas, rien n'a été repris.
- **Retenu** : la roue (`PitchWheel`) et la fenêtre « Lecture en direct » (`rv-hero`), sans
  le cadre.

## `decisions/` — ADR : « Bibliothèque d'accords : notes facultatives, orthographe jazz »

**Contexte.** Audit sur 73 voicings jazz : 71 % de lectures justes.

Lectures fausses :
- C13 était lu C9 : le moteur exigeait la 11e.
- Do-Si♭-Mi-La était lu Am/C.
- Cmaj7♯11 était lu Cmaj7 : le ♯11 disparaissait.
- C6/9 était lu D7sus2/C.

Autres défauts :
- Renversement faux 7 fois sur 7 : la basse était la plus petite classe de note, pas la
  plus grave. Si♭7 en position fondamentale était annoncé « 1ère inversion ».
- A♯7, D♯maj7 en dièses, alors que Sessions MIDI écrit déjà B♭7.
- Un amas Do-Do♯-Ré s'affichait « C ».
- Étiquette de voicing calculée sur les classes de notes.
- Alias figés absurdes (« maj7alt »).

**Décision (`src/chord-engine/`).**
- **Notes obligatoires d'abord.** Une définition se compare sur ses notes obligatoires ;
  ses `optionalIntervals` (quinte, 9e et 11e des 13e…) peuvent manquer.
- **Score explicite.** Une lecture exacte l'emporte, fondamentale à la basse d'abord, avec
  une petite pénalité par note omise. La 11te juste sur tierce majeure (« note à éviter »)
  est pénalisée. Une note étrangère est signalée (`extraPcs`) ; deux notes étrangères
  donnent « ? ».
- **Nouvelles couleurs**, réservées à la détection (`DETECTION_DEFINITIONS`) :
  `CHORD_DEFINITIONS` nourrit aussi le moteur de voicings, la mélodie, l'Analyse et
  Corriger, et reste inchangé.
- **Polyaccord.** Préféré à une lecture en slash à notes manquantes (« D/C » plutôt que
  « Am13/C »).
- **Orthographe** (`spelling.js`).
  - Fondamentale selon la famille : majeur D♭ E♭ G♭ A♭ B♭ ; dominante D♭ E♭ F♯ A♭ B♭ ;
    mineur C♯ E♭ F♯ G♯ B♭ ; diminué en dièses.
  - Chaque note est écrite par son degré : la ♯9 reste une ♯9.
  - `jazzChordName()` pour le Temps réel ; `chordName()` est inchangé ailleurs.
- **« Aussi »** = `chordReadings()` : les autres lectures exactes, à une omission au
  plus et sans note à éviter. Exemples : C6 → Am7/C, Cm7 → E♭6/C, Fa La Si Mi → G13
  sans fondamentale.

**Mesure** (`test-chord-library.js`, 112 contrôles) :

| Mesure | Avant | Après |
|--------|-------|-------|
| Audit jazz | 52/73 | 73/73 |
| Renversements | 0/7 | 7/7 |
| Corpus réaliste (quinte omise, 13e jouées 1-3-7-13, renversements) | 59 % | 86 % |

Le reste du corpus, ce sont les paires ambiguës (C6 avec La à la basse = Am7), que
« Aussi » affiche.

## `decisions/` — ADR : « MIDI : un seul décideur, port suivi par son nom »

**Contexte.** « Connecté » mais muet ; il fallait débrancher le synthé.

Causes :
- **Port suivi par sa position.** Un synthé ré-énuméré (veille du PC, synthé rallumé vite)
  gardait sa place sous un autre numéro ALSA (« 20:0 » → « 24:0 »). La connexion était
  morte et jamais rouverte.
- **L'app pouvait s'écouter elle-même.** Notre port virtuel « Piano Jazz Chords » (sortie
  VST) apparaît parmi les entrées, et son nom contient « piano ». Après un débranchement,
  l'auto-connexion pouvait s'y brancher.
- **Deux auto-connexions concurrentes** : la boucle du main et la fenêtre.

**Décision** — `src/midi-ports.js`, pur, 30 contrôles :
- `baseName`, `isHardwarePort`, `pickPreferredInput`, `decideInputAction`,
  `createInputWatcher`, branchés par `electron/main.js` sur le vrai module MIDI.
- **Suivi par le nom** : même appareil sous un autre numéro → rouvert ; les ports
  logiciels et les nôtres ne sont jamais choisis d'office ; un choix à la main est retenu.
- **Au réveil de veille** (`powerMonitor 'resume'`), reconnexion après 1,5 s.
- **Le main décide seul** ; la fenêtre lit son état (`midi:get-status`).
- **Pastille « Clavier MIDI connecté »** : un clic reconnecte.
- **Notes tenues** relâchées quand la connexion tombe ou reprend.
- **Le menu** n'ouvre plus le port deux fois.

## `decisions/` — « Enregistrer » et Coach

- « Enregistrer » ne sert qu'aux Sessions MIDI : il a quitté la sous-navigation, et
  « + Nouvelle session » est devenu « ● Enregistrer » (même action).
- « Coach d'accompagnement » est masqué (`hidden`). La vue et `coach-tab.js` restent
  intacts ; retirer `hidden` suffit à le faire revenir.

## `state/current-state.md` — à fusionner

- Entraînement : Temps réel, Sessions MIDI, Pédagogie IA, Copilot IA, Exercices.
- Temps réel : Lecture en direct (roue, lectures, Réécouter) et portée (Sol + Fa / Sol /
  Fa / Ut 3e / Ut 4e).
- Noms d'accords à la manière jazz dans le Temps réel. Sessions MIDI avait déjà les
  bémols ; l'Analyse et le Copilote gardent `chordName()`.

## `state/current-work.md` — à vérifier sur le PC (vrai synthé, Electron)

1. **Synthé** :
   - mettre le PC en veille puis le réveiller ;
   - éteindre et rallumer le synthé vite ;
   - choisir la sortie « Port virtuel » vers le VST puis débrancher et rebrancher le
     synthé.

   Dans les trois cas, les notes doivent revenir sans débrancher. Sinon, cliquer la
   pastille et noter dans quelle situation c'est arrivé.
2. **Temps réel**, au vrai clavier :
   - B♭7, C13 (Do Si♭ Mi La), Cm7, C7♯9, D/F♯, deux notes, un amas ;
   - notation latine ;
   - clavier replié, thème clair.
3. **Portée** : changer de clé, relancer l'app, elle doit revenir sur Sol + Fa.
4. **« Réécouter »** après avoir relâché les touches, avec la sortie VST si elle est
   utilisée.

## `state/next-actions.md` — à ajouter

- **Test instable** : `src/melody/test-spelled-pitch.js`, C18 (« expected C, got A »),
  une fois sur quatre (le module de tonalité utilise `Date.now()`). Hors de ce lot, à
  rendre déterministe.
- **Noms jazz ailleurs.** Aligner Sessions MIDI, l'Analyse et le Copilote sur
  `spelling.js`, s'ils doivent écrire comme le Temps réel.
- **C-Ré-Mi** est lu « D7sus2/C » (7sus2 sans quinte) : à discuter si ça gêne.

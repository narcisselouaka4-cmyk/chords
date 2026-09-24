# À reporter dans le vault — 2026-09-24 (soir) : Copilote, Session MIDI, passerelle Studio

> Huitième fichier du 24/09, après `2026-09-24-tensions-en-passage.md`. Branche
> `fix/exercices-voicing-correctifs`.

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 (soir) — Copilote qui explique puis joue en pianiste ; analyse du jeu ; prises du Studio
- Narcisse : « Tu gardes les noms » (mouvements renommés le 24/09 : rien à changer).
- Copilote : « quand je lui demande de m'expliquer un 2-5-1, il va directement me le jouer
  au lieu d'expliquer d'abord » ; « sa façon de jouer […] on dirait plutôt un débutant ».
- Session MIDI : « transférer une session MIDI vers le Copilote IA pour qu'il analyse le jeu,
  donne des conseils et pointe ce qui ne va pas » ; « les accords détectés et affichés ne sont
  pas toujours les bons, alors qu'il s'agit bien de pur MIDI natif ».
- Studio : « quand j'enregistre mon jeu dans le Studio, que la prise soit automatiquement
  enregistrée dans le sous-onglet Session » (la retrouver, la réécouter seule, l'analyser).
- Fait : exemples du Copilote préparés sous l'explication (bouton Écouter, lecture seule si
  l'élève demande à entendre), joués à deux mains (basse + voicings rootless enchaînés) ;
  détection des accords des sessions refaite ; analyse du jeu (carnet + Copilote) ; prises
  MIDI du Studio enregistrées comme sessions.
```

## `decisions/` — ADR à créer : « Exemples du Copilote : expliquer, puis faire entendre »

- **Contexte** : les outils audio du Copilote jouaient leurs notes pendant que la réponse se
  préparait (avant le texte), en accords secs de 0,6 s ou en arpèges d'une note toutes les
  300–450 ms, notes choisies par le modèle. Le classifieur d'intention forçait la lecture d'un
  2-5-1 même pour « explique-moi ». Et la technique Auto de l'Exercice commence par les shells
  du débutant (trois notes à la main gauche, rien à droite).
- **Décision** : un outil audio ne joue rien ; il prépare un exemple (carte sous la réponse :
  Écouter / Arrêter, accords, style, notes de chaque main). Lecture automatique 0,7 s après
  l'affichage du texte seulement si l'élève demande à entendre (« joue-moi », « fais-moi
  écouter », « je veux entendre », « démo », « montre-moi »…). Les accords sont voicés par
  l'application (moteur de l'Exercice), jamais par le modèle.
- **Choix faits par Claude, à valider** :
  - technique par défaut des exemples : **main droite en rootless** (Dm7 → Fa La Do Mi,
    G7 → Fa La Si Ré, Cmaj7 → Mi Sol Si Ré : la 9e s'entend même si l'accord est écrit en 7e),
    enchaînés d'un accord à l'autre, **basse à la main gauche** (fondamentale + quinte, 7e sur
    une dominante) ; un rootless plus grave que Mi3 monte d'une octave ;
  - triades (F G Am), accords sur basse (C/E, F/C, G/B) et accords que l'Exercice ne joue qu'en
    shell ou sans basse possible (C6/9) : voicés par le Copilote — triade serrée à droite,
    reliée à l'accord voisin par le plus petit mouvement, sans seconde mineure ; basse écrite
    en octave (Mi2 Mi3 pour C/E) ;
  - une technique demandée par l'élève est jouée telle quelle (rootless demandé : sans basse) ;
  - style : celui du Copilote (Auto → Ballade 60, Worship/Gospel → Gospel 72, Jazz → Comping
    swing 108, « plaqué » → Plaqué 66, avec basse) ;
  - une question d'explication (« explique-moi un 2-5-1 », « c'est quoi un Cmaj9 ? ») reçoit
    aussi sa carte (sans lecture) ; les accords de la carte sont ceux que la réponse écrit s'ils
    forment la même suite (Dm9 → G13 → Cmaj9), sinon ceux de la question.
- **Alternative écartée** : faire choisir les notes au modèle (règles d'espacement en ms) —
  c'était le son « de débutant ».

## `decisions/` — ADR à créer : « Analyse du jeu d'une session »

- **Contexte** : le Copilote ne recevait que la grille des accords ; il ne pouvait rien dire du
  jeu lui-même, et son prompt lui interdisait de « juger la performance ».
- **Décision** : l'application mesure ce que le MIDI permet de mesurer sans se tromper
  (`session-performance.js`), l'affiche dans le carnet (« Analyse du jeu ») et le transmet au
  Copilote, qui commente en coach (points forts, trois problèmes au plus avec leurs moments,
  deux ou trois conseils dont un exercice) sans inventer d'autre défaut.
- **Seuils choisis par Claude, à valider sur de vraies sessions** :
  - pédale gardée pendant un changement d'accord : enfoncée avant et pas relevée entre
    −0,1 s et +0,4 s, avec une note de l'accord précédent (relâchée au clavier) étrangère au
    suivant ;
  - grave boueux : limites d'intervalles graves de Levine (celles du moteur) ;
  - 9e mineure entre deux voix, sauf b9 d'une dominante ;
  - voix du dessus : saut d'une sixte ou plus dans au moins un quart des changements ;
    « bien enchaînée » si elle bouge de 3 demi-tons au plus en moyenne ;
  - nuances et équilibre seulement si la vélocité varie (au clavier virtuel elle est fixe) :
    dessus plus faible que les autres notes (≥ 60 % des accords), grave plus fort que l'aigu
    (+0,08), nuances resserrées (p10–p90 < 15 sur 127) ;
  - régularité : seulement si les changements reviennent à peu près régulièrement (60 % à
    ±25 % de la médiane) ; rythme harmonique ×2 ou ÷2 accepté ; « en avance » entre 0,55 et
    0,72 fois l'écart habituel, « en retard » entre 1,4 et 1,8 fois ;
  - arrêts de plus de 2 s (session de 20 s au moins) ; attaques dispersées (45–90 ms, ordre
    ni montant ni descendant) ; vocabulaire (triades / 7e / couleurs / tensions).

## `state/current-state.md` — à fusionner

- **Copilote** (`copilot-client.js`, `copilot-demo.js`, `copilot-tab.js`, `main.js`) : prompt
  refait (pianiste pédagogue ; expliquer d'abord ; structure idée → accords en gras → pourquoi
  → mains → exemple ; mode coach pour une session). `executeToolCalls` prépare un `example`
  ({kind, title, subtitle, style, tempo, events, beats, chords}) ; `wantsToHear` décide de la
  lecture automatique ; carte `.copilot-example` sous le texte ; lecture par le lecteur des
  démos (`copilot-play-example` / `copilot-stop-example` / `copilot-example-state`). Clavier
  masqué : l'explication reste, une ligne dit d'afficher le clavier pour voir les touches.
- **Classifieur** (`intent-classifier.js`) : tonalités en français et en anglais
  (`extractKey` : « en Fa », « en Sib majeur », « en la mineur », « in Eb » ; « en la jouant »
  n'est pas une tonalité) ; II-V-I mineur = m7b5 – 7 – m7 ; accords en solfège (« Rém7 Sol7
  Domaj7 ») ; « il y a » n'est plus un accord de La ; `chordSymbolsInText`.
- **Session MIDI** : `midi-chord-namer.js` (nom depuis les notes jouées, fondamentale à la
  basse d'abord, `matched`) ; `session-analysis.js` (accords lus sur ce qui sonne, basse de
  pédale, mélodie au-dessus, arpèges lents ; une basse frappée sous Do3 remplace celle que
  garde la pédale) ; `session-performance.js` (analyse du jeu) ; carnet : rangée « Analyse du
  jeu » (pastilles, moments cliquables), en-tête sur une ligne ; bouton « Analyser mon jeu avec
  le Copilot » → demande « Analyse mon jeu sur cette session : ce qui est réussi, ce qui ne va
  pas (avec les moments), et comment progresser. » ; contexte : origine, constats.
- **Studio → Session** : pendant l'enregistrement vidéo du Studio, un second enregistreur prend
  le jeu MIDI ; à l'arrêt, session « Studio · <piste> · <date> » (`sourceType: 'studio'`,
  étiquette studio, sans tempo inventé), sélectionnée dans Session MIDI ; message dans la barre
  d'état du Studio ; filtre « Mes captures » les inclut.

## `state/current-work.md` — à vérifier sur le PC (Electron, clavier MIDI, clé IA)

1. Copilote, « Explique-moi un 2-5-1 » : le texte d'abord, aucune note avant ; carte « Dm7 →
   G7 → Cmaj7 » ; Écouter → basse + main droite ; Arrêter.
2. « Joue-moi un 2-5-1 en Fa » : texte, puis l'exemple démarre seul (Gm7 → C7 → Fmaj7).
3. « Joue-moi F G Am en worship » : triades à droite, basse à gauche, style Gospel / worship.
4. Session MIDI : jouer Dm9 → G13 → Cmaj9 à deux mains, pédale gardée d'un accord à l'autre :
   accords bien nommés ; « Pédale gardée entre deux accords » avec ses moments ; clic sur un
   moment → la tête de lecture y va.
5. « Analyser mon jeu avec le Copilot » : réponse de coach qui cite les moments.
6. Studio : piste chargée, enregistrement (R), jouer au clavier MIDI, arrêter : message « Jeu
   MIDI enregistré dans Session MIDI » ; la prise est sélectionnée dans Session MIDI ;
   Lecture → le jeu seul, sans les pistes audio.

## `state/next-actions.md` — à ajouter

- Faire valider les choix des deux ADR (rootless par défaut, seuils de l'analyse).
- Calibrer l'analyse sur de vraies sessions de Narcisse (faux positifs ?).
- Option possible : technique des exemples au choix (Rootless / Drop 2 / Triades).
- Nettoyage : écouteurs `copilot-note-on` / `copilot-note-off` de `main.js` devenus inutiles.
- Six suites de tests échouaient déjà avant ce travail, à l'identique : `test-skin-manager`,
  `test-coach-dom` (28/30), `test-load-session` (window absent), `test-training-dom`,
  `test-voicing-preview`, `tests/ui/test-analysis-workspace` (5/10).

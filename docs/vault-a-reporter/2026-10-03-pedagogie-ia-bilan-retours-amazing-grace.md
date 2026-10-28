# Pédagogie IA — bilan des retours de Narcisse (tuto GHM, Amazing Grace) — 03/10/2026

À reporter dans le vault :
- `state/current-state.md` et `state/current-work.md` (la série est finie) ;
- `state/next-actions.md` (vérifications sur son PC, ci-dessous) ;
- `log.md` (une ligne par lot) ;
- `decisions/` : ses trois choix (analyse à l'import ; plage de 10 min ; pauses de 2 s
  signalées).

Le détail de chaque lot est dans sa propre note :
`retour-aux-cartes`, `rejeu-naturel`, `analyse-a-l-import`, `plage-du-copilote`,
`barre-de-lecture`, `transfert-fidele`.

## Ce qu'il a demandé
D'abord, avec sa vidéo du tuto GHM :
- revenir aux cartes ;
- le rejeu « part en vrille » ;
- choisir le passage sans rien taper ;
- une durée maximale ;
- savoir quand le prof parle.

Puis, après ses essais sur Amazing Grace (9:57 → 10:57) :
- fermer le Copilote tant que l'analyse n'est pas faite, avec un temps de chargement
  pendant lequel on peut aller ailleurs ;
- rendre plus claires les pauses où le prof explique ;
- garder les étiquettes d'accords repliées ;
- une barre de lecture pour revenir en arrière ;
- choisir sa propre plage (« une minute, c'est trop court ») ;
- un rejeu saccadé, faute de pédale ;
- un transfert de voicings qui « n'a rien à voir ».

Ses choix :
- toute la vidéo analysée dès l'import ;
- une plage de 10 minutes au plus ;
- des pauses raccourcies à 2 s, et signalées.

## Ce qui est fait (7 commits sur `fix/exercices-voicing-correctifs`)
| Lot | Commit | En bref |
|-----|--------|---------|
| 1 | `fa7c7e9` | « ← Mes tutoriels » ramène aux cartes ; un relevé continue sous son tuto si l'on part ; « Style » groupé avec sa liste. |
| 2 | `f49ab0d` + `7520bc7` | Le rejeu ne reprend que ce qu'il joue (pas sa voix transcrite), 10 notes ensemble au plus, avec sa pédale (entendue, sinon une par accord) ; pauses de plus de 2 s ramenées à 2 s et signalées ; « ici il parle » dit au Copilote. |
| 3 | `f7223b1` | Analyse dès l'import (30 min au plus, refus clair sinon) ; écran d'attente commun ; Copilote amarré seulement une fois prêt ; message « prêt » depuis n'importe quel onglet. |
| 4 | `80d4d64` | Barre du passage : Début / Fin en listes (heures, minutes, secondes), « Maintenant », 10 min au plus, « Boucler », « Suivre la vidéo », bande « il joue / il explique » ; le Copilote parle de cette plage ; frise des accords repliée par défaut (choix retenu). |
| 5 | `cd6f65f` | Barre de lecture des exemples : Pause / Reprendre, « ⟲ 5 s », curseur avec les moments où le prof parle, « Ici, le prof explique (10:12 → 10:20) », « Dans la vidéo : 10:03 · Voir dans la vidéo ». |
| 6 | `4734b8f` | Transfert fidèle : chaque accord relu d'après ses notes quand la frise ne les explique pas, sa forme la plus jouée par famille, toute la plage lue (10 min). |

## Vérifié (état final)
- Suite complète : 96 suites. Seuls les 6 échecs anciens connus restent, avec le même
  nombre de contrôles ratés qu'avant la série :
  - `test-skin-manager` ;
  - `test-coach-dom` (28/30) ;
  - `test-load-session` ;
  - `test-training-dom` (11) ;
  - `test-voicing-preview` ;
  - `tests/ui/test-analysis-workspace` (5/10).
- Tests de la série :
  - `test-pedagogie-dom` 142/142 ;
  - `test-tutorial-transfer` 99/99 ;
  - `practice-demo.test` 89/89 ;
  - `test-teacher-notes` 48/48 ;
  - `test-tutorial-moment` 30/30 ;
  - `test-teacher-activity` 28/28 ;
  - `test-example-transport` 18/18 ;
  - `test-passage-range` 12/12 ;
  - `test-copilot-client` 210/210.
- Build Vite OK, régressions Partie 1 et Partie 3 OK.
- Scénarios Playwright sur l'application construite, avec un faux electronAPI, passés lot
  par lot, sans erreur. Ils couvrent : import et attente, retour aux cartes, mémoire,
  Copilote en direct, outils, parole, plage, barre de lecture, transferts (voicings,
  enchaînement, lick). Plus `demo-live` (démo des Exercices, même lecteur).
- Repassés tous ensemble sur la version finale : 22 passages (11 scénarios, en sombre et
  en clair), aucune erreur.

## À vérifier sur le PC de Narcisse
1. Importer un tuto, aller dans le Studio pendant l'analyse : le message « prêt » apparaît ;
   un clic rouvre le tuto, Copilote ouvert.
2. Amazing Grace, Début 9:57 → Fin 10:57 (listes), « reproduis ce que je viens
   d'entendre » :
   - le rejeu est fluide (sa pédale) ;
   - ses explications sont raccourcies à 2 s et signalées sur la barre de lecture ;
   - « ⟲ 5 s » et « Voir dans la vidéo » fonctionnent.
3. Même passage, « Appliquer à une progression… » › Voicings › 4-5-3-6-2-5-1 : ses
   voicings (main gauche, rôles de la main droite) doivent se retrouver. Le texte sous la
   réponse dit les accords relus d'après ses notes.
4. Tuto GHM 0:04 → 0:24 : le Copilote dit qu'il parle ; la bande du passage le montre.
5. Un tuto de plus de 30 min : il est refusé à l'import, avec le message.

## Limites connues
- Le relevé d'un tuto est gardé sans être refait. Ce qui se calcule à l'affichage (il
  joue / il parle, notes de sa voix écartées) vaut aussi pour un relevé ancien. Mais un
  tuto analysé avant le lot 2 n'a pas gardé la pédale entendue au son : son rejeu prend
  la pédale « à chaque accord ». « Refaire l'analyse » la relève.
- La vidéo est lue en entier en mémoire pour être jouée (comme dans le Studio) ; le
  plafond de 30 minutes protège.
- Le transfert repose sur ses notes lues : si l'image est mal lue (clavier filmé de côté),
  ses voicings ne peuvent pas être meilleurs que la lecture. Son fichier de relevé
  d'Amazing Grace (`~/PianoJazzChords/Pedagogie/memoire/*.json`), s'il l'envoie, ferait de
  son vrai passage un test.

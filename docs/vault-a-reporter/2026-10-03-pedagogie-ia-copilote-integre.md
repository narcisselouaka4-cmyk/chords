# Pédagogie IA — le Copilote intégré à côté de la vidéo du prof (Lot 1, 03/10/2026)

À reporter dans le vault (`state/current-work.md`, `log.md`, `decisions/` : nouvelle
ADR « Pédagogie IA = vidéo + Copilote intégré »).

## Le besoin, dit par Narcisse
- « La clarté des “professeurs” sur YouTube : parfois je ne comprends pas tout ce que
  dit le pianiste (langue, explications floues). Pédagogie IA doit m'aider à comprendre
  les concepts utilisés dans la vidéo, pour les appliquer à mon jeu si c'est pertinent. »
- Il veut le Copilote **dans** Pédagogie IA, à côté du prof qui parle, pour demander :
  « Qu'est-ce qu'il a voulu dire à ce moment-là ? », « C'est quoi ce voicing ? »,
  « Que donnerait ce voicing en Fa♯ ? », et surtout « Comment appliquerait-on ce qu'il
  vient de faire dans une progression 4-5-3-6-2-5-1 ? ».
- Écartés par lui :
  - le karaoké (plutôt pour Analyse) ;
  - la transcription et les sous-titres affichés (souvent faux ou mal traduits) ;
  - le « résumé » (trop court).
- Plan approuvé : 6 lots. Lot 1 = mise en page + Copilote intégré.

## Fait
- **Mise en page.** La vidéo est à gauche, avec dessous la frise des accords (cliquable),
  puis la vitesse et la boucle A-B (lot 6). Le panneau du Copilote est à droite.
  - Accueil sans tuto choisi : `#pedagogie-home`. Ses vignettes viendront au lot 5.
  - Vue avec tuto : `#pedagogie-split`.
  - Styles : `src/ui/refonte/astra-pedagogie.css`.
- **Un seul Copilote.** La zone de conversation (`#copilot-chat-area`) est
  *déplacée* dans le panneau de Pédagogie, puis remise à sa place dans l'onglet
  Copilote (`src/pedagogie/copilot-dock.js`). Les règles CSS du Copilote visent
  `:is(#practice-view-copilot, #pedagogie-copilot-panel)`.
- **Le « moment ».** Chaque question part avec le passage qui vient de se jouer
  (`src/pedagogie/tutorial-moment.js`).
  - Le passage dure 20 s avant l'instant de la vidéo ; on peut choisir 10, 20, 30 ou
    60 s. Une boucle A-B, si elle est posée, le remplace.
  - L'étiquette « Passage : 0:22 → 0:42 » est affichée au-dessus de la conversation.
  - Le contexte contient les accords du passage, les notes du prof (main gauche | main
    droite) et la parole, présentée comme un indice.
  - Règle 19 du prompt : « ici », « ce qu'il vient de faire » = ce passage. On explique
    à partir des notes jouées ; la transcription n'est jamais citée.
- **Questions rapides** (`src/pedagogie/tutorial-questions.js`) :
  - « Qu'a-t-il voulu dire ? » ;
  - « Ce voicing ? » ;
  - « Autre tonalité… » (choix de la tonalité) ;
  - « Appliquer à une progression… » : quoi (voicings, enchaînement, lick), quelle
    progression (4-5-3-6-2-5-1 en premier), quelle tonalité.
- Les moments « m:ss » d'une réponse sont cliquables et placent la vidéo. Écrire dans la
  case met la vidéo en pause.
- **Retirés :**
  - le résumé du cours ;
  - le glossaire ;
  - la question « Tutoriel ou Cover ? » ;
  - les messages techniques (V2N, pip, git lfs), repliés sous « Détails techniques ».

## Vérifié
- `src/pedagogie/test-tutorial-moment.js` (26/26) et `src/ui/test-pedagogie-dom.js`
  (104/104).
- Scénario Playwright avec une analyse simulée, en sombre et en clair.
- Build OK, régressions Partie 1 / 3 OK.

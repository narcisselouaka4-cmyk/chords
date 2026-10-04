# Copilote — étiquettes : ce qui est écrit part (04/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, `decisions/` (son choix : ce
qui est écrit part).

## Demande de Narcisse
- « Il y a le système d'étiquettes, notamment celles affiliées à « sur ce passage ». En
  gros, pour chaque étiquette, il y a une question, et il faudrait changer ça. »
- « « Autre tonalité » qu'on pourrait améliorer, ou « Voicing » […] dont on ne comprend
  pas vraiment le sens. Ça se trouve, ça correspond à ce que je veux dire à Copilot, mais
  ça se trouve, ça ne colle pas du tout à ce que je pense. »
- Ses deux pistes : tout enlever (« mais il faudra tout écrire à la main, ce qui sera vite
  saoulant »), ou une approche « beaucoup plus simple et plus rapide ».
- Son choix, parmi trois : **ce qui est écrit part**. Les deux autres options étaient
  « elles remplissent la case » et « les enlever ».

## Fait
- **Pédagogie IA, quatre étiquettes** (`tutorial-questions.js`) :
  - « Explique ce passage » envoie « Explique ce passage. » ;
  - « Rejoue ce passage » envoie « Rejoue ce passage. » ;
  - « Rejoue-le en… » ouvre les 12 tonalités. Un clic sur Fa écrit « Rejoue ce passage en
    Fa. » dans la case, sans l'envoyer ;
  - « Applique-le à… » ouvre le choix (ses voicings, ses accords de passage, son lick ;
    une progression ou la sienne ; une tonalité). La phrase de la case suit chaque choix :
    « Applique ses accords de passage à 2-5-1 en Fa. » ;
  - « Envoyer » (ou Entrée) envoie la phrase, que l'on peut changer avant ;
  - fermer le choix sans envoyer efface la phrase préparée.
- **Même règle partout dans le Copilote**, puisque c'est le même système d'étiquettes, et
  que le « Voicing » qu'il cite en venait :
  - Exercices : « Explique ce voicing », « Comment le jouer à deux mains ? », « Quelles
    voix bougent ? », « Fais-moi entendre la carte » ;
  - onglet Copilot IA (« Continuer : ») : « Montre-moi un voicing pour cet accord », « Que
    peut jouer la main gauche ? », « Que peut jouer la main droite ? », « Fais-moi un
    arpège lent », « Fais-moi une démonstration », « Fais-moi un lick adapté » ;
  - accueil du Copilote : « Montre-moi un voicing intéressant », « Explique-moi un
    2-5-1 », « Comment mieux accompagner ? ».
- **Suggestions sous les réponses** (`suggest_actions`) :
  - le bouton montre le message qui partira, et la mention « Demander » est retirée ;
  - le modèle est prié d'écrire 2 à 4 questions de suivi de 40 caractères au plus, « comme
    le pianiste les poserait » (label = message).
- **Le repli automatique du Copilote reconnaît les nouvelles phrases** :
  - « Rejoue ce passage en Fa. » donne le passage transposé (avant, la tonalité aurait
    été perdue) ;
  - une progression tapée en accords après « à » est reconnue ;
  - « applique » lance l'exemple après la réponse, comme le faisait la question cachée
    (« Fais-la-moi entendre ») ;
  - les questions tapées à la main restent reconnues.
- **De la hauteur pour la conversation** :
  - en mode tuto, le libellé « Sur ce passage : » est masqué (les étiquettes disent déjà
    « ce passage ») ;
  - « Style » est passé sur la ligne de la case, avant le bouton d'envoi ;
  - les quatre étiquettes tiennent ainsi sur une ligne.
- **Retirés** : les questions cachées (`whatHeMeantQuestion`, `voicingQuestion`) et la liste
  `STATIC_QUICK_ACTIONS`, qui n'était plus utilisée.

## Vérifié
- Tests :
  - `test-tutorial-moment.js` 32/32 ;
  - `test-copilot-client.js` 213/213 (repli sur les nouvelles phrases) ;
  - `test-copilot-tab.js` 22/22 ;
  - `test-pedagogie-dom.js` 151/151, dont 4 contrôles du lot.
- Scénario Playwright `pedago-chips`, en sombre et en clair, sans erreur :
  1. étiquettes « Explique ce passage », « Rejoue ce passage », « Rejoue-le en… »,
     « Applique-le à… » ;
  2. « Explique ce passage » envoie exactement « Explique ce passage. » ;
  3. « Rejoue-le en… » puis Fa : la case contient « Rejoue ce passage en Fa. », rien n'est
     parti, « Envoyer » est actif ;
  4. Entrée envoie la phrase ; le choix se ferme ; l'exemple est transposé de +5
     demi-tons ;
  5. « Applique-le à… » : la phrase suit chaque choix, jusqu'à « Applique ses accords de
     passage à Fmaj7 E7 Am7 D9. » ;
  6. « Envoyer » envoie la phrase et donne l'exemple de transfert ;
  7. choix refermé sans envoyer : la case est vidée ;
  8. suggestions : « Que fait la main gauche ? », « Rejoue-le plus lentement » ;
  9. un clic envoie exactement ce texte.
- Les scénarios `pedago-live`, `pedago-tools`, `pedago-speech` et `pedago-apply`
  repassent.
- Suite complète : 97 suites, seuls les 6 échecs anciens connus restent (mêmes nombres).
  Build et régressions Partie 1 et Partie 3 OK.

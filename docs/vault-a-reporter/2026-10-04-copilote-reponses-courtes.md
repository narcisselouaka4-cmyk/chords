# Copilote — réponses courtes, détail sur demande (04/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, `decisions/` (son choix :
courtes, le détail sur demande).

## Demande de Narcisse
- « Ses explications ont l'air intéressantes, mais il en donne parfois de très longues. »
- « Les explications manquent de clarté : il y a trop de détails, trop d'inscriptions. Il
  faudrait que ce soit beaucoup plus clair et épuré, parce que là c'est vraiment pas
  avantageux. »
- Son choix, parmi trois : **courtes, le détail sur demande**. Les deux autres options
  étaient « très courtes » (deux ou trois phrases) et « même contenu, aéré » (explications
  complètes, avec des intertitres).

## Fait
- **Les consignes du Copilote** (`COPILOT_SYSTEM_PROMPT`, `copilot-client.js`) :
  - règle 4 réécrite. Par défaut, l'idée en une phrase, puis deux ou trois points « • »
    d'une ligne, environ 80 mots. Ni titres ni longue liste, et la question n'est pas
    répétée. Seulement les deux ou trois notes qui comptent. L'exemple à écouter vient en
    dernière ligne ;
  - sur « Plus de détails » (ou « détaille », « explique plus »), l'explication complète
    revient, en courts paragraphes : l'idée, les accords et les notes, pourquoi ça marche,
    ce que fait chaque main ;
  - règle 3 : « ton explication (courte : règle 4) » au lieu de « complète » ;
  - règle 19 (tuto). Quelques lignes sur l'idée du prof et pourquoi ça marche. Les notes,
    accord par accord, sont écrites par l'application sous la réponse : il ne les recopie
    pas. Le rôle de chaque note n'est donné que sur demande ;
  - avis sur une session, ou sur un passage joué : même structure, chaque point en une ou
    deux lignes. Exercices : le voicing de la carte en quelques lignes ;
  - règle 14 : l'application propose déjà « Plus de détails », le modèle ne le propose pas.
- **Les notes écrites par l'application sont repliées** :
  - elles sont placées sous « Les notes, accord par accord ▸ » (`details.copilot-notes`) ;
    un clic les déplie ;
  - le texte complet reste dans la conversation envoyée au modèle, ce qui permet aux
    questions de suivi de connaître ces notes ;
  - les anciennes conversations se replient aussi ;
  - rien n'est replié si la réponse ne contient pas ces notes, ou ne contient rien
    d'autre : pas de bulle vide.
- **« Plus de détails »** : une étiquette sous la dernière réponse seulement, pour avoir
  moins d'inscriptions. Elle envoie « Plus de détails ». Elle n'apparaît pas dans ces cas :
  - après une erreur du service (les erreurs sont marquées `isError`) ;
  - après une demande de détail, qu'elle vienne de l'étiquette ou soit tapée (« plus de
    détails. », « Détaille la main gauche »…) ;
  - pendant que le Copilote répond à la question suivante.

  Si le modèle la propose aussi, elle n'apparaît qu'une fois. *Écart avec l'option
  choisie, qui disait « sous chaque réponse » : je l'ai mise sous la dernière seulement,
  pour ne pas ajouter d'inscriptions. Narcisse en est averti ; à changer s'il la veut
  partout.*
- **Deux fonctions pures, testées** : `splitAnswerNotes`, `answerActions` et `MORE_DETAILS`
  (`copilot-tab.js`).

## Vérifié
- Tests :
  - `test-copilot-tab.js` 32/32, dont 10 contrôles du lot (repli des notes, « Plus de
    détails ») ;
  - `test-pedagogie-dom.js` 154/154, dont 3 contrôles du lot ;
  - `test-copilot-client.js` 213/213 et `test-tutorial-moment.js` 32/32.
- Scénario Playwright `pedago-short`, en sombre et en clair, sans erreur :
  1. réponse de transfert : 4 lignes affichées, les notes repliées sous « Les notes, accord
     par accord », « Plus de détails » sous la réponse ;
  2. les consignes envoyées au modèle contiennent la règle courte, le détail sur demande,
     « ne les recopie pas » et « ne le propose pas » ;
  3. un clic déplie les notes ;
  4. une autre question : « Plus de détails » passe sous la dernière réponse (un seul à
     l'écran) ;
  5. un clic sur « Plus de détails » envoie « Plus de détails », sans nouvelle étiquette
     sous le détail ;
  6. pendant la réponse suivante : aucun « Plus de détails » ;
  7. service en panne : le message d'erreur s'affiche sans « Plus de détails » ;
  8. le modèle propose aussi « Plus de détails. » : une seule étiquette (« Plus de
     détails », « Que fait la main gauche ? »).
- Les scénarios `pedago-apply`, `pedago-chips` (sombre et clair), `pedago-live`,
  `pedago-transport`, `pedago-tools` et `pedago-speech` repassent sans erreur.
- Suite complète : 97 suites, seuls les 6 échecs anciens connus restent (mêmes nombres).
  Build et régressions Partie 1 et Partie 3 OK.

## À vérifier chez Narcisse (vrai modèle d'IA)
La longueur réelle des réponses dépend du modèle choisi dans Réglages › Assistant IA. Les
tests ont utilisé une réponse simulée. Si un modèle reste bavard malgré la consigne, me le
dire, avec le nom du modèle.

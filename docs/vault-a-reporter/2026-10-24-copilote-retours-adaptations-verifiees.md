---
title: "Copilote : choix annulables et adaptations vérifiées avant l’IA"
type: feature
date: 2026-10-24
status: "implémenté localement, contrôles passés ; Electron et MIDI physique non revalidés"
tags:
  - pedagogie-ia
  - copilote
  - transfert
  - fiabilite
---

# Ce qui a été fait

Demande de Narcisse : permettre de revenir après le choix d’une étiquette ; reprendre une idée
musicale dans un autre contexte seulement quand l’application sait justifier l’adaptation.
L’application doit expliquer les refus et les informations manquantes, sans fabriquer une réponse
musicale de remplacement. Le Guide du tuto reste retiré.

- `src/pedagogie/copilot-tab.js` : les étiquettes du tutoriel et les suggestions sous les réponses
  préparent la demande. Envoyer ou Entrée transmet ; Annuler, Échap depuis la saisie ou le choix,
  et un deuxième clic sur la même étiquette referment le choix. Le brouillon antérieur est
  restauré, même après un changement d’étiquette. Effacer la progression personnalisée désactive
  Envoyer et vide la demande, sans conserver une ancienne cible invisible.
- Nouveau `src/pedagogie/source-transfer.js` : même chemin déterministe pour le tutoriel/cover,
  le dernier passage MIDI et une session MIDI confiée. Source explicite, plage, type d’idée,
  cible et tonalité sont vérifiés avant l’appel au modèle. Une source personnelle demandée
  n’est jamais remplacée par la vidéo, ni une session absente par le dernier essai.
- `tutorial-transfer.js` : retrait de la pose « partout » lorsque le contexte ne correspond pas,
  et du remplacement silencieux d’un lick ou d’accords de passage absents par des voicings.
  Un mouvement conserve ses familles, ses déplacements et, quand les tonalités sont fournies,
  ses degrés. Un mouvement direct sans accord de passage peut être adapté dans son contexte
  analogue ; une demande explicite d’accords de passage n’est pas remplacée par ce mouvement direct.
  Les notes des accords source doivent permettre de vérifier le mouvement complet. Des démonstrations
  séparées par une interruption de plus d’une seconde ne sont pas assemblées.
- Les voicings restent adaptables par rôles : les modifications de tierces, septièmes et couleurs
  sont annoncées. Un rôle inexistant dans l’accord cible n’est plus remplacé par la fondamentale.
  Pour un lick, aucun accompagnement générique n’est ajouté lorsque la source n’en donne pas.
- `copilot-client.js` : les adaptations reconnues sont calculées avant le réseau. La réponse visible
  explique ce qui est conservé ; les notes détaillées restent repliées. Le modèle ne reçoit plus
  l’outil d’adaptation à décider lui-même. Un appel d’adaptation inattendu, même écrit en texte,
  reçoit une demande de précision sans exemple. La consigne permettant de changer les degrés III/VI
  en dominantes au nom du style gospel est retirée. « Fais-le-moi entendre » conserve le résultat
  déjà vérifié, sans le recalculer depuis une autre sélection.
- Transposition : la tonalité demandée ne peut plus être oubliée au profit d’un simple rejeu.
  Une tonalité source inconnue et un changement explicite majeur/mineur empêchent le faux exemple
  transposé. Le clavier transposé est pris en compte dans la source MIDI.
- `tutorial-questions.js` : reconnaissance de « mouvement », cible unique pour un voicing,
  et conservation des tokens inconnus dans la cible afin de refuser la progression complète,
  plutôt que d’en supprimer silencieusement un accord.
  Après la question de suivi de Narcisse : « Rejoue ce passage dans un contexte de 2-5-1 »
  est également reconnu comme une adaptation, au lieu d’un rejeu simple qui ignorerait la cible.
  Si le procédé à conserver n’est pas précisé, le Copilote demande s’il s’agit du voicing,
  du mouvement ou de la ligne ; « Rejoue ce voicing … » adapte directement le voicing si possible.

Les sessions de plus de dix minutes sont refusées avant leur segmentation, et les vidéos longues
ne sont pas tronquées silencieusement pour produire une adaptation.

Les fichiers de tests existants correspondants sont adaptés. Nouveau test
`src/pedagogie/test-source-transfer.js` et banc navigateur
`src/pedagogie/fixtures/copilot-transfer.html` : véritable contrôleur, données synthétiques,
sans fichiers utilisateur, sans configuration d’API et sans réseau d’IA.

# Ce qui a été vérifié, et comment

- Source → adaptation : **32/32 scénarios**. Notamment I–vi refusé sur ii–V–I, I–vi transposé
  accepté dans sa tonalité d’arrivée, I–vi non confondu avec IV–ii, voicing adaptable au ii–V–I,
  données manquantes, interruption, cible invalide, source personnelle/session/vidéo distinctes,
  tonalité inconnue, transposition majeur/mineur et tentative de contournement par le modèle.
- Moteur de transfert : **100/100** ; client Copilote **260/260** ; contrôleur **37/37** ; questions
  et moments **32/32** ; notes du professeur **84/84** ; moteur Pédagogie **97/97** ; analyse d’une
  prise **55/55** ; contrat DOM Pédagogie **180 contrôles**, sortie zéro.
- Contrôles obligatoires : accords **98/98**, régressions parties 1 et 3 passées, build Vite passé,
  `git diff --check` passé. Le build garde son avertissement préexistant sur la taille du bundle.
- Navigateur réel : **13/13 contrôles** sur le banc, avec les vraies fonctions et les vrais
  événements du contrôleur. Vérifiés : Annuler, Échap, brouillon, changement d’étiquette, cible
  effacée, absence d’envoi au premier clic, motif de refus et exemple compatible.
- Six relevés existants de la bibliothèque ont été utilisés en lecture seule, sur les vingt
  secondes à partir de leur première note. Rapport local :
  `audit-output/pedagogie-transfer/real-cache-check.json`. Le calcul des voicings aboutit sur
  cinq sources et refuse la sixième ; les mouvements de ces fenêtres ne sont pas certifiés.
  Ce contrôle vérifie le comportement du transfert sur ces entrées, pas la fidélité musicale
  du relevé à la vidéo originale.

Le test historique du délai Electron compare désormais le délai restant à une borne (0 < délai
≤ 60 ms), au lieu d’exiger exactement 60 ms après le temps de préparation de la requête.
Deux attentes obsolètes sur « Joue le résultat final » ont été retirées du test des questions,
en accord avec ADR-058 ; aucun retour de cet outil dans le produit.

# Ce qui reste à vérifier

- Pas de nouvelle analyse vidéo complète dans Electron, ni de nouvel enregistrement au clavier
  physique, ni de validation à l’oreille de toutes les adaptations possibles.
- Le relevé conservé `04028adb.json` d’« Amazing Grace – Slow Gospel Blues Piano » a **127 notes,
  révision 5**, lors de cette inspection. Sur la fenêtre testée, le transfert refuse les données
  insuffisantes. Cette session ne répare pas ce relevé et ne prétend pas que sa lecture est correcte.
- La compatibilité est volontairement conservatrice : elle certifie les transformations calculées
  par les règles actuelles. Un refus signifie « je ne peux pas le justifier ainsi », pas une preuve
  générale d’impossibilité musicale. D’autres procédés valides peuvent nécessiter un traitement
  explicite et une référence musicale avant d’être pris en charge.
- L’analyse continue de la performance face à une référence vidéo n’est pas ajoutée par ce lot.

# À mettre dans decisions/

- L’adaptation est autorisée par le calcul, jamais par la seule réponse du modèle. Source, objectif
  à conserver et cible doivent être explicites ; un refus ne change ni le procédé ni la progression.
- Distinguer reprise des rôles d’un voicing et conservation de la fonction d’un mouvement.
  La présence d’un accord de même famille ou d’un intervalle similaire ne suffit pas.
- Une étiquette prépare une demande annulable ; le brouillon précédent reste récupérable avant envoi.

# À mettre dans experiments/

- Les anciens tests attendaient explicitement des accords de passage ou un lick placés ailleurs
  quand le contexte ne convenait pas. Ces comportements sont désormais des cas de refus, et des
  exemples positifs avec contexte compatible sont conservés et vérifiés note par note.
- La vérification navigateur utilise une fixture dans `src/` parce que Vite sert cette racine ;
  un chemin sous `tests/` renvoyait la page principale au lieu du banc.
- Inspection des six anciens relevés : utile pour tester les refus sur des entrées imparfaites,
  insuffisante pour affirmer que l’extraction de la vidéo est fiable.

# Prochaines actions et questions pour Narcisse

Recharger l’application puis vérifier le même parcours sur un passage choisi et un essai MIDI réel.
Pour clore le problème du relevé d’Amazing Grace, il faut contrôler une nouvelle analyse complète,
son fichier réellement sauvegardé et son rejeu ; aucune invalidation globale des caches effectuée ici.

Changements locaux, non commités ni poussés. Les autres modifications déjà présentes dans le dépôt
(Analyse, bibliothèque, Studio, thèmes, fichiers générés) sont conservées. Note à intégrer au coffre
avec `state/` et `log.md` lors de la reprise documentaire.

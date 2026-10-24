---
title: Copilote - corriger les erreurs revelees par la conversation 7-3-6
type: implementation
date: 2026-10-24
status: validation-locale
tags: [pedagogie, copilot, source, adaptation, regression]
---

## Ce qui a été fait et fichiers touchés

La conversation fournie par Narcisse (`conv_1792802012844_je6n0s.json`) révèle des erreurs que les tests précédents ne couvraient pas :

- Le 7-3-6 est présenté comme septième / tierce / sixième d'un accord, avec des affirmations injustifiées sur les mains et des notes erronées.
- Une demande de démonstration de la vidéo reçoit un lick généré. Un autre message affirme qu'aucun exemple n'est disponible alors qu'un exemple de la source est conservé dans `toolResult`.
- Le parseur confond la progression source 7-3-6 et la cible 1-6-2-5 en Mi.
- Le contrôle d'adaptation précédemment ajouté demande une catégorie technique au lieu d'examiner ce qui est réutilisable, puis perd la demande quand Narcisse répond « je veux conserver ce qui est possible de conserver ».

Le cache de la vidéo contient une estimation globale en Mi, mais une annonce de Do dans la transcription et deux occurrences Si → Mi → La dans le relevé. Ces données concordent pour une lecture des fondamentales 7 → 3 → 6 en Do. Les qualités relevées B7#9#11, E7#5, A7sus4 ne sont pas présentées comme les accords diatoniques de Do.

Modifications :

- `src/pedagogie/tutorial-evidence.js` : croisement entre progression nommée, tonalité annoncée et fondamentales relevées ; localisation d'occurrences complètes ; explication française et demandes de démonstration traitées localement. Les accords incertains ou illisibles interrompent une occurrence. Une région explicitement choisie reste prioritaire. Un autre moment de la vidéo ne reçoit pas le titre de la progression complète.
- `src/pedagogie/tutorial-questions.js` : distinction source/cible, y compris deux suites de degrés, deux tonalités et tirets typographiques.
- `src/pedagogie/source-transfer.js` : examen des éléments conservables après refus du mouvement complet ; conservation de l'intention, de la cible, de la tonalité et de la fenêtre source ; détection du changement de source/relevé. Le jeu personnel reste attribué au pianiste, même avec une vidéo ouverte. Les anciennes conversations sans métadonnées peuvent reprendre leur dernière demande d'adaptation.
- `src/pedagogie/copilot-client.js` : intégration des branches locales avant tout appel au modèle, contexte cohérent avec les notes réellement disponibles, protection contre la confusion intervalles/degrés observée, correction des légendes contradictoires. Les actions proposées portent le même texte que le message envoyé.
- `src/pedagogie/test-copilot-conversation.js`, `fixtures/copilot-736-conversation.json`, `test-source-transfer.js`, `test-copilot-client.js` : régressions issues de la conversation et adaptation des assertions au traitement direct sans modèle.

Sur ce cas, le mouvement 7-3-6 complet est refusé sur 1-6-2-5 en Mi. Une adaptation partielle des rôles des voicings est identifiée. Après la réponse « conserver ce qui est possible », l'exemple préparé suit Emaj7 → C#m7 → F#m7 → B7 et explique explicitement que le mouvement complet serait changé. Aucune demande de cette suite ne dépend d'un appel réseau.

Cette note complète celle du 24/10 sur les retours et adaptations vérifiées. Le comportement qui demandait systématiquement « voicing / mouvement / ligne » est remplacé par l'examen des possibilités, suivi d'une reprise partielle explicitement demandée.

## Ce qui a été vérifié et comment

- `node src/pedagogie/test-copilot-conversation.js` : **26/26** scénarios ; les sept demandes exactes sont enchaînées avec leur historique, sans appel réseau. Les hauteurs de chaque démonstration sont comparées aux événements du fragment source. Reprise d'une conversation ancienne, changement de vidéo, sélection incomplète, source sans notes, tonalité contradictoire et ancien lick généré sont couverts.
- `node src/pedagogie/test-source-transfer.js` : **36/36** scénarios.
- `node src/pedagogie/test-copilot-client.js` : **260/260** tests.
- Régressions : transfert tutoriel **100/100**, moment **32/32**, notes du professeur **84/84**, onglet Copilote **37/37**, historique **27/27**, moteur pédagogique **97/97**, théorie parlée **51**, rôles des notes **21/21**, accords **98/98** ; contrôles DOM Pédagogie et régressions parties 1 et 3 passés.
- `git diff --check` sur les fichiers suivis concernés : passé.
- `npm run build` : passé ; le dernier build après les ajustements finaux est consigné dans `/tmp/pjc-final-build.log`.

Le JSON de conversation et le cache utilisateur ont uniquement été lus. La fixture de régression contient un fragment de 56 notes, six accords et une courte annonce de tonalité, avec chemin de vidéo fictif. Elle n'est pas une transcription musicale validée manuellement.

## Ce qui reste à vérifier

- Écoute et essai interactif dans Electron avec cette vidéo. Aucun contrôle à l'oreille ni test de clavier MIDI physique pendant cette correction.
- La conversation sauvegardée ne donne pas la région active d'origine. Le test utilise un contexte borné 0:35–0:51 et vérifie aussi les refus dans une région explicite incomplète. Il ne prétend pas reproduire la position exacte de l'interface historique.
- Les branches corrigées évitent les erreurs `AI_EMPTY_RESPONSE` pour cette suite ; les autres questions qui utilisent encore un modèle peuvent échouer. Le filtrage d'une confusion observée ne garantit pas la justesse de toutes les réponses libres.
- La justesse de l'ensemble du relevé de la vidéo, le rendu musical des adaptations partielles et la généralisation à tous les tutoriels restent à mesurer.

## À mettre dans decisions/

Une adaptation doit conserver une identité de source et de cible entre les messages. Un refus du mouvement complet doit s'accompagner d'un examen concret de ce qui reste conservable, sans présenter une reprise de voicings comme la conservation du mouvement.

## À mettre dans experiments/

La première correction de compatibilité n'était pas suffisante : elle couvrait le refus et les rôles, mais pas cette conversation réelle, ses deux progressions nommées, son conflit de tonalité, ses demandes implicites de démonstration ni sa relance « ce qui est possible ». Garder cette conversation comme régression ; ajouter des cas réels distincts plutôt que généraliser depuis les seuls exemples synthétiques.

## Prochaines actions et questions pour Narcisse

Tester la même suite dans Electron, écouter la démonstration reprise et l'adaptation partielle, puis relever les écarts entre vidéo, relevé et rendu. Aucune nouvelle fonctionnalité à ajouter avant ce contrôle musical.

---
title: Copilote - relances coherentes et insertion du 7-3-6
type: implementation
date: 2026-10-24
status: validation-locale
tags: [pedagogie, copilot, conversation, adaptation, provenance]
---

## Ce qui a été fait et fichiers touchés

Narcisse reste insatisfait et fournit la même conversation, désormais prolongée jusqu'à 24 messages. Les nouveaux défauts sont distincts du premier lot :

- Après un rejeu du passage 7-3-6, « un autre exemple » joue une ancienne grille Emaj7 → C#m7 → F#m7 → B7 générée par l'application.
- « C'est pas dans la vidéo ça ? » aboutit à une réponse vide.
- Après le refus global d'adapter le 7-3-6 à 1-6-2-5, « tu peut le jouer entre le 1-6 comme mouvement de passage » aboutit également à une réponse vide.

Le premier correctif était trop strict : il assimilait une application du mouvement à la reproduction de ses degrés sur toute la grille. Un mouvement peut aussi être inséré avant son accord d'arrivée. Cette correction remplace donc le refus global documenté dans la note précédente lorsque cette insertion est réalisable.

Comportement calculé sur le fragment fourni :

**Emaj7 → D#7#9#11 → G#7#5 → C#7sus4 → C#m7 → F#m7 → B7**.

Les vingt notes source de 0:42.017–0:46.125 sont toutes transposées de +4 demi-tons. Leurs intervalles sont conservés. L'arrivée relevée est A7sus4, donc C#7sus4 après transposition, alors que la grille demande C#m7 : une résolution sus4 → tierce mineure est ajoutée et explicitement signalée. Ses autres notes viennent du voicing d'arrivée relevé. Les accords de contexte demandés proviennent du moteur de l'application et ne sont pas attribués au pianiste de la vidéo.

Fichiers :

- `src/pedagogie/passage-insertion.js` : repérage de la paire de degrés ; validation de la source et de l'arrivée ; transposition du passage entier ; résolution suspendue limitée aux cas vérifiables ; assemblage avec les accords explicites de la grille. Chaque partie et chaque événement portent leur origine : source, contexte ou résolution.
- `src/pedagogie/source-transfer.js` : distinction entre placement dans la grille et remplacement de la grille ; recherche d'une insertion avant un refus global ; conservation de l'intention au travers des questions intermédiaires. Une nouvelle tonalité explicite reste prioritaire.
- `src/pedagogie/tutorial-evidence.js` : « un autre exemple » suit le dernier objet musical, recherche une autre occurrence du même mouvement et respecte la région choisie. Une variante d'insertion garde la cible et l'opération. Les questions de provenance sont résolues depuis l'exemple réellement préparé, y compris les anciens exemples générés.
- `src/pedagogie/copilot-client.js` : intégration avant le modèle, provenance explicite des rejeux et reconnaissance de « tu peut le jouer ».
- `src/pedagogie/test-copilot-followup.js`, `test-copilot-conversation.js` et `fixtures/copilot-736-conversation.json` : ajout des cinq nouvelles demandes exactes et des cas de suivi ; les anciennes attentes de refus global sont remplacées par la vérification de l'insertion possible.

## Ce qui a été vérifié et comment

- **28/28** scénarios de relance passent, avec réseau interdit : deuxième occurrence au lieu d'une ancienne grille, provenance réelle, insertion dans la grille entière, transposition intégrale, notes de résolution exactes, refus des arrivées incompatibles et des paires absentes, changement de tonalité, conservation du passage après une question intermédiaire et changement de vidéo.
- Les **20 notes et leurs instants** de la fixture pour le premier extrait ont été comparés au cache réel `8aaf3a36.json` (révision 5, 1114 événements) : identité confirmée. L'insertion est contrôlée note par note ; un écart rythmique de 1,08 seconde du fragment est aussi conservé.
- Suites : conversation initiale **26/26**, source/adaptation **36/36**, client Copilot **260/260**, transfert **100/100**, onglet **37/37**, moment **32/32**, notes du professeur **84/84**, export d'exemple **8/8**, transport **18/18**, historique **27/27**, accords **98/98**. DOM Pédagogie et régressions parties 1 et 3 passent.
- `git diff --check` et syntaxe du module d'insertion : passés. Build de production passé après les dernières corrections ; sortie dans `/tmp/pjc-followup-build.log`.
- Aucun fichier de conversation ni cache utilisateur modifié. Les autres modifications déjà présentes dans le dépôt sont conservées.

## Ce qui reste à vérifier

- Écouter cette insertion dans Electron, notamment le passage C#7sus4 → C#m7 et le raccord rythmique avec les accords de contexte. Aucune écoute réelle ni validation du toucher pendant ce lot.
- La conservation des événements du relevé ne prouve pas la justesse de ce relevé par rapport au son de la vidéo.
- La réponse concerne une proposition d'insertion avec résolution explicitement ajoutée ; elle ne certifie pas que toute chaîne peut servir de passage avant toute arrivée.
- Les questions libres qui passent encore par le modèle restent soumises aux erreurs du service. Ces cas de relance sont traités localement, mais cela ne suffit pas à déclarer tout Copilot terminé.

## À mettre dans decisions/

Un refus d'adaptation doit distinguer remplacer une progression et insérer une chaîne avant son arrivée. Une résolution absente de la source doit être affichée comme un ajout calculé. Les relances courtes gardent l'identité du dernier objet musical ; une question intermédiaire ne doit pas effacer l'intention d'adaptation.

## À mettre dans experiments/

Le premier contrôle source/cible empêchait certaines inventions, mais produisait un faux refus sur ce cas. L'ancienne attente de test « le 7-3-6 est refusé sur toute la grille 1-6-2-5 » était insuffisante. Les demandes exactes suivantes montrent l'importance d'évaluer les suites de messages, et pas seulement les questions isolées.

## Prochaines actions et questions pour Narcisse

Reprendre les cinq derniers échanges avec cette vidéo et écouter les deux occurrences puis l'insertion. Vérifier musicalement le raccord avant de généraliser cette possibilité à d'autres familles de mouvements.

# Bibliothèque harmonique — 24 octobre 2026

## Le problème corrigé

Les 61 anciennes fiches décrivaient des suites d’accords, sans partition rythmique ni provenance. Un réglage de « niveau », puis de « couleurs », enrichissait les qualités et insérait des accords. Le même accompagnement de quatre temps par accord se répétait partout. Cela ne définissait ni un mouvement de passage précis, ni une interprétation à apprendre.

Le catalogue actif est désormais `src/data/exercise-studies.json`, via `src/exercise-catalogue.js`. Les 61 fiches historiques restent dans leur fichier d’origine et dans la catégorie Archives, avec leurs accords écrits conservés et sans enrichissement automatique. Elles sont exclues du tirage courant et de la liste des études. Leur ancien intitulé ne constitue pas une attribution vérifiée. Les anciennes sélections peuvent être retrouvées par identifiant ; des alias redirigent certains anciens noms vers l’étude correspondante.

## Trois objets pédagogiques

- **Progression** : cadre harmonique, sur lequel une réalisation particulière est écrite. Une dominante altérée peut être structurelle.
- **Mouvement de passage** : trajet défini, avec départ, accords de liaison et arrivée. Le moteur n’intercale rien de plus dans ce trajet.
- **Geste de voix** : travail d’une suspension ou d’une ligne sur une harmonie, qui ne se réduit pas à un changement de fondamentale.

Il s’agit d’une distinction de travail dans le produit : au sens large, un passage est aussi une succession d’accords. Il n’existe pas une façon universelle de jouer chaque formule. L’étude expose **une réalisation précise**, sans la présenter comme la seule valable.

## Première sélection : 13 études

| Type | Études |
| --- | --- |
| Progressions (5) | II–V–I majeur ; IIø–V7♭9–i6 ; turnaround I–VI7–ii–V–I ; boucle I–V–vi–IV ; blues jazz 12 mesures |
| Passages (6) | diminué chromatique vers ii ; dominante secondaire vers ii ; dominantes chromatiques vers IV ; substitution tritonique vers I ; backdoor vers I ; IV–iv mineur vers I |
| Gestes (2) | suspension 4–3 sur V ; ligne chromatique mineure |

Chaque fiche comporte une nature, un trajet, une intention, les références du procédé et une réalisation originale. Les noms décrivent la fonction ou la formule. Aucun artiste n’est crédité pour les notes composées ici, et aucune étude n’est présentée comme une transcription de sa vidéo.

## Ce qui est écrit et joué

`score.steps` donne, accord par accord : durée en temps, mains en MIDI de référence en Do, attaques par main/voix, durée de tenue, nuance et éventuel égrenage. Le slide du blues est écrit à un endroit précis ; il n’est pas distribué sur toutes les harmonies. Aucun run final ni accord n’est ajouté automatiquement.

En Auto, les voicings de l’étude sont transposés ensemble. L’aperçu et la carte utilisent les mêmes notes et le même rythme. Le tempo appartient à la fiche. « Accords seuls » garde les harmonies, les voicings et leurs durées, en retirant le phrasé. Les familles de voicings restent explorables ; l’interface signale alors « voicings modifiés » et supprime l’ornement qui dépendait de la mise en voix originale.

Les anciennes recettes harmoniques ne changent plus les études et leur menu est masqué pour ces contenus. Dans une grille personnelle, le rôle est choisi explicitement : `role: 'passing'`. Une qualité 7♭9, altérée ou diminuée ne suffit plus à modifier la fonction ou la durée d’un accord. Les grilles anciennes dépourvues de rôle explicite gardent tous leurs accords comme accords de grille ; le pianiste peut indiquer un passage dans l’éditeur.

## Références consultées

- [Robert Hutchinson — Standard Chord Progressions](https://musictheory.pugetsound.edu/mt21c/StandardChordProgressions.html) : cadences jazz, turnarounds, substitution tritonique et forme blues.
- [Robert Hutchinson — Harmonic Rhythm](https://musictheory.pugetsound.edu/mt21c/HarmonicRhythm.html) : la durée des accords participe à la phrase et peut varier.
- [Robert Hutchinson — The Best-Seller Progression](https://musictheory.pugetsound.edu/mt21c/BestsellerProgression.html) : cadre I–V–vi–IV.
- [PianoGroove — Gospel Passing Chords & Substitutions](https://www.pianogroove.com/blues-piano-lessons/gospel-passing-chords-substitutions/) : liaisons, approches chromatiques, suspensions et diminués dans leur contexte.
- [Richard W. Smith — Apostolic Praise 102, page PDF 46](https://www.apostolicpsom.com/wp-content/uploads/woocommerce_uploads/2016/10/AP-102-Study-Info-with-Goals-and-Homework.pdf#page=46) : diminué d’approche d’un accord mineur.
- [James Melton — Backdoor Progression](https://www.learnjazzstandards.com/blog/learning-jazz/jazz-theory/backdoor-progression/) : iv–♭VII7–I et conduite des voix.
- [PianoGroove — The Minor Line Cliché](https://www.pianogroove.com/jazz-piano-lessons/the-minor-line-cliche-tutorial/) : déplacement de voix sur un accord mineur.
- [Jonny May / Michael LaDisa — Gospel Piano Chords and Walking Bass](https://pianowithjonny.com/piano-lessons/gospel-piano-chords-and-walking-bass/) : slide vers la tierce et interaction entre basse et main droite.

Les références justifient le procédé. Les voicings, rythmes, durées et nuances de ces études ont été composés pour l’application, sans reproduire les partitions ou MIDI des cours.

## Vérification et limite musicale

- `node src/exercise-studies.test.js` : les 13 études dans 12 tonalités, sans ajout harmonique, avec transposition exacte, mains dans l’octave, notes de la carte présentes dans la lecture, absence de notes bloquées ou réattaquées sans relâchement ; invariance aux anciennes recettes ; provenance ; rôles personnels et persistance.
- `practice-exercise.test.js` et `practice-demo.test.js` conservent leurs fixtures historiques par injection explicite pour vérifier les mécanismes et les accompagnements libres. Ils ne certifient pas le nouveau catalogue.
- Contexte du Copilote : nature, trajet et provenance transmis ; bibliothèque de référence alignée. Les études originales ne deviennent pas des transcriptions attribuées aux sources.
- Captures et résultats d’interface : `audit-output/exercise-catalogue-2026-10-24/`.

Ces contrôles ne remplacent pas une validation artistique à l’oreille. Le navigateur de vérification ne dispose pas des échantillons piano chargés par Electron et utilise le synthétiseur de secours. La qualité d’interprétation au piano réel et la validation pédagogique par un pianiste restent à évaluer. Le catalogue constitue une première sélection écrite et traçable, pas une revendication de 61 interprétations authentiques.

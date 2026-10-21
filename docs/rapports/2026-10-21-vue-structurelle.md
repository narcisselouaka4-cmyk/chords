# Lecture des seuls accords structurels — 21 octobre 2026

L'onglet Analyse affichait tous les événements du moteur. Les accords de passage et les détections incertaines pouvaient devenir de petits marqueurs au dézoom, mais restaient dans la grille. La demande actuelle est une lecture simple de l'ossature harmonique.

La grille affiche désormais les seuls accords classés structurels par défaut. Elle conserve leurs débuts, fins et identités. Retirer un événement ne prolonge pas ses voisins et ne crée aucun accord de remplacement. Pendant un intervalle omis, aucun accord n'est annoncé comme actuellement joué. Les positions de la frise et des modulations suivent directement le temps audio ; le nombre de blocs n'ajoute plus de décalage horizontal cumulatif.

La vue d'ensemble, la liste de correction et les exports MIDI, JSON, CSV et texte utilisent la même sélection. La vue détaillée permet volontairement de consulter les autres rôles et de corriger une détection. Le projet enregistré conserve l'analyse complète. Une correction manuelle prime sur le rôle du moteur ; les analyses MIDI sans rôle restent lisibles. Un rôle explicitement inconnu n'est pas promu structurel. Chaque ouverture d'analyse revient à la lecture structurelle.

## Vérification sur le fichier fourni

Application de la sélection aux résultats déjà calculés avec `ADR-061-triades-6` sur les extraits de Deborah Lukalu. Aucun nouveau calcul acoustique n'est nécessaire pour ce changement de présentation.

| Extrait original | Tous les segments | Accords affichés | Passages retirés | Incertains retirés |
| --- | ---: | ---: | ---: | ---: |
| 00:00–02:00 | 55 | 34 | 4 | 17 |
| 08:00–09:00 | 23 | 20 | 1 | 2 |
| 15:00–16:00 | 33 | 24 | 3 | 6 |
| Total | 111 | 78 | 8 | 25 |

[Relevé des accords conservés avec leurs temps](../../benchmark_outputs/structural_view_2026-10-21.json). Ce sont des mesures de sélection, pas une nouvelle mesure de justesse musicale. Un accord mal classé structurel pourrait encore apparaître ; ces extraits ne disposent pas d'une annotation manuelle de référence.

## Contrôles

`node src/analyzer/test-structural-progression.js` couvre la sélection sans mutation, les intervalles conservés, l'absence de remplacement, les corrections et la compatibilité MIDI, les quatre exports, le rendu réel du contrôleur sur un DOM minimal, la bonne cible d'édition après filtrage, le suivi de lecture dans les intervalles omis, la bascule vers les détails et une grille sans pilier confirmé.

Les suites existantes de rôles harmoniques, lisibilité, DOM Analyse, workflow, persistance, sections et exports passent, ainsi que la compilation Vite. Le contrôle du contrôleur utilise un DOM minimal en Node ; il ne constitue pas une vérification visuelle de l'application Electron.

La suite historique `tests/ui/test-analysis-workspace.js` conserve cinq échecs sur dix liés à d'anciens intitulés et contrôles retirés. Les mêmes cinq échecs ont été reproduits avec le HTML de `HEAD`, avant cette modification ; ils ne sont pas corrigés dans ce changement.

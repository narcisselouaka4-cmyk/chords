# Réduction des accords incertains — 21 octobre 2026

Version : `ADR-061-triades-6`. Comparaison avec la version `-5`, sur les mêmes extraits du fichier de Deborah Lukalu fourni par l'utilisateur.

## Résultat mesuré

| Extrait dans le fichier original | Segments incertains avant | Après | Durée incertaine avant | Après |
| --- | ---: | ---: | ---: | ---: |
| 00:00–02:00 | 33 | 17 | 32,1 s | 14,0 s |
| 08:00–09:00 | 4 | 2 | 7,1 s | 3,9 s |
| 15:00–16:00 | 6 | 6 | 6,0 s | 6,0 s |
| **Total : quatre minutes** | **43** | **25** | **45,2 s** | **23,9 s** |

La durée marquée incertaine baisse de **56 % dans l'introduction**, et de **47 % sur les quatre minutes**. Ce sont des mesures de la classification du moteur, pas un taux de transcription musicale vérifié à l'oreille. Les intervalles temporels et le nombre total de segments de ces extraits restent identiques ; les incertitudes ne sont pas masquées dans l'interface.

Les sorties, les preuves et les corrections sont conservées dans [le relevé avant/après](../../benchmark_outputs/chord_uncertainty_2026-10-21.json). Le relevé de référence `-5` reste conservé séparément.

Évolution suivante : à la demande de l'utilisateur, [la vue structurelle](2026-10-21-vue-structurelle.md) devient l'affichage par défaut. Les mesures de réduction de l'incertitude ci-dessus concernent le moteur ; les incertitudes restantes sont désormais consultables dans la vue détaillée.

## Ce qui change dans le moteur

- Les occurrences longues et confirmées servent de références acoustiques propres au morceau. Chaque confirmation exige une ressemblance à la fois dans le chromagramme global et dans le registre supérieur, avec une marge sur les autres accords de référence.
- Les références sont figées avant la résolution : deux hypothèses faibles ne peuvent pas se confirmer mutuellement. Un segment ne peut pas servir de preuve à sa propre détection. Sans référence sûre, le moteur conserve l'incertitude.
- Une confusion de qualité sur une même fondamentale peut être corrigée si le voicing correspond à une occurrence confirmée ET si les notes distinctives contredisent la première interprétation. Sur ces extraits : `F#dim → F#m` à 01:47,4 et `C# → C#m` à 08:35,1. La confiance est recalculée depuis l'audio, sans lui attribuer un pourcentage artificiel.
- Un pilier récurrent clairement confirmé peut durer un temps dans une phrase. Il n'a plus besoin d'atteindre la moitié de la durée des longs accords du morceau pour être reconnu. Les occurrences plus brèves ne deviennent pas structurelles du seul fait de leur fréquence.
- Deux accords de passage confirmés peuvent former ensemble un mouvement de trois temps entre deux piliers. Cette extension exige une preuve acoustique pour chacun et ne s'applique pas à une chaîne contenant une détection non confirmée.

Les vrais accords de passage, les silences et le recalage fin sont conservés. Les ambiguïtés persistantes ne sont pas remplacées arbitrairement par la tonique ou un voisin.

## Vérifications

- **51 tests ciblés réussis**, incluant les tests de timing et les diagnostics purs. Les nouveaux tests couvrent les voicings incomplets, les confusions majeur/mineur dans les douze tonalités, les deux tierces présentes, le désaccord entre basse et registre supérieur, l'absence de référence sûre, les passages nouveaux et les silences.
- **16 scénarios audio réussis, aucun échec, un BLOCKED** : la résolution sus4 → majeur reste exclue du vocabulaire actif. Le code de sortie strict reste 1 pour ce BLOCKED.
- **7/7 tests de diagnostic réussis**, y compris identité avec/sans diagnostics.
- Contrats moteur → interface, hiérarchie des rôles, persistance et `npm run build` réussis. Versions Python et JavaScript synchronisées pour recalculer les anciennes analyses.

L'extrait 15:00–16:00 ne fournit pas assez de références acoustiques sûres pour résoudre ses six cas restants. Le moteur ne les confirme pas par simple répétition statistique. Les quatre minutes analysées n'ont pas de grille manuelle validée ; aucune justesse globale n'est revendiquée pour les dix-huit minutes du concert.

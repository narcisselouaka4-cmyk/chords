# Détection audio : calage et accords de passage — 21 octobre 2026

Moteur : `ADR-061-triades-5` (version Python et miroir JavaScript synchronisés).

Suivi : [réduction des incertitudes avec la version `-6`](2026-10-21-reduction-incertitude.md).

## Corrections

- La grille annoncée à 250 ms avance en réalité de 11 × 512 / 22050, soit 255,42 ms. Les conversions temps → indices des couches de nettoyage utilisent désormais cet intervalle réel, sans dérive cumulée. Aucun échantillon d'analyse ne commence à la fin exacte du fichier.
- Le HMM et son lissage restent chargés de proposer une harmonie stable. Une seconde lecture du chromagramme du signal original recale les frontières par comparaison des deux accords voisins, avec un pas de 23,22 ms et une recherche limitée à une seconde. Elle exige une preuve harmonique des deux côtés ; elle ne se cale pas automatiquement sur les percussions.
- Les passages courts sont vérifiés sur leur propre fenêtre, plutôt que mélangés à une longue fenêtre voisine. Une harmonie complète, soutenue et distincte de ses voisines est protégée des absorptions historiques et du seuil de 400 ms.
- Les changements masqués par le lissage peuvent être réintroduits lorsque toutes les notes de la triade sont présentes, avec une marge sur les autres candidats et un changement des voix supérieures. Une fondamentale forte ne suffit plus à battre une triade complète renversée.
- Les fragments résiduels contredits par l'audio sont absorbés vers le voisin acoustiquement le plus plausible. Les silences mesurés sur le signal sont conservés.
- Toute harmonie réintroduite doit rester confirmée après le recalage et la prise en compte des nouveaux voisins. Si elle perd cette preuve, le moteur restaure l'étiquette d'origine plutôt que d'ajouter un nouvel accord incertain.
- Une basse mobile sous des voix supérieures fixes ne suffit pas à créer de nouvelles harmonies. Un cycle de basse répété peut se terminer sur un fragment incomplet sans casser l'harmonie tenue, sous garde de stabilité du registre supérieur.
- La classification distingue les piliers tenus, les passages courts confirmés (y compris plusieurs successifs) et les cas incertains. La fréquence des fragments courts ne réduit plus artificiellement la durée de référence ; un emprunt long peut être structurel.
- Les indices, les candidats et la confiance sont reconstruits sur les intervalles définitifs. Les preuves acoustiques sont conservées dans `analysis.harmonicEvidence` et transmises par le mapper existant.

## Corpus et limites de mesure

Le fichier de Deborah Lukalu fourni par l'utilisateur dure 18 min 45,75 s. Comparaison automatique avant/après sur trois extraits : **00:00–02:00**, **08:00–09:00**, **15:00–16:00**, soit quatre minutes. Les temps internes de chaque extrait commencent à zéro ; ajouter son décalage pour retrouver le temps du fichier original. Aucun découpage n'a été écrit dans le dossier Musique.

Ces extraits ne disposent pas d'une grille manuelle vérifiée. Le nombre de segments et le déplacement des frontières ne constituent donc pas un taux de justesse. Les mesures chiffrées de précision temporelle concernent les fixtures synthétiques annotées, pas le concert complet. Pas de certification à l'écoute de l'intégralité du morceau.

## Corrections du banc de tests

- La fixture J annonçait Ré7 mais synthétisait **Ré–Fa–La–Do**, soit Rém7. Le générateur, le WAV et les métadonnées ont été corrigés en **Ré–Fa♯–La–Do**, sans élargir l'oracle. Le moteur reste volontairement sur son vocabulaire de triades en sortie.
- La fixture I n'est plus déclarée non évaluable au motif que le passage est plus court qu'un beat : l'analyse n'est plus quantifiée aux beats. Elle exige maintenant les **neuf zones exactes** des quatre répétitions fusionnées, avec une tolérance de 120 ms.
- Les sous-processus des runners emploient le même interpréteur Python que leur parent, pour respecter le virtualenv.

## Reproduction

Résultats obtenus : **31 tests unitaires ciblés réussis**, **7/7 diagnostics réussis** (y compris identité des sorties avec/sans diagnostics), contrats moteur → interface et persistance réussis, `npm run build` réussi. Le banc audio complet obtient **16/17 réussis, aucun échec, un BLOCKED** (M, voir ci-dessous). Le code de sortie strict reste donc 1, conformément à son contrat.

| Fixture audio | Résultat attendu et obtenu |
| --- | --- |
| H : alternance C / G | 8 zones |
| I : G de passage de 250 ms | 9 zones, quatre passages préservés, frontières dans les 120 ms exigées |
| J : C → D7 → G | 12 zones, D rendu sous forme de triade conformément au vocabulaire actif |
| K : C / Am sur pédale C | 8 zones |
| L : walking bass dans Cmaj7 | 1 harmonie C, aucune alternance C / Em |
| P : cellule G/B, B–D–E et Am | 8 zones, Am préservé et aucun fragment de transition parasite |
| F et G : mélodies diatonique / chromatique sur C | 1 harmonie C, aucune nouvelle zone |

Le détail avant/après des extraits réels est conservé dans [le relevé JSON](../../benchmark_outputs/chord_timing_2026-10-21.json). Vérifications automatiques : couverture de chaque extrait, frontières contiguës et ordonnées, durées strictement positives, confiance bornée et rôles valides. Ce sont des invariants de sortie, pas une validation musicale à l'écoute. L'introduction fournit davantage d'hypothèses courtes incertaines (55 segments contre 42 avant) : cette région doit encore être vérifiée manuellement ; une augmentation du nombre de segments n'est pas présentée comme un gain de justesse.

```bash
python3 -m pytest -q tests/test_harmonic_timing.py
.venv/bin/python tests/test_arpeggio_audio.py --verbose
.venv/bin/python tests/test_diagnostic_audio.py
python3 tests/test_harmonic_deterministic.py
node src/analyzer/test-analyzer-mapping.js
node src/ui/test-chord-roles.js
node src/ui/test-analysis-persistence.js
npm run build
```

La suite déterministe ancienne appelle explicitement les couches historiques sur des chromas synthétiques ; elle ne passe pas par la nouvelle lecture du signal original. Son état initial est **14/17**, avec les échecs K, M et P. Ils restent signalés, sans modifier leurs oracles pour les transformer en succès.

Le cas audio M (suspension sus4 → majeur) demande une qualité exclue du vocabulaire actif. Il doit rester marqué **BLOCKED**, jamais compté comme réussi. Le runner strict renvoie un code non nul tant qu'un BLOCKED subsiste.

Réharmonisation et Masterclass : aucun changement d'accès dans cette intervention.

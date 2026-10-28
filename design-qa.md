# Complément fonctionnel — motifs transposés — 28/10/2026

Aucun changement de mise en page. Correction vérifiée sur le relevé réel du fichier
« Dieu ouvre un chemin là où tout semble fermé — Mohamed Sanogo Lyrics » (Track_024).
Les trois régions du cache donnaient trois résumés vides. La lecture des phrases en degrés
retrouve quatre cadres : Ré majeur à 0, Mi majeur à 83,17 s, Fa♯ majeur à 121,44 s,
La♭ majeur à 158,66 s ; même motif 1 / 5 / 6 / 1 / 4 / 1 / 6 / 2 / 5.
Ces dates sont calculées à partir des étiquettes existantes, pas certifiées à l’oreille.

- 17 scénarios : transpositions d’un/deux demi-tons, mineur, descentes/retour, distinction
  de familles, passages étrangers/secondaires sans fausse modulation, préservation d’une
  tonalité compatible, fixture réelle et invariance des données source.
- Dans le navigateur intégré, contrôleur réel avec pont IPC de test, vrai `audio.wav` local
  décodé (209,93161 s) : les quatre tonalités affichent leur progression ; sauts en pause,
  passage automatique Ré → Mi et retour arrière vers Ré/couleur initiale constatés.
- Aucune erreur console, aucun débordement horizontal à 1144 × 892. Captures :
  `audit-output/analysis-degrees-2026-10-28/01-re-majeur.jpg`, `02-mi-majeur.jpg`,
  `03-lab-majeur.jpg`, toutes ouvertes pour inspection. Clavier inférieur déployé.
- La garde de dix secondes/cinq jetons et les phrases partagées limitent la décision aux
  changements établis ; sans preuve de transposition, les régions existantes restent utilisées.
- Aucun changement du moteur lv-chordia, des temps d’accords, du projet enregistré ou des
  exports. Écoute humaine et parcours dans Electron restent à confirmer ; ce contrôle ne les remplace pas.
- Le contrôle précédent « uniquement frontières de 30 s » reste historique : ce lot peut
  désormais remplacer ces frontières dans le bandeau lorsqu’un motif transposé est établi.

Contrôle fonctionnel : réussi pour ce périmètre. Historique visuel conservé ci-dessous.

---

# Design QA — Analyse, vue fusionnée — 27/10/2026

## Résultat et périmètre

Aucun écart P0/P1/P2 restant sur le panneau demandé. Contrôle visuel du rendu réel dans Chrome local, avec le contrôleur et les composants de l’application, un pont IPC de test et un WAV silencieux. Ce verdict porte sur la présentation et les interactions du scénario ; il ne certifie ni l’import Electron ni la justesse musicale des modulations.

## Référence, état et normalisation

- Vérité visuelle : `docs/design/analysis-overview-reference.png`, dernière maquette choisie après suppression de l’encart « Modulation / Avant / Maintenant ».
- Source : 1672 × 941 pixels ; recadrage de la surface applicative `(0,52)-(1672,902)` en 1672 × 850, sans déformation.
- Implémentation : `audit-output/analysis-overview-2026-10-27/03-reference-final.jpg`, viewport CSS et image 1672 × 850, densité 1.
- Comparaison commune pleine vue ouverte et inspectée : `audit-output/analysis-overview-2026-10-27/comparison-full.jpg` (source puis réalisation).
- Comparaison commune du bandeau : `audit-output/analysis-overview-2026-10-27/comparison-context.jpg`.
- État commun : Analyse > Vue d’ensemble, Sol mineur, 108 BPM, Eb / Bb / F / Gm, accord Gm, clavier inférieur replié. Source à 3:20 en lecture, réalisation à 3:18 en pause sur le même accord. La frise conserve ses véritables espacements temporels et son défilement ; elle ne reproduit pas les huit cases décoratives de l’image.
- Complément clair : `audit-output/analysis-overview-2026-10-27/04-light-1195.jpg`, 1195 × 800 ; aucun débordement horizontal et clavier inférieur accessible.

## Itérations et écarts corrigés

1. P2 — Marges historiques trop importantes et panneau central n’occupant pas la scène. Correction du padding des résultats et du conteneur flexible des panneaux ; nouvelle capture à viewport identique.
2. P2 — Sélection courante encore entourée de jaune, accord suivant en pointillés hérités. Contour d’accent uni et bordure suivante pleine ; couleurs calculées contrôlées et nouvelle comparaison des deux images.
3. Les captures claires ont été reprises après la fin de transition de thème ; la capture intermédiaire n’est pas utilisée comme preuve de contraste.

## Cinq surfaces de fidélité

| Surface | Constat final |
| --- | --- |
| Police et typographie | Fraunces, Inter et monospace locales existantes conservées. Repères à 11/14 px et accord à 22 px : plus compacts, conformément aux demandes répétées de Narcisse. Aucun libellé tronqué dans les tailles vérifiées. |
| Espacement et composition | Bandeau permanent, transport, frise, quatre onglets, panneau pleine largeur avec fiche centrée ; marges corrigées. Clavier de travail volontairement limité à 440 px pour garder une typographie modeste. |
| Couleurs et états | Tokens du thème Velours, contraste sombre/clair vérifié, repères violets après changement de tonalité. Pas de badge de modulation, de trait jaune ou de pointillés. |
| Images et composants | Photo locale, marque, icônes et véritable mini-clavier existants réutilisés. Aucune image de l’interface ne remplace des commandes. Géométrie exacte et trois notes du clavier réel conservées plutôt que les touches déformées de la maquette générée. |
| Contenu | Uniquement Tonalité / Tempo / Accords principaux, puis Accord à travailler. Statut réel « Analyse sauvegardée » à la place de la légende de maquette. Notes en notation de l’application (D / G / A#) ; aucun texte ni auteur inventé. |

## Interactions vérifiées

- Scénario de quatre changements de tonalité : passage automatique en lecture, sauts directs, retour arrière en pause ; contexte et couleur restaurés, y compris le retour à la première tonalité.
- Sélection depuis la frise, commandes d’écoute accord/arpège, onglets Corriger puis Vue d’ensemble ; bandeau présent dans les deux.
- MIDI/JSON/CSV/texte toujours proposés dans Corriger, aucun export dans Vue d’ensemble.
- Pas d’erreur console sur la dernière passe ; avertissement attendu de repli synthétique lorsque les échantillons piano ne sont pas disponibles dans le banc navigateur.
- Animations de 160 ms à chaque changement seulement, désactivées avec la préférence de réduction des animations ; pas de nouvelle animation continue.

## Limites et suite

- Refaire le parcours dans Electron avec un vrai morceau et une écoute humaine. WAV silencieux et données locales ne valident pas le sampler, le MIDI physique ou la transcription.
- Les dates de modulation proviennent des régions déjà livrées par le moteur (fenêtres conservatrices de 30 secondes), sans nouveau recalage acoustique dans ce lot.
- Le résumé suit la progression récurrente avec tolérance aux substitutions ; il ne prétend pas reconnaître couplet et refrain. Sans motif suffisamment répété, il reste vide plutôt que d’en inventer un.
- P3 possible : harmoniser plus tard les noms français des notes du clavier et leur orthographe enharmonique dans l’ensemble du produit, sans changer les hauteurs.

Checklist : source et réalisation ouvertes ensemble ; écarts P2 corrigés ; sombre/clair et largeur réduite inspectés ; interactions testées ; limites consignées.

final result: passed

---

# Historique des vérifications précédentes

# Design QA — Velours, phases 1 à 5

## Scope vérifié

Cette passe couvre le socle du troisième habillage puis son décor partagé : sélection et persistance, palettes sombre/claire, typographie locale, couleur personnalisable, photo de studio, lumière, ondes, parallaxe et halo lié au pointeur. Les compositions spécifiques de Temps réel, Analyse, Studio et de la barre clavier appartiennent aux phases suivantes.

## Référence et captures

- Référence Arena : `https://01a15922-5ccf-70fd-8d66-c2c69fae825b.arena.site/`
- Capture de référence : `audit-output/velours-phase1/reference-arena.jpg`
- Implémentation sombre : `audit-output/velours-phase1/velours-dark.jpg`
- Implémentation claire : `audit-output/velours-phase1/velours-light.jpg`
- Temps réel recentré : `audit-output/velours-phase3/realtime-centered.png`
- Titre dégagé de la note C : `audit-output/velours-phase3/realtime-title-gap.png`
- Fenêtre commune : 1465 × 892 px
- État : Entraînement > Temps réel, clavier déployé, aucune note jouée
- Passe phase 2 : Temps réel, accueil Analyse et accueil Studio contrôlés dans le navigateur local en sombre et clair, avec l'accent Rose.

## Comparaison finale

| Critère | Référence | Implémentation phase 1 | Résultat |
| --- | --- | --- | --- |
| Ambiance sombre | Graphite profond, ivoire, ambre | Même famille de couleurs, sans violet structurel | Conforme |
| Mode clair | Ivoire chaud, texte brun-noir | Palette dédiée et lisible, sans inversion automatique | Conforme |
| Titres et marque | Sérif éditoriale contrastée | Fraunces Variable locale, axe optique activé | Conforme |
| Texte fonctionnel | Sans-sérif sobre | Inter conservée pour la lecture et les commandes | Conforme |
| Métadonnées | Monospace discrète | JetBrains Mono conservée | Conforme |
| Sélection du skin | Contrôle segmenté, accent chaud | Troisième choix Velours, état actif clair | Conforme |
| Persistance | Non applicable à la maquette | Velours et clair/sombre restent actifs après rechargement | Conforme |
| Réduction des animations | Attendue pour l’accessibilité | Intensité et parallaxe futures neutralisées avec `prefers-reduced-motion` | Conforme |
| Accent personnalisable | Les lumières chaudes appartiennent au thème, sans couleur imposée | Rose vérifié sur titres actifs, filets, boutons, lumière, ondes et halo ; ambre conservé comme défaut | Conforme |
| Photo de studio | Image réelle, atténuée et non décor recréé | Ressource locale du ZIP, fondue sous un voile graphite/ivoire | Conforme |
| Réaction au pointeur | Halo et parallaxe discrets | Mouvement lissé ; halo réactivé au retour après sortie | Conforme |
| Périmètre | Temps réel, Analyse, Studio uniquement | Décor masqué dans Sessions MIDI et les autres sous-onglets exclus | Conforme |

## Ajustements issus de la passe visuelle

1. La palette claire a été traitée comme une composition ivoire autonome afin de conserver du contraste dans la portée, la roue et les libellés.
2. Le fond de démarrage suit immédiatement Velours afin d’éviter un flash violet avant le chargement des styles.
3. Fraunces est embarquée localement avec ses axes complets ; aucune ressource typographique distante n’est nécessaire.
4. Velours hérite de la grammaire Atelier pour que tous les écrans non redessinés restent utilisables pendant le déploiement progressif.
5. Les anciennes valeurs orange secondaires ont été reliées au générateur d'accent ; changer la couleur de l'application recolore désormais toute la signature de Velours.
6. La réduction des animations conserve la photo et la lumière statiques, mais supprime parallaxe, halo mobile et ondes animées.
7. Après le signalement d'un fort ralentissement dans Electron, l'absence volontaire d'accélération graphique a été identifiée. Les effets continus ont été neutralisés par défaut : aucun suivi du pointeur, halo, parallaxe, onde, filtre ou respiration animée. La photo et les lumières restent statiques. Narcisse confirme que le ralentissement a disparu après redémarrage.
8. Après les phases 3 à 5 terminées par Claude, la roue du Temps réel a été recentrée sans toucher à son dessin : le titre ne réserve plus de hauteur dans la colonne centrale. À 1465 × 892, les centres verticaux mesurés sont `409 px` pour la roue, `408,99 px` pour la portée et `409 px` pour la fiche complète ; le centre horizontal de la roue est identique à celui de la scène (`732,5 px`).
9. L'invitation a ensuite été remontée indépendamment de la roue : à 1195 × 892, son bord inférieur reste à environ `44 px` de la note `C`, sans modifier le centrage du cadran.

## Hors périmètre assumé

- La roue et le clavier eux-mêmes restent inchangés, conformément à la décision produit.
- Le correctif de centrage ne modifie ni la portée, ni la fiche harmonique, ni leur logique.

## Verdict

Le rendu visuel des phases 1 et 2 est validé : l’infrastructure, les deux palettes et le décor statique sont cohérents avec la direction Arena. La personnalisation Rose ne laisse aucun accent ambre résiduel sur les zones actives vérifiées. Le correctif de performance passe les contrôles automatisés et sa fluidité est confirmée dans l'application Electron réelle.

final result: passed

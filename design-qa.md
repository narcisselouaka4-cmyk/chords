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

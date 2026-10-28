# Correctif tempo et premier temps — 28/10/2026

Retour utilisateur : les temps de la grille se décalent par rapport à la musique ;
le BPM estimé peut aussi être erroné. Deux défauts de `9699709` identifiés : le suivi
sur enveloppe d'énergie sélectionnait trop librement les contretemps et le bord à
zéro pouvait insérer une pulsation artificielle, décalant la phase des mesures.

## Correction

- Worker d'énergie retiré. Outil Python distinct utilisant l'enveloppe spectrale
  médiane et `librosa.beat.beat_track`, déjà employé pour le tempo du moteur. Le
  moteur harmonique n'est pas appelé/modifié. Le calage conserve des temps réels,
  avec interpolation/sous-échantillonnage pour rester dans l'octave du tempo source.
- IPC `analyzer:grid-beats` : chemin autorisé et WAV exigés, arguments sans shell,
  BPM 20–400, travail précédent interrompu, timeout 90 s et processus suivi à la fermeture.
- Les bords tronquent une pulsation existante. L'identité du premier temps survit
  à l'extrapolation et au décalage ; levée distincte avant la première mesure pleine.
- Dans Corriger : BPM manuel (champ vide = auto) et « Caler le premier temps ici »
  à la position du lecteur. Entrée applique le BPM et remet ×2/÷2 à ×1, pour éviter
  de diviser deux fois la valeur saisie. Le bandeau reflète le BPM corrigé ; le tempo
  d'origine reste conservé dans `analysis`, avec les accords et leurs dates.
- Calage v1 invalidé et recalculé à l'ouverture de la grille, réglages précédents
  conservés. Version d'affichage v2 ; version du moteur inchangée. BPM et ancrage
  sont conservés sous `display.chordGrid`. La vitesse du lecteur reste à 1×.

## Vérifications

22 tests de grille/projection/persistance/exports, 4 DOM interactifs, 2 contrats IPC,
12 tests de progression, 17 scénarios de piliers, suites DOM/persistance/exports et
build passent. Quatre tests Python standard `unittest` (aucune dépendance pytest
requise) : WAV à clics de pulsation connue et contretemps, estimation malgré une
référence BPM fausse, tempo manuel, accélération, respect des intervalles variables
après changement d'octave, rejet des tempos invalides. Le WAV connu passe avec une
erreur au 95e percentile <40 ms ; la série accélérée garde >95 % des temps à <25 ms
sur ce signal de test. Cela ne mesure pas la justesse de tout morceau réel.

Lancement du **vrai runner Node/Python** sur les trois WAV entiers (environ 9–11 s
par fichier pendant cette mesure), sans lecture/écriture d'analyse harmonique :

| Fichier | Pulsations v2 | Tempo automatique | BPM par fenêtres de 16 temps, v1 puis v2 |
| --- | --- | --- | --- |
| Sanogo | 425 | 123,05 | 109,5–134,8 puis 118,5–128,0 |
| SEIGNEUR | 947 | 129,20 | 109,6–147,5 puis 119,1–136,0 |
| ANGES | 1 237 | 139,67 | 113,5–178,1 puis 130,0–144,1 |

Les chiffres comparent la stabilité des deux suivis, **pas une vérité musicale
annotée**. Les fixtures ont reçu les temps du nouvel outil. Ni Python harmonique
ni `ANALYSIS_ENGINE_VERSION` ne sont modifiés.

Navigateur avec vrai contrôleur et vrai audio : IPC de test renvoyant les sorties
réellement calculées ci-dessus, sauvegarde en sessionStorage. Migration Sanogo v1
avec ÷2 conservé ; saisie 120 BPM appliquée au bandeau/grille et ×1 restauré ; temps
3,761633 s auparavant ordinaire devenu premier temps au clic sur Caler ici ; BPM et
ancrage restaurés après rechargement. Lecture avancée puis recul de dix secondes :
surlignage suit, vitesse 1×. SEIGNEUR et ANGES : nouveau calage chargé, tempo et grille
vérifiés. Pas d'erreur console. Aucun projet utilisateur écrit par ce banc.

Captures inspectées dans `audit-output/grid-tempo-fix-2026-10-28/` :
`1440-corriger-dark.jpg`, `1024-corriger-dark.jpg`, `1024-corriger-light.jpg`.
Tous les réglages accessibles, pas de débordement horizontal à 1024 px. Les boutons
Charger en bas appartiennent au banc, supprimé après les contrôles ; viewport restauré.

**Redémarrage d'Electron nécessaire** pour charger le nouveau main/preload. Le vrai
processus de calcul est testé par le runner, son branchement IPC par contrats et le
renderer dans le navigateur ; pas de nouveau parcours natif Electron ni d'écoute
humaine annotant les trois morceaux. Le suivi reste une estimation (premier temps
fort parfois ambigu, silence/syncopes/variations brutales), avec calage manuel possible.

---

# Grille musicale — vérification du 28/10/2026

La grille agrandie utilise une projection en pulsations, quatre mesures par ligne,
cellules fusionnées et deux harmonies principales au plus par mesure. Les passages
restent dans les données et s'affichent en petit dans la cellule en vue détaillée.
Heure seulement en tête de ligne, barres de mesure, sections A/B… avec retour de
la même lettre/couleur pour une assise ressemblante. La frise compacte, la fiche
centrée et les quatre sous-onglets sont conservés.

## Calage et provenance

Les trois projets examinés ne contiennent ni pulsations ni premier temps ; le moteur
lv-chordia calcule des temps en interne mais ne les transmet pas dans son résultat.
Aucun changement de Python, moteur, version ou accord n'a été fait. Un Worker lit
le WAV et estime des pulsations **réservées à l'affichage**, avec période locale
variable. Ce calage est identifié comme estimé ; sans WAV compatible, repli au tempo,
annoncé dans la grille. Les bords hors du suivi sont extrapolés jusqu'aux extrémités.
Le calage ne certifie pas le premier temps musical. Dans Corriger : mesure, choix
entre les pulsations de la mesure et décalage fin ±10 s. ×2 / ÷2 dans la grille
agit seulement sur la subdivision affichée. Réglages et temps dérivés sont stockés
sous `display.chordGrid`, à côté de `analysis`, après contrôle de l'identité audio.
La sauvegarde est sérialisée pour ne pas faire concourir calage et corrections.

## Résultats sur les projets réels

| Fichier | Durée | Événements source | Lignes ×1 | Lignes ÷2 |
| --- | --- | --- | --- | --- |
| Sanogo, Track_024 | 3:29,93 | 123 | 27 | 14 |
| SEIGNEUR, Track_020 | 7:47,16 | 151 | 63 | 32 |
| ANGES, Track_022 | 8:54,73 | 198 | 78 | 39 |

Les fixtures contiennent les accords/timings anonymisés des projets et les pulsations
d'affichage calculées depuis leurs vrais WAV ; elles ne sont pas des annotations à
l'oreille. Les anciens caches SEIGNEUR/ANGES ne sont pas réanalysés : leur avertissement
de moteur ancien/inconnu reste visible. Les nombres de lignes ne dépendent pas du
nombre d'événements : quatre minutes à 129 BPM en 4/4 exigent environ 33 lignes de
quatre mesures. Le critère <25 lignes ne peut être garanti avec ces contraintes ;
÷2 produit environ 17 lignes, quand cette lecture de la pulsation est pertinente.

## Parcours navigateur réellement exercé

Banc temporaire chargeant le vrai contrôleur et les vrais WAV, avec IPC fichiers de
test en sessionStorage ; aucun projet utilisateur écrit. Sur les trois morceaux,
calage Worker, grille et accès aux accords vérifiés. Sanogo : lecture réelle avancée,
pulsation unique active, détails internes sans cellule supplémentaire, ÷2 sans changer
les 123 BPM analysés, restauration 3/4, phase et décalage 0,15 s après rechargement.
SEIGNEUR : clic à 86,47 s, recul à 76,47 s, pulsation et scroll remontent. ANGES :
clic à 80,28 s, recul à 70,28 s, ÷2 donne 39 lignes / 69,9 BPM ; les 140 BPM du
bandeau restent ceux de l'analyse. Retour à Vue d'ensemble : lecteur à 70,28 s,
fiche d'accord centrée visible. Pas d'erreur console ; seul avertissement sampler
absent attendu dans le banc. Viewport rétabli, onglet et fichiers de test supprimés.

Captures inspectées dans `audit-output/musical-grid-2026-10-28/` (non versionnées) :

- `1440-dark.jpg` : Sanogo, grille ×1.
- `1440-light.jpg` : ANGES, grille ÷2 et temps actif.
- `1024-dark.jpg`, `1024-light.jpg` : Sanogo ×1, pas de débordement horizontal.
- `overview-restored.jpg` : fiche centrée après réduction.

Les boutons « Charger… » tout en bas appartiennent uniquement au banc de test.

## Tests et limites

Passent : 17 tests de projection/calage/persistance/exports/corpus, 3 tests DOM du
rendu interactif, 12 tests de progression, 17 scénarios d'accords principaux,
contrats DOM Analyse, persistance existante, exports et éditeur/corrections.
`npm run build` passe (avertissement habituel sur la taille du bundle).
Tests de calage : pulsations non uniformes, glissement de tempo sur attaques
synthétiques, arrondi au temps proche, fusion sous le temps, sections A/B/A,
phase/mesure/décalage, sauts avant/arrière, écritures concurrentes et invariance
JSON/CSV/texte/MIDI. Pas de nouveau test du moteur, qui est hors périmètre.

**À confirmer dans Electron et à l'oreille** : premier temps, qualité du suivi des
pulsations sur rythmes syncopés/sans batterie et pertinence des frontières de parties.
Le suivi privilégie l'octave du tempo donné (période locale recherchée entre 0,8 et
1,25 fois la période de référence), il ne certifie pas tout changement de tempo.
Les sections comparent les palettes sur huit mesures ; ce sont des repères
harmoniques, pas une identification fiable des couplets/refrains ni une grille
annotée manuellement. Le corpus n'est pas une preuve de justesse musicale globale.

---

# Grille d’accords agrandie — contrôle fonctionnel du 28/10/2026

Bouton d’agrandissement ajouté à droite de la frise. La même liste de boutons devient
une grille à plusieurs lignes, avec symboles complets et repères de début ; elle occupe
la scène disponible sous le lecteur, avec barre verticale. Les informations musicales,
commandes audio et clavier inférieur restent accessibles. Ce sont des cases chronologiques,
pas une partition découpée en mesures inventées.

Les quatre sous-onglets existants restent dans une navigation verticale à gauche.
Cliquer Vue d’ensemble, Réharmonisation, Masterclass ou Corriger restaure la frise compacte
et ouvre le panneau correspondant. Le bouton Réduire et Échap restaurent le panneau quitté.
Grille d’accords indique l’état actif dans la sidebar ; la navigation retrouve sa disposition
horizontale une fois la grille réduite. Flèches de navigation, orientation ARIA et focus vérifiés.

## Preuves visuelles et interactions

- `audit-output/analysis-grid-2026-10-28/01-expanded.jpg` : sombre, 1280×720.
- `audit-output/analysis-grid-2026-10-28/02-expanded-light.jpg` : clair, 1195×800.
- `audit-output/analysis-grid-2026-10-28/03-expanded-large.jpg` : sombre, 1920×1080.
- `audit-output/analysis-grid-2026-10-28/04-compact-restored.jpg` : retour au panneau.
- Captures ouvertes et inspectées. Premier écart corrigé : espacement historique de 26 px
  entre les onglets, qui masquait Corriger en petite hauteur ; surcharge spécifique à la
  grille, quatre pixels entre les entrées, scrollbar fine et tous les onglets accessibles.
- Navigateur intégré, contrôleur réel et IPC de test, vrai audio de Track_024 : 122 accords
  hors N, mêmes segmentId et même ordre avant/après agrandissement. Aucun accord réanalysé.
- Saut jusqu’au dernier accord : 3:29, La♭ majeur et sélection corrects ; défilement vertical
  constaté (961 px sur la petite fenêtre). Retour Vue d’ensemble : accord Ab et même temps.
- Les quatre sous-onglets ont été ouverts depuis la grille, puis réduction depuis Corriger :
  panneau attendu, temps et accord conservés. Échap rend le focus au bouton d’agrandissement.
- Agrandir/réduire pendant la lecture conserve le même élément/source audio et le temps avance.
  Vue détaillée réaffiche la même grille ; symbole C#7 complet visible, étiquette compacte masquée.
- Aucun débordement horizontal aux trois tailles, clavier inférieur visible, scrollbar verticale
  et panneaux accessibles. À 1920×1080 : quatorze colonnes, hauteur utile 521 px, contenu 660 px.
- Aucune erreur console ; avertissement habituel de repli synthétique du clavier dans le banc.
- 12 tests de progression structurelle passent, dont suivi vertical à la bonne horloge et
  absence de saut au rafraîchissement suivant. Les 17 scénarios d’accords principaux et les
  suites DOM/persistance/exports passent aussi. Le bandeau demeure plafonné à quatre piliers.

Pas de nouvelle validation native Electron, d’écoute humaine ou de MIDI physique. Aucun
changement du moteur, de la grille sauvegardée ni des autres modules. Banc temporaire retiré.

Contrôle fonctionnel et visuel : réussi pour ce périmètre.

---

# Correction de présentation — quatre accords principaux maximum — 28/10/2026

Le bandeau présente désormais les piliers distincts du motif, trois ou quatre maximum
lorsque le morceau en établit autant. Le cycle entier reste utilisé pour reconnaître
les transpositions, sans être affiché. Les variations étrangères au motif ne sont pas ajoutées.
Quand le cycle a plus de quatre harmonies, les quatre piliers ayant le plus de durée
relevée sont retenus, puis affichés dans leur ordre de première apparition dans le motif.
Une musique à un ou deux accords ne reçoit pas de faux accords pour atteindre trois.

Sanogo : D / A / Bm / G ; puis E / B / C#m / A ; puis F# / C# / D#m / B ; puis
Ab / Eb / Fm / Db. Les quatre ensembles et leur tonalité ont été contrôlés dans le
navigateur intégré, avec retour à Ré/couleur initiale en pause. Captures finales :
`audit-output/analysis-degrees-2026-10-28/04-re-4piliers.jpg` et `05-lab-4piliers.jpg`.
La suite de 17 scénarios impose maintenant aussi ce plafond, y compris pour un cycle
long et les quatre régions réelles. Les captures à neuf accords ci-dessous sont historiques.

---

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

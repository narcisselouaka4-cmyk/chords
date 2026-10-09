# Pédagogie IA — la fenêtre sous la vidéo, en une seule carte (04/10/2026)

À reporter dans le vault : `state/current-work.md`, `log.md`, et `decisions/` (la fenêtre
sous la vidéo : une carte, trois étages).

## Demande de Narcisse
La fenêtre sous la vidéo, à gauche du Copilote, réunit :
- les passages ;
- la boucle ;
- les parties de la vidéo ;
- des indications comme « explique entre 0 et 15 secondes ».

« Fonctionnellement, tout va bien. » Il la veut :
- « plus épurée » ;
- « plus lisible » ;
- « mieux organisée » ;
- « visuellement plus moderne » ;
- « moins chargée ».

C'est une amélioration de l'interface, sans changer le fonctionnement.

## Avant
Cinq blocs empilés, chacun dans son style.
1. La ligne « PASSAGE Début [00▾] min [00▾] s [Maintenant] → Fin [00▾] min [26▾] s
   [Maintenant] 0:26 · 10 min max [Boucler] [Suivre la vidéo] ».
2. Une bande hachurée, et sa légende de moments.
3. « ACCORDS RELEVÉS (4) », en majuscules à chasse fixe.
4. « VITESSE 0,5× 0,75× 1× » et un gros bouton « Refaire l'analyse ».
5. Un encadré pour le message de lecture.

## Après : une carte, trois étages séparés par un filet
1. **Le passage**, sur une ligne : « Passage · Début [00 : 00] ◎ → Fin [00 : 26] ◎ · 26 s ·
   [⟲ Boucler] [Suivre la vidéo] ».
   - Les listes minutes / secondes sont réunies en un seul champ, sans flèche ni unité.
     Les unités restent dites aux lecteurs d'écran.
   - « Maintenant » devient une petite cible ◎, avec l'infobulle « Début : prendre l'instant
     de la vidéo ».
   - La durée est en pastille (« 26 s », « 1 min 05 », « 10 min »). Elle devient « suit la
     vidéo » tant qu'aucun passage n'est choisi.
   - Ce qui a changé seul s'écrit à côté : « la fin a suivi », « 10 min au plus : … ». Le
     reste est en infobulle.
   - Dans une colonne étroite, les boutons passent à la ligne, à droite.
2. **La bande** « il joue / il explique » :
   - plus haute et arrondie ;
   - « il joue en parlant » d'un ton intermédiaire, sans hachures ;
   - son début et sa fin aux deux bouts ;
   - une légende par sorte. Seuls les moments où il explique sont datés (« il explique
     0:12–0:20 ») ; qu'il joue, la bande le montre.
   - Un appui place toujours la vidéo.
3. **« Accords relevés »** : titre simple et nombre en pastille. La frise est repliée, comme
   avant, et le choix est retenu.
4. **Le pied de carte** :
   - « Vitesse » et un sélecteur segmenté 0,5× | 0,75× | 1× ;
   - à droite, en boutons discrets, « Calibrer le clavier » (quand il sert) et « Refaire
     l'analyse » ;
   - le message de lecture en note de bas de carte, avec ⓘ, et « Détails techniques » sur sa
     ligne. Une erreur garde un filet rouge et reste lisible.
- **Ce qui ne change pas** :
  - les mêmes identifiants et le même ordre dans le HTML ;
  - les mêmes listes (heures pour une vidéo d'une heure ou plus), la limite de 10 min,
    Boucler, Suivre la vidéo ;
  - l'appui sur la bande, Maj + clic sur un accord, la vitesse de la vidéo, Refaire
    l'analyse et le message de lecture.
- Un étage caché ne laisse pas de filet. La carte entière se cache quand tout l'est (`:has`).

### Fichiers
- `src/index.html` : la carte `pedago-under` autour des quatre blocs.
- `src/ui/refonte/astra-pedagogie.css` : jetons `--tr-*`, sombre et clair.
- `src/ui/pedagogie-tab.js`, la présentation seulement :
  - `buildEdge` ;
  - la pastille de durée (`durationText`) ;
  - `renderPassageActivity` ;
  - le titre de la frise ;
  - le sélecteur de vitesse.

## Vérifié
- `test-pedagogie-dom.js` 174/174. Les contrôles portaient sur l'ancienne présentation :
  « Maintenant » écrit, « Accords relevés (N) ». Ils sont réécrits, et 4 contrôles sont
  ajoutés : la carte et son ordre, filets et carte cachée, champ / pastille / sélecteur, bande.
- Scénario `pedago-passage` (le fonctionnement complet) repassé et comparé à la version
  d'avant :
  - les mêmes valeurs des listes, les mêmes 10 min au plus, la même boucle (117,2 → 123,1 s) ;
  - le même « Suivre la vidéo », le même appui sur la bande (12,3 s), la même frise retenue.
  - Seuls les textes de présentation changent.
- Scénario `pedago-fenetre`, avant / après, en sombre et en clair. Hauteur de la carte :

  | Cas | Avant | Après |
  |-----|-------|-------|
  | 1600 px | 232 px | 219 px |
  | Accords dépliés | 242 px | 226 px |
  | 1280 px | 274 px | 226 px |
  | Copilote agrandi | 291 px | 294 px |

  Rien ne déborde.
- Tous les scénarios Pédagogie IA repassés, en sombre et en clair, sans erreur : 40 passages
  (20 scénarios). Ils couvrent l'import, le retour aux cartes, la mémoire, le Copilote en
  direct, les outils, la parole et le passage. Puis la barre de lecture, l'agrandissement, le
  curseur, la structure, la vitesse et les étiquettes. Enfin les réponses courtes, le bandeau,
  le texte d'outil, la fenêtre et les transferts (voicing, enchaînement, lick).

## Limites
- Les listes gardent leur fonctionnement natif. Un clic sur les minutes ouvre la liste des
  minutes : le champ ressemble à un champ d'heure, mais se règle en deux listes.

---
title: "Le Guide du tuto est retiré ; régression du Copilote sur Amazing Grace"
type: decision
date: 2026-10-16
status: livré (non vérifié dans Electron)
tags:
  - piano-jazz-chords
  - pedagogie-ia
  - copilote
  - regression
---

# Le Guide du tuto est retiré, et ce que la régression du Copilote a appris

## Demande de Narcisse

> « Le copilote ne marche plus comme avant. Je lui ai demandé de me rejouer ce que le pianiste joue
> dans le tuto Amazing Grace, et il fait très clairement n'importe quoi. En plus, il y a des messages
> qui disent que le prof parle alors qu'il ne dit rien du tout. »

> « Je ne vois aucune plus-value au guide du tuto, donc on va l'enlever. […] on gardera simplement le
> copilote, et puis basta. »

## Ce que la mesure a établi sur la régression

1. **Mes deux derniers commits n'y sont pour rien.** Rejoué sur les cinq relevés « Amazing Grace » de
   la bibliothèque, le rejeu du Copilote est **identique** avant (0f00f78) et après (205d23b) : mêmes
   accords, mêmes notes, même source.
2. **Le relevé ENREGISTRÉ de la vidéo est abîmé.** Même fichier (9 431 614 octets, 175,75 s), deux
   lectures :

   | relevé | révision | notes | segments | octaves |
   |---|---|---|---|---|
   | 4 octobre | — | **603** | 95 | 3 : 272 · 4 : 223 |
   | 16 octobre 12:22 | 4 | **127** | 42 | **2 : 90** · 3 : 20 · 4 : 14 |

   C'est exactement le symptôme que Narcisse décrivait depuis des jours (« l'application joue à
   l'octave 2 alors que le pianiste se situe en 3 ou 4 »), et la cause du « n'importe quoi » : le
   Copilote rejoue un cinquième des notes, deux octaves trop bas.
3. **Mais le code actuel lit cette vidéo correctement.** Rejoué hors Electron exactement comme
   l'application le lance (ffmpeg → 8 i/s → `detectVideoFormat` → `readLitKeys` → `buildVideoAnalysis`,
   puis relecture fine à 30 i/s fusionnée) : **96 segments, 603 notes, octaves 3 et 4**. Et la lecture
   des couleurs est inchangée par mon correctif du clavier teinté (575 touches lues, identique à
   l'ancienne règle, sur 176 images).
4. Bissection sur les quatre commits de lecture du 14–16/10 (`e1d3984`, `a8a8f97`, `1317587`,
   `b3fbf4d`) : touches lues 5009 → 3401 → 3401 → 4871 → 4754 ; la répartition par octave ne bouge
   pas (octave 3 : 2280 avant, 2204 aujourd'hui). Aucun de ces commits ne produit la perte observée.

**Conclusion** : la lecture est bonne, le relevé gardé est mauvais. `READING_REVISION` passe à **5**
pour que tous les relevés de la révision 4 soient relus. **Ce qui reste inexpliqué** : pourquoi le
relevé du 16/10 à 12:22 est sorti abîmé. Les fenêtres de relecture fine enregistrées (5,5–7,75 ;
19,375–22,25 ; 67–77,5 ; 85,5–…) ne sont pas celles que `busyWindows` calcule sur mes échantillons
(0–2,3 ; 8,3–11 ; 119,3–125 ; 141,1–144,6 ; 159,8–164,6) : l'application avait donc d'autres
échantillons que les miens. Si une vidéo revient abîmée après relecture, chercher là (sondes de
géométrie dans Electron), pas dans la couleur des touches.

## Le guide est retiré

Supprimés : `src/ui/pedagogie-guide.js`, `src/pedagogie/tutorial-guide.js`, `guide-chapters.js`,
`guide-highlights.js`, `demo-check.js` et leurs tests ; les onglets Guide/Copilote et le panneau de
droite ne contiennent plus que le Copilote ; la barre sous la vidéo montre les accords relevés (plus
de chapitres) ; les styles du guide sont retirés du CSS.

**Côté Copilote**, ce qui venait du guide s'en va aussi :
- l'outil **`play_final_result`** et l'intention « joue le résultat final ». Il rejouait une
  progression **reconstituée** par l'application à partir de bouts (main gauche montrée seule + main
  droite montrée seule) : mesuré sur « Amazing Grace Gospel Jazz Chords », huit accords assemblés
  (C6 · Ddim7 · D9sus4 · G7♯5 · E7♯9/B · Fmaj9 · F♯7♭13 · Dm9) que le prof n'a jamais joués ainsi.
  C'était une source directe de « il fait n'importe quoi » ;
- le bloc « Guide du tuto » du contexte et la règle 22 du prompt.

Ce qui reste au Copilote : la grille relevée, la structure (la boucle), les notes du prof,
`play_tutorial_passage` (SES notes réelles — vérifié : 74 notes du prof sur 20–26 s),
`apply_tutorial_passage`, les moments où il joue ou parle, la région tracée sous la vidéo.

**Gardé exprès** : `spoken-theory.js` (la tonalité que le prof ANNONCE), rebranché sur la **structure**
que lit le Copilote au lieu du guide. Il corrigeait une vraie erreur — sur « Drop 2 » le prof dit
« the key of C sharp » et le moteur devinait La♭, ce qui décalait tous les degrés d'une quinte. Le
garde-fou mesuré reste : la vidéo de salsa annonce Sol mineur mais joue en Si mineur, et le jeu gagne.

## Ce qui a été vérifié

- 174 contrôles DOM (dont 5 nouveaux qui veillent à ce que le guide ne revienne pas), 247 Copilote,
  51 parole, 97 moteur, 84 notes du prof, 99 transfert, 41 structure, Parties 1 et 3, `npm run build`.
- Rejeu réel : `play_tutorial_passage` sur 20–26 s rend 74 notes du prof ; `play_final_result` ne rend
  plus rien (outil inconnu, ignoré).
- Les deux échecs de `test-coach-dom.js` **préexistent** (vérifiés en remisant mes changements) : ils
  ne viennent pas de ce travail.

## Ce qui n'a pas été vérifié

- **Rien dans Electron.** À faire par Narcisse : relancer l'app, rouvrir « Amazing Grace » (elle sera
  relue : quelques minutes), puis demander au Copilote de rejouer un passage.
- Si le relevé revient encore à 127 notes en octave 2, la cause est dans Electron seul (voir plus haut).

## À mettre dans decisions/

**ADR — Le Guide du tuto est retiré ; Pédagogie IA, c'est la vidéo + le Copilote.** Annule ADR-053 à
ADR-056 et la refonte du guide des 14–16/10. Raison : aucune plus-value constatée à l'usage, et une
source de rejeux reconstitués que le prof n'a jamais joués. Ce qui reste du travail de ces jours :
le correctif du clavier teinté, la transcription mot à mot (le faux « il parle »), la tonalité
annoncée par le prof.

**Leçon de méthode** : un correctif de lecture validé par mesure ne garantit pas que le relevé
enregistré par l'application sera bon. La prochaine fois, vérifier le relevé **tel qu'il est écrit
dans la fiche** après une vraie analyse, pas seulement le rejeu hors Electron.

## Liens
[[bugs/open/pedagogie-notes-manquantes-sauts-et-passages]] ·
[[features/pedagogie-ia/2026-10-16-mouvements-harmoniques-parole-du-prof]] ·
[[decisions/ADR-056-pedagogie-progression-ecrite-et-sous-reperes]]

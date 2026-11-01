---
title: "Une case du guide décrit exactement ce qu'elle joue — contrôle de cohérence"
type: feature
date: 2026-10-16
status: livré (non vérifié dans Electron)
tags:
  - piano-jazz-chords
  - pedagogie-ia
  - guide-tuto
  - fiabilite
---

# Une case du guide décrit exactement ce qu'elle joue

## Pourquoi

Un avis externe (ChatGPT) sur l'architecture cible de Pédagogie IA a posé : *« un bouton Play ne doit
jamais jouer silencieusement un contenu différent de celui annoncé »*. Vérifié dans notre code : **c'était
le cas, et c'est moi qui l'avais introduit** au commit 077ef37 (regroupement des cases par degrés).

## Le défaut (mesuré sur « Passing chords… Drop 2 »)

La case « 1 → 5 » affichait « drop 2 · avec accord de passage · 5 fois » mais rejouait 112,8 → 115,8 s :
un enchaînement **direct**. Le seul passage avec accord de passage est à 286 s. Cause : la case affichait
l'**union** des gestes de tous les passages regroupés, puis rejouait l'un d'eux.

## Ce qui a été fait

- `guide-highlights.js` : on classe des **occurrences** (un mouvement à un instant), pas des mouvements.
  La case se décrit à partir du passage qu'elle rejoue : ses gestes, **les mots que le prof dit à cet
  endroit** (`time.terms`, nouveau dans `tutorial-guide.js`). Le nombre d'occurrences est dit à part
  (« montré 5 fois »). Elle porte `claims` : ce qu'elle affirme et d'où.
- **`demo-check.js` (nouveau, pur)** : confronte `claims` aux données et à ce qui sera joué. Trois états,
  calculés sans IA, jamais montrés tels quels à l'écran :
  `validé` · `à confirmer` (la basse entendue n'est pas celle du degré annoncé ; progression seulement
  « assemblée ») · `non exploitable` (geste/mot affiché absent du passage joué, fenêtre ≠ lecture, aucune
  note, degrés incohérents) → **pas de bouton Écouter**, une phrase honnête à la place.
- Branché dans l'onglet (`pedagogie-tab.js` → `check` passé à `pedagogie-guide.js`).

## Mesuré (10 relevés réels, 47 cases d'avant / 59 d'après)

- **AVANT : 5 cases sur 47 annoncent un geste qu'on n'entend pas** (Drop 2, Above All ×2, Key Borrowing,
  Amazing Grace tuto).
- **APRÈS : 0** `non exploitable` ; 41 `validé`, 18 `à confirmer` (dont 6 sont l'avertissement
  « résultat assemblé »).
- Cas Drop 2 : « 1 → 5 » est maintenant **validé**.

## Essais ratés (à mettre dans experiments/)

1. Contrôle de basse sur les notes **attaquées** dans la fenêtre : 33 cases sur 59 « à confirmer ».
   Hypothèse (la basse est frappée avant la fenêtre) → corrigé en notes **qui sonnent** : **toujours 33**.
   L'hypothèse était fausse (ou insuffisante).
2. Contrôle sur la **seule** note la plus grave : trop strict (inversions, basse tenue sous l'accord
   suivant, lecture d'accord de 0,8 s). Remplacé par **les deux classes de hauteur les plus graves** :
   33 → 18. Le cas `Db → Ab5` de Drop 2 reste douteux à raison : la lecture « Ab5 » ne dure que 0,8 s et
   la basse entendue est un Do.

## À vérifier (non fait)

- **Rien écouté dans Electron.** À faire : cliquer Écouter sur chaque case de « Drop 2 » et vérifier que
  l'oreille confirme la description.
- Les 18 « à confirmer » ne changent rien à l'écran aujourd'hui (seul `non exploitable` masque Écouter).
  Faut-il les signaler ? Décision de Narcisse.

## Pas fait (volontairement)

- **« Approfondir dans le Copilote »** (P3 du plan) : le Copilote ne reçoit pas encore l'état du contrôle.
- Les trois zones / « À retenir » / objectifs / prérequis proposés par l'avis : contredisent ADR-051/052/056
  (moins de cases, pas d'hypothèses affichées, rien d'inventé).

## À mettre dans decisions/

**ADR — « Une démonstration affirme ce qu'elle joue, et c'est contrôlé. »** Chaque case porte ce
qu'elle affirme (`claims`) ; un contrôle sans IA le confronte au moteur et au rejeu. Les états de
confiance restent internes ; l'écran n'en montre que l'effet (pas d'Écouter si non exploitable).

## Liens
[[decisions/ADR-052-pedagogie-degres-plutot-que-noms-accords]] · [[decisions/ADR-056-pedagogie-progression-ecrite-et-sous-reperes]] ·
[[features/pedagogie-ia/2026-10-16-mouvements-harmoniques-parole-du-prof]]

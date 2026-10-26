---
title: "La basse pour la fondamentale : la bonne idée, le mauvais maillon"
type: experiment
date: 2026-10-26
status: à-reporter
tags: [analyse, audio, basse, fondamentale, midi, fusion-etiquettes]
---

## Ce qui a été fait

Narcisse a ouvert l'application. Verdict : « niveau étiquettes, franchement ça
va. Quand ce sont des sessions MIDI, ça va vraiment. […] Par contre, dans les
fichiers audio, ce n'est pas bon du tout. »

**Livré** — `50488cb` : une seule étiquette par accord (chemin MIDI).

**Non livré** — l'arbitrage par la basse, mesuré et écarté (voir plus bas).

## Livré : une seule étiquette par accord

Sa règle, mot pour mot : « si une étiquette est suivie d'une autre portant le
même accord (la même notation), ces deux étiquettes fusionnent ». Son grief :
« un pianiste débutant va penser qu'il y a eu deux enregistrements pour le même
accord, alors que j'ai simplement joué un si bémol mineur ».

La cause : la fusion existait, mais sur le nom de la **première** passe. Deux
segments nommés différemment pendant le découpage reçoivent le même nom à la
seconde passe, quand la tonalité est connue — trop tard pour fusionner. Son si
bémol mineur de 27,3 s portait **trois** étiquettes « Bbm » identiques.

Second cas, le sien aussi : même fondamentale et l'une des deux étiquettes est
la triade nue. On garde la triade nue, conformément à sa préférence constante
pour le nom simple (son « Em simple » de la veille).

Ses quatre cas sur Session_014 : `Bbm`, `Db`, `Db`, et `Bbm` au lieu de trois.
29 → 22 étiquettes ; Session_019 31 → 29 ; Session_013 et 017 inchangées.

**Réfuté en route :** recalculer le nom sur l'UNION des notes des deux
segments. Celles-ci accumulent tout ce qui a sonné, et le renommage sortait
« Gbmaj7/Bb » de la fusion de ses trois si bémol mineur.

## L'arbitrage par la basse : mesuré, puis écarté

Sa consigne : « il va falloir s'aider de la basse : elle permet d'identifier la
fondamentale d'un accord. En revanche, pour déterminer s'il s'agit d'un majeur,
d'un mineur ou d'un diminué, je te laisse gérer. » Et : « s'il n'y a pas de
basses, à la limite, il faut s'aider des fréquences basses. »

**Découverte de départ, et elle est réelle.** L'analyse de basse tournait déjà —
671 segments sur « Saint Esprit » — mais arrivait APRÈS la détection d'accords
et ne servait qu'à l'affichage : elle n'a jamais touché une fondamentale.
`usedBassStem` est faux sur ce morceau alors que `stems/bass.wav` existe depuis
le 22 août : le détecteur tourne sur le mix, exactement comme il le suggérait.

**La séquence des basses est bien meilleure que celle des accords.** Filtrée au
grave (octave ≤ 3) et aux notes tenues (≥ 0,6 s), elle suit sa boucle à
**75,4 %** (43 conformes, 14 fautives) contre **54,1 %** pour les accords
détectés (59 / 50). Elle passe 78 % de son temps sur ses quatre fondamentales.

**Mais le mécanisme implémenté ne gagne que +1,1 pt.** Module réel : conformité
54,1 % → **55,2 %**, temps hors vocabulaire 10,5 % → 8,8 %, 13 étiquettes
changées sur 159.

### Trois raisons, toutes mesurées

1. **Renommer ne sert presque à rien ; c'est le découpage qui compte.** Attribuer
   à chaque segment sa basse dominante : 54,1 % → 56,4 %, 20 étiquettes sur 159.
   Un segment d'accord long couvre plusieurs notes de basse, et sa basse
   majoritaire est celle que le moteur avait déjà retenue.

2. **Le degré iii fabrique de faux accords.** Le détecteur passe 7,8 % du temps
   sur un si ; l'accepter comme « Bm » en sol majeur produit un accord qu'il n'a
   jamais joué — un si à la basse y est la tierce de sol. Le vii° de même. Après
   restriction à I, ii, IV, V et vi, le temps hors vocabulaire tombe de 10,5 % à
   8,8 %.

3. **La basse est muette là où il faut.** C'est la raison décisive. Le passage
   qui incarne son grief — « il détecte du Mi mineur, après du Sol, après du Mi
   mineur » — est l'alternance `D`/`G` de **24 s à 40 s**, seize secondes où sa
   boucle veut Em–C–G–D. Dans ces seize secondes, le détecteur de basse ne
   trouve que **six notes brèves** (G3, A3, F#3, D3, D3, B3 ; 0,2 à 0,5 s) et
   **aucune note stable**. La première arrive à 38,01 s. La basse ne peut donc
   pas corriger son pire passage.

### Le maillon faible, quantifié

Couverture d'une basse stable (≥ 0,8 s, grave) sur ses quatorze morceaux
analysés : **50 % du temps en moyenne**, de 25 % (Track_020) à 78 %
(Track_021). Même parfait, l'arbitrage ne pourrait agir que sur la moitié du
morceau — et pas sur la moitié qui en a besoin.

**Conclusion : sa demande est la bonne, mais elle butte sur un maillon en
amont.** L'ordre des travaux est donc inversé : d'abord la COUVERTURE de la
détection de basse (`scripts/export_bass_candidates.py` + la fusion), ensuite
l'arbitrage. Le module a été écrit, mesuré, puis retiré du dépôt : livrer
+1,1 pt aurait donné l'illusion d'avoir répondu à son grief alors que le
mécanisme est inopérant là où il se produit.

### Chemin d'implémentation, si la couverture s'améliore

`chords` et `bassSegments` ne coexistent que côté JS : le moteur Python ne voit
pas la basse (elle est produite par `runBassAnalysis` dans `electron/main.js`,
après `analyze-chords`). Le point d'accroche est donc
`src/analyzer/audio-analyzer.js`, avant le mapping des accords. Le mécanisme
qui a été mesuré : notes de basse du grave fusionnées par hauteur et filtrées à
0,8 s ; un accord par note stable, fondamentale = la basse, mode = le degré
dans la tonalité restreint à I/ii/IV/V/vi ; hors de ces notes, le chroma garde
la main ; voisins de même nom fusionnés. Garde-fous : tonalité à plus de 0,5 de
confiance (« Saint Esprit » sort à 0,975, et juste), basse dans le grave,
degrés restreints.

Mesurer sur GuitarSet demanderait d'intégrer le pipeline de basse au banc
(`export_bass_candidates.py` puis la fusion, avec `fusion_params.json`) — un
chantier à part, non fait.

## Quatrième proxy trompeur de la série

Une première simulation annonçait **79,5 %** au lieu de 55,2 %. L'écart venait
d'un détail de la simulation : elle réduisait chaque intervalle non couvert par
la basse à **un seul** accord du chroma, ce qui supprimait des transitions
fautives par fondu — le mécanisme déjà réfuté la veille. Le module réel, qui
conserve les accords du chroma découpés aux bornes, perd ce gain illusoire.

Avec le proxy du fondu A–B–A (+0,9 pt annoncé, +0,1 réel), l'oracle par morceau
(+2,0 pt, réglage choisi après coup) et la régularité prise à l'envers, cela
fait **quatre** chiffres crédibles et faux en deux jours. Voir
`[[proxy-nest-pas-le-moteur]]` : simuler sert à trier les pistes, jamais à
décider.

## Reste à faire, diagnostiqué mais non corrigé

**Session_014, 35,90 s → 40,15 s : une étiquette pour deux accords.** Il dit :
« juste après le mi bémol mineur 7, on a un fa mineur 7. Le sol bémol add9
n'arrive que vers la fin de la 37e / début de la 38e seconde ». Les notes le
confirment au dixième : **F3, C4, Eb4, Ab4 de 35,90 à 37,42 s** — un fa mineur 7
franc — puis Gb3, Db4, F4, Bb4 à partir de 37,66 s. L'étiquette `Gbadd9` couvre
les deux. Son `Ebm7` de 34,01 → 35,90 (1,9 s) est juste, comme il le dit.

## Sur son jeu libre

Il propose : « je ne joue pas avec un tempo fixe, je joue en jeu libre, ce qui
peut prêter à confusion. […] il faudrait sans doute que je joue au métronome
pour ne pas le pénaliser. »

**À lui dire : ce n'est pas nécessaire, et ce serait le mauvais compromis.** Sur
le chemin MIDI, le tempo ne sert qu'à une chose — le `beatDuration` de
`classifyMidiRoles`, qui distingue un accord tenu d'un accord de passage — et
aucun des défauts qu'il a relevés n'en vient : tous étaient des erreurs de
nommage, de frontière ou de fusion. Les notes et leurs temps sont exacts par
construction.

Et côté audio, la mesure dit que la grille métrique ne sert à rien de toute
façon : la concentration des frontières d'accords sur la mesure est de **0,141**
à 152 BPM et **0,090** à 76 BPM, c'est-à-dire l'aléatoire. L'outil doit suivre
son jeu, pas l'inverse.

## Prochaines actions

1. La couverture de la détection de basse — 50 % du temps, et zéro sur le
   passage le plus fautif de « Saint Esprit ». C'est le maillon qui débloque sa
   demande.
2. L'absorption de Session_014 à 35,90 s (son fa mineur 7), diagnostiquée
   ci-dessus.
3. Une métrique de SÉQUENCE pour juger l'audio : le majmin MIREX, pondéré par
   la durée, ne voit presque pas ce dont il se plaint.
4. Le Temps réel (`src/main.js`) nomme encore avec `detectChord` quand
   Pédagogie et Sessions MIDI utilisent `nameMidiChord`.

## Questions pour Narcisse

- Les trois `Cmadd9/Eb` de Session_013 et l'absorption de 47,5 s sont un
  problème de FRONTIÈRE, pas de nom : son La bémol n'est frappé qu'à 48,13 s, si
  bien qu'aucun nommage ne peut le trouver dans le segment qui précède. Confirme-
  t-il qu'il entend le La bémol dès 47,5 s, ou bien à 48,1 s ?
- La détection de basse rate les passages où l'instrumentation s'allège. Sur
  « Saint Esprit » entre 24 s et 40 s, y a-t-il vraiment une basse qui joue, ou
  est-ce un pont où elle se tait ? Sa réponse dit s'il faut améliorer le
  détecteur ou accepter que la basse soit absente.

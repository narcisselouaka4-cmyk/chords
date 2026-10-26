---
title: "Les relevés ouverts par Narcisse : sept défauts corrigés, le contexte harmonique en butée"
type: feature
date: 2026-10-25
status: à-reporter
tags: [analyse, midi, nommage, decoupage, frise, adr-063, gospel]
---

## Ce qui a été fait

Narcisse a ouvert l'application et dicté, repère par repère, ce qu'il entend
contre ce qu'il voit : trois sessions MIDI (Session_013 du 15/09 17h42,
Session_017 et Session_019 du 25/10) et un audio (Track_006, « Saint Esprit »
de MLK Music). **Vingt et une observations vérifiables.** Chacune a été
reproduite sur les données réelles avant toute modification du code.

Six commits, chacun mesuré avant d'être écrit :

| commit | défaut traité |
|---|---|
| `ab3e93b` | la tierce jouée en mélodie appartient à l'accord |
| `a13e503` | plus aucune case vide dans la frise |
| `b99880b` | un accord joué en arpège commence à sa première note |
| `6d19076` | la coquille sans tierce que porte la basse |
| `e89f0b7` | deux noms sur la même fondamentale ne font qu'un accord |
| `069fb0a` | les notes qui finissent de sonner ne font pas l'accord |
| `28cd3e4` | la quarte ajoutée sur une triade entière est un appui |
| `59570d7` | la lecture qui s'appuie sur le moins de notes tenues |

Fichiers touchés : `src/recorder/midi-chord-namer.js`,
`src/recorder/session-analysis.js`, `src/analyzer/structural-progression.js`,
`src/ui/analyzer-tab.js`, `src/ui/components/analyzer-workspace.css`,
`src/ui/refonte/astra-bridge.css`, et quatre bancs mis à jour.

## Ce qui a été vérifié, et comment

**Sur ses propres relevés, aux instants qu'il a cités.** Le fa mineur
s'arrête maintenant à 19,11 s et le Bb7b9/F à 33,46 s — ses « 19e » et « 33e »
seconde, au centième. Son mouvement de Session_019 se lit
`Am9 — Em/G — Fmaj7 — C/E — Dm7` : cinq accords, exactement sa dictée, là où
le moteur en donnait sept dont deux faux.

**Compte honnête des 21 observations : 12 corrigées, 4 partielles, 5 restantes.**
*(9/4/8 au soir du 25/10, avant les deux commits du 26.)*

Corrigées : le `Csus4` parasite de 23,7 s ; le `Csus4` de 1:19 qu'il dit être
un do mineur ; les deux `Ebmaj7/D` parasites de 0,27 s ; l'`Abmaj7/C` de 1:56
qu'il dit être un do mineur ; l'`Esus4` de Session_017 (« ce n'est pas un
suspendu, c'est un mineur ») ; le mouvement de Session_019, 5 noms sur 5 ; le
`Dmadd9` parasite de 0,3 s ; les cases vides de l'audio ; les vides en tête
des trois sessions.

Partielles : le si bémol de 19 s et le mi bémol de 33 s ont désormais leur
propre segment, mais mal nommés ; le `C7sus4` de 2:05 devient `Cm11` (plus un
suspendu, mais il attend un si bémol) ; l'absorption de 47,5 s passe de 3,07 s
à 0,63 s.

Ajoutées le 26/10 : l'`Esus4` devenu « Em » tout court, à sa demande ; et
**les six occurrences de son mouvement de conclusion**, désormais uniformes —
quatre se lisent `Ebadd9 → Bb/D → Cm`, exactement sa dictée, les deux autres
`Bb/D → Cm`. Il disait : « cette répartition-là n'est pas commune partout dans
la musique. Alors que pourtant, j'ai pas accéléré le mouvement. » Elle l'est.

Restantes : l'`Abadd9` trop courte de 30,8 s, le si bémol absorbé à 50 s, le
passage 47,5–50 s qu'il dit être un simple La bémol, le Bb/Ab de 2:19–2:20, et
la boucle de « Saint Esprit ».

**Mesures nouvelles.** Zéro étiquette de moins de 0,35 s sur les trois
sessions (contre quatre). Session_013 passe de 69 à 63 segments,
Session_019 de 34 à 31. Sur « Saint Esprit », la frise couvre 100 % de la
durée sans aucun trou, contre 11,3 % de temps masqué et un blanc en tête.

**Bancs** : 31/31 nommage, 15/15 sessions de Narcisse, 15/15 rôles, 27/27
découpage, 11/11 progression, 18/18 grille, lisibilité, régressions Partie 1
et Partie 3, `npm run build`.

## Ce qui reste à vérifier

**Rien n'a été vu tourner dans Electron.** Six commits de changement de
comportement, vérifiés par mesure et par banc, jamais par l'œil. À regarder :
la frise sans aucune case vide sur « Saint Esprit », les nouveaux noms sur ses
trois sessions, et le fait qu'une pastille élargie au minimum n'écrase pas sa
voisine de façon gênante.

L'`events.mid` des sessions antérieures au 09/10/2026 est à **la moitié** de
la durée réelle (Session_013 : 74 s pour 147,9 s). Le bug d'export est corrigé
depuis, mais les anciens fichiers restent faux — à vérifier avant tout usage
du pont MIDI sur ces sessions.

## À mettre dans decisions/

**ADR — la frise ne laisse plus aucune case vide (renverse l'ADR-063 pour
l'audio).** L'ADR-063 masquait les détections douteuses de l'audio : taire une
hypothèse hasardeuse protégeait le lecteur. Mesuré sur « Saint Esprit » : 35
segments sur 161, 11,3 % du temps. Mais les pastilles sont posées au temps, en
absolu — un segment retiré laisse un **trou**, et un trou affirme un silence.
C'est une affirmation plus forte, et plus fausse, que l'étiquette qu'on voulait
taire. Narcisse a tranché : « je préfère avoir une étiquette parasite plutôt
que de voir une case vide. » Le rôle sert désormais partout au **contraste**,
jamais à effacer. Seuls les « N » restent sans étiquette, et la frise étend
alors sa voisine. Cinq tests protégeaient la règle inverse ; ils protègent
maintenant celle-ci, plus un nouveau qui vérifie l'absence de tout vide.

**ADR — la basse frappée lit la coquille sans tierce, la tonalité en donne le
mode.** La main gauche du gospel est fondamentale + quinte + septième +
extensions, sans tierce. Le moteur trouvait alors toujours une triade complète
ailleurs dans l'ensemble et nommait sur elle : ses `{Do, Fa, Sol, Si♭, La♭}`
sortaient « Fmadd9/C » à 1:19 et « Abmaj7/C » à 1:56 — **mêmes classes de
hauteur, deux noms différents**, quand il entend « do mineur » les deux fois.
La basse est désormais fondamentale si elle porte sa quinte juste et **aucune**
tierce ; ces deux conditions épargnent tous ses renversements légitimes. Le
mode vient de la tonalité, car une coquille n'en porte aucun. Portée volontai-
rement étroite : on ne choisit pas la fondamentale par le contexte, on tranche
seulement le mode d'une coquille dont la fondamentale est déjà fixée par la
basse.

## À mettre dans experiments/

**EXP — le critère « plus aucune note ne sonne » pour détecter l'absorption :
1 cas sur 5.** Hypothèse : un segment qui s'étire le fait parce qu'une nouvelle
attaque arrive quand plus rien de l'accord ne sonne. Mesuré sur les cinq
absorptions de Session_013 : vrai pour une seule — mais pour celle-là,
exactement aux deux instants qu'il cite (139,30 s et 140,47 s, ses « 2:19 » et
« 2:20 »). Remplacé par le critère de la **note étrangère**, qui attrape les
deux plus grosses. À noter : l'hypothèse initiale venait d'une lecture
manuelle des notes qui avait raté un D#5 encore sonnant — la mesure a corrigé
la lecture à l'œil.

**EXP — filtrer les résidus par fenêtre : échoue ; par classe de hauteur :
réussit.** Premier essai : écarter toute fenêtre de note attaquée avant le
segment et éteinte dans son premier tiers. Résultat nul — le Mi était écarté
avec le Do, et il ne restait que deux hauteurs, donc rien de nommable. Son Mi
finit de sonner à 11,55 s et **repart à 11,74 s**, dans le segment. Le verdict
doit porter sur la classe de hauteur, en considérant toutes ses fenêtres. Avec
ce changement : `Cmaj7/G → Em/G` et `C6/E → C/E`, les deux noms qu'il dicte.

**EXP — le seuil temporel ne séparera pas `Bbadd11/D` de `Ebmaj9/D`.** Ses deux
étiquettes fausses sont **inversées** : le moteur dit Bb quand il entend Eb, et
Eb quand il entend Bb/D. La différence entre les deux ensembles est un seul
Sol résiduel. Essayé : élargir le premier tiers à la moitié — le Sol part, mais
le Si♭ qu'il faut **garder** part aussi, car c'est la note éteinte le plus tôt
(27 % du segment). Aucun critère de durée ne les sépare. `{Ré, Fa, Si♭, Mi♭}`
**est** un Si♭ add11 autant qu'un Mi♭maj9 sans tierce ; seul le contexte
harmonique tranche.

**EXP — la boucle de « Saint Esprit » comme vérité terrain.** Il a dicté
l'ordre strict `Em → C → G → D`, sans jamais de saut. Mesure : le vocabulaire
est presque juste (**89,5 %** du temps sur l'un des quatre bons accords), mais
l'**ordre est faux à 46 %** — 59 transitions conformes contre 50 hors ordre. La
faute dominante est `D→G`, **17 fois** : le moteur oscille entre sol et ré et
écrase le mi mineur et le do au passage. G et D sont à la **quinte** l'un de
l'autre, soit exactement l'erreur n°1 du banc GuitarSet (+7, 24,1 % des
erreurs). Le `Bm` parasite (13 des 26 segments hors vocabulaire) est
l'intersection de G et de D. Diagnostic : le moteur ne se trompe pas de notes,
il se trompe de fondamentale parmi les notes présentes.

## À mettre dans experiments/ — le 26/10

**EXP — rouvrir le contexte harmonique : quatre pistes, trois réfutées par la
mesure, une qui marche (étroite).** Narcisse : « on rouvre le contexte
harmonique, ça passerait non ? »

1. **Le bonus diatonique de transition (retiré par `1a4d9dd`) : inopérant par
   construction sur son défaut.** Sa boucle est `Em → C → G → D` et les quatre
   accords — **plus le `Bm` parasite** — sont tous diatoniques de sol majeur. Un
   bonus qui favorise le diatonique ne sépare donc **aucune** des 17 fautes
   `D→G`. Ce n'est pas que le mécanisme soit mauvais : il ne touche pas le
   problème.
2. **Les priors de tonalité (retirés par `04289bd`) : du code mort.** Le commit
   le dit lui-même — « strictement aucun effet mesuré sur le corpus ». Rien à
   rouvrir.
3. **Le contexte séquentiel appris sur les sorties du moteur :
   auto-confirmation, mesurée.** La bonne suite domine pour trois des quatre
   accords (`Em→C` 9/21, `C→G` 17/28, `G→D` 25/45) mais **pas pour `D`** :
   `D→G` (17) écrase `D→Em` (8). Une contrainte apprise renforcerait donc
   l'erreur. À noter : `G→D` (25) **et** `D→G` (17) forment un va-et-vient,
   impossible dans une boucle — un critère de structure cyclique resterait à
   explorer, mais pas la simple fréquence des transitions.
4. **Le contexte métrique (l'accord change sur le temps fort) : mort.**
   Concentration circulaire des frontières sur la grille de mesure : **0,141** à
   152 BPM, **0,090** à 76 BPM. C'est-à-dire aléatoire. Piste fermée, un
   chantier économisé.

**EXP RÉFUTÉ — le fondu des segments courts.** Piste trouvée en remplacement
du contexte : la durée sépare nettement le juste du faux sur « Saint Esprit »
(avant une transition conforme, médiane 2,74 s ; avant une faute, 1,52 s ; sur
un accord hors vocabulaire, 1,06 s). Fondre tout segment plus court qu'une
fraction du pas harmonique médian faisait passer la conformité à sa boucle de
**54,1 % à 75,6 %** (fraction ×0,67), avec un optimum net, et les accords hors
vocabulaire de 26 à 11 — les `Bm` parasites avec.

**Mesuré sur 40 morceaux de GuitarSet (`--merge-sweep`, une exécution du
moteur, six fractions) : réfuté.**

| fondu | majmin | écart |
|---|---|---|
| aucun | 65,0 % | — |
| ×0,30 | 65,4 % | +0,4 pt |
| ×0,50 | 64,8 % | −0,2 pt |
| ×0,67 | 63,9 % | **−1,1 pt** |
| ×0,80 | 62,9 % | −2,1 pt |
| ×1,00 | 54,9 % | **−10,0 pt** |

La fraction qui gagnait 21,5 points sur sa boucle en coûte 1,1 sur le corpus.
Au meilleur seuil fixe le gain est de +0,4 pt, négligeable ; et 12 morceaux sur
40 n'aiment **aucun** fondu. Non livré.

**Ce que l'écart révèle, et c'est une limite du banc.** Les deux chiffres ne
mesurent pas la même chose : le majmin MIREX est **pondéré par la durée**, donc
fondre un segment d'une seconde sur 344 le change à peine ; la conformité de
transitions compte chaque transition à égalité. Autrement dit, **le majmin
pondéré par la durée ne voit presque pas le défaut dont Narcisse se plaint** —
les étiquettes parasites et l'ordre pèsent peu en durée. Avant de juger un
futur correctif de lisibilité, il faudra une métrique de séquence (distance
d'édition sur la suite d'accords), pas seulement de recouvrement temporel.

**Hypothèse réfutée en route : la régularité du pas harmonique comme condition
d'application.** Supposé : le fondu aide les morceaux au pas régulier (gospel)
et nuit aux irréguliers (jazz solo). Mesuré sur GuitarSet, c'est **l'inverse** —
pas régulier −0,2 pt, pas irrégulier +1,1 pt — et ses propres morceaux le
confirmaient déjà : « Saint Esprit » est le **moins** régulier de ses quinze
(0,45) et le plus amélioré. L'explication tient : mesurée sur les SORTIES du
moteur, une faible régularité signale la sur-segmentation elle-même, pas la
musique. L'effet reste de toute façon trop faible pour justifier un mécanisme
conditionnel.

**Piste non testée, pour la suite :** ne fondre que les segments courts dont
l'étiquette est **hors du vocabulaire dominant du morceau**, au lieu de tous.
Sur « Saint Esprit », 13 des 26 segments hors vocabulaire sont des `Bm` courts —
l'intersection exacte de `G` et `D`. Sur un corpus au vocabulaire large comme
GuitarSet, le mécanisme se déclencherait beaucoup moins.

**Ce qui a marché, et c'est bien du contexte — mais étroit.** Côté MIDI, deux
mécanismes livrés aujourd'hui utilisent le contexte sans choisir la
fondamentale à la place des notes : la **tonalité** donne le mode d'une
coquille sans tierce dont la basse fixe déjà la fondamentale (`6d19076`), et la
**parcimonie** écarte les notes tenues qui complètent une lecture plus riche
(`59570d7`). Ensemble : neuf étiquettes corrigées sur ses sessions. La leçon est
celle de la portée — le contexte sert à trancher entre lectures également
valides des mêmes notes, jamais à en inventer une.

## Prochaines actions

1. **Ouvrir Electron** et regarder les six changements. Rien n'a été vu tourner.
2. Ranger cette note et celle de la veille (1433 lignes) dans le coffre.
3. Le Temps réel (`src/main.js`) nomme encore avec `detectChord` quand Pédagogie
   et Sessions MIDI utilisent `nameMidiChord` : les mêmes notes peuvent
   s'afficher différemment selon l'onglet.
4. Les trois absorptions restantes (47,5 s, 50 s, 2:16) et les neuf étiquettes
   de la famille `Bbadd11/D` / `Ebmaj9/D` / `Cmadd9/Eb`.

## Questions pour Narcisse

- L'`Esus4` de Session_017 est devenu **`Emadd11`** : le La est bien joué et
  tenu tout du long, donc l'étiquette le dit. Tu avais dicté « mi mineur ».
  Veux-tu le nom précis (`Emadd11`) ou le nom simple (`Em`), la quarte étant
  traitée comme un appui ?
- Les pastilles trop étroites s'élargissent maintenant au minimum nécessaire
  pour écrire leur fondamentale, ce qui les fait **empiéter légèrement** sur
  leur voisine. Est-ce lisible à l'écran, ou faut-il plutôt un décalage
  vertical ?
- Les neuf étiquettes restantes demandent le **contexte harmonique**, dont le
  retrait est une décision documentée du coffre (`1a4d9dd`, `04289bd`). Le
  rouvrir est un chantier, pas une retouche — et c'est ton appel. On a
  maintenant un banc de 180 morceaux pour juger, ce qui n'existait pas quand la
  décision a été prise.

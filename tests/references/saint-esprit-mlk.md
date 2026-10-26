# « Saint Esprit » (MLK Music et Jessy Elsa Palma) — relevé de Narcisse

Vérité terrain **dictée par Narcisse le 26/10/2026**, étiquette par étiquette,
sur les 33 premières secondes. C'est la première référence temporelle dont le
projet dispose sur du gospel complet — batterie, chant, piano, chœurs — là où
GuitarSet n'offre que de la guitare solo.

Sa boucle, dans ses mots : « La boucle commence par mi mineur. Ensuite, do
majeur. Sol majeur. Pour finir sur ré majeur. » Un tour fait environ douze
secondes, et le premier mi mineur dure le double — une ouverture.

Ses repères :

- « à la 6e seconde, c'est un Do […] ça reste en Do » — « le Do est censé durer
  jusqu'au début de cette 9e seconde »
- « l'étiquette de Sol […] devrait clairement commencer dès la 9e seconde et
  durer jusqu'à la 12e »
- « entre la 12e et la 15e seconde, l'étiquette de Ré est bonne »
- « entre la 15e et la 16e seconde, l'étiquette de Sol est fausse : c'est un Mi
  mineur. Le Mi mineur doit tout couvrir jusqu'à la 17e seconde »
- « après la 17e seconde […] c'est un Do, qui doit aller de la 17e jusqu'à la
  21e seconde »
- « à partir de la 21e seconde, l'étiquette de Sol est bonne »
- « l'étiquette de Ré arrive au bon moment et est censée durer jusqu'à la 27e
  seconde »
- « après la 27e seconde, on est censé avoir un Mi mineur »
- « juste après, il y a une étiquette de Ré, alors que normalement c'est un Do »

## Une correction à garder en mémoire

Sa première dictée disait « le morceau commence par un La mineur ». La mesure du
spectre a montré que le son des six premières secondes contient **Mi 100,
Si 74, Sol 57 — et La 17, Do 19**, donc pas de la mineur. Il s'est corrigé
lui-même : « il n'y a pas de la mineur dans la musique […] à la limite, le la
mineur peut remplacer le do majeur. »

L'écart n'est pas anecdotique : avec `A:min` en tête, le moteur mesure **32,4 %**
de fondamentales justes ; avec `E:min`, **41,9 %**. Neuf points et demi
dépendaient d'une seule étiquette de référence, et le moteur avait raison là où
la référence avait tort.

**Une référence dictée est une donnée, pas un oracle.** C'est la quatrième fois
de la semaine qu'une référence erronée produit un chiffre crédible et faux —
après le MIDI de Slakh désaligné, la durée prise pour preuve d'alignement, et la
tonalité de « Père nous t'adorons » stockée en si majeur. Voir
`[[simuler-le-correctif-avant]]` et `[[proxy-nest-pas-le-moteur]]`.

La fin du mi mineur de 27 s et le début du do qui suit ne sont pas datés au mot :
30,0 s est l'estimation la plus prudente, au pas de la boucle. Le fichier
s'arrête à 33,5 s, là où son relevé s'arrête.

## Usage

`saint-esprit-mlk.lab` est au format Harte, mesurable par
`scripts/corpus-bench.py`. **L'audio n'est pas dans le dépôt** — il est sous
droits, et seul le relevé est versionné. Le fichier analysé est
`~/PianoJazzChords/Studio/Track_006/audio.wav` (344,14 s) ; les pistes séparées
du même dossier ne couvrent que 300 s, la région que Narcisse avait confirmée
dans le Studio.

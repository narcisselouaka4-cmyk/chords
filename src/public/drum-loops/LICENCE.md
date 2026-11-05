# Boucles de batterie — provenance et licence

Ces boucles **ne sont pas de nous**. Elles viennent de la bibliothèque
[cueharbor/sound-library](https://huggingface.co/datasets/cueharbor/sound-library)
(Hugging Face), publiée en **CC0-1.0** — domaine public, usage commercial compris,
sans attribution obligatoire. On la cite quand même : une source se dit.

Elles remplacent les percussions que l'application synthétisait elle-même
(oscillateurs + bruit filtré). Narcisse, 04/11/2026 : « les boucles de batterie
sont catastrophiques […] prends plutôt des boucles qui existent déjà sur
Internet ». Il avait raison : fabriquer un clave à l'oreille quand on n'entend
rien ne pouvait pas marcher.

Téléchargées le 04/11/2026, converties en MP3 **320 kb/s** 44,1 kHz (même format que
`assets/piano-samples`). Les WAV d'origine font 44,1 kHz / stéréo.

| Fichier | Tempo | Durée | Source amont de la bibliothèque |
|---|---|---|---|
| `son-clave_104bpm.mp3` | 104 | 4,615 s | [VCSL · Claves](https://github.com/sgossner/VCSL/tree/master/Idiophones/Struck%20Idiophones/Claves) |
| `conga-tumbao_100bpm.mp3` | 100 | 4,800 s | [VCSL · Conga](https://github.com/sgossner/VCSL/tree/master/Membranophones/Struck%20Membranophones/Conga) |
| `shaker-16ths_100bpm.mp3` | 100 | 4,800 s | [VCSL · Shaker](https://github.com/sgossner/VCSL/tree/master/Idiophones/Struck%20Idiophones/Shaker%2C%20Small) |
| `cajon-groove_96bpm.mp3` | 96 | 5,000 s | [VCSL · Cajon](https://github.com/sgossner/VCSL/tree/master/Idiophones/Struck%20Idiophones/Cajon) |
| `cowbell-groove_120bpm.mp3` | 120 | 4,000 s | [VCSL · Cowbells](https://github.com/sgossner/VCSL/tree/master/Idiophones/Struck%20Idiophones/Cowbells) |
| `bongo-martillo_112bpm.mp3` | 112 | 4,286 s | [VCSL · Bongos](https://github.com/sgossner/VCSL/tree/master/Membranophones/Struck%20Membranophones/Bongos) |
| `boom-bap_88bpm.mp3` | 88 | 5,455 s | [karoryfer.gogodze-phu-vol-ii](https://github.com/sfzinstruments/karoryfer.gogodze-phu-vol-ii) |
| `one-drop_76bpm.mp3` | 76 | 6,316 s | idem |
| `shuffle_96bpm.mp3` | 96 | 5,000 s | idem |
| `rock-beat_90bpm.mp3` | 90 | 5,333 s | idem |
| `boom-bap_92bpm.mp3` | 92 | 5,217 s | idem |
| `bossa-nova_132bpm.mp3` | 132 | 3,636 s | idem |
| `funk-groove_100bpm.mp3` | 100 | 4,800 s | idem |
| `motown-beat_104bpm.mp3` | 104 | 4,615 s | idem |
| `pop-beat_110bpm.mp3` | 110 | 4,364 s | idem |
| `tambourine-8ths_110bpm.mp3` | 110 | 4,364 s | [VCSL · Tambourine](https://github.com/sgossner/VCSL/tree/master/Idiophones/Struck%20Idiophones/Tambourine%201) |

**Les 16 boucles du tableau font exactement 8 temps (2 mesures à 4/4)** — vérifié fichier par fichier
avant conversion (`durée × tempo / 60 = 8,00`). C'est ce qui permet de les boucler
sans trou : le lecteur cale `loopEnd` sur cette durée exacte.

**Non écoutées.** Aucune de ces boucles n'a été entendue : le choix repose sur les
métadonnées (genre, tempo) et sur la mesure, pas sur l'oreille.

## Réencodage du 04/11/2026 (320 kb/s)

Premier encodage à 128 kb/s : sur des percussions, c'est-à-dire des transitoires
très brefs, ce débit produit un **pré-écho** audible — un souffle juste avant
chaque frappe. Les claves et les congas sont exactement le pire cas. Les
fichiers ont été réencodés **depuis les WAV d'origine** en 320 kb/s.

## Ajouter ses propres boucles

Le fichier `kits.json` de ce dossier est fait pour être modifié. Déposer un
`.mp3` ou un `.wav` nommé `<nom>_<tempo>bpm`, puis ajouter une entrée dans `styles`.
Pour un WAV, inclure l'extension dans `layers` (ex. `salsa-coro_90bpm.wav`).
Sans extension, le lecteur conserve la convention historique `.mp3`.
Le champ `beats` indique le nombre de temps du cycle : **8** par défaut
(2 mesures à 4/4), **16** pour 4 mesures, **32** pour 8 mesures.
`fitToBeats: true` utilise le fichier entier et ajuste sa vitesse pour qu'il
dure exactement le nombre de temps déclaré au tempo choisi. La hauteur suit
cet ajustement de vitesse ; ce mode ne préserve pas indépendamment la hauteur.
En développement, relancer l'application suffit ; pour une version construite,
reconstruire l'application afin de recopier les fichiers publics dans `dist`.

## Boucles personnelles ajoutées le 04/11/2026

Ces deux fichiers sont fournis par Narcisse et ne proviennent pas de la
bibliothèque CC0 ci-dessus. Leur provenance et leur licence restent à renseigner.

| Fichier | Tempo indiqué | Durée MP3 mesurée | Cycle déclaré |
|---|---|---|---|
| `drum-montuno_118bpm.mp3` | 118 | 8,176 s | 16 temps (4 mesures) |
| `salsa-latin-drums_100bpm.mp3` | 100 | 19,226 s | 32 temps (8 mesures) |

Deux choix indépendants du métronome : **Salsa — Montuno** et
**Salsa — Latin drums**. Le lecteur ferme leurs cycles à 8,136 s et 19,200 s
respectivement, selon le tempo indiqué et le nombre de temps déclaré.
Les durées sont compatibles avec ces cycles, mais le premier temps, le tempo
réel et la qualité des raccords restent à confirmer par une écoute humaine.

### Remplacement salsa par le WAV fourni

`Coro 1-2 90 BPM.wav`, fourni par Narcisse depuis son dossier Téléchargements,
est copié sans modification sous `salsa-coro_90bpm.wav` : PCM 16 bits stéréo,
44,1 kHz, 233 184 échantillons par canal, soit 5,287619 s.
Le style **Salsa / Latin** utilise maintenant ce WAV entier, `tempo: 90`,
`beats: 8`, `fitToBeats: true`. Sa vitesse est proche de 0,99143× pour fermer
le cycle à 5,333333 s sans ajouter de silence. Le MP3 précédent est conservé.
La provenance et la licence de ce WAV restent à renseigner ; il n'est pas
couvert par la déclaration CC0 de la bibliothèque historique.
Chargement, décodage et cycle ajusté vérifiés dans Chromium ; raccord musical
et rendu natif Electron restent à confirmer par écoute humaine.

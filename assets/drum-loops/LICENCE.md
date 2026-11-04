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

**Toutes font exactement 8 temps (2 mesures à 4/4)** — vérifié fichier par fichier
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
`.mp3` nommé `<nom>_<tempo>bpm.mp3` (boucle de **2 mesures à 4/4**), puis
ajouter une entrée dans `styles`. Aucun code à toucher, aucune reconstruction :
relancer l'application suffit. C'est la seule façon fiable d'améliorer le
rendu — je n'entends rien, Narcisse si.

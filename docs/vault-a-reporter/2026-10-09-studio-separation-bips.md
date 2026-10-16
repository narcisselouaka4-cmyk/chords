# Studio — régression après séparation : les pistes étaient des bips de 2 s (09/10/2026)

À reporter dans le vault :
- `log.md` et `state/current-work.md` ;
- **corriger** `decisions/ADR-016-studio-post-separation-fixes.md` et les §8–9 de
  `meta/lecons-methodologiques.md` (session OpenCode du 08/10) : ils attribuent le bruit sourd
  aux tampons SoundTouch, à l'absence de fondu et au DC offset du découpage, et disent le bug
  « vérifié ». Narcisse a répondu « aucune avancée » puis « toujours pas » : la cause était
  ailleurs (voir ci-dessous) ;
- `meta/lecons-methodologiques.md` : une nouvelle leçon (en bas de cette note).

## Demande de Narcisse
« ALERTE RÉGRESSION : une fois la séparation terminée, plusieurs problèmes : le son bug, le
lecteur est bloqué, un bruit sourd se fait entendre au lancement de la vidéo. Le bouton
transpose marche très bien. C'est systématique. »

## Cause (lue dans ses propres logs)
1. **Demucs échouait à la fin.** Le calcul allait à 100 %, puis :
   `ImportError: TorchCodec is required for save_with_torchcodec`.
   - Le `torchaudio` du `.venv` n'est pas épinglé (tiré par demucs). Depuis la 2.9, il
     enregistre **uniquement** par TorchCodec et ignore `TORCHAUDIO_BACKEND`.
   - La ligne `os.environ['TORCHAUDIO_BACKEND'] = 'soundfile'` de `demucs-wrapper.py` ne
     servait donc plus à rien.
2. **L'application masquait l'échec.** `studio:separate` (`electron/main.js`) attrapait l'erreur
   et fabriquait des **pistes simulées : des bips de 2 s** (basse 80 Hz, batterie 200 Hz…), en
   répondant `success: true`.
3. Ce que Narcisse entendait :
   - le **bruit sourd** : le bip de 80 Hz de la « basse » ;
   - le **lecteur bloqué** : des pistes de 2 s pour une région de 4 à 5 min ;
   - « **le son bug** » : des bips à la place de la musique ;
   - **transpose marche** : SoundTouch transposait fidèlement les bips ;
   - **systématique** : chaque séparation échouait de la même façon.
4. Le bouton « Réanalyser » prenait même un message d'erreur pour un succès
   (`Object.values(result).some(Boolean)`).

## Fait
- **`electron/demucs-wrapper.py`** : `torchaudio.save` est remplacé, avant l'import de demucs,
  par une écriture WAV directe.
  - Elle passe par soundfile (déjà dans `requirements.txt`), sinon par le module `wave`.
  - Elle reprend les mêmes formats : PCM 16/24 bits ou flottant.
  - Le résultat ne dépend plus de la version de torchaudio ; torchcodec n'est pas nécessaire.
- **`electron/main.js`** :
  - un échec de Demucs renvoie `success: false` et la ligne d'erreur Python
    (`demucsErrorSummary`). Plus de bips, et les pistes précédentes restent en place ;
  - les bips ne servent plus que si Demucs n'est pas installé, et ils sont marqués
    (`stems/simulated.json`) ;
  - **les anciens bips** (5 fichiers de 176 444 octets, sans marque) sont reconnus :
    `get-stems` et `is-separated` les ignorent. Le morceau revient au son original et
    propose « Séparer les pistes ». C'est le cas de Track_020 et Track_021.
- **`src/ui/studio-tab.js`** :
  - une séparation échouée s'affiche (« Erreur : la séparation n'a pas pu enregistrer les
    pistes (torchaudio demande torchcodec)… ») ;
  - le lecteur garde le son original ;
  - « Réanalyser » ne prend plus une erreur pour un succès.
- **`requirements.txt`** : une note sur torchaudio et torchcodec.

## Vérifié
- **Reproduction de son erreur** : un torchaudio factice qui exige torchcodec, et un
  `demucs.separate` factice qui enregistre comme demucs 4.0.1 (`ta.save(str(path), wav,
  sample_rate=…, encoding='PCM_S', bits_per_sample=16)`, lu dans le source 4.0.1).
  - Avec l'ancien wrapper : la même `ImportError: TorchCodec is required…`.
  - Avec le nouveau : 6 pistes WAV stéréo, 16 bits, 44,1 kHz, avec et sans soundfile, et les
    crêtes conservées.
- **Les anciens bips** : reconnus, alors que des bips marqués, de vraies pistes de 5 min ou
  l'absence de pistes ne le sont pas.
- **La ligne d'erreur** extraite de son vrai log : celle de torchcodec.
- **Tests** :
  - `test-studio-dom.js` : un nouveau contrôle (échec dit, pas de bips, `torchaudio.save`
    remplacé, anciens bips écartés) ;
  - `test-pedagogie-dom.js` 177/177 et `test-analysis-persistence.js` ;
  - build, régressions Partie 1 et Partie 3, `test:chords` 98/98.
- **Non vérifié ici** : une vraie séparation Demucs complète. L'index PyTorch est bloqué depuis
  l'environnement de test ; c'est à vérifier sur sa machine.

## Limites et suites
- La session OpenCode du 08/10 a laissé des modifications **non enregistrées** sur sa machine :
  - `stem-mixer.js` (fondu, `clear()`), `studio-tab.js` (lecture automatique) ;
  - `audio-processor.py` (passe-haut), `demucs-wrapper.py` (autre contournement) ;
  - `index.html`, `style.css` et `studio.css` (cadre « Zone à travailler », poignées).

  Elles ne traitaient pas la cause. Conseil : les mettre de côté (`git stash`) avant de
  récupérer ce correctif ; reprendre ensuite, si on le veut, la partie CSS.
- Les dossiers `demucs_out/` des essais ratés restent sur le disque, sans effet.

## Leçon
Un repli « pour que les tests continuent » (`createSimulatedStems` dans le `catch`) a caché un
échec réel pendant toute une session de débogage. Le symptôme (bruit sourd, lecteur bloqué)
ressemblait à un problème du mixeur, et quatre correctifs du mixeur n'ont rien changé.
- Un repli doit se voir : marqué, et dit à l'écran.
- Avant de corriger le lecteur, vérifier dans les logs que les fichiers qu'il lit sont les bons.

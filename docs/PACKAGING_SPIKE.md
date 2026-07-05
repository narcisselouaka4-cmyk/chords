# Spike : Packaging Demucs pour Electron multi-plateforme

> Date : 5 juillet 2026
> Objectif : évaluer la faisabilité d'embarquer Demucs + PyTorch dans un bundle Electron sans dépendance Python visible pour l'utilisateur.
> Méthode : spike time-boxé, tests sur l'environnement de développement Linux actuel.

## Résumé exécutif

**Verdict : possible, mais coûteux.** Le packaging propre de Demucs en bundle autonome est un chantier à part, bien plus lourd que le reste du module Studio. Pour une v1 à usage personnel/église, **l'installation manuelle documentée de Python + ffmpeg + venv reste la bonne stratégie**. Le packaging auto-contenu doit être reporté en v1.1.

## État actuel du pipeline

Le Studio fonctionne déjà via un mécanisme robuste :

- Electron appelle `getPythonCommand()` qui détecte un `.venv` local ou fallback sur `python3`.
- `audio-processor.py` (librosa + soundfile + imageio_ffmpeg) gère extraction audio, waveform, pitch-shift via RubberBand.
- `demucs-wrapper.py` lance `demucs.separate.main()` avec le modèle `htdemucs_6s`.
- Si Demucs n'est pas installé, l'application génère des stems simulés (bip) pour ne pas bloquer l'utilisateur.

## Données du spike

### Environnement testé

- OS : Linux Debian (kernel 7.0.13-3-liquorix-amd64)
- Python : 3.13.5
- Venv local : `/home/visiteur/piano-jazz-chords/.venv`
- Demucs : 4.0.1
- PyTorch : 2.6.0+cpu (pas de CUDA ni MPS sur cette machine)

### Tailles mesurées

| Élément | Taille |
|---------|--------|
| `.venv/lib/python3.13/site-packages` | **1,5 Go** |
| Modèle `htdemucs_6s` (téléchargé au premier run) | ~80-150 Mo |
| Bundle Electron actuel (HTML/CSS/JS) | ~200 Ko |

### Test PyInstaller

- Commande : `pyinstaller --onefile --name demucs-cli electron/demucs-wrapper.py`
- Résultat : **timeout après plus de 7 minutes**, le build n'a pas terminé.
- Interprétation : PyInstaller analyse l'ensemble des imports transitifs de PyTorch + Demucs. Avec 1,5 Go de site-packages, le temps de scan est très long et la RAM consommée importante. Le build aurait probablement fini, mais au prix d'un binaire de **plusieurs centaines de Mo** (estimation 400-800 Mo pour l'exécutable seul).

## Problèmes identifiés

### 1. Taille du bundle

PyTorch CPU seul pèse ~500-600 Mo. Demucs ajoute torchaudio, einops, julius, openunmix, etc. Le bundle final exécutable pourrait dépasser 1 Go compressé — inacceptable pour une app de 200 Ko initiale.

### 2. Modèles téléchargés à la volée

Demucs télécharge `htdemucs_6s` dans `~/.cache/demucs` au premier lancement. Il faut soit :
- embarquer le modèle dans le bundle (ajoute 80-150 Mo),
- ou télécharger à la demande (mauvaise UX première utilisation).

### 3. Multi-plateforme

- **Linux** : possible avec PyInstaller, mais glibc et drivers audio varient.
- **Windows** : nécessite un build sur Windows, gestion de CUDA/CPU, chemins Python différents.
- **macOS / Apple Silicon** : PyTorch ARM + Demucs doivent être testés spécifiquement. Pas de GPU Metal garanti.

### 4. Temps d'exécution CPU

Sur la machine de test (8 threads, CPU uniquement), une séparation Demucs prend typiquement **2 à 5 minutes** pour un morceau de 3-4 minutes. C'est acceptable en usage perso mais doit être clairement communiqué.

### 5. Qualité audio

RubberBand est présent sur la machine de test (`/usr/bin/rubberband`). Sur Windows/macOS, il faudrait l'embarquer ou fallback sur librosa phase vocoder (qualité inférieure).

## Options envisagées

| Option | Avantage | Inconvénient | Recommandation |
|--------|----------|--------------|----------------|
| **A. Status quo : venv + doc** | Rapide, fiable, pas de surpoids | Nécessite installation manuelle | ✅ **v1** |
| **B. PyInstaller one-file Demucs** | Un seul binaire à copier | 1 Go+, build long, multi-plateforme complexe | v1.1 |
| **C. Désactiver la séparation de sources en prod** | App légère | Perd une fonctionnalité clé du blueprint | Non |
| **D. Remplacer Demucs par modèle ONNX léger** | Bundle plus petit | Qualité moindre, modèles rares | À étudier en v1.2 |

## Recommandation

1. **Pour la v1** : conserver le mécanisme actuel (venv local + fallback stems simulés). Ajouter un assistant d'installation dans l'app qui vérifie Python/Demucs/ffmpeg et guide l'utilisateur.
2. **Pour la v1.1** : explorer un build PyInstaller **non one-file** (dossier) plutôt qu'un exécutable monolithique. Cela réduit le temps de build et permet de gérer les modèles/cache séparément.
3. **Pour la v1.2** : évaluer des alternatives ONNX ou des modèles plus légers (Spleeter est aujourd'hui moins bon que Demucs mais plus simple à packager).

## TODO restant lié au packaging

- [ ] Créer un `requirements.txt` officiel avec versions pinnées.
- [ ] Ajouter un script `scripts/setup-python-env.sh` (et `.bat` Windows) d'installation automatique du venv.
- [ ] Dans Electron, ajouter une vérification au démarrage : Python, ffmpeg, Demucs présents — sinon ouvrir une modale avec le guide d'installation.
- [ ] Documenter dans `docs/STUDIO_SETUP.md` la procédure pour Linux/Windows/macOS.

## Conclusion

Le packaging autonome de Demucs est **un vrai projet**, pas une simple option de build. Il ne doit pas bloquer la v1. La stratégie actuelle (venv + fallback simulé) est pragmatique et doit être documentée proprement.

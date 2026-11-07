# État de départ et écoutes comparatives de Copilot

Ce dispositif mesure une dépendance précise à la grammaire issue de la référence
approuvée. Il ne constitue ni un nouveau moteur d'IA ni un test sur des prises inconnues.
Le comportement habituel de l'application reste inchangé.

## Préparer une série, dans cet ordre

Avant de modifier le code musical, sur une version commitée :

```bash
node scripts/copilot-evaluation.mjs freeze /chemin/nouvelle-serie
```

Le dossier contient une archive du code suivi (sans secrets, modèles, dépendances ou
fichiers audio publics), le SHA Git, les empreintes du verrou de dépendances et des
fixtures, les entrées exactes et les sorties locales habituelles. Aucun fournisseur
n'est appelé. Cette copie sur le même disque n'est pas une sauvegarde hors machine.

Après ajout du mode d'essai, sans changer le comportement par défaut :

```bash
node scripts/copilot-evaluation.mjs compare /chemin/nouvelle-serie
python3 scripts/copilot-render.py /chemin/nouvelle-serie
```

`compare` refuse la série si les sorties habituelles diffèrent de celles figées, y compris
la variante liée historique et les cartes réellement sélectionnées. Les fichiers
existants ne sont pas écrasés. Choisir un autre dossier pour une autre série.

Le rendu utilise FluidSynth, `FluidR3_GM.sf2`, numpy, soundfile et ffmpeg installés
localement. Tous les canaux jouent le même piano. Notes et pédale sont rendues ; les
changements d'instrument sont volontairement ignorés. La sonie est mesurée sur le fichier
entier ; un gain constant par fichier les amène à une cible commune, abaissée si les
crêtes l'exigent. Aucun compresseur/limiteur n'est ajouté. Une queue de trois secondes
suit la levée finale de pédale. Le rapport conserve mesures, SoundFont et empreintes.

## Écouter et conserver les avis

Ouvrir `index.html` directement dans un navigateur. Les données sont intégrées à la page,
les WAV sont relatifs à son dossier : aucun serveur, API ou installation supplémentaire
n'est nécessaire à l'écoute. Une copie du dossier complet reste portable.

- A et B changent de méthode selon la prise ; les noms des méthodes ne sont pas affichés.
- On peut écouter l'original, comparer au même endroit, ralentir, choisir A/B/équivalentes/
  aucune/pas d'avis et commenter un moment.
- Les réponses restent dans le stockage du navigateur si disponible. **Exporter mes avis**
  produit le JSON nécessaire au dépouillement ; ne pas se fier uniquement au stockage local.
- Ne pas ouvrir `comparison-private.json` avant d'avoir donné les avis : il contient la
  correspondance et les plans. Masquer les intitulés ne garantit pas que l'auditeur ne
  reconnaîtra aucune version déjà entendue.

```bash
node scripts/copilot-evaluation.mjs score /chemin/nouvelle-serie /chemin/avis.json
```

L'outil vérifie l'identifiant de série, distingue les absences de votes et refuse les
réponses incompatibles. Il ne transforme pas les préférences d'un auditeur en preuve
statistique de qualité professionnelle ou universelle.

## Ce qui est comparé

La même fonction `buildPhraseArrangement`, avec la même demande et le même mode ouvert :
préférence habituelle pour les dispositions de référence, ou `useReferenceVoicings:false`
pour interdire **tous** leurs appels, préparations et cadence finale comprises. Le second
chemin conserve les autres règles et catalogues locaux écrits par des humains.

Ce n'est pas la comparaison avec la carte historique « Voix intérieures liées » : cette
dernière désactive la préférence seulement sur les accords principaux. Elle est figée et
contrôlée séparément, sans être présentée comme une méthode indépendante.

Les six fixtures sont déjà connues du développement. Cinq donnent une paire. La mélodie
Session_010 utilise un autre parcours : absence de paire consignée, pas de substitution
silencieuse par une autre méthode ni de case vide à noter. Les refus, s'il y en a dans
une future série, restent consignés.

## Avant toute conclusion générale

Réserver de nouvelles prises indépendantes sans les utiliser pour régler le moteur.
Les transpositions ne remplacent pas des musiques nouvelles. Conserver séparément :
préférences de Narcisse, avis d'autres pianistes et vérifications techniques. La suite
dépend du verdict d'écoute : corriger les défauts communs avant de comparer de nouveaux planificateurs.

## Réécouter un correctif sans écraser le point de départ

Les premiers avis du 07/11 signalent surtout des coupures d'accompagnement et une
cadence source dénaturée. Après commit du correctif, préparer une **autre** série :

```bash
node scripts/copilot-repair-evaluation.mjs /chemin/baseline /chemin/nouvelle-ecoute
python3 scripts/copilot-render.py /chemin/nouvelle-ecoute
node scripts/copilot-evaluation.mjs score /chemin/nouvelle-ecoute /chemin/avis.json
```

Cette commande conserve la première baseline et compare ses sorties enregistrées
aux cartes sélectionnées par le moteur actuel, sur les mêmes entrées contrôlées
par empreintes. Deux paires ciblent la continuité (prise 2) et la résolution (prise 5).
Le format de sauvegarde des éditions reste 8 ; la politique de génération passe à 9
pour proposer de recalculer les anciennes cartes sur demande, sans les réécrire.

Un troisième argument facultatif permet de comparer la dernière proposition évaluée
au correctif actuel, plutôt que de rejouer systématiquement la sortie initiale :

```bash
node scripts/copilot-repair-evaluation.mjs /chemin/baseline /chemin/nouvelle-ecoute /chemin/serie-precedente
```

L'outil vérifie que la proposition précédente est celle de sa politique musicale et
repose sur la même source. Elle reste archivée dans sa série ; aucun résultat n'est
écrasé. La politique 10 reprend les instants des arpèges source et leurs nuances, avec
un relais des nuances entre accords pour les passages. Elle n'assimile plus douceur
d'attaque et atténuation globale des notes ajoutées.

## Harmoniser une session de mélodie sur des degrés demandés

Après commit, le client habituel peut produire une version à partir d'une mélodie
seule et d'une progression numérique (par exemple 4–5–3–6). Préparer une écoute
dans un dossier neuf, sans inventer une proposition manuelle :

```bash
node scripts/copilot-melody-evaluation.mjs /chemin/Session_010 /chemin/nouvelle-ecoute 'Fais-moi entendre ma mélodie harmonisée sur 4-5-3-6 avec des accords de passage et des appoggiatures.'
python3 scripts/copilot-render.py /chemin/nouvelle-ecoute
```

La commande passe par `sendCopilotMessage`, interdit toute requête réseau, conserve
les empreintes des trois JSON de session et refuse de remplacer un dossier existant.
Deux fichiers : la mélodie d'origine et une seule proposition, pas une paire masquée A/B.
La page propose un lecteur commun, une vitesse réglable, la grille active et un export
de commentaire ; cet export n'utilise pas le dépouilleur des anciennes paires.
Après conversion éventuelle des WAV en FLAC, actualiser les chemins dans `listening.json`
et les données intégrées de `index.html` ; vérifier l'identité PCM et archiver les mesures.

La politique 12 interprète les degrés en utilisant la tonalité explicite ou une
estimation suffisamment étayée. Quatre temps par accord et première attaque principale
prise comme début de mesure sont des hypothèses à déclarer à l'auditeur. Les événements
source restent exacts, y compris les petites notes ; la carte des temps privilégie
l'attaque principale d'un groupe plutôt qu'une petite note d'approche. Les dispositions
sont cherchées sur la chaîne entière ; seules les dominantes dont une voix résout
effectivement vers l'accord suivant sont retenues. Appoggiatures intérieures facultatives,
mains et pédale contrôlées. Ces contrôles ne garantissent pas un résultat musical réussi.

`test 4` est Session_010, déjà présente parmi les fixtures : cette écoute ne constitue
pas une validation sur une prise inconnue. Les anciens avis, séries et référence
approuvée ne sont pas remplacés. Aucun identifiant de session ou passage de référence
n'est codé dans le générateur musical.

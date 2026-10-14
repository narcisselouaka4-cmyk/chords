# Mission à lancer SUR LE PC : un seul coffre Obsidian pour Piano Jazz Chords

À coller dans une session Claude Code ouverte dans `/home/visiteur/piano-jazz-chords` (le PC de
Narcisse). Cette mission ne peut pas être faite depuis le cloud : les dossiers n'y existent pas.

Avant de la coller : `git pull --ff-only` (les notes de Claude arrivent par là).

## Où sont les sources (déjà retrouvées, ne pas redemander)
1. Coffre existant : `/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord` (~200 fichiers).
2. Notes écrites par Claude dans le dépôt : `/home/visiteur/piano-jazz-chords/docs/vault-a-reporter/`
   (53 notes `AAAA-MM-JJ-sujet.md`, du 24/09 au 14/10/2026 ; `LISEZ-MOI.md` n'est pas une note).
   Un script existe déjà : `scripts/sync-vault.sh` (copie sans écraser vers `<vault>/a-integrer/`).
3. Autres textes du dépôt : `CLAUDE.md` (la mémoire de travail du projet), `docs/*.md`
   (ARCHITECTURE, DESIGN, KNOWN_LIMITATIONS, rapports, baselines…), `CHANGES*.md` s'il existe.
4. Le journal git (`git log`) pour dater les décisions.
À ne pas lire : `node_modules`, `.git`, `dist`, caches, modèles, venv, binaires.

## Garde-fous propres à ce dépôt (à respecter en plus de la mission)
- Il existe un fichier nommé `apikeys` à la racine du dépôt : **ne jamais l'ouvrir ni le copier**.
- Aucune clé, aucun token, aucun mot de passe dans le coffre (chercher aussi `sk-`, `Bearer`, `API_KEY`).
- Pas de `git add -A` ni `git add .` : toujours des chemins explicites (dans le dépôt de l'app ;
  dans le coffre, le premier commit peut ajouter le contenu du coffre, qui est un dépôt à part).
- Ne pas modifier le code de l'application ; ne rien supprimer ni déplacer dans les originaux.


## État réel du projet au 14/10/2026 (à reporter dans state/, backlog, roadmap — vérifier dans le code)
Source : `git log` (397 commits, branche `fix/exercices-voicing-correctifs`, poussée sur GitHub
`narcisselouaka4-cmyk/chords`), `CLAUDE.md` à jour au 14/10, les 53 notes. L'ancien coffre date
d'août / septembre : tout ce qui suit est postérieur.

### Déjà fait (par thème, du plus ancien au plus récent)
- **24/09 — Exercices / Mouvements / démo** : voicings contrôlés d'après les manuels, Mouvement 12
  tons, démo Gospel/worship et styles (Ballade, Comping swing, Plaqué), démo jouable à deux mains,
  accords de passage, tensions, bibliothèque de mouvements, Copilote « explication puis démo ».
- **25–26/09 — Copilote interactif, Session MIDI → Copilote, Studio → Session**, étoiles, mélodie,
  Melody chords.
- **02/10 — Temps réel** : scène épurée, lecture en direct, portée (clés sol/fa/ut), bibliothèque
  d'accords ; mode clair Entraînement.
- **03–05/10 — Pédagogie IA, refonte en 6 lots** : Copilote intégré à côté de la vidéo du prof,
  transfert des voicings / enchaînements / licks du prof vers une autre progression, mémoire des
  analyses + accueil en vignettes, outils (vitesse, boucle), analyse à l'import, plage du Copilote,
  structure d'un tuto (boucle, passages, lignes), notes fantômes écartées, lecteur d'exemples
  (pause, curseur, sans pédale), vitesse libre 0,25×–2×, rejeu : pédale après les notes d'approche.
- **09/10 — Studio** : étape 1 (région, « Confirmer », ≤ 5 min séparé directement, « Annuler et
  revenir »), séparation Demucs sans bips de substitution, lecture fluide, un seul SoundTouch sur le
  bus (étape 3) ; Analyse accepte MP4 et MIDI ; rejeu du Copilote : vélocité, groove, licks rapides,
  grace notes, Fmaj9/C ; la lecture suit d'un onglet à l'autre.
- **13/10 — Interface** : Réglages regroupés, fond unique, navigation Atelier/Scène, couleur
  générale réglable, barre du clavier stable, bibliothèques avec recherche ; Sessions MIDI
  (angle « Chute », Pause réparée) ; Studio : roue des morceaux, pistes repliables en rond, export
  WAV/MIDI, mode enregistrement, notification « morceau prêt » ; rangement de la racine du dépôt.
- **14/10 — Pédagogie IA (travail de la dernière session)** :
  - l'image du tuto est **recoupée avec le son** (octaves, lacunes, glissandos) ; métronome calé ;
  - clavier dessiné **couvert par les mains** du prof lu (vidéo « Next Level Worship » : 2/22 → 20/22
    images reconnues) ;
  - rendu **« éclair »** (touche allumée seulement à l'attaque) : notes tenues, accords par
    harmonie ; fausses notes voisines corrigées ;
  - **Guide du tuto** : étapes, parties par tonalité, **résultat final** assemblé et jouable,
    **mouvements** relevés (jamais inventés), titres des étapes en français par l'IA ;
  - **barre du tuto à régions** (comme le Studio) + onglets Guide / Copilote ; retrait de la
    frise « Accords relevés » et des listes Début/Fin ;
  - tonalité par II-V-I ; accords lus pendant que le prof parle écartés ;
  - bug réel corrigé : deux transcriptions parallèles s'effaçaient leur WAV (`electron/main.js`).
  Voir la note `2026-10-14-pedagogie-guide-et-resultat-final.md` (et `…-clavier-sous-les-mains`,
  `…-son-et-metronome`).

### En cours / ouvert (à vérifier avec Narcisse)
- **Pédagogie IA — hypothèses « intro / couplet / mouvement »** : demandé le 14/10, **pas fait** : le
  guide range par tonalité et par mains, pas par rôle dans le morceau. Proposé à Narcisse, non tranché.
- **Boucle de batterie par style** : demandée, **pas commencée** ; les styles doivent être choisis
  avec Narcisse avant.
- **Vérification dans le vrai Electron** de la refonte Pédagogie IA : **jamais faite** (essais
  uniquement navigateur + faux environnement). À faire par Narcisse : mettre à jour, puis
  « Refaire l'analyse » sur « Next Level Worship ».
- Les titres en français des étapes exigent la clé IA et la transcription (Whisper) ; sinon titres
  automatiques.
- **Échecs de tests anciens, connus et indépendants** : `test-home-results-separation` (1),
  `test-load-session` (plantage), `test-training-dom` (11), `test-voicing-preview` (68/69).
- **Vault** : cette mission elle-même (coffre unique). Pendant des semaines le vault du PC n'a pas
  été mis à jour : Claude écrivait dans `docs/vault-a-reporter/` sans moyen de le reporter ;
  `scripts/sync-vault.sh` a été ajouté le 14/10. Ajouter un ADR : « le coffre `zic-vault` est la
  source de vérité ; le cloud dépose ses notes dans `docs/vault-a-reporter/` ».

### Règles de travail qui ont émergé (à garder dans 00_AGENT_START_HERE.md)
- Narcisse n'est pas développeur : rapports en français simple, « tu », pas de jargon.
- Commits aux chemins explicites ; branche `fix/exercices-voicing-correctifs` ; ne jamais ouvrir
  `apikeys` ; ne jamais stocker de secret.
- Mode auto sur les corrections ; ne demander que pour les choix majeurs ou irréversibles.
- Ne jamais dire « fait » sans l'avoir vérifié (tests + scénarios Playwright + captures).

## Mission
(Colle ici, tel quel, le texte de la mission de Narcisse : étapes 1 à 8, interdits, rapport final.)

# Pédagogie IA — les notes fantômes (bandeau sur le clavier) et le texte d'outil (04/10/2026)

À reporter dans le vault :
- `state/current-work.md` et `log.md` ;
- `concepts/` : ce que la lecture prend pour des touches ;
- `experiments/` : le seuil des 6 touches voisines, mesuré sur ses relevés ;
- `state/next-actions.md` : confirmer sur son relevé gardé de la vidéo Cory Henry.

## Demande de Narcisse
Test sur « This Anonymous Pianist Impressed Cory Henry With Amazing Grace.mp4 », passage de
0:15 à 2:16. « Le Copilote arrive à reproduire la prestation quasiment à l'identique », sauf :
- **« Entre 38 et 39 s, le Copilote joue des notes que le pianiste original ne joue pas. »**
  - B6, C7, D7, E7, F7, G7, A7 et B7 s'allument simultanément : un son faux, très audible.
  - À 40 s, F7, G7, A7 et B7 restent encore allumées.
  - Tout redevient juste vers 42 s.
  - Il le classe « priorité à corriger ».
- « On peut retrouver dans les réponses de Copilot ce genre de message :
  `suggest_actions(actions=[{label: "Détaille les accords", message: "Plus de détails"},
  {label: "Rejoue le passage", message: "Rejoue ce passage"}])` ».

## Cause des notes fantômes
- **La lecture du clavier dessiné** (`key-detection.js`, `classifyTint`).
  - Une touche est « allumée » dès que sa couleur est saturée, quelle que soit la couleur.
  - Tout bandeau, logo, effet ou écran de fin coloré posé sur le clavier allume donc des
    touches.
  - Les blanches sont lues tout en bas, sous les noires : un bandeau en bas de l'image
    n'allume que des **blanches**. C'est son cas : Si6 → Si7, huit blanches voisines, qui
    s'éteignent par paquets, comme un bandeau qui glisse.
- **Le nettoyage des notes du prof** (`cleanTeacherNotes`, `teacher-activity.js`).
  - Il écartait les notes impossibles (plus de 10 ensemble, amas de demi-tons) seulement pour
    les notes **lues au son**.
  - Les notes lues à l'image étaient toutes gardées, puis rejouées par le Copilote.
- **Mesuré sur ses vrais relevés.**
  - « comment harmoniser rapidement » : à 9:37, **80 touches** s'allument d'un coup (l'écran de
    fin de la vidéo). La grille y avait un faux accord « C/C » de 82 touches.
  - En jeu réel, sur ce tuto et sur « L'Éternel est bon », jamais plus de **2** touches
    voisines ne sonnent ensemble.
  - Le relevé de la vidéo Cory Henry n'est pas dans ceux qu'il a envoyés : la cause y est
    déduite, puis reproduite dans le scénario « bandeau » ci-dessous.

## Fait
### Les notes fantômes
Dans `teacher-activity.js`, fonctions pures.
- **`readingArtifacts(notes, { source })`** renvoie `{ notes, zones }` :
  - **6 touches voisines ou plus** (chaque note à 1 ou 2 demi-tons de la suivante,
    `KEY_BLOCK`) forment un bloc écarté. Une main n'en couvre pas autant.
    - Lu à l'image : le bloc compte s'il **sonne** ensemble.
    - Lu au son : seulement s'il est **attaqué** ensemble. Une gamme tenue à la pédale reste.
  - À l'image, la **zone** du bloc (ses touches, de son début à sa fin, ±0,3 s) écarte aussi
    ce qui s'y rallume : un bandeau qui clignote.
  - Une attaque de **plus de 10 notes** est écartée, pour toutes les sources désormais. Elle
    est comptée après le retrait du bloc : l'accord joué au moment où le bandeau apparaît
    reste.
  - Les autres notes du même instant restent : la main gauche, un accord plus bas.
- **`cleanTeacherNotes`** l'applique d'abord, pour toutes les sources.
  - Il travaille sur les durées lues : un écran de fin allumé 10 s fait une zone de 10 s.
  - Puis il borne les durées, comme avant.
  - En profitent : le rejeu (« Rejoue ce passage »), les lignes du prof, la frise envoyée au
    Copilote, la structure et la bande « il joue ».
- **`segmentsWithoutArtifacts(segments, zones)`** et **`withoutReadingArtifacts(analysis)`** :
  la grille d'accords perd les touches de la zone. Un segment est renommé (`labelNotes`) ; un
  segment vidé est écarté.
- **`pedagogie-tab.js`, `readingInUse`** : appliqué aux deux endroits où un relevé devient
  courant (relevé gardé, analyse neuve).
  - Un relevé ancien est corrigé **sans refaire l'analyse**.
  - **Le fichier gardé n'est pas modifié** : on y garde ce qui a été lu.

### Le texte d'outil
Dans `copilot-client.js`.
- **`extractTextToolCalls(content)`** retire de la réponse les appels d'outil que le modèle y
  a écrits au lieu de les faire :
  - `suggest_actions(…)` et `functions.suggest_actions(…)` ;
  - un bloc `<tool_call>…</tool_call>` ;
  - un objet JSON `{"name": …}` ;
  - le même texte entre accents graves ou dans un bloc de code ;
  - une ligne qui n'était qu'un intitulé (« Suggestions : »).
- `suggest_actions` devient un **vrai appel** : ses boutons. Les arguments sont lus avec
  tolérance (`actions=[{label: …}]`, guillemets simples, appel mal fermé).
- Les autres outils écrits en texte sont seulement retirés. Le routage d'intention choisit
  l'exemple.
- **Branché dans `callChatCompletionOnce`** : chaque réponse du modèle, relances comprises.
  - Pas de doublon si le modèle a aussi fait l'appel.
  - Sans outils (repli après une erreur 400), les suggestions écrites deviennent quand même
    des boutons.
- **`copilot-tab.js`** : les réponses déjà gardées dans l'historique sont montrées sans
  l'appel.
- **Consignes** :
  - règle 14 : « appelle l'outil suggest_actions (un appel d'outil, jamais écrit dans le
    texte de ta réponse) » ;
  - sans outils : « n'écris jamais d'appel d'outil ».

## Vérifié
- **Tests** :
  - `test-teacher-activity.js` 48/48, dont 20 nouveaux contrôles :
    - son cas recréé : Si6 → Si7 écartés, ses deux accords gardés ;
    - le bandeau qui clignote ; un vrai amas de 5 touches gardé ; un écran entier écarté ;
    - au son : la gamme tenue gardée, le bloc attaqué écarté ;
    - plus de 10 notes ; la grille ;
    - ses relevés réels :
      - `fixtures/harmoniser-fin.json` (nouveau, sans chemin local) : l'écran de fin de 113
        notes écarté, ses 164 notes de jeu toutes gardées, le faux accord de la grille
        retiré ;
      - « L'Éternel est bon » : rien d'écarté.
  - `test-copilot-client.js` 231/231, dont 14 nouveaux contrôles ;
  - `test-pedagogie-dom.js` 174/174.
- **Sur ses relevés complets** :
  - « comment harmoniser rapidement » : 738 notes, 625 gardées. Les 113 écartées sont toutes
    l'écran de fin ; 134 segments, 133 gardés.
  - « L'Éternel est bon » (deux fois) : 155 sur 155 gardées.
- **Scénario Playwright `pedago-bandeau`**, nouvelle variante du faux electronAPI : clavier
  dessiné lu à l'image, boucle 2-5-1-6, bandeau Si6 → Si7 de 38 à 40/42 s. Sur la version
  poussée avant, son bug est reproduit :
  - « Rejoue ce passage » contenait [95 96 98 100 101 103 105 107] ;
  - la frise envoyée au Copilote citait « Si6 Do7 Ré7 Mi7 Fa7 Sol7 La7 Si7 » ;
  - la grille disait « Dm13/A » à 0:38 au lieu de A7♯9.

  Après la correction : aucune de ces notes, et la grille dit A7♯9.
- **Scénario `pedago-suggest-text`** : le faux Copilote répond avec sa phrase exacte.
  - Avant : l'appel s'affichait, sans bouton « Rejoue ce passage ».
  - Après : le message est propre et les boutons sont « Plus de détails » (une seule fois) et
    « Rejoue ce passage ». Le clic envoie « Rejoue ce passage », et l'historique envoyé au
    modèle est propre.
- Suite complète : 99 suites, seuls les 6 échecs anciens connus. Régressions Partie 1 et
  Partie 3, et build, OK.

## Limites
- Une vraie note jouée **dans** la zone du bandeau, à ce moment-là, est écartée avec lui. On ne
  peut pas les distinguer à l'image.
- Un bandeau qui n'allume pas 6 touches voisines (texte clairsemé, petit logo) n'est pas
  reconnu. Il reste écarté s'il allume plus de 10 touches d'un coup.
- **À confirmer** sur son vrai passage : le relevé gardé de la vidéo Cory Henry
  (`~/PianoJazzChords/Pedagogie/memoire/`) en ferait un test.
- Les « 2-3 petits détails » de la reproduction ne sont pas encore décrits : à lui demander.

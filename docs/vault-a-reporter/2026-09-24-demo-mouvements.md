# À reporter dans le vault — 2026-09-24 (nuit) : démo des mouvements

> Quatrième fichier du 24/09, à reporter après les trois autres de `docs/vault-a-reporter/`.
> Commits `ed92b01` (voicings enchaînés) et `3ca075d` (démo, sortie MIDI), branche
> `fix/exercices-voicing-correctifs`.

## `log.md` — entrée à ajouter

```markdown
## 2026-09-24 (nuit) — Démo des mouvements, voicings enchaînés, sortie MIDI
- Voicings enchaînés en Mouvement 12 tons (démo = exercice) : écart moyen entre accords
  15,7 → 9,7 demi-tons.
- Démo gospel / worship (« Écouter le mouvement », « Écouter » sur les cartes de la
  bibliothèque), jouée par le même chemin qu'un vrai clavier, jamais jugée par l'exercice.
- Sortie MIDI vers un VST (menu « Sortie », port virtuel « Piano Jazz Chords » sous Linux).
- Bugs corrigés : relecture de Session MIDI qui pouvait valider l'exercice ; touche
  relâchée pédale enfoncée qui restait tenue.
```

## `state/current-state.md` — à fusionner

- **Voicings de Mouvement 12 tons enchaînés** : chaque accord prend la variante (à l'octave
  près) qui bouge le moins depuis le précédent ; flèches ‹ › = variante fixée sur l'accord
  affiché, les suivants s'enchaînent à partir de lui.
- **Démo** : style Gospel / worship (72 à la noire, une mesure par accord) : basse en octaves,
  accords sur 2 et 4, pédale changée à chaque accord, approche chromatique de la basse et
  mouvement interne vers l'accord suivant, dernier accord arpégé. Voicings = ceux de l'exercice.
  Joue la tonalité en cours ; la carte suit l'accord joué.
- **Sortie MIDI** : menu « Sortie » du pied de page ; la démo et « Écouter » y envoient leurs
  notes, le piano intégré se tait. Port virtuel « Piano Jazz Chords » hors Windows (Windows :
  câble virtuel type loopMIDI nécessaire).
- **Son** : piano intégré = échantillons Salamander (CC BY 3.0, crédits dans
  `assets/piano-samples/CREDITS.md`).

## `state/current-work.md` — à vérifier sur le PC (Electron réel)

1. Exercices → Mouvement 12 tons → « Écouter le mouvement » : la démo joue, les touches
   s'allument, la carte suit, l'exercice n'avance pas, retour à l'accord de départ.
2. Bibliothèque → « Écouter » sur une carte : aperçu sans choisir le mouvement.
3. Pied de page → Sortie → « Port virtuel « Piano Jazz Chords » » ; dans l'hôte du VST
   (Carla, Reaper, Ardour…), brancher ce port en entrée → la démo joue sur le VST.
4. Jouer une note au clavier pendant la démo → elle s'arrête.
5. Pédale : relâcher une touche pédale enfoncée, relever la pédale → la touche s'éteint.

## `state/next-actions.md` — à ajouter

- Autres styles de démo (Ballade, Comping swing, Plaqué) et réglage du tempo.
- Démo sur plusieurs tonalités à la suite ? (aujourd'hui : la tonalité en cours).
- Aperçu de « Ma grille » avant de la lancer.

## `decisions/` — une décision (numéro à attribuer)

### Démo des mouvements : nos voicings, écrits, jamais importés

- **Contexte** : Narcisse veut entendre un mouvement avant de le travailler, avec ses propres
  voicings, sur son VST, et craint le droit d'auteur si l'on reprend des démos d'Internet.
- **Décision** : la démo est écrite par l'application d'après des procédés courants (les
  grilles et procédés ne sont pas protégés, les enregistrements et transcriptions si) ; elle
  joue les voicings de l'exercice, désormais enchaînés d'un accord à l'autre (démo = exercice) ;
  son = piano Salamander (CC BY) ou VST via la sortie MIDI. Style v1 : Gospel / worship.

## Contraintes relevées (pour mémoire)

- La session cloud ne peut pas lire les sites de démos (réseau filtré) : aucune démo n'en est
  tirée, les procédés sont écrits d'après la pratique courante.
- La démo ne doit pas faire avancer l'exercice : la détection différée (80 ms) contournait le
  garde-fou existant, corrigé.
- La transposition d'affichage est compensée : la démo sonne à sa hauteur écrite.
- Le jeu de l'utilisateur n'est pas renvoyé sur la sortie MIDI (son VST le reçoit déjà de son
  clavier : sinon doublon).
- Windows : RtMidi n'y crée pas de port virtuel → câble virtuel (loopMIDI) à installer.

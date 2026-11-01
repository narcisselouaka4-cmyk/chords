# Définitions formelles des familles de voicings

Ce document est la source de vérité musicale. Chaque générateur et chaque validateur doit implémenter exactement la définition de sa famille. Une famille non conforme à sa définition est marquée `—` plutôt qu'affichée.

## Conventions communes

- **Rôles** : root, third, fifth, seventh, ninth, eleventh, thirteenth.
- **Résolution des rôles** : à partir des intervalles bruts de la définition canonique de l'accord (`resolveCanonicalChordDefinition`), jamais par simple modulo 12.
- **Tessitures** : LH `[28, 59]`, RH `[48, 88]` (voir `hand-ranges.js`).
- **Basse slash externe** : un `bassPc` différent de `rootPc` est considéré comme une note extérieure à l'accord ; elle ne compte pas comme voix du close ni du 4-way.
- **Comptage des voix** : nombre de pitch classes distinctes, sauf indication contraire.
- **Continuité de registre** : pour chaque main, toute octave comprise entre la note la plus basse et la note la plus haute de cette main doit contenir au moins une note. Le passage entre LH et RH est un changement de main, pas un trou de registre. Les familles à justification musicale explicite de trou d'octave interne (stride, walking bass) peuvent désactiver cette règle via `allowsRegisterGaps`.

---

## 1. Shell

**FAMILY**: `shell`

**DEFINITION**: Voicing guide-tone. La main gauche joue la fondamentale (ou la basse slash). La main droite joue la tierce et la septième ; une extension caractéristique (9e, 11e ou 13e) ou la quinte peut être ajoutée si elle appartient à l'accord.

**INPUT REQUIREMENTS**:
- L'accord possède une tierce et une septième (`hasThirdAndSeventh`).

**NUMBER OF VOICES**:
- LH : exactement 1 note.
- RH : 2 à 4 notes.
- Total : 3 à 5 notes.

**CONSTRUCTION ALGORITHM**:
1. LH = note MIDI la plus basse possible pour `rootPc` (ou `bassPc`) dans la tessiture LH, au moins une octave sous le RH.
2. RH rôles de base = `[third, seventh]`.
3. Si `ninth` existe, ajouter `ninth`. Sinon si `thirteenth` existe, ajouter `thirteenth`. Sinon si `eleventh` existe, ajouter `eleventh`. Sinon si `fifth` existe, ajouter `fifth`.
4. Convertir les rôles en pitch classes et construire un close au-dessus de la LH, span RH ≤ 12.

**VALIDATION RULES**:
- LH contient exactement 1 note et c'est `rootPc` ou `bassPc`.
- RH contient `third` et `seventh`.
- Notes du RH dans l'accord.
- Pas de doublure intra-main.
- Span RH ≤ 12.
- Pas de croisement LH/RH.

**APPLICABILITY**: `hasThirdAndSeventh(input)`.

---

## 2. Two-Note Shell

**FAMILY**: `twoNoteShell`

**DEFINITION**: Version minimale du Shell : basse en LH, guide tones (tierce + septième) seuls en RH.

**INPUT REQUIREMENTS**:
- L'accord possède une tierce et une septième.

**NUMBER OF VOICES**:
- LH : 1 note.
- RH : 2 notes.
- Total : 3 notes.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse dans tessiture LH.
2. RH = `[third, seventh]` en close au-dessus de la LH.

**VALIDATION RULES**:
- LH == 1 note == root/bass.
- RH == 2 notes == third et seventh.
- Span RH ≤ 12.
- Pas de croisement.

**APPLICABILITY**: `hasThirdAndSeventh(input)`.

---

## 3. Rootless A

**FAMILY**: `rootlessA`

**DEFINITION**: Voicing rootless type A (Kenny Barron). Structure 3e-5e-7e-9e empilée en close dans la main droite, pas de fondamentale.

**INPUT REQUIREMENTS**:
- L'accord possède une tierce, une septième et une neuvième.

**NUMBER OF VOICES**:
- LH : 0 note.
- RH : exactement 4 notes.

**CONSTRUCTION ALGORITHM**:
1. Sélectionner les rôles `[third, fifth, seventh, ninth]`.
2. Si `fifth` est absente, la famille n'est pas applicable.
3. Construire un close RH avec `third` en bas, puis `fifth`, `seventh`, `ninth`.

**VALIDATION RULES**:
- `lh.notes.length === 0`.
- Aucune note n'est `rootPc`.
- RH contient exactement 4 pitch classes : third, fifth, seventh, ninth.
- RH span ≤ 12.
- Ordre ascendant : third < fifth < seventh < ninth (en termes de rôles, pas nécessairement de demi-tons stricts).

**APPLICABILITY**: `hasThirdAndSeventh(input) && hasNinth(input)`.

---

## 4. Rootless B

**FAMILY**: `rootlessB`

**DEFINITION**: Voicing rootless type B centré sur la septième. Structure 7e-3e-5e-9e en close, pas de fondamentale, septième en bas.

**INPUT REQUIREMENTS**:
- L'accord possède une tierce, une septième et une neuvième.

**NUMBER OF VOICES**:
- LH : 0 note.
- RH : exactement 4 notes.

**CONSTRUCTION ALGORITHM**:
1. Sélectionner les rôles `[seventh, third, fifth, ninth]`.
2. Si `fifth` est absente, la famille n'est pas applicable.
3. Construire un close RH avec `seventh` en bas, puis `third`, `fifth`, `ninth`.

**VALIDATION RULES**:
- `lh.notes.length === 0`.
- Aucune note n'est `rootPc`.
- RH contient exactement 4 pitch classes : seventh, third, fifth, ninth.
- RH span ≤ 12.
- La note la plus grave du RH est `seventh`.

**APPLICABILITY**: `hasThirdAndSeventh(input) && hasNinth(input)`.

---

## 5. Close

**FAMILY**: `close`

**DEFINITION**: Empilement compact de notes de l'accord dans une octave, fondamentale comprise par défaut, extensions ajoutées selon les règles d'omission jazz.

**INPUT REQUIREMENTS**:
- L'accord possède au moins 3 notes distinctes.

**NUMBER OF VOICES**:
- LH : 1 note (fondamentale/basse).
- RH : 3 à 6 notes.
- Total : 4 à 7 notes.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse.
2. Sélectionner les rôles par priorité : `root, third, fifth, seventh, ninth, eleventh, thirteenth`.
3. Omettre `fifth` si `seventh` ou une extension (9/11/13) est présente et que l'accord a plus de 4 notes.
4. Si le nombre de rôles sélectionnés excède 6, supprimer les moins essentiels dans l'ordre : 11e, 13e, 9e.
5. Construire un close RH en ordre chromatique ascendant à partir de `rootPc`, au-dessus de la LH, span ≤ 12.

**VALIDATION RULES**:
- LH == 1 note == root/bass.
- RH contient `root` et `third` (sauf accord à 3 notes sans root ? non, ici root toujours présent).
- Toutes les notes du RH appartiennent à l'accord.
- Span RH ≤ 12.
- Pas de doublure intra-main.
- Pas de croisement.

**APPLICABILITY**: `input.chordTonePcs.length >= 3`.

---

## 6. 4-Way Close

**FAMILY**: `fourWayClose`

**DEFINITION**: Close exactement à 4 voix réelles. Par défaut root-3-5-7. La 5e peut être omise/remplacée par une seule extension caractéristique si l'accord est riche, mais la fondamentale est conservée.

**INPUT REQUIREMENTS**:
- L'accord possède au moins 4 notes distinctes.
- L'accord possède une tierce et une septième.

**NUMBER OF VOICES**:
- LH : 1 note (fondamentale/basse).
- RH : exactement 4 notes.
- Total : 5 notes.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse.
2. Rôles de base = `[root, third, fifth, seventh]`.
3. Si `fifth` est absente ou si l'accord contient 9/11/13, remplacer `fifth` par la meilleure extension disponible dans l'ordre : `ninth, thirteenth, eleventh`.
   - Si `fifth` existe et qu'il n'y a pas d'extension, conserver `fifth`.
   - Si `fifth` existe mais qu'une extension est présente, préférer l'extension (omission de la 5e classique en jazz).
4. Convertir en pitch classes. S'il y a moins de 4 rôles distincts, la famille n'est pas applicable.
5. Construire un close RH à partir de `rootPc`, span ≤ 12.

**VALIDATION RULES**:
- 4 pitch classes distinctes (hors basse slash externe).
- Span RH ≤ 12.
- Le close contient `root`, `third` et `seventh`.
- La 4e note est soit `fifth` soit une extension autorisée (9/11/13).
- Pas de doublure intra-main.
- Pas de croisement.

**APPLICABILITY**: `hasThirdAndSeventh(input) && hasAtLeastFourNotes(input)`.

---

## 7. Drop 2

**FAMILY**: `drop2`

**DEFINITION**: Dérivation d'un 4-Way Close valide. La 2e voix depuis le haut du close est descendue d'une octave et placée en main gauche (avec la fondamentale si elle n'était pas déjà en LH).

**INPUT REQUIREMENTS**:
- Un 4-Way Close peut être construit.

**NUMBER OF VOICES**:
- LH : 2 notes (fondamentale + note descendue) si pas de basse slash externe ; 1 note sinon.
- RH : 3 notes.
- Total : 5 notes réelles (4 + basse).

**CONSTRUCTION ALGORITHM**:
1. Générer un 4-Way Close valide (le "close parent").
2. Trier les 4 notes du close par hauteur.
3. Identifier la 2e note depuis le haut = `close[2]` (index 2 dans un tableau de 4 trié).
4. Descendre cette note d'une octave en LH.
5. LH = `[fondamentale, noteDescendue]` trié.
6. RH = les 3 notes restantes du close triées.

**VALIDATION RULES**:
- 4 pitch classes distinctes (hors basse slash externe).
- En remontant les notes LH (hors basse fondamentale) d'une octave et en les fusionnant avec RH, on obtient exactement le close parent (mêmes 4 notes, span ≤ 12).
- La note descendue correspond à la 2e voix depuis le haut du close parent.
- Pas de croisement.

**APPLICABILITY**: `hasThirdAndSeventh(input) && hasAtLeastFourNotes(input)`.

---

## 8. Drop 3

**FAMILY**: `drop3`

**DEFINITION**: Dérivation d'un 4-Way Close valide. La 3e voix depuis le haut du close (c'est-à-dire la 2e depuis le bas) est descendue d'une octave et placée en main gauche avec la fondamentale. Le résultat met 2 notes en main gauche et 2 notes en main droite.

**INPUT REQUIREMENTS**:
- Un 4-Way Close peut être construit.

**NUMBER OF VOICES**:
- LH : 2 notes (fondamentale + note descendue).
- RH : 2 notes.
- Total : 4 voix réelles.

**CONSTRUCTION ALGORITHM**:
1. Générer un 4-Way Close valide (le "close parent").
2. Trier les 4 notes du close par hauteur : v0 (basse), v1, v2, v3 (haut).
3. Descendre v1 (3e voix depuis le haut) d'une octave.
4. LH = `[fondamentale, v1 - 12]` trié.
5. RH = `[v2, v3]` trié.

**VALIDATION RULES**:
- 4 pitch classes distinctes (hors basse slash externe).
- En remontant les notes LH (hors basse fondamentale) d'une octave et en les fusionnant avec RH, on obtient exactement le close parent (mêmes 4 notes, span ≤ 12).
- La note descendue correspond à la 3e voix depuis le haut (2e depuis le bas) du close parent.
- Pas de croisement.

**APPLICABILITY**: `hasThirdAndSeventh(input) && hasAtLeastFourNotes(input)`.

---

## 9. Block / Locked Hands

**FAMILY**: `block`

**DEFINITION**: Empilement close sur 5 voix réelles réparties entre les deux mains : les 2 notes les plus graves en main gauche, les 3 notes les plus aiguës en main droite. Le span total ne dépasse pas une octave. C'est le son "locked hands" des big bands.

**INPUT REQUIREMENTS**:
- L'accord possède au moins 5 notes distinctes.

**NUMBER OF VOICES**:
- LH : 2 notes.
- RH : 3 notes.
- Total : 5 voix réelles distinctes.

**CONSTRUCTION ALGORITHM**:
1. Sélectionner 5 rôles parmi les notes de l'accord par priorité : root, third, seventh, ninth, eleventh, thirteenth, fifth.
2. Omettre la quinte si une extension plus caractéristique est disponible.
3. Construire un close compact (span ≤ 12) à partir de la note la plus basse.
4. LH = 2 notes les plus graves du close.
5. RH = 3 notes les plus aiguës du close.
6. Vérifier que les tessitures LH/RH sont respectées et qu'il n'y a pas de croisement.

**VALIDATION RULES**:
- 5 pitch classes distinctes.
- Span total (toutes notes confondues) ≤ 12.
- LH contient exactement 2 notes, RH exactement 3 notes.
- Pas de croisement.

**APPLICABILITY**: `input.chordTonePcs.length >= 5`.

---

## 10. Stride

**FAMILY**: `stride`

**DEFINITION**: Basse lointaine en main gauche (souvent une octave ou plus sous l'accord) + accord compact en main droite. La grande distance entre les mains est intentionnelle et justifiée musicalement (style stride piano).

**INPUT REQUIREMENTS**:
- L'accord possède au moins 4 notes distinctes.

**NUMBER OF VOICES**:
- LH : 1 note (basse).
- RH : 3 à 5 notes en close compact.
- Total : 4 à 6 voix.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse dans la tessiture LH basse.
2. RH = close compact des notes restantes au-dessus de la LH avec un écart significatif.

**VALIDATION RULES**:
- LH == 1 note fondamentale/basse.
- RH forme un close (span ≤ 12).
- L'écart LH max / RH min est important (≥ 12 demi-tons). C'est le marqueur du stride.
- Pas de croisement.
- La continuité de registre intra-main est vérifiée, mais le grand trou entre les mains est autorisé (`allowsRegisterGaps`).

**APPLICABILITY**: `input.chordTonePcs.length >= 4`.

---

## 11. Open

**FAMILY**: `open`

**DEFINITION**: Dérivé d'un close : une ou deux voix sont déplacées d'une octave pour élargir la sonorité, sans atteindre l'étalement extrême du Spread. Le résultat garde une cohérence close avec des écarts sélectifs.

**INPUT REQUIREMENTS**:
- L'accord possède au moins 4 notes distinctes.

**NUMBER OF VOICES**:
- LH : 1 à 2 notes.
- RH : 2 à 4 notes.
- Total : 4 à 6 voix.

**CONSTRUCTION ALGORITHM**:
1. Construire un close valide de l'accord.
2. Descendre la voix la plus haute d'une octave en RH, ou monter la voix la plus basse du RH d'une octave.
3. Garder une structure où chaque main reste continue.

**VALIDATION RULES**:
- Toutes les notes appartiennent à l'accord.
- Pas de doublure intra-main.
- Pas de croisement.
- Le span intra-main de chaque main reste ≤ 12.
- Au moins un écart d'une octave est introduit par rapport au close parent.

**APPLICABILITY**: `input.chordTonePcs.length >= 4`.

---

## 12. Spread

**FAMILY**: `spread`

**DEFINITION**: Voix étalées sur plusieurs octaves. Chaque note de l'accord est placée dans une octave différente, créant une texture très aérée. Le span total peut dépasser 2 octaves.

**INPUT REQUIREMENTS**:
- L'accord possède au moins 4 notes distinctes.

**NUMBER OF VOICES**:
- LH : 1 à 2 notes.
- RH : 2 à 4 notes.
- Total : 4 à 6 voix.

**CONSTRUCTION ALGORITHM**:
1. Placer la basse en LH.
2. Distribuer les notes restantes sur plusieurs octaves en RH de manière à ce que chaque note successive soit dans une octave supérieure ou du moins avec un écart d'octave.

**VALIDATION RULES**:
- Toutes les notes appartiennent à l'accord.
- Pas de doublure intra-main.
- Pas de croisement.
- Chaque main est continue (`allowsRegisterGaps` désactivé pour chaque main).
- Le span total est supérieur à une octave (> 12) et les voix sont réparties sur au moins 3 octaves différentes.

**APPLICABILITY**: `input.chordTonePcs.length >= 4`.

---

## 13. Quartal

**FAMILY**: `quartal`

**DEFINITION**: Empilement d'intervalles de quartes justes (5 demi-tons) ou tritonus (6 demi-tons). Typique des accords suspendus et des sonorités modales. La structure n'est pas nécessairement liée aux rôles harmoniques classiques (3e, 7e...).

**INPUT REQUIREMENTS**:
- L'accord possède au moins 3 notes distinctes.
- La qualité est de type sus4, m11, m7sus4, 7sus4, ou l'accord contient une 4e/11e.

**NUMBER OF VOICES**:
- LH : 1 note (basse fondamentale).
- RH : 3 à 5 notes formant une chaine de quartes.
- Total : 4 à 6 voix.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse.
2. Choisir une note de l'accord comme première note du stack quartal au-dessus de la LH (souvent la 4e ou la 7e).
3. Construire une chaine montante d'intervalles de 4e juste / 4e augmentée à partir de cette note, en utilisant uniquement des notes appartenant à l'accord.
4. Arrêter quand on a 3 à 5 notes ou quand on dépasse la tessiture RH.

**VALIDATION RULES**:
- Toutes les notes appartiennent à l'accord.
- LH == 1 note fondamentale/basse.
- Pas de doublure intra-main.
- Pas de croisement.
- Le RH forme une chaine de quartes : écarts entre notes consécutives de 5, 6, 7 demi-tons (4e juste/augm/dim).

**APPLICABILITY**: accord contenant une 11e/sus4 ou qualité compatible (sus4, 11, m11, 7sus4, etc.).

---

## 14. So What

**FAMILY**: `soWhat`

**DEFINITION**: Stack quartal décalé, célèbre voicing de Miles Davis "So What" : deux quartes avec la tierce en bas. Structure [3e, 4e juste supérieure, 4e juste supérieure] par rapport à la fondamentale, i.e. [third, sixth/ninth, root au-dessus] selon le mode.

**INPUT REQUIREMENTS**:
- L'accord est de type m7 ou m9 sans altération (sonorité doriennne/modale).

**NUMBER OF VOICES**:
- LH : 1 note (fondamentale, très basse).
- RH : 3 notes formant le stack quartal décalé.
- Total : 4 voix.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse.
2. RH = [tierce, sixte/neuvième, quinte/4e du mode supérieure] en close quartal.

**VALIDATION RULES**:
- Accord de type m7/m9.
- LH fondamentale, RH 3 notes.
- RH forme un stack quartal : intervalles de 5 ou 6 demi-tons entre notes successives.
- Pas de croisement.

**APPLICABILITY**: qualité `m7` ou `m9` sans altération, et accord possède au moins 4 notes.

---

## 15. Upper Structure

**FAMILY**: `upperStructure`

**DEFINITION**: Triade (majeure, mineure, diminuée ou augmentée) superposée au-dessus d'une fondamentale, de sorte que les notes de la triade forment des extensions et altérations par rapport à l'accord de base. Exemple : sur C7, triade D♭ majeur = D♭-F-A♭ = b9-3-b13.

**INPUT REQUIREMENTS**:
- L'accord est un accord dominaint 7alt, 7#9, 7#11, 7b9, 7b13, 13#11, etc.
- L'accord possède au moins 4 notes distinctes.

**NUMBER OF VOICES**:
- LH : 1 note (fondamentale).
- RH : 3 notes (triade superposée).
- Total : 4 voix.

**CONSTRUCTION ALGORITHM**:
1. LH = fondamentale/basse.
2. Chercher parmi les triades majeures/mineures/dis/dim/aug possibles celle dont les 3 notes appartiennent toutes à l'accord (en tant qu'extensions/altérations).
3. Placer la triade en close au-dessus de la LH.

**VALIDATION RULES**:
- LH == 1 note fondamentale.
- RH == 3 pitch classes distinctes appartenant à l'accord.
- RH forme un close (span ≤ 12).
- Les 3 notes du RH forment une triade majeure, mineure, diminuée ou augmentée.
- Pas de croisement.

**APPLICABILITY**: accord dominant altéré (7alt, 7#9, 7#11, 7b9, 7b13, etc.) avec au moins 4 notes.

---

## 16. Familles volontairement non implémentées

Certaines familles théoriques ne sont pas applicables dans le modèle actuel (basse externe + voix internes) sans créer des doublons de fondamentale ou des définitions ambiguës. Elles restent enregistrées comme `available: false` en attendant une définition formelle clarifiée :

- `drop2Plus4` : descendre la 2e et la 4e voix depuis le haut d'un close implique de descendre la voix la plus basse du close, qui est déjà la basse fondamentale dans notre modèle (doublon LH interdit par `validateNoUselessNotes`).

Critère dur : **une famille n'est affichée que si son validateur musical passe.**
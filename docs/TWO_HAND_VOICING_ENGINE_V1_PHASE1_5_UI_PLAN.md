# Two-Hand Piano Voicing Engine V1 — Phase 1.5 : Read-Only Close Voicing Preview (UI)

> **Nature du document :** plan uniquement. Aucun fichier de code ne doit être modifié ni créé à ce stade.  
> **Projet :** Piano Jazz Chords  
> **Contexte :** la Phase 1 (générateur Close stateless) et la Phase 1.1 (vocabulaire supporté) sont terminées et archivées. La Phase 1.5 ne concerne **que** la prévisualisation en lecture seule du voicing Close dans l’onglet Analyse.

---

## 1. Objectif de la Phase 1.5

Offrir à l’utilisateur, dans l’onglet Analyse, une **prévisualisation immédiate et en lecture seule** du voicing Close généré pour le segment actif, sans modifier le générateur, sans ajouter de contrôles, et sans permettre d’édition.

La Phase 1.5 est scindée en deux sous-phases strictement séparées :

- **Phase 1.5A** : affichage **textuel** LH / RH uniquement.
- **Phase 1.5B** : superposition **visuelle** des notes sur le **grand clavier existant** (`#hero-keyboard`).

---

## 2. Règles conceptuelles fixes

### 2.1 `voicing-both` est défini par un même numéro MIDI exact

Une touche du clavier est marquée `voicing-both` **si et seulement si** le même numéro MIDI apparaît à la fois dans `leftHand` et dans `rightHand` du résultat `generateVoicing()`.

```text
both(midi) ⇔ leftHand.some(n => n.midi === midi) && rightHand.some(n => n.midi === midi)
```

**Conséquence importante :** deux notes de même pitch class mais d’octaves différentes ne sont **jamais** `both`. Exemple : C3 dans la main gauche et C4 dans la main droite produisent deux touches distinctes : C3 = `voicing-lh`, C4 = `voicing-rh`.

### 2.2 Duplication inter-mains de pitch class ≠ `voicing-both`

La métadonnée `interHandDoubledPitchClasses` (si elle existe un jour) indique qu’un pitch class est présent dans les deux mains, possiblement à des octaves différentes. Elle ne doit **pas** colorer des touches distinctes en `voicing-both`.

| Main gauche | Main droite | Touches attendues |
|-------------|-------------|-------------------|
| C3 (midi 48) | C4 (midi 60) | C3 = `voicing-lh`, C4 = `voicing-rh` (pas de `both`) |
| C3 (midi 48) | C3 (midi 48) | C3 = `voicing-both` |

### 2.3 Basse slash et priorité visuelle

Pour chaque touche du clavier, la classification est appliquée touche par touche selon la priorité suivante, de la plus forte à la plus faible :

1. Note jouée en live (MIDI externe ou souris) : garde sa couleur live existante.
2. Même MIDI exact dans LH et RH : `voicing-both`.
3. Le MIDI exact correspond à la basse slash (`metadata.slashBassMidi === midi`) : `voicing-bass`.
4. Le MIDI exact est dans `leftHand` : `voicing-lh`.
5. Le MIDI exact est dans `rightHand` : `voicing-rh`.
6. Aucun des cas ci-dessus : pas de classe voicing (touche normale ou `voicing-unavailable` si la fonctionnalité d’indisponibilité est active).

La basse slash n’est **jamais** considérée comme `voicing-both` à cause de sa présence dans les deux mains à des octaves différentes.

### 2.4 Notes indisponibles (textuelles uniquement en 1.5A)

Dans la vue textuelle 1.5A, les notes théoriques de l’accord qui ne sont pas réalisées dans le voicing (omissions, extensions non supportées) peuvent être affichées avec l’état `unavailable`. Cela ne concerne **pas** le clavier.

---

## 3. Phase 1.5A — Vue textuelle LH / RH

### 3.1 Périmètre strict

- **Uniquement** un bloc textuel sous `#analyzer-hero`.
- **Aucun mini-clavier** dédié.
- **Aucune coloration** du grand clavier `#hero-keyboard`.
- **Aucun contrôle** (pas de sélecteur de style, pas de bouton Play, pas d’alternatives).
- Affichage en lecture seule.

### 3.2 Insertion dans le DOM

Ajouter un conteneur dans `src/index.html` :

```html
<div id="analyzer-voicing-preview" class="voicing-preview-panel" aria-live="polite"></div>
```

Positionné sous `#analyzer-hero`, dans la colonne de l’onglet Analyse.

### 3.3 Module créé

Créer `src/ui/voicing-preview.js` avec une unique fonction pour la Phase 1.5A :

```js
/**
 * Met à jour la vue textuelle du voicing Close pour le segment courant.
 * @param {VoicingResult|null} voicingResult — résultat déjà calculé, ou null pour vider.
 */
export function updateVoicingTextPreview(voicingResult) { /* … */ }
```

### 3.4 Recalcul au changement de position

Dans `src/ui/analyzer-tab.js`, à la fin de `updatePlaybackPosition()` :

```js
const segment = getSegmentAtTime(currentTime);
const result = segment ? generateVoicing(segment.effectiveChord) : null;
updateVoicingTextPreview(result);
```

`effectiveChord` est la source de vérité (`manualOverride ?? detectedChord`).

### 3.5 Contenu affiché

Pour un résultat valide, afficher :

```text
Voicing Close
Main gauche :  E2
Main droite :  G3  C4  E4
```

Les noms de notes incluent l’octave (ex. `E2`, `G3`, `C4`).

Si l’option utilisateur préfère les bémols, les notes s’affichent `Eb`, `Ab`, etc. ; sinon dièses. L’identité musicale (pitch class / MIDI) reste inchangée ; seul le **label affiché** change.

### 3.6 États additionnels affichés en 1.5A

- `Inversion : basse slash` si `metadata.inversion === 'basse slash'`.
- `Mode : rootless` si `metadata.rootless === true`.
- `Notes omises : …` si `metadata.omittedTones` est non vide.
- `Non supporté` si `result.ok === false`.

---

## 4. Phase 1.5B — Overlay sur le grand clavier existant

### 4.1 Périmètre strict

- **Aucun second appel à `generateVoicing()`**.
- Le résultat déjà calculé pour la Phase 1.5A est réutilisé.
- Deux fonctions dédiées dans `src/ui/voicing-preview.js` :

```js
export function renderVoicingKeyboardOverlay(voicingResult) { /* … */ }
export function clearVoicingKeyboardOverlay() { /* … */ }
```

### 4.2 Règle de mise à jour

Lorsque `updatePlaybackPosition()` recalcule le voicing :

```js
if (result && result.ok) {
  renderVoicingKeyboardOverlay(result);
} else {
  clearVoicingKeyboardOverlay();
}
```

### 4.3 Sélecteurs CSS

Ajouter dans `src/style.css` les classes suivantes **uniquement** pour l’overlay :

```css
.key.voicing-lh { /* main gauche */ }
.key.voicing-rh { /* main droite */ }
.key.voicing-both { /* même MIDI exact dans LH et RH */ }
.key.voicing-bass { /* basse slash exacte */ }
.key.voicing-unavailable { /* note théorique non jouée, optionnel */ }
```

### 4.4 Pas de second clavier

Le petit clavier harmonique existant (affichage des pitch classes de l’accord effectif) reste **inchangé**. L’overlay Phase 1.5B ne s’applique qu’au grand clavier `#hero-keyboard`.

### 4.5 Interaction avec les notes live

Si l’utilisateur joue une note en live (MIDI ou souris), cette note garde sa couleur live et n’est pas écrasée par `voicing-lh/rh/both/bass`. Dès que la note live est relâchée, l’overlay voicing se restaure automatiquement pour ce MIDI (puisque l’état live disparaît).

---

## 5. Exemples concrets et contraintes de vérification

### 5.1 C/E (C majeur, basse E)

- Pitch classes : C(0), E(4), G(7)
- Basse slash : E
- Voicing Close attendu :
  - LH : E2 (midi 40)
  - RH : G3 (midi 55), C4 (midi 60), E4 (midi 64)
- **Vérification :** aucune touche `voicing-both` (E2 ≠ E4, C4 n’est pas dans LH).

### 5.2 C/G (C majeur, basse G)

- Pitch classes : C(0), E(4), G(7)
- Basse slash : G
- Voicing Close attendu :
  - LH : G2 (midi 43)
  - RH : C4 (midi 60), E4 (midi 64), G4 (midi 67)
- **Vérification :** aucune touche `voicing-both`.

### 5.3 G7/B (G7, basse B)

- Pitch classes : G(7), B(11), D(2), F(5)
- Basse slash : B
- Voicing Close attendu :
  - LH : B1 (midi 35)
  - RH : D3 (midi 50), F3 (midi 53), G3 (midi 55), B3 (midi 59)
- **Vérification :** aucune touche `voicing-both`. B1 ≠ B3.

### 5.4 Même pitch class dans deux octaves (cas interdit pour `both`)

- Hypothèse artificielle : LH = C3 (48), RH = C4 (60), E4 (64), G4 (67).
- Résultat attendu : C3 = `voicing-lh`, C4 = `voicing-rh`. Pas de `voicing-both`.

### 5.5 Même MIDI exact dans les deux mains (cas autorisé pour `both`)

- Hypothèse artificielle : LH = C3 (48), RH = C3 (48), E3 (52), G3 (55).
- Résultat attendu : C3 = `voicing-both`.

### 5.6 Amaj7 avec préférence enharmonique

- Pitch classes : A(9), C#(1), E(4), G#(8)
- Voicing Close attendu (préférence dièses) :
  - LH : A2 (midi 45)
  - RH : C#4 (midi 61), E4 (midi 64), G#4 (midi 68), A4 (midi 69)
- Si la préférence utilisateur est bémols, les labels affichés deviennent `Db4`, `Gb4`, etc., mais les MIDI restent **61, 64, 68, 69**.

---

## 6. Flux d’intégration

```text
updatePlaybackPosition()
        │
        ▼
   segment = getSegmentAtTime(currentTime)
        │
        ▼
   effectiveChord = segment.manualOverride ?? segment.detectedChord
        │
        ▼
   voicingResult = generateVoicing(effectiveChord)
        │
        ├─────► updateVoicingTextPreview(voicingResult)   [Phase 1.5A]
        │
        └─────► renderVoicingKeyboardOverlay(voicingResult)  [Phase 1.5B]
```

**Règle absolue :** `generateVoicing()` est appelé **une seule fois** par mise à jour de position. Le même objet `voicingResult` est passé aux deux fonctions d’affichage.

---

## 7. Tests et invariants bloquants

### 7.1 Invariants à vérifier manuellement ou via tests futurs

1. Pour `C/E`, `C/G` et `G7/B`, le rendu clavier ne contient **aucune** touche `voicing-both`.
2. Deux notes de même pitch class mais d’octaves différentes (ex. C3 et C4) ne produisent jamais `voicing-both`.
3. Un MIDI exact identique dans LH et RH produit bien `voicing-both`.
4. La basse slash exacte (ex. E2 pour C/E) est classée `voicing-bass`, et non `voicing-both`.
5. La Phase 1.5A ne contient **ni mini-clavier, ni coloration du grand clavier**.
6. La Phase 1.5B ne rappelle pas `generateVoicing()` ; elle réutilise le résultat de la Phase 1.5A.
7. Le petit clavier harmonique existant reste inchangé.
8. Une note live garde sa couleur live et restaure l’overlay voicing après relâchement.
9. Le passage d’un accord slash à un accord non-slash nettoie correctement les classes CSS précédentes.
10. L’exemple `Amaj7` utilise les MIDI 45, 61, 64, 68, 69 et respecte la préférence enharmonique pour l’affichage textuel.

### 7.2 Scénarios de transition

| Transition | Comportement attendu |
|------------|----------------------|
| Aucun segment → segment valide | texte et overlay apparaissent |
| Segment valide → aucun segment | texte vide, overlay retiré |
| Accord sans basse slash → accord slash | anciennes classes voicing supprimées, nouvelle basse mise en évidence |
| Note live pressée sur un MIDI voicing | couleur live prioritaire, overlay masqué temporairement sur cette touche |
| Note live relâchée | overlay voicing restauré |

---

## 8. Livrables et sortie

### 8.1 Livrables de la Phase 1.5 (plan)

1. Ce document validé et corrigé.
2. Plan d’implémentation Phase 1.5A prêt.
3. Plan d’implémentation Phase 1.5B prêt.

### 8.2 Non-livrables à ce stade

- Aucun fichier `.js` n’est créé.
- Aucun fichier `.css` n’est modifié.
- Aucun fichier `.html` n’est modifié.
- Aucun commit n’est réalisé.

---

## 9. Glossaire des termes critiques

| Terme | Définition dans ce plan |
|-------|-------------------------|
| `voicing-both` | Même numéro MIDI exact présent dans `leftHand` et `rightHand`. |
| `voicing-bass` | Numéro MIDI exact qui correspond à la basse slash (`metadata.slashBassMidi`). |
| `voicing-lh` | Numéro MIDI exact uniquement dans `leftHand`. |
| `voicing-rh` | Numéro MIDI exact uniquement dans `rightHand`. |
| `interHandDoubledPitchClasses` | Métadonnée indiquant qu’un pitch class est présent dans les deux mains, **sans impliquer** `voicing-both`. |
| `#hero-keyboard` | Grand clavier existant de l’onglet Analyse. |
| petit clavier harmonique | Vue compacte des pitch classes de l’accord effectif, inchangée en 1.5B. |

---

TWO_HAND_VOICING_ENGINE_V1_PHASE1_5_UI_PLAN_CORRECTED_READY

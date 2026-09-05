# EXP-040 — Basculer le défaut production vers `posthoc_discriminator`

## Contexte
EXP-039 a confirmé que la production tournait en mode `baseline` (défaut Python jamais surchargé côté UI). Or `posthoc_discriminator` est fiable à 100% sur B1/ii-V-I à tous les tempos, alors que `baseline` oscille entre Am7/Gm7 à 77/90 BPM.

## Ce qui motivait `baseline` comme défaut
- **ADR-003** (2026-07-09) : a gelé le HMM "baseline" comme référence stable pour les benchmarks
- Commit `af2136a` (2026-08-08) : a introduit `observation_mode` avec "baseline" comme défaut — pas de raison technique documentée, juste cohérence avec la baseline gelée
- Aucun ADR ni commentaire ne mentionnait de contrainte de performance temps réel

## Vérification du coût de performance
Mesure sur `b1_3iivi_120.wav` (10 itérations, warmup inclus) :

| Mode | Temps moyen | Écart-type | Surcoût |
|------|-------------|------------|---------|
| `baseline` | 6.65s | ±0.045s | — |
| `posthoc_discriminator` | 6.86s | ±0.097s | **+3%** |

**Conclusion** : surcoût négligeable (~200ms sur ~6.7s). L'analyse n'est **pas** temps réel (fichier audio → grille), pas de flux MIDI live. Pas de risque perf.

## Changement effectué

### `electron/main.js:1103-1106`
```javascript
// AVANT
const chordArgs = ['analyze-chords', analysisWav];
if (options.observationMode && options.observationMode !== 'baseline') {
  chordArgs.push(`--observation-mode=${options.observationMode}`);
}

// APRÈS
const chordArgs = ['analyze-chords', analysisWav];
const obsMode = options.observationMode || 'posthoc_discriminator';
if (obsMode !== 'baseline') {
  chordArgs.push(`--observation-mode=${obsMode}`);
}
```

- Le défaut UI est maintenant `posthoc_discriminator`
- L'appelant peut encore surcharger via `options.observationMode`
- Le défaut Python (`analyze_chords` ligne 4403) reste `baseline` pour ne pas casser les scripts CLI qui ne le surchargent pas (choix conservateur)

## Vérification non-régression

### B1 (ii-V-I) — 100% Gm7 à tous les tempos
| Tempo | Avant (baseline) | Après (posthoc_discriminator par défaut) |
|-------|------------------|------------------------------------------|
| 60 BPM | Gm7 ✅ | Gm7 ✅ |
| 77 BPM | **Am7/Gm7 oscillation ❌** | Gm7 ✅ |
| 90 BPM | **Am7/Gm7 oscillation ❌** | Gm7 ✅ |
| 120 BPM | Gm7 ✅ | Gm7 ✅ |

### B4 (Tempo) — Non-régression
| Cas | Tempo détecté | Segments |
|-----|---------------|----------|
| b4_stable_60 | 60.1 | 9 |
| b4_stable_120 | 120.2 | 9 |
| b4_rubato_90 | 89.1 | 8 |
| b4_syncop_140 | 143.6 | 10 |

### Tests unitaires (302+)
✅ `test-regression-part1.js` — 17/17  
✅ `test-regression-part3.js` — 16/16  
✅ `test-chords.js` — 98/98  
✅ `test-gospel-techniques.js` — 29/29  
✅ `test-jazz-techniques.js` — 85/85  
✅ `test-neo-soul-techniques.js` — 45/45  
✅ `test-reharmonization-variants.js` — 28/28  
✅ `test-reharmonization-validator.js` — 17/17  

### Build Vite
✅ `npm run build` — 4.75s, sans erreur

## Impact utilisateur
- **Gain immédiat** : ii-V-I correct à 77/90 BPM (cas bloquant identifié dans EXP-038)
- **Aucune régression** : B1, B4, tous tests passent
- **Pas de changement** pour les scripts CLI/benchmarks (défaut Python inchangé)

## Prochaines étapes
- EXP-041 : Corriger la pédale/walking bass (B2 — 49%→53% seulement)

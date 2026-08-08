# Piano Jazz Chords — Design System

> Tokens et composants visuels utilisés par l'interface.

---

## Tokens de couleur

| Token | Clair | Sombre | Usage |
|-------|-------|--------|-------|
| `--bg` | `#f4f6f8` | `#0f1117` | Fond de l'application |
| `--surface` | `#ffffff` | `#181b24` | Surfaces principales (panneaux, cartes) |
| `--surface-secondary` | `#f8fafc` | `#23273a` | Surfaces secondaires, sections repliables |
| `--panel-bg` | `#ffffff` | `#181b24` | Panneaux (legacy, alias vers `--surface`) |
| `--panel-border` | `#e4e7ec` | `#2d323e` | Bordures subtiles |
| `--border` | `#e4e7ec` | `#2d323e` | Bordures génériques |
| `--text` | `#1f2937` | `#f3f4f6` | Texte principal |
| `--text-dim` | `#6b7280` | `#9ca3af` | Texte secondaire |
| `--muted` | `#6b7280` | `#d1d5db` | Texte tertiaire |
| `--accent` | `#4f46e5` | `#818cf8` | Actions principales |
| `--accent-hover` | `#4338ca` | `#a5b4fc` | Accent au survol |
| `--accent-text` | `#ffffff` | `#0f1117` | Texte sur accent |
| `--accent-soft` | `#eef2ff` | `#23273a` | Fonds d'accent léger |
| `--success` | `#16a34a` | `#22c55e` | États positifs |
| `--error` | `#dc2626` | `#ef4444` | États d'erreur |
| `--warning` | `#f59e0b` | `#fbbf24` | Avertissements |
| `--tonic` | `#111111` | `#4ade80` | Fondamentale au clavier |

## Typographie

| Token | Valeur | Usage |
|-------|--------|-------|
| `--font` | `Inter, Segoe UI, system-ui, sans-serif` | Police principale |
| `--font-mono` | `SFMono-Regular, Consolas, monospace` | Données techniques |
| `--text-hero` | `clamp(3rem, 8vw, 6rem)` | Nom d'accord courant |
| `--text-lg` | `1.25rem` | Titres de section |
| `--text-base` | `1rem` | Corps |
| `--text-sm` | `0.875rem` | Métadonnées |
| `--text-xs` | `0.75rem` | Labels |

## Rayons et ombres

| Token | Valeur |
|-------|--------|
| `--radius` | `14px` |
| `--radius-md` | `10px` |
| `--radius-sm` | `8px` |
| `--radius-pill` | `999px` |
| `--shadow` | `0 8px 30px rgba(0,0,0,0.08)` clair / `0.35` sombre |

## Composants

### `.panel`
Surface principale avec fond, bordure, ombre et radius.

### `.card`
Carte autonome, plus compacte que `.panel`, utilisée pour l'historique et les cibles d'exercice.

### `.surface-secondary`
Fond secondaire pour les contenus repliables à l'intérieur d'un panneau.

### `.btn-primary` / `.btn-secondary`
Boutons d'action. Primary est plein accent, secondary est contour.

### `.badge`
Puce d'information (voicing, alias, degré).

### `.collapse`
En-tête repliable avec icône `+`/`−`.

---

Dernière mise à jour : 2026-07-10.

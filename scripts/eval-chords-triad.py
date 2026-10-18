#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Thermomètre de la mission « détection d'accords fiable » (ADR-061).

Pour chaque morceau d'un manifeste :
  1. appelle le vrai moteur (CLI analyze-chords) DEUX FOIS et vérifie que la
     sortie est strictement identique (déterminisme) ;
  2. replie prédiction et vérité terrain sur des triades 4 qualités
     (maj/min/aug/dim, 7e -> triade) ;
  3. calcule les métriques (CSR triade, rappel par accord, frontières ±0,5 s,
     fragmentation, accords de passage, métriques de grille, accord Chordify) ;
  4. écrit un JSON par morceau, un résumé, et une ligne dans RESULTATS-BOUCLE.csv.

Usage :
  python3 scripts/eval-chords-triad.py --manifest ~/zic-boucle/manifest.json \
      --label iteration0 [--csv ~/zic-boucle/RESULTATS-BOUCLE.csv] \
      [--outdir ~/zic-boucle/out] [--items id1,id2] [--runs 2] [--workers 3]
  python3 scripts/eval-chords-triad.py --selftest   (vérifie les métriques sur un exemple fait main)
"""

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

NOTE_BASE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
ACCIDENTALS = {'#': 1, '♯': 1, 'b': -1, '♭': -1}

ROOT_RE = re.compile(r'^([A-Ga-g])([#♯b♭]*)')


def parse_root_pc(text):
    """Retourne (pc, reste) si un nom de note est en tête, sinon (None, text)."""
    m = ROOT_RE.match(text)
    if not m:
        return None, text
    pc = NOTE_BASE[m.group(1).upper()]
    for ch in m.group(2):
        pc += ACCIDENTALS[ch]
    return pc % 12, text[m.end():]


def fold_quality(suffix, root_pc):
    """Replie un suffixe d'accord sur l'une des 4 qualités triade (ou 'N')."""
    s = suffix.strip().lower().replace('°', 'dim').replace('ø', 'm7b5')
    s = s.replace('º', 'dim').replace('+', 'aug')
    if s in ('', 'maj', 'major', '5', 'add9', 'add2', '6', '69', '9', '11', '13',
             '7', '7alt', 'alt', 'sus', 'sus2', 'sus4', '2', '4', 'maj9', 'maj6', 'maj13'):
        return 'maj'
    if s in ('m', 'min', 'minor', '-'):
        return 'min'
    if s.startswith('maj'):  # maj7, maj9, maj13...
        return 'maj'
    if s.startswith('min'):  # min7, min9...
        return 'min'
    if s.startswith('m7b5') or s.startswith('ø') or s.startswith('hdim') or s.startswith('half'):
        return 'dim'
    if s.startswith('dim'):  # dim, dim7, dim9...
        return 'dim'
    if s.startswith('aug'):  # aug, aug7...
        return 'aug'
    if s.startswith('mmaj'):  # mMaj7
        return 'min'
    if s.startswith('m'):  # m7, m9, m11, m13, m6...
        return 'min'
    return 'maj'


def fold_label(label):
    """Replie une étiquette d'accord sur (root_pc, qualité, bass_pc).

    Gère : C, Cm, F#m7, Bb, C/E, G/B, BØ, F#°/E, A7(9)/C#, D7sus4, Emaj7, D/C,
    N, x...  Retourne (None, 'N', None) pour un silence.
    """
    if label is None:
        return (None, 'N', None)
    text = str(label).strip()
    if text in ('N', 'n', 'x', 'X', '-', '—', '', 'None'):
        return (None, 'N', None)
    bass_pc = None
    if '/' in text:
        text, bass_part = text.split('/', 1)
        bass_part = bass_part.strip()
        if bass_part:
            bass_pc, _ = parse_root_pc(bass_part)
    root_pc, rest = parse_root_pc(text)
    if root_pc is None:
        return (None, 'N', None)
    rest = rest.strip()
    # « C- » (jazz) = Do mineur ; « C-7 » = m7.
    if rest.startswith('-'):
        rest = 'm' + rest[1:]
    quality = fold_quality(rest, root_pc)
    return (root_pc, quality, bass_pc)


def fold_chordify_entry(cell_value):
    """Replie une entrée Chordify : 'Em' (ancien format) ou objet {root, triad, bass}."""
    if isinstance(cell_value, dict):
        root = cell_value.get('root')
        triad = cell_value.get('triad')
        bass = cell_value.get('bass')
        root_pc, _ = parse_root_pc(str(root)) if root is not None else (None, '')
        if root_pc is None:
            return (None, 'N', None)
        quality = {'maj': 'maj', 'min': 'min', 'dim': 'dim', 'aug': 'aug'}.get(
            str(triad).lower(), 'maj')
        bass_pc, _ = parse_root_pc(str(bass)) if bass else (None, '')
        return (root_pc, quality, bass_pc)
    return fold_label(cell_value)


def parse_chordify_file(path):
    """Lit un relevé Chordify -> liste [(root_pc, qualité, bass), durée_cellules].

    Formats acceptés :
      - "chords" : liste [[cellule, étiquette]] (étiquette = 'Em' ou objet
        {root, triad, bass}) ;
      - "raw" : chaîne 'cellule:Label cellule:Label ...' (durées par différence).
    """
    with open(path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    entries = []
    chords = data.get('chords')
    if chords:
        for entry in chords:
            cell, value = entry[0], entry[1] if len(entry) > 1 else 'N'
            entries.append((cell, value))
    else:
        raw = data.get('raw')
        if not raw:
            return []
        for token in raw.split():
            if ':' not in token:
                continue
            cell_s, label = token.split(':', 1)
            try:
                entries.append((int(cell_s), label))
            except ValueError:
                continue
    entries.sort(key=lambda e: e[0])
    events = []
    for k, (cell, value) in enumerate(entries):
        folded = fold_chordify_entry(value)
        if folded[1] == 'N':
            continue
        next_cell = entries[k + 1][0] if k + 1 < len(entries) else cell + 4
        dur = max(1, next_cell - cell)
        if events and events[-1][0] == folded:
            events[-1] = (folded, events[-1][1] + dur)
        else:
            events.append((folded, dur))
    return events


def run_engine(python_bin, repo, audio, mode, extra=None):
    """Appelle le CLI réel analyze-chords, retourne le dict résultat."""
    args = [python_bin, os.path.join(repo, 'electron', 'audio-processor.py'),
            'analyze-chords', audio, mode]
    proc = subprocess.run(args, capture_output=True, text=True, cwd=repo)
    if proc.returncode != 0:
        raise RuntimeError(f"moteur en échec ({proc.returncode}) : {proc.stderr[-800:]}")
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    result = json.loads(lines[-1])
    return result


def collapse_events(segments, clip=None):
    """[(start, end, triad)] -> liste repliée [(triad, durée)] sans N, dans le clip."""
    events = []
    for start, end, triad in segments:
        if clip:
            start = max(start, clip[0])
            end = min(end, clip[1])
            if end <= start:
                continue
        if triad[1] == 'N':
            continue
        if events and events[-1][0] == triad:
            events[-1] = (triad, events[-1][1] + (end - start))
        else:
            events.append((triad, end - start))
    return events


def parse_pred_segments(result):
    segs = []
    for ch in result.get('chords', []):
        segs.append((float(ch['startTime']), float(ch['endTime']),
                     fold_label(ch.get('chord'))))
    return segs


def parse_gt_timestamped(gt):
    """Vérité terrain avec timestamps (segments ou chords avec start/end)."""
    segs = []
    for seg in gt.get('segments') or gt.get('chords') or []:
        if 'start' in seg:
            start, end = float(seg['start']), float(seg['end'])
        else:
            start, end = float(seg['startTime']), float(seg['endTime'])
        label = seg.get('chord') or seg.get('label')
        segs.append((start, end, fold_label(label)))
    return segs


def overlap_total(ref, pred, same):
    """Durée totale où pred « same » ref, sur des listes de segments repliés."""
    total = 0.0
    i = j = 0
    while i < len(ref) and j < len(pred):
        s = max(ref[i][0], pred[j][0])
        e = min(ref[i][1], pred[j][1])
        if e > s and same(ref[i][2], pred[j][2]):
            total += e - s
        if ref[i][1] <= pred[j][1]:
            i += 1
        else:
            j += 1
    return total


def csr_metrics(ref, pred):
    """CSR triade (4 qualités), majmin, fondamentale — pondérés par durée."""
    ref_non_n = [(s, e, t) for (s, e, t) in ref if t[1] != 'N']
    denom = sum(e - s for (s, e, t) in ref_non_n)

    def same_triad(a, b):
        return a[0] == b[0] and a[1] == b[1]

    def same_root(a, b):
        return a[0] == b[0]

    def same_majmin(a, b):
        return a[0] == b[0] and a[1] == b[1] and a[1] in ('maj', 'min')

    num_triad = overlap_total(ref_non_n, pred, same_triad)
    num_root = overlap_total(ref_non_n, pred, same_root)
    ref_mm = [(s, e, t) for (s, e, t) in ref_non_n if t[1] in ('maj', 'min')]
    denom_mm = sum(e - s for (s, e, t) in ref_mm)
    num_mm = overlap_total(ref_mm, pred, same_majmin)
    return {
        'csr_triade': 100.0 * num_triad / denom if denom else None,
        'csr_root': 100.0 * num_root / denom if denom else None,
        'csr_majmin': 100.0 * num_mm / denom_mm if denom_mm else None,
    }


def recall_events(ref, pred):
    """Rappel par accord de référence (≥50 % de sa durée couverte par la même triade)."""
    ref_non_n = [(s, e, t) for (s, e, t) in ref if t[1] != 'N']
    ok = 0
    covered_short = []
    for (s, e, t) in ref_non_n:
        dur = e - s
        cov = 0.0
        for (ps, pe, pt) in pred:
            if pt[0] == t[0] and pt[1] == t[1]:
                ov = min(e, pe) - max(s, ps)
                if ov > 0:
                    cov += ov
        good = cov >= 0.5 * dur
        ok += 1 if good else 0
        covered_short.append((s, e, t, good))
    recall = 100.0 * ok / len(ref_non_n) if ref_non_n else None
    passing = [(s, e, t, g) for (s, e, t, g) in covered_short if e - s < 1.0]
    passing_recall = None
    if passing:
        passing_recall = 100.0 * sum(1 for (_, _, _, g) in passing if g) / len(passing)
    return recall, passing_recall


def boundaries(ref, pred, tol=0.5):
    """Précision/rappel/F1 des changements d'accord, tolérance 0,5 s + offset médian."""
    def changes(segs):
        out = []
        non_n = [(s, e, t) for (s, e, t) in segs if t[1] != 'N']
        for a, b in zip(non_n, non_n[1:]):
            if a[2][0] != b[2][0] or a[2][1] != b[2][1]:
                out.append(b[0])
        return out

    ref_t, pred_t = changes(ref), changes(pred)
    used = [False] * len(pred_t)
    matches = []
    for rt in ref_t:
        best_j, best_d = None, tol + 1e-9
        for j, pt in enumerate(pred_t):
            if used[j]:
                continue
            d = abs(pt - rt)
            if d < best_d:
                best_d, best_j = d, j
        if best_j is not None and best_d <= tol:
            used[best_j] = True
            matches.append(pred_t[best_j] - rt)
    tp = len(matches)
    rec = 100.0 * tp / len(ref_t) if ref_t else None
    prec = 100.0 * tp / len(pred_t) if pred_t else None
    f1 = None
    if rec is not None and prec is not None and (rec + prec) > 0:
        f1 = 2 * rec * prec / (rec + prec)
    matches.sort()
    med = matches[len(matches) // 2] if matches else None
    return prec, rec, f1, med


def fragmentation(ref, pred):
    n_ref = len([1 for (s, e, t) in ref if t[1] != 'N'])
    n_pred = len([1 for (s, e, t) in pred if t[1] != 'N'])
    return n_pred / n_ref if n_ref else None, n_pred, n_ref


def slash_stats(ref, pred):
    """Bonus : accords avec basse notée dans la référence."""
    refs = [(s, e, t) for (s, e, t) in ref if t[1] != 'N' and t[2] is not None]
    if not refs:
        return None
    ok_chord, ok_bass = 0, 0
    for (s, e, t) in refs:
        cov_chord = cov_bass = 0.0
        for (ps, pe, pt) in pred:
            if pt[0] == t[0] and pt[1] == t[1]:
                ov = min(e, pe) - max(s, ps)
                if ov > 0:
                    cov_chord += ov
                    if pt[2] == t[2]:
                        cov_bass += ov
        if cov_chord >= 0.5 * (e - s):
            ok_chord += 1
        if cov_bass >= 0.5 * (e - s):
            ok_bass += 1
    return {'n': len(refs), 'chord_ok': 100.0 * ok_chord / len(refs),
            'bass_ok': 100.0 * ok_bass / len(refs)}


def ordered_match(ref_events, pred_events):
    """Rappel ordonné (deux pointers) de la séquence ref dans la séquence pred.

    ref_events/pred_events : listes repliées [(triad, poids)]. Retourne
    (match_pct_pondéré, match_pct_événements).
    """
    i = 0
    matched_w = matched_n = 0
    total_w = sum(w for (_, w) in ref_events)
    total_n = len(ref_events)
    for (triad, w) in ref_events:
        found = False
        while i < len(pred_events):
            p_triad, _ = pred_events[i]
            i += 1
            if p_triad[0] == triad[0] and p_triad[1] == triad[1]:
                found = True
                break
        if found:
            matched_w += w
            matched_n += 1
    return (100.0 * matched_w / total_w if total_w else None,
            100.0 * matched_n / total_n if total_n else None)


def transition_metrics(events, loops, variants, expected_labels):
    """[Mission ANGES §2] Sauts et arrivées anticipées pour une grille SANS timestamps.

    Pour chaque accord source X de la grille (chaque position de chaque boucle,
    successeurs fusionnés) et chaque occurrence de X détectée : la fenêtre
    jusqu'à la prochaine occurrence de X doit contenir l'un des successeurs
    attendus de X. Sinon -> transition SAUTÉE. Si un accord de la grille
    (ni X ni un successeur attendu) apparaît avant tout successeur attendu ->
    ARRIVÉE ANTICIPÉE (un accord arrive avant sa place dans l'ordre).
    Retourne (skip_rate, early_rate, detail {(src,tgt): [kept, skipped]}).
    """
    variants = variants or {}
    expanded = expand_loops(loops, variants)
    succ = {}
    for loop in expanded:
        fl = [fold_label(c) for c in loop]
        for k, x in enumerate(fl):
            y = fl[(k + 1) % len(fl)]
            succ.setdefault((x[0], x[1]), set()).add((y[0], y[1]))
    expected = set()
    for lab in expected_labels:
        t = fold_label(lab)
        expected.add((t[0], t[1]))
    srcs = list(succ.keys())
    total_kept = total_skipped = total_early = 0
    detail = {}
    for src in srcs:
        targets = succ[src]
        occ = [i for i, (t, _) in enumerate(events) if (t[0], t[1]) == src]
        kept = skipped = early = 0
        for k, i in enumerate(occ):
            end = occ[k + 1] if k + 1 < len(occ) else len(events)
            if end <= i + 1:
                # fenêtre vide : le morceau se coupe là, pas de saut comptable
                continue
            found_target = False
            for j in range(i + 1, end):
                ev = (events[j][0][0], events[j][0][1])
                if ev in targets:
                    found_target = True
                    break
                if ev in expected and ev != src and ev not in targets:
                    early += 1
                    break
            if found_target:
                kept += 1
            else:
                skipped += 1
        detail[src] = [kept, skipped, early]
        total_kept += kept
        total_skipped += skipped
        total_early += early
    tot = total_kept + total_skipped
    skip_rate = 100.0 * total_skipped / tot if tot else None
    early_rate = 100.0 * total_early / tot if tot else None
    return skip_rate, early_rate, detail


def diatonic_triad_set(key_pc, mode):
    """Triades diatoniques d'une tonalité, comme ensembles (root_pc, qualité).

    Majeur : I, ii, iii, IV, v(min), vi, vii°. Mineur naturel : i, ii°, III, iv,
    v(min), VI, VII. Enharmonique par pitch class (Cdim ≡ B#dim de C# majeur).
    """
    if mode == 'major':
        base = [(0, 'maj'), (2, 'min'), (4, 'min'), (5, 'maj'),
                (7, 'min'), (9, 'min'), (11, 'dim')]
    else:
        base = [(0, 'min'), (2, 'dim'), (3, 'maj'), (5, 'min'),
                (7, 'maj'), (8, 'maj'), (10, 'maj')]
    return {((key_pc + i) % 12, q) for (i, q) in base}


def recall_subset(ref, pred, keep):
    """Rappel (critère >=50 % de durée couverte par la même triade) sur un
    sous-ensemble d'accords de référence sélectionnés par keep(t)."""
    ref_sel = [(s, e, t) for (s, e, t) in ref if t[1] != 'N' and keep(t)]
    if not ref_sel:
        return None
    ok = 0
    for (s, e, t) in ref_sel:
        cov = 0.0
        for (ps, pe, pt) in pred:
            if pt[0] == t[0] and pt[1] == t[1]:
                ov = min(e, pe) - max(s, ps)
                if ov > 0:
                    cov += ov
        if cov >= 0.5 * (e - s):
            ok += 1
    return 100.0 * ok / len(ref_sel)


def levenshtein(a, b):
    """Distance d'édition sur des séquences quelconques."""
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1,
                           prev[j - 1] + (0 if ca == cb else 1)))
        prev = cur
    return prev[-1]


def align_similarity(ref_events, pred_events):
    """Similarité d'alignement (100 - distance d'édition normalisée), en %.

    Compare les séquences repliées triade par triade : robuste aux insertions,
    suppressions et substitutions (contrairement au pointeur strict).
    """
    ra = [t for (t, _) in ref_events]
    pa = [t for (t, _) in pred_events]
    if not ra or not pa:
        return None
    dist = levenshtein(ra, pa)
    return 100.0 * (1.0 - dist / max(len(ra), len(pa)))


def expand_loops(loops, variants):
    """Génère toutes les variantes de boucles (substitution accord -> variantes)."""
    out = []
    for loop in loops:
        options = []
        for ch in loop:
            opts = [ch] + variants.get(ch, [])
            options.append(opts)
        idx = [0] * len(loop)
        while True:
            out.append([options[k][idx[k]] for k in range(len(loop))])
            k = len(loop) - 1
            while k >= 0:
                idx[k] += 1
                if idx[k] < len(options[k]):
                    break
                idx[k] = 0
                k -= 1
            if k < 0:
                break
    return out


def loop_score(events, loops, variants=None, max_insertions=1):
    """Part (pondérée par durée) de la séquence expliquée par les boucles attendues.

    Reconnaît les rotations ; un accord peut être suivi de répétitions de la
    boucle complète (match cyclique) ou d'une autre rotation. Retourne
    (strict, loose) :
      - strict : chaque tour doit être 100 % conforme (aucun accord étranger) ;
      - loose  : les accords de la boucle doivent apparaître DANS L'ORDRE en
        tolérant jusqu'à `max_insertions` accords étrangers par tour
        (accords de passage réels d'un arrangement live — la mission §9 parle
        de « boucle reconnue dans le bon ordre », pas de boucle nue).
    """
    variants = variants or {}
    expanded = expand_loops(loops, variants)
    folded_loops = []
    for loop in expanded:
        folded_loops.append([fold_label(ch) for ch in loop])
    total = sum(w for (_, w) in events)
    if not total:
        return None, None

    def run_strict(i, rot):
        j = 0
        w = 0.0
        while i + j < len(events) and events[i + j][0] == rot[j % len(rot)]:
            w += events[i + j][1]
            j += 1
            if j >= 2 * len(rot):
                break
        return j, w

    # loose : les accords de la boucle doivent apparaître DANS L'ORDRE en
    # tolérant jusqu'à `max_insertions` accords étrangers par tour (accords
    # de passage réels d'un arrangement live — mission §9 : « boucle reconnue
    # dans le bon ordre », pas boucle nue). Ne touche pas aux événements déjà
    # réclamés par la passe stricte.
    def run_loose(i, rot):
        L = len(rot)
        pos = i
        expect = 0
        inserts = 0
        budget = max_insertions
        matched_w = 0.0
        matched_count = 0
        while pos < len(events):
            if claimed[pos]:
                break
            if events[pos][0] == rot[expect % L]:
                matched_w += events[pos][1]
                matched_count += 1
                expect += 1
                pos += 1
                if expect % L == 0 and expect >= L:
                    budget += max_insertions  # nouveau tour, nouveau budget
                    # le tour suivant doit suivre quasi immédiatement
                    nxt = 0
                    while (pos + nxt < len(events) and not claimed[pos + nxt]
                           and events[pos + nxt][0] == rot[expect % L]
                           and nxt == 0):
                        matched_w += events[pos + nxt][1]
                        matched_count += 1
                        expect += 1
                        pos += 1
                    break
            else:
                inserts += 1
                pos += 1
                if inserts > budget:
                    break
        if expect >= L:
            return matched_count, matched_w, pos
        return 0, 0.0, i

    matched_strict = 0.0
    matched_loose = 0.0
    i, n = 0, len(events)
    claimed = [False] * n

    # passe 1 : strict (prioritaire)
    i = 0
    while i < n:
        best_len, best_w = 0, 0.0
        for floop in folded_loops:
            for k in range(len(floop)):
                rot = floop[k:] + floop[:k]
                j, w = run_strict(i, rot)
                if j >= len(rot) and j > best_len:
                    best_len, best_w = j, w
        if best_len > 0:
            matched_strict += best_w
            matched_loose += best_w
            for k in range(i, i + best_len):
                claimed[k] = True
            i += best_len
        else:
            i += 1

    # passe 2 : loose sur les événements non réclamés par strict
    i = 0
    while i < n:
        if claimed[i]:
            i += 1
            continue
        best_len, best_w, best_end = 0, 0.0, i
        for floop in folded_loops:
            for k in range(len(floop)):
                rot = floop[k:] + floop[:k]
                j, w, end = run_loose(i, rot)
                if j >= len(rot) and w > best_w:
                    best_len, best_w, best_end = j, w, end
        if best_len > 0:
            matched_loose += best_w
            for k in range(i, min(n, best_end)):
                claimed[k] = True
            i = max(best_end, i + 1)
        else:
            i += 1

    return (100.0 * matched_strict / total,
            100.0 * matched_loose / total)


def grid_coverage(pred_events, expected_triads, audio_dur):
    """Chaque triade attendue apparaît-elle (durée ≥ max(3 s, 1 % de l'audio)) ?"""
    thresh = max(3.0, 0.01 * audio_dur)
    per = {}
    for (triad, w) in pred_events:
        per[(triad[0], triad[1])] = per.get((triad[0], triad[1]), 0.0) + w
    covered = []
    for label in expected_triads:
        t = fold_label(label)
        covered.append((label, per.get((t[0], t[1]), 0.0) >= thresh,
                        per.get((t[0], t[1]), 0.0)))
    pct = 100.0 * sum(1 for (_, ok, _) in covered if ok) / len(covered) if covered else None
    return pct, covered


def grid_precision(pred_events, allowed_labels):
    allowed = set()
    for label in allowed_labels:
        t = fold_label(label)
        allowed.add((t[0], t[1]))
    total = sum(w for (_, w) in pred_events)
    inside = sum(w for (t, w) in pred_events if (t[0], t[1]) in allowed)
    return 100.0 * inside / total if total else None


def parse_key_name(name):
    if not name:
        return None
    pc, _ = parse_root_pc(str(name).strip())
    return pc


def key_matches(result, expected_keys):
    """expected_keys : liste de {pc, mode}. True si la tonalité détectée est dedans
    (ou un des 3 premiers candidats)."""
    detected = (parse_key_name(result.get('key')), result.get('keyMode'))
    ok_direct = any(detected[0] == k['pc'] and detected[1] == k['mode']
                    for k in expected_keys)
    if ok_direct:
        return True
    cands = result.get('keyCandidates') or []
    for cand in cands[:3]:
        pc = parse_key_name(cand.get('name') if isinstance(cand, dict) else None)
        mode = cand.get('mode') if isinstance(cand, dict) else None
        if any(pc == k['pc'] and mode == k['mode'] for k in expected_keys):
            return True
    return False


def evaluate_item(item, repo, python_bin, runs, workers):
    audio = os.path.expanduser(item['audio'])
    mode = item.get('mode', 'legacy')

    def one_run():
        return run_engine(python_bin, repo, audio, mode)

    first = one_run()
    deterministic = True
    for _ in range(runs - 1):
        second = one_run()
        if json.dumps(second, sort_keys=True) != json.dumps(first, sort_keys=True):
            deterministic = False
            break

    pred = parse_pred_segments(first)
    out = {'id': item['id'], 'mode': mode, 'deterministic': deterministic,
           'audio': audio}
    gt_status = None
    gt_path = item.get('gt')
    gt = None
    if gt_path:
        with open(os.path.expanduser(gt_path), 'r', encoding='utf-8') as fh:
            gt = json.load(fh)
        gt_status = gt.get('status')

    if item['type'] == 'timestamped':
        ref = parse_gt_timestamped(gt)
        clip = item.get('clip')
        if clip:
            ref = [(max(s, clip[0]), min(e, clip[1]), t) for (s, e, t) in ref
                   if min(e, clip[1]) > max(s, clip[0])]
            pred_c = [(max(s, clip[0]), min(e, clip[1]), t) for (s, e, t) in pred
                      if min(e, clip[1]) > max(s, clip[0])]
        else:
            pred_c = pred
        out.update(csr_metrics(ref, pred_c))
        recall, passing = recall_events(ref, pred_c)
        prec_b, rec_b, f1_b, med_b = boundaries(ref, pred_c)
        frag, n_pred, n_ref = fragmentation(ref, pred_c)
        ref_labels = {(t[0], t[1]) for (_, _, t) in ref if t[1] != 'N'}
        pred_non_n = [(s, e, t) for (s, e, t) in pred_c if t[1] != 'N']
        pred_dur_t = sum(e - s for (s, e, _) in pred_non_n)
        foreign = sum(e - s for (s, e, t) in pred_non_n
                      if (t[0], t[1]) not in ref_labels)
        # [Mission ANGES §1quater] Accords chromatiques (hors triades
        # diatoniques de la tonalité de la GT) et accords courts (< 2 s) :
        # rappel sur ces sous-ensembles. Le moteur remplace-t-il les accords
        # chromatiques d'un temps par des accords proches de la tonalité ?
        kpc = gt.get('key_pc')
        kmode = gt.get('key_mode')
        if kpc is None and gt.get('key'):
            kpc, _ = parse_root_pc(str(gt['key']).split(' ')[0])
            kmode = 'minor' if 'm' in str(gt.get('key', '')) else 'major'
        if kpc is not None:
            dia = diatonic_triad_set(kpc, kmode)
            chrom_recall = recall_subset(
                ref, pred_c, lambda t: (t[0], t[1]) not in dia)
            short2_recall = recall_subset(
                ref, pred_c, lambda t: True)
        else:
            chrom_recall = None
            short2_recall = None
        # [Mission §1quinquies] Tonalité attendue sur les morceaux à
        # timestamps aussi : comparaison (pitch class, mode) — le nom de la
        # tonalité porte déjà le mode (« Fm » = Fa mineur).
        exp_key = item.get('expected_key')
        if exp_key:
            exp_fold = fold_label(exp_key)
            det_name = str(first.get('key') or '')
            det_fold = fold_label(det_name)
            out['key_ok'] = (det_fold[0] == exp_fold[0]
                             and det_fold[1] == exp_fold[1])
        out.update({'chromatic_recall': chrom_recall, 'short2_recall': short2_recall,
                    'recall_events': recall, 'passing_recall': passing,
                    'boundaries_precision': prec_b, 'boundaries_recall': rec_b,
                    'boundaries_f1': f1_b, 'median_offset': med_b,
                    'fragmentation': frag, 'segments_pred': n_pred,
                    'segments_ref': n_ref,
                    'skipped_rate': None if recall is None else 100.0 - recall,
                    'insertion_rate': 100.0 * foreign / pred_dur_t if pred_dur_t else None,
                    'slash': slash_stats(ref, pred_c)})
    elif item['type'] == 'sequence':
        gt_seq = gt.get('chords_in_order') or gt.get('chords') or []
        ref_events = []
        for label in gt_seq:
            t = fold_label(label)
            if t[1] == 'N':
                continue
            if ref_events and ref_events[-1][0] == t:
                ref_events[-1] = (t, ref_events[-1][1] + 1)
            else:
                ref_events.append((t, 1))
        pred_events = collapse_events(pred)
        match_w, match_n = ordered_match(ref_events, pred_events)
        root_match_w, _ = ordered_match(
            [(t, w) for (t, w) in ref_events],
            [((p[0], None, None), w) for (p, w) in pred_events])
        cov, _ = grid_coverage(pred_events, [str(c) for c in gt_seq],
                               first.get('duration', 0))
        out.update({'seq_match': match_w, 'seq_match_events': match_n,
                    'seq_match_root': root_match_w, 'coverage': cov,
                    'segments_pred': len(pred_events),
                    'segments_ref': len(ref_events)})
    elif item['type'] == 'chordify-only':
        # [§5.0bis] Morceaux de diversité : pas de grille Narcisse, pas de
        # timestamps — le relevé Chordify (cellules NON calibrées) sert de
        # SECONDE référence, évalué par alignement (jamais par CSR à la
        # seconde). Statistiques : jamais utilisé pour régler le moteur.
        chordify_path = item['chordify']
        with open(os.path.expanduser(chordify_path), 'r', encoding='utf-8') as fh:
            cf_data = json.load(fh)
        cf = parse_chordify_file(chordify_path)
        pred_events = collapse_events(pred)
        out['segments_pred'] = len(pred_events)
        match_w, _ = ordered_match(cf, pred_events)
        rev_w, _ = ordered_match(pred_events, cf)
        align = align_similarity(cf, pred_events)
        cf_labels = set()
        for (t, _) in cf:
            cf_labels.add((t[0], t[1]))
        dur_by_triad = {}
        for (t, w) in pred_events:
            dur_by_triad[(t[0], t[1])] = dur_by_triad.get((t[0], t[1]), 0.0) + w
        audio_dur = first.get('duration', 0) or 1.0
        thresh = max(3.0, 0.01 * audio_dur)
        covered = sum(1 for lab in cf_labels if dur_by_triad.get(lab, 0.0) >= thresh)
        cov_pct = 100.0 * covered / len(cf_labels) if cf_labels else None
        pred_dur_c = sum(w for (_, w) in pred_events)
        foreign_c = sum(w for (t, w) in pred_events
                        if (t[0], t[1]) not in cf_labels)
        out.update({
            'chordify_match': match_w, 'chordify_match_reverse': rev_w,
            'chordify_align': align,
            'coverage': cov_pct,
            'n_chordify_labels': len(cf_labels),
            'skipped_rate': None if cov_pct is None else 100.0 - cov_pct,
            'insertion_rate': 100.0 * foreign_c / pred_dur_c if pred_dur_c else None})
        expected_keys = []
        key_raw = cf_data.get('key')
        if key_raw:
            pc, rest = parse_root_pc(str(key_raw).split('(')[0].split('(')[0])
            mode = 'minor' if 'min' in str(key_raw).lower() or 'm)' in str(key_raw) else 'major'
            if pc is not None:
                expected_keys.append({'pc': pc, 'mode': mode})
        out['key_ok'] = key_matches(first, expected_keys) if expected_keys else None
    elif item['type'] in ('grid', 'multi-grid'):
        audio_dur = first.get('duration', 0)
        pred_events = collapse_events(pred)
        out['segments_pred'] = len(pred_events)
        if item['type'] == 'grid':
            keys = [gt['key']]
            expected = list(gt['expected_set'])
            loops = list(gt['loops'])
            variants = gt.get('variants', {})
            for p in gt.get('passing_optional', []):
                expected.append(p['chord'])
            cov, covered = grid_coverage(pred_events, gt['expected_set'], audio_dur)
            prec = grid_precision(pred_events, expected)
            ls_strict, ls_loose = loop_score(pred_events, loops, variants)
            skip_rate, early_rate, skip_detail = transition_metrics(
                pred_events, loops, variants, expected)
            out.update({'coverage': cov, 'coverage_detail': covered,
                        'precision_set': prec, 'loop_score': ls_strict,
                        'loop_loose': ls_loose,
                        'skipped_rate': skip_rate, 'early_rate': early_rate,
                        'skip_detail': {f'{k[0]}/{k[1]}': v
                                        for k, v in skip_detail.items()},
                        'insertion_rate': None if prec is None else 100.0 - prec,
                        'key_ok': key_matches(first, keys)})
            out['passing'] = [
                {'chord': p['chord'],
                 'found': any(e[0] == fold_label(p['chord'])
                              for (e, _) in pred_events)}
                for p in gt.get('passing_optional', [])]
        else:
            keys = [s['key'] for s in gt['sections'] if s.get('key')]
            expected_all = []
            per_section = []
            for sec in gt['sections']:
                if sec.get('key'):
                    expected_all.extend(sec['expected_set'])
                cov, covered = grid_coverage(pred_events, sec['expected_set'], audio_dur)
                ls_strict, ls_loose = loop_score(pred_events, sec['loops'], sec.get('variants'))
                per_section.append({'name': sec['name'], 'coverage': cov,
                                    'coverage_detail': covered, 'loop_score': ls_strict,
                                    'loop_loose': ls_loose})
            prec = grid_precision(pred_events, expected_all)
            out.update({'coverage': None, 'sections': per_section,
                        'precision_set': prec,
                        'key_ok': key_matches(first, keys)})
            cov_mean = None
            known = [s for s in per_section if s['coverage'] is not None]
            if known:
                cov_mean = sum(s['coverage'] for s in known) / len(known)
            out['coverage'] = cov_mean

    chordify_path = item.get('chordify')
    if chordify_path:
        cf = parse_chordify_file(os.path.expanduser(chordify_path))
        pred_events = collapse_events(pred)
        match_w, _ = ordered_match(cf, pred_events)
        rev_w, _ = ordered_match(pred_events, cf)
        out.update({'chordify_match': match_w, 'chordify_match_reverse': rev_w,
                    'chordify_align': align_similarity(cf, pred_events)})
    out['gt_status'] = gt_status
    out['detected_key'] = first.get('key')
    out['detected_mode'] = first.get('keyMode')
    out['keys'] = first.get('keys')
    # [Mission §9.6] Modulations : précision/rappel à ±3 s (correction 18/10 :
    # ±5 s acceptait une frontière décalée de −15 s), offset, exactitude
    # de la tonalité pondérée par la durée, fausses modulations.
    # Le filet « même tonalité, n'importe quand » est retiré : il
    # comptait comme bonnes des frontières hors tolérance.
    exp_mods = (gt or {}).get('expected_modulations')
    det_keys = first.get('keys') or []
    if exp_mods is not None:
        det_mods = [{'at': k['start'], 'key': k['key'], 'mode': k['mode']}
                    for k in det_keys[1:]] if det_keys else []
        used = [False] * len(det_mods)
        matched = []
        for em in exp_mods:
            hit = None
            for j, dm in enumerate(det_mods):
                if used[j]:
                    continue
                if (dm['key'], dm['mode']) == (em['key'], em['mode']) and \
                        abs(dm['at'] - em['at']) <= 3.0:
                    hit = j
                    break
            if hit is not None:
                used[hit] = True
                matched.append(abs(det_mods[hit]['at'] - em['at']))
        out['mod_recall'] = 100.0 * len(matched) / len(exp_mods) if exp_mods else None
        out['mod_precision'] = 100.0 * len(matched) / len(det_mods) if det_mods else (100.0 if not exp_mods else None)
        out['mod_offset'] = sum(matched) / len(matched) if matched else None
        out['false_modulations'] = len(det_mods) - len(matched)
    if det_keys:
        exp_keys = (gt or {}).get('expected_keys')
        if exp_keys:
            def key_of(label, mode):
                return (label, mode)
            dur_ok = 0.0
            total = 0.0
            for (st, lab, mode) in exp_keys:
                pass
            # recouvrement des segments de tonalité prédits vs attendus
            pred_segs = [(float(k['start']), float(k['end']), (k['key'], k['mode']))
                         for k in det_keys]
            for (e_start, e_key, e_mode) in exp_keys:
                e_end = None
                for (s2, k2, m2) in exp_keys:
                    if s2 > e_start:
                        e_end = s2 if e_end is None else min(e_end, s2)
                e_end = (first.get('duration') or 0) if e_end is None else e_end
                total += e_end - e_start
                for (ps, pe, pk) in pred_segs:
                    ov = min(e_end, pe) - max(e_start, ps)
                    if ov > 0 and pk == (e_key, e_mode):
                        dur_ok += ov
            out['key_dur_accuracy'] = 100.0 * dur_ok / total if total else None
    out['detected_mode'] = first.get('keyMode')
    out['duration'] = first.get('duration')
    out['pred'] = [{'start': s, 'end': e, 'chord': f"{t[0]}/{t[1]}"
                    if t[0] is not None else 'N'}
                   for (s, e, t) in pred]
    return out


def selftest():
    """Vérification faite main des métriques (§6.1)."""
    ref = [(0.0, 4.0, (0, 'maj', None)), (4.0, 8.0, (9, 'min', None))]
    pred = [(0.0, 3.0, (0, 'maj', None)), (3.0, 8.0, (9, 'maj', None))]
    m = csr_metrics(ref, pred)
    assert abs(m['csr_triade'] - 37.5) < 1e-9, m
    # racine : C 0-3 s (3 s) + A 3-8 s contre Am 4-8 s (4 s) = 7 s / 8 s.
    assert abs(m['csr_root'] - 87.5) < 1e-9, m
    assert abs(m['csr_majmin'] - 37.5) < 1e-9, m
    prec, rec, f1, med = boundaries(ref, pred)
    assert rec == 0.0 and prec == 0.0 and f1 is None and med is None
    r, p = recall_events(ref, pred)
    assert r == 50.0, r
    frag, np_, nr = fragmentation(ref, pred)
    assert frag == 1.0 and np_ == 2 and nr == 2
    pred2 = [(0.0, 4.0, (0, 'maj', None)), (4.0, 8.0, (9, 'min', None))]
    prec2, rec2, f12, med2 = boundaries(ref, pred2)
    assert rec2 == 100.0 and prec2 == 100.0 and abs(f12 - 100.0) < 1e-9 and med2 == 0.0
    assert fold_label('C/E') == (0, 'maj', 4)
    assert fold_label('F#m7') == (6, 'min', None)
    assert fold_label('BØ') == (11, 'dim', None)
    assert fold_label('D7sus4') == (2, 'maj', None)
    assert fold_label('Gm') == (7, 'min', None)
    assert fold_label('A#') == (10, 'maj', None)
    assert fold_label('N') == (None, 'N', None)
    assert fold_label('Cm7') == (0, 'min', None)
    assert fold_label('Emaj7') == (4, 'maj', None)
    events = [((4, 'min', None), 1), ((0, 'maj', None), 1), ((7, 'maj', None), 1), ((2, 'maj', None), 1)] * 3
    ls, ls_l = loop_score(events, [['Em', 'C', 'G', 'D']])
    assert abs(ls - 100.0) < 1e-9 and abs(ls_l - 100.0) < 1e-9, (ls, ls_l)
    events2 = [((0, 'maj', None), 1)] + events
    ls2, ls2_l = loop_score(events2, [['Em', 'C', 'G', 'D']])
    # 13 événements : le C initial n'amorce aucune rotation, les 12 suivants
    # (Em C G D x3) sont absorbés par les rotations -> 12/13 ≈ 92,3.
    assert abs(ls2 - 100.0 * 12 / 13) < 1e-9, ls2
    # diatoniques de C# majeur (pc 1) : C#maj, D#m, E#m(=Fm), F#maj, G#m,
    # A#m, B#dim(=Cdim). F majeur et D# majeur sont chromatiques.
    dia = diatonic_triad_set(1, 'major')
    assert (1, 'maj') in dia and (3, 'min') in dia and (5, 'min') in dia
    assert (6, 'maj') in dia and (8, 'min') in dia and (10, 'min') in dia
    assert (0, 'dim') in dia
    assert (5, 'maj') not in dia and (3, 'maj') not in dia
    # recall_subset : 1 chromatin retrouvé sur 2.
    ref3 = [(0, 2, (5, 'maj', None)), (2, 4, (3, 'maj', None))]
    pred3 = [(0, 2.2, (5, 'maj', None)), (2.2, 4, (1, 'maj', None))]
    r = recall_subset(ref3, pred3, lambda t: True)
    assert abs(r - 50.0) < 1e-9, r

    # transition_metrics : boucle [C D G] (pcs 0/2/7), événements
    # [C D G C G C D G] :
    # C->D : C@0 fenêtre(D,G)=D ✓ ; C@3 fenêtre(G)=... cible D absente ->
    # sauté, et G arrive avant sa place -> avance ; C@5 fenêtre(D,G)=D ✓.
    # D->G : D@1 fenêtre(G,C)=G ✓ ; D@6 fenêtre(G)=G ✓ -> 0.
    # G->C : G@2 fenêtre(C,G,C)=C ✓ ; G@4 fenêtre(C,D)=C ✓ ; G@7 fin -> sauté.
    Cc, Dd, Gg = (0, 'maj', None), (2, 'maj', None), (7, 'maj', None)
    sk, er, det = transition_metrics(
        [(Cc, 1), (Dd, 1), (Gg, 1), (Cc, 1), (Gg, 1), (Cc, 1), (Dd, 1), (Gg, 1)],
        [['C', 'D', 'G']], {}, ['C', 'D', 'G'])
    # C@3 : fenêtre (G) sans D -> sauté + avance ; G@7 : fenêtre vide, exclu.
    # 7 transitions comptables, 1 saut, 1 avance -> 1/7 chacun.
    assert abs(sk - 100.0 / 7) < 1e-9, sk
    assert abs(er - 100.0 / 7) < 1e-9, er
    sk2, er2, _ = transition_metrics([(Cc, 1), (Dd, 1), (Gg, 1)] * 3,
                                    [['C', 'D', 'G']], {}, ['C', 'D', 'G'])
    assert sk2 == 0.0 and er2 == 0.0, (sk2, er2)
    # loose : tolère les accords de passage À L'INTÉRIEUR d'un tour.
    # [Em C |Am| G D Am Am Am] : aucun tour strict (Em C interrompus, G D
    # seuls) ; loose reconnaît le tour Em-C-(-Am)-G-D -> 4/8 = 50 %.
    ls3, ls3_l = loop_score([((4, 'min', None), 1), ((0, 'maj', None), 1),
                            ((9, 'min', None), 1), ((7, 'maj', None), 1),
                            ((2, 'maj', None), 1),
                            ((9, 'min', None), 1), ((9, 'min', None), 1),
                            ((9, 'min', None), 1)],
                           [['Em', 'C', 'G', 'D']])
    assert ls3 == 0.0 and abs(ls3_l - 50.0) < 1e-9, (ls3, ls3_l)
    print('SELFTEST OK — métriques vérifiées sur exemples faits main.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=False)
    ap.add_argument('--label', default='run')
    ap.add_argument('--csv', default=os.path.expanduser('~/zic-boucle/RESULTATS-BOUCLE.csv'))
    ap.add_argument('--outdir', default=os.path.expanduser('~/zic-boucle/out'))
    ap.add_argument('--items', default=None)
    ap.add_argument('--runs', type=int, default=2)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--selftest', action='store_true')
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return

    with open(os.path.expanduser(args.manifest), 'r', encoding='utf-8') as fh:
        manifest = json.load(fh)
    repo = manifest['repo']
    python_bin = manifest.get('python', sys.executable)
    items = manifest['items']
    if args.items:
        wanted = set(args.items.split(','))
        items = [it for it in items if it['id'] in wanted]

    commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=repo,
                            capture_output=True, text=True).stdout.strip()

    def work(item):
        try:
            return evaluate_item(item, repo, python_bin, args.runs, args.workers)
        except Exception as exc:  # noqa
            return {'id': item['id'], 'error': str(exc)}

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(work, items))

    outdir = os.path.join(os.path.expanduser(args.outdir), args.label)
    os.makedirs(outdir, exist_ok=True)
    for res in results:
        with open(os.path.join(outdir, res['id'] + '.json'), 'w',
                  encoding='utf-8') as fh:
            json.dump(res, fh, indent=1, ensure_ascii=False)

    fields = ['label', 'commit', 'id', 'type', 'gt_status', 'deterministic',
              'csr_triade', 'csr_majmin', 'csr_root', 'recall_events',
              'passing_recall', 'boundaries_f1', 'boundaries_precision',
              'boundaries_recall', 'median_offset', 'fragmentation',
              'coverage', 'precision_set', 'loop_score', 'loop_loose', 'skipped_rate',
              'early_rate',               'insertion_rate', 'key_ok',
              'mod_recall', 'mod_precision', 'mod_offset', 'false_modulations',
              'chordify_match', 'chordify_align', 'seq_match', 'chromatic_recall',
              'short2_recall', 'segments_pred', 'segments_ref',
              'detected_key', 'detected_mode', 'error']
    write_header = not os.path.exists(os.path.expanduser(args.csv))
    with open(os.path.expanduser(args.csv), 'a', newline='',
              encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction='ignore')
        if write_header:
            w.writeheader()
        for res in results:
            item = next(i for i in items if i['id'] == res['id'])
            row = {'label': args.label, 'commit': commit, 'id': res['id'],
                   'type': item['type']}
            row.update({k: res.get(k) for k in fields if k not in row})
            if res.get('error'):
                row['error'] = res['error'][:200]
            w.writerow(row)

    print(f"\n=== {args.label} (commit {commit}) ===")
    for res in results:
        if res.get('error'):
            print(f"{res['id']:14s} ERREUR : {res['error'][:120]}")
            continue
        keys = ['csr_triade', 'recall_events', 'boundaries_f1', 'fragmentation',
                'coverage', 'precision_set', 'loop_score', 'key_ok',
                'chordify_align', 'seq_match', 'skipped_rate', 'early_rate',
                'insertion_rate', 'chromatic_recall', 'short2_recall',
                'mod_recall', 'mod_precision', 'mod_offset', 'false_modulations']
        vals = ' '.join(f"{k}={_fmt(res.get(k))}" for k in keys if res.get(k) is not None)
        det = '' if res['deterministic'] else ' ⚠️NON-DÉTERMINISTE'
        print(f"{res['id']:14s} {vals}{det}")
        if res.get('sections'):
            for sec in res['sections']:
                print(f"    - {sec['name']:30s} coverage={_fmt(sec['coverage'])} "
                      f"loop={_fmt(sec['loop_score'])} loose={_fmt(sec['loop_loose'])}")


def _fmt(v):
    if v is None:
        return 'NA'
    if isinstance(v, float):
        return f"{v:.1f}"
    return str(v)


if __name__ == '__main__':
    main()
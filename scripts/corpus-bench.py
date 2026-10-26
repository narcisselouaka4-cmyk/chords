#!/usr/bin/env python3
"""Banc de mesure du moteur d'accords AUDIO sur des corpus annotés.

[Claude] — 2026-10-25 — Narcisse veut rendre le moteur audio excellent, et
voulait pour cela récupérer de l'audio sur Internet avec sa grille d'accords.
Ce n'est ni légal ni tenable (la chaîne Python doit écrire des WAV pour
analyser : « ne pas sauvegarder » n'existe pas). Ce banc est la voie propre.

Trois sources, par ordre de disponibilité immédiate :

1. LIBRE — corpus dont l'AUDIO est redistribuable, avec accords horodatés.
   GuitarSet (360 extraits, CC BY 4.0). Rien à fournir, rien à risquer.

2. PONT MIDI — corpus dont l'audio est libre ET accompagné d'un MIDI exactement
   aligné (MAESTRO, Slakh). La vérité terrain est produite par le moteur MIDI
   (scripts/midi-to-grid.mjs), exact par construction puisque les notes sont
   connues. C'est la seule source de vérité terrain horodatée illimitée et
   juridiquement propre — et MAESTRO, c'est du piano.

3. ANNOTATIONS SEULES — Isophonics, McGill Billboard, JAAH, RWC. Les grilles
   sont libres, l'audio doit être fourni par l'utilisateur, légalement obtenu.

Mesure : mir_eval (MIREX), les mêmes scores que la littérature — root, majmin,
triads, sevenths, et le recouvrement pondéré par la durée.

Usage :
  python3 scripts/corpus-bench.py --list
  python3 scripts/corpus-bench.py --fetch guitarset --data-home ~/zic-corpus
  python3 scripts/corpus-bench.py --bench guitarset --data-home ~/zic-corpus
  python3 scripts/corpus-bench.py --bench-local deliverable/data/synthetic_b1
  python3 scripts/corpus-bench.py --bridge <dossier-midi> --audio <dossier-audio>
"""

import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
VENV_PY = PROJECT / '.venv' / 'bin' / 'python'
PROCESSOR = PROJECT / 'electron' / 'audio-processor.py'
# Moteur à mesurer. Permet de comparer une variante à la référence SANS toucher
# au moteur de l'application — indispensable quand une mesure de référence est
# déjà en cours : chaque morceau relance le moteur en sous-processus, donc une
# modification en cours de route corromprait silencieusement le résultat.
ENGINE = PROCESSOR
# Filtre de style, pour cibler une famille de morceaux (GuitarSet : Funk, Jazz…).
STYLE_FILTER = None
MIDI_TO_GRID = PROJECT / 'scripts' / 'midi-to-grid.mjs'

CORPORA = {
    'guitarset': {
        'tier': 'LIBRE',
        'mirdata_id': 'guitarset',
        'audio': 'inclus (CC BY 4.0)',
        'size': '360 extraits · ~3 Go',
        'why': "Audio redistribuable ET accords horodatés. Le seul corpus utilisable sans rien fournir.",
        # Les extraits « solo » sont des improvisations sur la MÊME annotation que
        # le « comp » (mirdata le signale). Un solo n'énonce pas l'harmonie : le
        # mesurer contre une grille d'accompagnement ne dit rien du moteur.
        'track_filter': lambda tid: tid.endswith('_comp'),
    },
    'maestro': {
        'tier': 'PONT MIDI',
        'mirdata_id': 'maestro',
        'audio': 'inclus (CC BY-NC-SA)',
        'size': '~200 h de piano · ~120 Go',
        'why': "Piano, audio libre, MIDI exactement aligné : la grille est produite par le moteur MIDI.",
    },
    'slakh': {
        'tier': 'PONT MIDI',
        'mirdata_id': 'slakh',
        'audio': 'inclus (synthétisé)',
        'size': '2100 morceaux · ~100 Go (version « baby » : ~5 Go)',
        'version': 'baby',
        'why': ("DÉCONSEILLÉ — son all_src.mid n'est pas fiablement aligné sur mix.wav. "
                "Mesuré le 25/10 sur les 20 morceaux de « baby » : 6 MIDI sont 11 à 34 % plus "
                "longs que leur audio, Track00019 fait 4094 s pour 232 s, et Track00014 passe "
                "le contrôle de durée (1,01×) tout en dérivant de 4 % — son score monte de "
                "17,7 % à 67,8 % si l'on étire la référence. Un MIDI désaligné fabrique une "
                "fausse vérité terrain et accuse le moteur à sa place. Vérifier l'alignement "
                "sur les ATTAQUES serait la bonne méthode (le tempo ne suffit pas : il rate "
                "Track00019, qui a le bon tempo et 17× la durée) ; c'est un chantier à part, "
                "non ouvert. Narcisse a décidé le 25/10 de laisser tomber Slakh."),
    },
    'billboard': {
        'tier': 'ANNOTATIONS',
        'mirdata_id': 'billboard',
        'audio': 'À FOURNIR',
        'size': '~1000 titres',
        'why': "Le corpus d'accords de référence de la littérature. Audio à fournir légalement.",
    },
    'isophonics': {
        'tier': 'ANNOTATIONS',
        'mirdata_id': 'beatles',
        'audio': 'À FOURNIR',
        'size': '~180 titres (Beatles, Queen…)',
        'why': "Annotations professionnelles, accords + temps + tonalités + sections.",
    },
    'jaah': {
        'tier': 'ANNOTATIONS',
        'mirdata_id': 'jaah',
        'audio': 'À FOURNIR',
        'size': '113 titres de jazz',
        'why': "Jazz : le point faible mesuré du moteur (17,5 % sur Autumn Leaves).",
    },
    'rwc_popular': {
        'tier': 'ANNOTATIONS',
        'mirdata_id': 'rwc_popular',
        'audio': 'À FOURNIR (licence RWC)',
        'size': '100 titres',
        'why': "Pop japonaise, annotations accords et structure.",
    },
}


def list_corpora():
    print("Corpus déclarés — trois niveaux, du plus immédiat au plus exigeant\n")
    for tier in ('LIBRE', 'PONT MIDI', 'ANNOTATIONS'):
        print(f"── {tier}")
        for name, c in CORPORA.items():
            if c['tier'] != tier:
                continue
            print(f"   {name:13s} {c['size']:34s} audio : {c['audio']}")
            print(f"   {'':13s} {c['why']}")
        print()
    print("Téléchargement : --fetch <nom> --data-home <dossier>  (réseau requis)")
    print("Mesure         : --bench <nom> --data-home <dossier>")
    print("Pont MIDI local: --bridge <dossier-midi> --audio <dossier-audio>")


def fetch(name, data_home, version=None):
    try:
        import mirdata
    except ImportError:
        sys.exit("mirdata absent : pip install mirdata")
    conf = CORPORA.get(name)
    if not conf:
        sys.exit(f"Corpus inconnu : {name}")
    version = version or conf.get('version')
    ds = (mirdata.initialize(conf['mirdata_id'], data_home=str(data_home), version=version)
          if version else mirdata.initialize(conf['mirdata_id'], data_home=str(data_home)))
    print(f"Téléchargement de {name}{' · version ' + version if version else ''} "
          f"vers {data_home} — {conf['size']}")
    if conf['audio'] == 'À FOURNIR':
        print("  Annotations seules : l'audio devra être déposé à côté, légalement obtenu.")
    ds.download()
    print("Vérification…")
    missing, invalid = ds.validate()
    print(f"  manquants : {sum(len(v) for v in missing.values())} · invalides : {sum(len(v) for v in invalid.values())}")


def run_audio_engine(wav_path, clean_mode='legacy'):
    """La grille produite par le moteur audio, telle que l'app la calcule."""
    python = str(VENV_PY) if VENV_PY.exists() else sys.executable
    # Le moteur importe ses voisins (harmony_engine). Une copie placée ailleurs —
    # le cas d'une variante comparée à la référence — doit donc pouvoir les
    # trouver : on ajoute le dossier du moteur DE L'APP au chemin d'import.
    env = dict(os.environ)
    env['PYTHONPATH'] = os.pathsep.join(
        filter(None, [str(PROCESSOR.parent), env.get('PYTHONPATH')]))
    out = subprocess.run([python, str(ENGINE), 'analyze-chords', str(wav_path), clean_mode],
                         capture_output=True, text=True, timeout=900, env=env)
    if out.returncode != 0:
        return None, (out.stderr or '').strip().splitlines()[-1:] or ['échec']
    for line in reversed(out.stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith('{'):
            try:
                return json.loads(line), None
            except json.JSONDecodeError:
                continue
    return None, ['sortie JSON introuvable']


# Qualité de l'app → syntaxe Harte, en miroir de scripts/midi-to-grid.mjs.
HARTE = {
    '': 'maj', 'm': 'min', 'dim': 'dim', 'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
    'maj7': 'maj7', 'm7': 'min7', '7': '7', 'dim7': 'dim7', 'm7b5': 'hdim7',
    'aug7': 'aug(b7)', '6': 'maj6', 'm6': 'min6',
}
HARTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
PCS = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6,
       'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def to_harte(chord):
    if not chord or chord == 'N':
        return 'N'
    root = chord[:2] if len(chord) > 1 and chord[1] in '#b' else chord[:1]
    if root not in PCS:
        return 'N'
    symbol = chord[len(root):].split('/')[0]
    return f"{HARTE_NAMES[PCS[root]]}:{HARTE.get(symbol, 'maj')}"


def intervals_labels(segments):
    import numpy as np
    starts = [float(s['startTime']) for s in segments]
    ends = [float(s['endTime']) for s in segments]
    labels = [to_harte(s.get('chord')) for s in segments]
    return np.array(list(zip(starts, ends))), labels


def read_lab(path):
    import numpy as np
    starts, ends, labels = [], [], []
    for line in Path(path).read_text().splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        starts.append(float(parts[0]))
        ends.append(float(parts[1]))
        labels.append(parts[2])
    return np.array(list(zip(starts, ends))), labels


def score(ref_intervals, ref_labels, est_intervals, est_labels):
    import mir_eval
    import numpy as np
    end = float(max(ref_intervals[-1][1], est_intervals[-1][1]))
    est_intervals, est_labels = mir_eval.util.adjust_intervals(
        est_intervals, est_labels, ref_intervals.min(), end, mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    ref_intervals, ref_labels = mir_eval.util.adjust_intervals(
        ref_intervals, ref_labels, ref_intervals.min(), end, mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    intervals, ref_l, est_l = mir_eval.util.merge_labeled_intervals(
        ref_intervals, ref_labels, est_intervals, est_labels)
    durations = mir_eval.util.intervals_to_durations(intervals)
    out = {}
    for metric in ('root', 'majmin', 'triads', 'sevenths'):
        comparison = getattr(mir_eval.chord, metric)(ref_l, est_l)
        # mir_eval rend -1 pour les accords hors du vocabulaire de la métrique.
        # Quand TOUS le sont, le poids total est nul et le score vaut NaN : il
        # n'y a rien à mesurer, et une moyenne qui l'inclut ne veut plus rien dire.
        kept = [d for c, d in zip(comparison, durations) if c >= 0]
        if not kept or sum(kept) <= 0:
            return None
        out[metric] = 100 * mir_eval.chord.weighted_accuracy(comparison, durations)
        if out[metric] != out[metric]:  # NaN
            return None
    return out


# [Claude] — 2026-10-26 — Fondu des segments courts, mesuré avant d'être codé.
#
# Mesuré sur « Saint Esprit » de Narcisse, dont il a dicté la boucle
# (Em → C → G → D, ordre strict) : la durée du segment sépare nettement le
# juste du faux. Avant une transition conforme, médiane 2,74 s ; avant une
# transition hors ordre, 1,52 s ; sur un accord hors vocabulaire, 1,06 s. Les
# erreurs sont concentrées dans les segments courts.
#
# Le seuil est RELATIF au pas harmonique du morceau — la médiane des durées —
# et non absolu : un morceau de jazz change d'accord deux fois par mesure, et
# un seuil fixe y effacerait de vrais accords. Un segment trop court est fondu
# dans son voisin le plus long, jamais supprimé : la frise reste continue.
def merge_short_segments(segments, fraction):
    """Fond les segments plus courts que `fraction` × le pas harmonique médian."""
    if fraction <= 0 or len(segments) < 3:
        return segments
    import statistics
    segs = [dict(s) for s in segments]
    spans = [float(s['endTime']) - float(s['startTime']) for s in segs]
    threshold = statistics.median(spans) * fraction
    changed = True
    while changed and len(segs) > 2:
        changed = False
        for i, seg in enumerate(segs):
            if float(seg['endTime']) - float(seg['startTime']) >= threshold:
                continue
            neighbours = [x for x in (segs[i - 1] if i > 0 else None,
                                      segs[i + 1] if i + 1 < len(segs) else None) if x]
            if not neighbours:
                continue
            host = max(neighbours, key=lambda x: float(x['endTime']) - float(x['startTime']))
            host['startTime'] = min(float(host['startTime']), float(seg['startTime']))
            host['endTime'] = max(float(host['endTime']), float(seg['endTime']))
            segs.pop(i)
            changed = True
            break
    return segs


# [Claude] — 2026-10-26 — Variante ciblée du fondu, après réfutation du fondu
# uniforme (−1,1 pt de majmin sur 40 morceaux de GuitarSet à ×0,67).
#
# L'idée vient de la mesure : sur « Saint Esprit », 13 des 26 segments hors
# vocabulaire sont des « Bm » courts — l'intersection exacte de G et de D, les
# deux accords entre lesquels le moteur oscille. Ce ne sont pas des accords mais
# des mélanges. Un morceau à quatre accords les expose crûment ; un morceau au
# vocabulaire large, non. La condition doit donc porter sur le VOCABULAIRE du
# morceau et pas seulement sur la durée du segment.
def dominant_vocabulary(segments, coverage=0.85):
    """Les étiquettes qui couvrent `coverage` de la durée, les plus longues d'abord."""
    from collections import Counter
    weight = Counter()
    for seg in segments:
        label = seg.get('chord')
        if label and label != 'N':
            weight[label] += float(seg['endTime']) - float(seg['startTime'])
    total = sum(weight.values())
    if total <= 0:
        return set()
    kept, run = set(), 0.0
    for label, w in weight.most_common():
        kept.add(label)
        run += w
        if run >= coverage * total:
            break
    return kept


def merge_offvocab_segments(segments, fraction, coverage=0.85):
    """Fond les segments courts ET hors du vocabulaire dominant, eux seuls."""
    if fraction <= 0 or len(segments) < 4:
        return segments
    import statistics
    segs = [dict(s) for s in segments]
    spans = [float(s['endTime']) - float(s['startTime']) for s in segs]
    threshold = statistics.median(spans) * fraction
    vocab = dominant_vocabulary(segs, coverage)
    if not vocab:
        return segs
    changed = True
    while changed and len(segs) > 2:
        changed = False
        for i, seg in enumerate(segs):
            if float(seg['endTime']) - float(seg['startTime']) >= threshold:
                continue
            if seg.get('chord') in vocab:
                continue          # un accord du morceau reste, même bref
            neighbours = [x for x in (segs[i - 1] if i > 0 else None,
                                      segs[i + 1] if i + 1 < len(segs) else None) if x]
            if not neighbours:
                continue
            host = max(neighbours, key=lambda x: float(x['endTime']) - float(x['startTime']))
            host['startTime'] = min(float(host['startTime']), float(seg['startTime']))
            host['endTime'] = max(float(host['endTime']), float(seg['endTime']))
            segs.pop(i)
            changed = True
            break
    return segs


def merge_interruptions(segments, fraction, coverage=None):
    """Fond un segment court ENCADRÉ par deux segments de même étiquette.

    Troisième forme essayée, après deux réfutations. Le fondu uniforme corrige
    bien l'ordre sur « Saint Esprit » (transitions fautives 50 → 20) mais coûte
    1,1 pt de majmin sur GuitarSet : sur une guitare solo, un segment bref est
    souvent un vrai accord. Le fondu ciblé par vocabulaire est pire encore sur
    son morceau (50 → 55 fautives) : retirer un « Bm » entre deux accords CRÉE
    la transition directe au lieu de la corriger.

    Ne reste que le motif A–B–A : un accord interrompu brièvement par un autre,
    puis repris. Là, l'interruption est presque sûrement parasite, et la fondre
    restaure un A continu. Le motif est fréquent quand le moteur oscille entre
    deux fondamentales à la quinte (le défaut n°1 du banc), et rare dans une
    progression qui avance.
    """
    if fraction <= 0 or len(segments) < 3:
        return segments
    import statistics
    segs = [dict(s) for s in segments]
    spans = [float(s['endTime']) - float(s['startTime']) for s in segs]
    threshold = statistics.median(spans) * fraction
    changed = True
    while changed and len(segs) > 2:
        changed = False
        for i in range(1, len(segs) - 1):
            seg = segs[i]
            if float(seg['endTime']) - float(seg['startTime']) >= threshold:
                continue
            before, after = segs[i - 1], segs[i + 1]
            if before.get('chord') != after.get('chord') or before.get('chord') == seg.get('chord'):
                continue
            # Les trois n'en font plus qu'un : A reprend sans interruption.
            before['endTime'] = max(float(before['endTime']), float(after['endTime']))
            del segs[i:i + 2]
            changed = True
            break
    return segs


def bench_pairs(pairs, clean_mode='legacy', progress=False, merge_sweep=None,
                merge_fn=None):
    """pairs : [(nom, wav, chemin .lab de référence)]"""
    rows, failures = [], []
    total = len(pairs)
    for index, (name, wav, ref) in enumerate(pairs, start=1):
        # Un corpus complet prend l'heure : on dit où on en est plutôt que de
        # laisser croire que rien ne se passe.
        if progress:
            print(f"  [{index:3d}/{total}] {short_name(name, 44):44s}", end='', flush=True)
        analysis, err = run_audio_engine(wav, clean_mode)
        if not analysis or not analysis.get('chords'):
            failures.append((name, err or ['aucun accord']))
            if progress:
                print(' ✗', flush=True)
            continue
        ref_i, ref_l = read_lab(ref)
        if merge_sweep is not None:
            # Une seule exécution du moteur, plusieurs fractions comparées.
            per_fraction = {}
            for fraction in merge_sweep:
                merged = (merge_fn or globals().get('MERGE_FN') or merge_short_segments)(
                    analysis['chords'], fraction)
                try:
                    sc = score(ref_i, ref_l, *intervals_labels(merged))
                except Exception:
                    sc = None
                if sc:
                    per_fraction[fraction] = (sc, len(merged))
            if per_fraction:
                rows.append((name, per_fraction, len(analysis['chords']), len(ref_l),
                             harmonic_regularity(analysis['chords'])))
                if progress:
                    base = per_fraction[0.0][0]['majmin'] if 0.0 in per_fraction else float('nan')
                    best = max(per_fraction.items(), key=lambda kv: kv[1][0]['majmin'])
                    print(f" {base:5.1f}% → {best[1][0]['majmin']:5.1f}% (×{best[0]})", flush=True)
            else:
                failures.append((name, ['aucun accord comparable']))
                if progress:
                    print(' ✗', flush=True)
            continue
        est_i, est_l = intervals_labels(analysis['chords'])
        try:
            scores = score(ref_i, ref_l, est_i, est_l)
        except Exception as exc:  # une grille vide ou dégénérée ne doit pas tout arrêter
            failures.append((name, [str(exc)[:70]]))
            if progress:
                print(' ✗', flush=True)
            continue
        if scores is None:
            failures.append((name, ['aucun accord comparable (vocabulaire hors métrique)']))
            if progress:
                print(' ✗', flush=True)
            continue
        rows.append((name, scores, len(analysis['chords']), len(ref_l)))
        if progress:
            print(f" {scores['majmin']:5.1f}%", flush=True)
    return rows, failures


def harmonic_regularity(segments):
    """Régularité du pas harmonique : 1 - écart relatif des durées, borné à [0,1].

    Un gospel qui tient un accord par mesure a un pas régulier ; une guitare
    jazz solo, qui change deux fois par mesure puis tient quatre mesures, non.
    Sert à savoir SI le fondu des segments courts a un sens sur ce morceau."""
    import statistics
    spans = [float(s['endTime']) - float(s['startTime']) for s in segments]
    if len(spans) < 4:
        return 0.0
    med = statistics.median(spans)
    if med <= 0:
        return 0.0
    # Écart absolu médian, plus robuste que l'écart-type aux segments très longs.
    mad = statistics.median([abs(x - med) for x in spans])
    return max(0.0, min(1.0, 1.0 - mad / med))


def report_sweep(rows, failures, fractions):
    """Moyennes par fraction de fondu, pondérées comme le rapport ordinaire."""
    if not rows:
        print('Aucun morceau mesurable.')
        return False
    print(f"\n{'fondu':>7} {'majmin':>8} {'root':>8} {'triads':>8} {'7es':>8} "
          f"{'segments':>9}  {'écart majmin':>13}")
    print('─' * 70)
    base = None
    for fraction in fractions:
        got = [r[1][fraction] for r in rows if fraction in r[1]]   # [(scores, n_segments)]
        if not got:
            continue
        avg = {m: sum(sc[m] for sc, _ in got) / len(got)
               for m in ('root', 'majmin', 'triads', 'sevenths')}
        nseg = sum(n for _, n in got) / len(got)
        if base is None:
            base = avg['majmin']
        delta = avg['majmin'] - base
        mark = '' if fraction == 0 else f"{delta:+6.1f} pt"
        label = 'aucun' if fraction == 0 else f"×{fraction:.2f}"
        print(f"{label:>7} {avg['majmin']:7.1f}% {avg['root']:7.1f}% {avg['triads']:7.1f}% "
              f"{avg['sevenths']:7.1f}% {nseg:9.1f}  {mark:>13}")
    print('─' * 70)
    print(f"{len(rows)} morceaux mesurés, {len(failures)} écartés")

    # Le fondu a-t-il un sens partout, ou seulement sur les morceaux au pas
    # harmonique régulier ? C'est l'hypothèse à trancher avant de le livrer.
    regs = [r[4] for r in rows if len(r) > 4]
    if regs and len(fractions) > 1:
        import statistics
        cut = statistics.median(regs)
        print(f"\nRégularité du pas harmonique — médiane {cut:.2f}")
        print(f"{'tranche':>22} {'morceaux':>9} {'sans fondu':>11} {'meilleur fixe':>14}")
        print('─' * 62)
        for label, keep in (('pas régulier (≥ méd.)', lambda x: x >= cut),
                            ('pas irrégulier (< méd.)', lambda x: x < cut)):
            grp = [r for r in rows if len(r) > 4 and keep(r[4])]
            if not grp:
                continue
            per = {}
            for fraction in fractions:
                vals = [r[1][fraction][0]['majmin'] for r in grp if fraction in r[1]]
                if vals:
                    per[fraction] = sum(vals) / len(vals)
            if 0.0 not in per:
                continue
            best_f = max((f for f in per if f != 0.0), key=lambda f: per[f], default=None)
            extra = f"{per[best_f]:7.1f}% (×{best_f}) {per[best_f] - per[0.0]:+5.1f} pt" if best_f else ''
            print(f"{label:>22} {len(grp):9} {per[0.0]:10.1f}% {extra:>14}")
        print('─' * 62)
    return True


def short_name(name, width=44):
    """Un nom lisible : les corpus préfixent tous leurs morceaux pareil, c'est la
    FIN qui les distingue (MAESTRO : « …ORIG_MID--AUDIO_01_R1_2004_wav--3 »)."""
    return name if len(name) <= width else '…' + name[-(width - 1):]


def report(rows, failures):
    if rows:
        print(f"\n{'morceau':44s} {'root':>7s} {'majmin':>7s} {'triads':>7s} {'7es':>7s}  {'est':>4s}/{'réf':>4s}")
        print('─' * 92)
        for name, s, n_est, n_ref in rows:
            print(f"{short_name(name):44s} {s['root']:6.1f}% {s['majmin']:6.1f}% {s['triads']:6.1f}% {s['sevenths']:6.1f}%  {n_est:4d}/{n_ref:4d}")
        print('─' * 92)
        avg = {m: sum(r[1][m] for r in rows) / len(rows) for m in ('root', 'majmin', 'triads', 'sevenths')}
        print(f"{'MOYENNE sur ' + str(len(rows)) + ' morceaux':44s} {avg['root']:6.1f}% {avg['majmin']:6.1f}% "
              f"{avg['triads']:6.1f}% {avg['sevenths']:6.1f}%")
    for name, err in failures:
        print(f"⚠  {name} : {' '.join(err)}")
    return bool(rows)


def bench_local(folder, clean_mode='legacy'):
    """Triplets locaux MIDI + WAV + vérité terrain (deliverable/data/synthetic_b1)."""
    folder = Path(folder)
    pairs = []
    with tempfile.TemporaryDirectory() as tmp:
        for gt_file in sorted(folder.glob('*_ground_truth.json')):
            gt = json.loads(gt_file.read_text())
            wav = folder / gt['audio']
            if not wav.exists():
                continue
            lab = Path(tmp) / f"{wav.stem}.lab"
            lab.write_text('\n'.join(f"{c['start']:.6f}\t{c['end']:.6f}\t{c['label']}" for c in gt['chords']) + '\n')
            pairs.append((wav.stem, wav, lab))
        if not pairs:
            sys.exit(f"Aucun triplet (vérité terrain + audio) dans {folder}")
        print(f"{len(pairs)} morceaux avec vérité terrain fournie — moteur audio « {clean_mode} »\n")
        if merge_sweep:
            return report_sweep(*bench_pairs(pairs, clean_mode, progress=True,
                                             merge_sweep=merge_sweep), merge_sweep)
        return report(*bench_pairs(pairs, clean_mode, progress=True))


# Les corpus rangent souvent un morceau par dossier (Slakh : TrackXXXXX/all_src.mid
# + mix.wav) plutôt qu'en MIDI et audio côte à côte. On reconnaît les deux.
TREE_MIDI = ('all_src.mid', 'all_src.midi')
TREE_AUDIO = ('mix.wav', 'mix.flac')


def tree_pairs(root):
    """Les couples (nom, MIDI, audio) d'une arborescence « un dossier par morceau »."""
    found = []
    for folder in sorted(Path(root).iterdir()):
        if not folder.is_dir():
            continue
        midi = next((folder / n for n in TREE_MIDI if (folder / n).exists()), None)
        audio = next((folder / n for n in TREE_AUDIO if (folder / n).exists()), None)
        if midi and audio:
            found.append((folder.name, midi, audio))
    return found


def bench_tree(root, clean_mode='legacy', limit=0):
    """Le pont sur une arborescence déjà téléchargée (Slakh, MAESTRO extrait)."""
    found = tree_pairs(root)
    if not found:
        sys.exit(f"Aucun couple {'/'.join(TREE_MIDI)} + {'/'.join(TREE_AUDIO)} sous {root}")
    if limit:
        found = found[:limit]
    print(f"{len(found)} morceaux — vérité terrain produite par le moteur MIDI\n")
    rows, failures = [], []
    for name, midi, audio in found:
        row, err = _bridge_and_score(name, midi, audio, clean_mode)
        (failures if err else rows).append((name, [err]) if err else row)
        print(f"  {short_name(name, 46):46s} {'✓' if not err else '✗'}", flush=True)
    print()
    return report(rows, failures)


def bench_bridge(midi_dir, audio_dir, clean_mode='legacy'):
    """Le pont : la grille vient du moteur MIDI, l'audio est mesuré contre elle."""
    midi_dir, audio_dir = Path(midi_dir), Path(audio_dir)
    with tempfile.TemporaryDirectory() as tmp:
        res = subprocess.run(['node', str(MIDI_TO_GRID), str(midi_dir), '--out', tmp],
                             capture_output=True, text=True)
        if res.returncode != 0:
            sys.exit(f"Conversion MIDI échouée : {res.stderr.strip()[:200]}")
        pairs = []
        for lab in sorted(Path(tmp).glob('*.lab')):
            audio = next((p for ext in ('.wav', '.flac', '.mp3')
                          for p in [audio_dir / f'{lab.stem}{ext}'] if p.exists()), None)
            if audio:
                pairs.append((lab.stem, audio, lab))
        if not pairs:
            sys.exit(f"Aucun audio correspondant aux MIDI de {midi_dir} dans {audio_dir}")
        print(f"{len(pairs)} morceaux — vérité terrain produite par le moteur MIDI")
        return report(*bench_pairs(pairs, clean_mode))


# Les corpus ne nomment pas leurs champs pareil : GuitarSet a `audio_mix_path` et
# `leadsheet_chords`, Billboard et Isophonics ont `audio_path` et `chords`. On
# cherche donc par ordre de préférence plutôt que de supposer un nom.
AUDIO_ATTRS = ('audio_mix_path', 'audio_path', 'audio_mic_path', 'audio_hex_cln_path', 'mix_path')
# `leadsheet_chords` est l'accord demandé au musicien, aux étiquettes propres ;
# `inferred_chords` est relevé du capteur hexaphonique, plus détaillé et plus
# bruité. Les deux sont alignés dans le temps.
CHORD_ATTRS = ('chords', 'leadsheet_chords', 'inferred_chords', 'chords_full', 'chords_majmin')


def resolve_audio(track):
    for attr in AUDIO_ATTRS:
        path = getattr(track, attr, None)
        if isinstance(path, str) and os.path.exists(path):
            return path
    return None


def resolve_chords(track, preferred=None):
    order = ([preferred] if preferred else []) + [a for a in CHORD_ATTRS if a != preferred]
    for attr in order:
        try:
            data = getattr(track, attr, None)
        except Exception:
            continue
        if data is not None and getattr(data, 'labels', None) is not None and len(data.labels):
            return data
    return None


def bench_mirdata(name, data_home, limit, clean_mode='legacy', chord_source=None,
                  all_tracks=False, version=None, diagnose=False, merge_sweep=None):
    try:
        import mirdata
    except ImportError:
        sys.exit("mirdata absent : pip install mirdata")
    conf = CORPORA.get(name)
    if not conf:
        sys.exit(f"Corpus inconnu : {name}")
    version = version or conf.get('version')
    ds = (mirdata.initialize(conf['mirdata_id'], data_home=str(data_home), version=version)
          if version else mirdata.initialize(conf['mirdata_id'], data_home=str(data_home)))
    tracks = ds.load_tracks()
    with tempfile.TemporaryDirectory() as tmp:
        pairs = []
        skipped_audio = skipped_chords = 0
        keep = None if all_tracks else conf.get('track_filter')
        for track_id, track in tracks.items():
            if keep and not keep(track_id):
                continue
            if STYLE_FILTER and STYLE_FILTER.lower() not in track_id.lower():
                continue
            audio = resolve_audio(track)
            chords = resolve_chords(track, chord_source)
            if not audio:
                skipped_audio += 1
                continue
            if chords is None:
                skipped_chords += 1
                continue
            lab = Path(tmp) / f'{track_id.replace("/", "_")}.lab'
            lab.write_text('\n'.join(
                f'{s:.6f}\t{e:.6f}\t{l}' for (s, e), l in zip(chords.intervals, chords.labels)) + '\n')
            pairs.append((track_id, audio, lab))
            if limit and len(pairs) >= limit:
                break
        if not pairs:
            sys.exit(f"{name} : aucun morceau exploitable sous {data_home}.\n"
                     f"  sans audio sur le disque : {skipped_audio} · sans annotation d'accords : {skipped_chords}\n"
                     f"  audio cherché parmi : {', '.join(AUDIO_ATTRS)}\n"
                     f"  accords cherchés parmi : {', '.join(CHORD_ATTRS)}\n"
                     f"  {conf['why']}\n  Audio : {conf['audio']}")
        print(f"{len(pairs)} morceaux de {name} — moteur audio « {clean_mode} »\n")
        if diagnose:
            return diagnose_roots(pairs, clean_mode)
        if merge_sweep:
            return report_sweep(*bench_pairs(pairs, clean_mode, progress=True,
                                             merge_sweep=merge_sweep), merge_sweep)
        return report(*bench_pairs(pairs, clean_mode, progress=True))




# ─────────────────────────────────────────────────────────────────────────────
# Mode FLUX — mesurer un corpus de 100 Go sans avoir 100 Go de disque.
#
# Narcisse n'a que 119 Go libres : Slakh complet (97 Go compressés) et MAESTRO
# (110 Go) ne tiennent pas, même avant décompression. Louer du cloud serait
# payer pour un problème qui n'existe pas : les deux archives sont lisibles à
# distance, morceau par morceau.
#
#   MAESTRO — un ZIP garde son index à la FIN. Le serveur accepte les requêtes
#   par plage (`accept-ranges: bytes`), donc on lit l'index puis chaque membre
#   voulu. Mesuré : index d'une archive de 110 Go lu en 4 requêtes et 0,4 Mo ;
#   un MIDI de 25 Ko coûte 17 Ko de réseau.
#
#   SLAKH — un tar.gz ne se lit que du début à la fin, mais il se lit EN FLUX :
#   on traverse l'archive sans jamais l'écrire, en n'extrayant que les membres
#   voulus, et on s'arrête dès qu'on en a assez.
#
# Dans les deux cas le disque ne porte qu'un morceau à la fois : on télécharge
# de la bande passante, pas du stockage.


class HttpRangeFile(io.RawIOBase):
    """Un fichier distant lu par plages d'octets, utilisable par `zipfile`."""

    def __init__(self, url, timeout=60):
        self.timeout = timeout
        self._pos = 0
        self.requests = 0
        self.bytes = 0
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=timeout) as head:
            self.length = int(head.headers['Content-Length'])
            self.url = head.geturl()  # après redirections

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self._pos

    def seek(self, offset, whence=io.SEEK_SET):
        self._pos = offset if whence == io.SEEK_SET else (
            self._pos + offset if whence == io.SEEK_CUR else self.length + offset)
        return self._pos

    def read(self, size=-1):
        if size < 0:
            size = self.length - self._pos
        if size <= 0 or self._pos >= self.length:
            return b''
        end = min(self._pos + size, self.length) - 1
        req = urllib.request.Request(self.url, headers={'Range': f'bytes={self._pos}-{end}'})
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            data = response.read()
        self._pos += len(data)
        self.requests += 1
        self.bytes += len(data)
        return data

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)


MAESTRO_ZIP = 'https://storage.googleapis.com/magentadata/datasets/maestro/v2.0.0/maestro-v2.0.0.zip'
SLAKH_TARS = {
    'baby': 'https://zenodo.org/record/4603870/files/babyslakh_16k.tar.gz?download=1',
    '2100-redux': 'https://zenodo.org/record/4599666/files/slakh2100_flac_redux.tar.gz?download=1',
}


# Écart maximal toléré entre la durée du MIDI et celle de l'audio pour croire
# qu'ils décrivent le même enregistrement.
#
# Le pont suppose un MIDI aligné sur l'audio. Quand il ne l'est pas, il fabrique
# SILENCIEUSEMENT une référence fausse, et le moteur audio est accusé à tort.
# Mesuré sur babySlakh : 6 morceaux sur 20 ont un MIDI 11 à 34 % plus long que
# l'audio, et Track00019 un MIDI de 4094 s pour 232 s d'audio (17,7×). Ce sont
# exactement les six plus mauvaises notes du banc — 1,7 % à 35 % — quand les
# morceaux alignés donnent 54 à 83 %. Sans ce garde-fou, la moyenne du corpus
# mesure la qualité de l'alignement, pas celle du moteur.
#
# La tolérance est large dans un sens : l'audio porte souvent quelques secondes
# de résonance après la dernière note MIDI (sur babySlakh, 5 s régulièrement).
ALIGNMENT_TOLERANCE = 0.08
ALIGNMENT_TAIL_SECONDS = 8.0


def audio_duration(path):
    """Durée d'un fichier audio, sans le décoder entièrement."""
    try:
        import soundfile
        info = soundfile.info(str(path))
        return info.frames / info.samplerate
    except Exception:
        pass
    try:
        import wave
        with wave.open(str(path)) as w:
            return w.getnframes() / w.getframerate()
    except Exception:
        return None


def check_alignment(grid_path, audio):
    """Le MIDI décrit-il bien CET enregistrement ? Message d'écart, ou None."""
    heard = audio_duration(audio)
    if heard is None or heard <= 0:
        return None
    lines = [l for l in Path(grid_path).read_text().splitlines() if l.strip()]
    if not lines:
        return 'grille vide'
    written = float(lines[-1].split()[1])
    if written <= 0:
        return 'grille de durée nulle'
    # L'audio peut dépasser le MIDI de quelques secondes (résonance finale).
    if 0 <= heard - written <= ALIGNMENT_TAIL_SECONDS:
        return None
    if abs(written - heard) / heard > ALIGNMENT_TOLERANCE:
        return (f'MIDI désaligné : {written:.0f}s contre {heard:.0f}s d\'audio '
                f'({written / heard:.2f}×)')
    return None


def _bridge_and_score(name, midi, audio, clean_mode):
    """Grille produite par le moteur MIDI, puis mesure du moteur audio dessus."""
    lab = Path(str(midi) + '.lab')
    res = subprocess.run(['node', str(MIDI_TO_GRID), str(midi), '--lab', str(lab)],
                         capture_output=True, text=True)
    if res.returncode != 0 or not lab.exists():
        return None, (res.stderr or 'conversion MIDI échouée').strip()[:80]
    drift = check_alignment(lab, audio)
    if drift:
        return None, drift
    rows, failures = bench_pairs([(name, audio, lab)], clean_mode)
    if failures:
        return None, ' '.join(failures[0][1])
    return rows[0], None


def stream_maestro(count, clean_mode='legacy'):
    """MAESTRO par plages d'octets : piano, audio libre, MIDI exactement aligné."""
    remote = HttpRangeFile(MAESTRO_ZIP)
    print(f"MAESTRO : archive de {remote.length / 1e9:.1f} Go, lue à distance sans la télécharger")
    archive = zipfile.ZipFile(remote)
    stems = {}
    for member in archive.namelist():
        root, ext = os.path.splitext(member)
        if ext in ('.wav', '.midi'):
            stems.setdefault(root, {})[ext] = member
    pairs = [(root, m['.midi'], m['.wav']) for root, m in sorted(stems.items())
             if '.midi' in m and '.wav' in m][:count]
    print(f"  index lu en {remote.requests} requêtes ({remote.bytes / 1e6:.1f} Mo) — "
          f"{len(pairs)} morceaux retenus\n")
    rows, failures = [], []
    for root, midi_member, wav_member in pairs:
        name = os.path.basename(root)
        with tempfile.TemporaryDirectory() as tmp:
            midi = Path(tmp) / 'track.midi'
            audio = Path(tmp) / 'track.wav'
            try:
                midi.write_bytes(archive.read(midi_member))
                audio.write_bytes(archive.read(wav_member))
            except Exception as exc:
                failures.append((name, [f'extraction : {str(exc)[:60]}']))
                continue
            row, err = _bridge_and_score(name, midi, audio, clean_mode)
            (failures if err else rows).append((name, [err]) if err else row)
            print(f"  {short_name(name, 46):46s} {'✓' if not err else '✗'}", flush=True)
    print(f"\nréseau total : {remote.bytes / 1e9:.2f} Go — disque occupé : un morceau à la fois")
    return report(rows, failures)


def stream_slakh(count, version='baby', clean_mode='legacy'):
    """Slakh en flux : on traverse le tar.gz sans jamais l'écrire."""
    url = SLAKH_TARS.get(version)
    if not url:
        sys.exit(f"Version Slakh inconnue : {version} (baby, 2100-redux)")
    print(f"Slakh « {version} » : archive traversée en flux, jamais stockée\n")
    rows, failures = [], []
    pending = {}
    downloaded = 0
    with tempfile.TemporaryDirectory() as tmp:
        stream = urllib.request.urlopen(url, timeout=120)
        with tarfile.open(fileobj=stream, mode='r|gz') as tar:
            for member in tar:
                if not member.isfile():
                    continue
                downloaded += member.size
                parts = member.name.split('/')
                if len(parts) < 3:
                    continue
                track, leaf = parts[-2], parts[-1]
                role = ('midi' if leaf in ('all_src.mid', 'all_src.midi')
                        else 'audio' if leaf in ('mix.wav', 'mix.flac') else None)
                if role is None:
                    continue
                target = Path(tmp) / f'{track}_{leaf}'
                with open(target, 'wb') as out:
                    shutil.copyfileobj(tar.extractfile(member), out)
                pending.setdefault(track, {})[role] = target
                if {'midi', 'audio'} <= pending[track].keys():
                    row, err = _bridge_and_score(track, pending[track]['midi'],
                                                 pending[track]['audio'], clean_mode)
                    (failures if err else rows).append((track, [err]) if err else row)
                    print(f"  {short_name(track, 46):46s} {'✓' if not err else '✗'}", flush=True)
                    for path in pending.pop(track).values():
                        path.unlink(missing_ok=True)
                    if len(rows) + len(failures) >= count:
                        break
    print(f"\nréseau traversé : {downloaded / 1e9:.2f} Go — disque occupé : un morceau à la fois")
    return report(rows, failures)




# ─────────────────────────────────────────────────────────────────────────────
# Diagnostic : l'écart de FONDAMENTALE.
#
# Mesuré sur les 180 morceaux de GuitarSet, la perte se décompose ainsi :
# 31,4 % du temps le moteur ne trouve pas la bonne fondamentale, contre 5,8 %
# seulement où il la trouve mais se trompe de qualité. En funk : 50,3 % contre
# 7,1 %. Le vocabulaire restreint (maj/min/dim) ne coûte donc presque rien ;
# c'est la fondamentale qui porte tout.
#
# Reste à savoir si cet écart est SYSTÉMATIQUE. Sur 03_Jazz3-137-Eb_comp, le
# seul morceau à 0,0 %, il l'est : 54,7 % du temps la fondamentale retenue est
# +4 demi-tons au-dessus de la bonne — le moteur nomme l'accord par sa TIERCE.
# Si ce motif se retrouve sur tout le corpus, il y a une cible nette ; sinon
# c'est une confusion diffuse, et le remède n'est pas le même.

INTERVAL_NAMES = {
    0: 'juste', 1: '+1 (demi-ton)', 2: '+2 (ton)', 3: '+3 (tierce mineure)',
    4: '+4 (TIERCE majeure)', 5: '+5 (quarte)', 6: '+6 (triton)',
    7: '+7 (QUINTE)', 8: '+8 (sixte mineure)', 9: '+9 (sixte majeure)',
    10: '+10 (septième mineure)', 11: '+11 (septième majeure)',
}


def root_pc(label):
    """Classe de hauteur de la fondamentale, depuis « C#:maj » ou « C#m7 »."""
    head = label.split(':')[0] if ':' in label else label
    name = head[:2] if len(head) > 1 and head[1] in '#b' else head[:1]
    return PCS.get(name)


def diagnose_roots(pairs, clean_mode='legacy'):
    """Histogramme des écarts de fondamentale, pondéré par la durée."""
    import collections
    histogram = collections.Counter()
    total = 0.0
    examined = 0
    for index, (name, wav, ref) in enumerate(pairs, start=1):
        analysis, _ = run_audio_engine(wav, clean_mode)
        if not analysis or not analysis.get('chords'):
            continue
        reference = []
        for line in Path(ref).read_text().splitlines():
            parts = line.split()
            if len(parts) >= 3:
                reference.append((float(parts[0]), float(parts[1]), parts[2]))
        for chord in analysis['chords']:
            if chord.get('chord') in (None, 'N'):
                continue
            middle = (chord['startTime'] + chord['endTime']) / 2
            heard = next((l for a, b, l in reference if a <= middle < b), None)
            if not heard or heard == 'N':
                continue
            expected, got = root_pc(heard), root_pc(chord['chord'])
            if expected is None or got is None:
                continue
            seconds = chord['endTime'] - chord['startTime']
            histogram[(got - expected) % 12] += seconds
            total += seconds
        examined += 1
        print(f"  [{index:3d}/{len(pairs)}] {short_name(name, 44):44s}", flush=True)
    if not total:
        sys.exit('Aucun accord comparable.')
    print(f"\nÉcart entre la fondamentale retenue et la bonne — {examined} morceaux, "
          f"pondéré par la durée\n")
    for interval, seconds in sorted(histogram.items(), key=lambda kv: -kv[1]):
        share = 100 * seconds / total
        bar = '█' * int(share / 2)
        print(f"  {INTERVAL_NAMES[interval]:24s} {share:5.1f} %  {bar}")
    wrong = 100 * (total - histogram[0]) / total
    print(f"\n  fondamentale fausse : {wrong:.1f} % du temps")
    if wrong > 0:
        top = max((k for k in histogram if k), key=lambda k: histogram[k])
        print(f"  écart le plus fréquent parmi les erreurs : {INTERVAL_NAMES[top]} "
              f"({100 * histogram[top] / (total - histogram[0]):.1f} % des erreurs)")
    return True


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--list', action='store_true', help='les corpus déclarés et ce qu\'ils exigent')
    p.add_argument('--fetch', metavar='CORPUS', help='télécharge un corpus (réseau requis)')
    p.add_argument('--bench', metavar='CORPUS', help='mesure le moteur audio sur un corpus mirdata')
    p.add_argument('--bench-local', metavar='DOSSIER', help='mesure sur des triplets locaux (vérité terrain fournie)')
    p.add_argument('--bench-tree', metavar='DOSSIER',
                   help='pont sur une arborescence un-dossier-par-morceau (Slakh téléchargé)')
    p.add_argument('--bridge', metavar='DOSSIER_MIDI', help='vérité terrain produite par le moteur MIDI')
    p.add_argument('--audio', metavar='DOSSIER', help='audio correspondant, pour --bridge')
    p.add_argument('--data-home', default=os.path.expanduser('~/zic-corpus'))
    p.add_argument('--limit', type=int, default=0, help='nombre de morceaux (0 = tous)')
    p.add_argument('--clean-mode', default='legacy')
    p.add_argument('--diagnose-root', action='store_true',
                   help="histogramme des écarts de fondamentale au lieu des scores")
    p.add_argument('--engine', metavar='FICHIER', default=None,
                   help='moteur à mesurer (par défaut celui de l\'app) — pour comparer une variante')
    p.add_argument('--stream', metavar='CORPUS', choices=('maestro', 'slakh'),
                   help="mesure SANS télécharger l'archive (maestro par plages, slakh en flux)")
    p.add_argument('--tracks', type=int, default=10, help='nombre de morceaux en mode flux')
    p.add_argument('--style', default=None,
                   help='ne garder que les morceaux dont le nom contient ceci (ex. Funk)')
    p.add_argument('--version', default=None,
                   help="version du corpus (slakh : baby ≈ 5 Go, 2100-redux ≈ 100 Go)")
    p.add_argument('--all-tracks', action='store_true',
                   help='ne pas filtrer (GuitarSet : inclut les solos, mesurés contre la grille du comp)')
    p.add_argument('--merge-mode', default='uniform',
                   choices=('uniform', 'offvocab', 'interruptions'),
                   help="forme du fondu mesuré par --merge-sweep : 'uniform' (tout segment "
                        "court), 'offvocab' (court ET hors du vocabulaire dominant), "
                        "'interruptions' (court ET encadré par deux fois le même accord). "
                        "Les trois ont été mesurées le 26/10/2026 : voir leurs en-têtes.")
    p.add_argument('--merge-sweep', metavar='FRACTIONS', default=None,
                   help='mesure le fondu des segments courts à plusieurs fractions du pas '
                        'harmonique médian, en une seule exécution du moteur (ex. 0,0.5,0.67,0.8)')
    p.add_argument('--chords', metavar='CHAMP', default=None,
                   help="annotation d'accords à prendre (ex. leadsheet_chords, inferred_chords)")
    args = p.parse_args()
    if args.style:
        globals()['STYLE_FILTER'] = args.style
    if args.engine:
        globals()['ENGINE'] = Path(args.engine).resolve()
        print(f"moteur mesuré : {ENGINE}")

    if args.list or not any([args.fetch, args.bench, args.bench_local, args.bridge,
                             args.bench_tree, args.stream]):
        list_corpora()
        return 0
    if args.stream:
        if args.stream == 'maestro':
            return 0 if stream_maestro(args.tracks, args.clean_mode) else 1
        return 0 if stream_slakh(args.tracks, args.version or 'baby', args.clean_mode) else 1
    if args.fetch:
        fetch(args.fetch, Path(args.data_home), args.version)
        return 0
    if args.bench_tree:
        return 0 if bench_tree(args.bench_tree, args.clean_mode, args.limit) else 1
    if args.bench_local:
        return 0 if bench_local(args.bench_local, args.clean_mode) else 1
    if args.bridge:
        if not args.audio:
            sys.exit('--bridge demande --audio <dossier>')
        return 0 if bench_bridge(args.bridge, args.audio, args.clean_mode) else 1
    sweep = None
    if args.merge_sweep:
        sweep = sorted({float(x) for x in args.merge_sweep.split(',') if x.strip()} | {0.0})
        globals()['MERGE_FN'] = {'uniform': merge_short_segments,
                                 'offvocab': merge_offvocab_segments,
                                 'interruptions': merge_interruptions}[args.merge_mode]
        print(f"forme du fondu mesurée : {args.merge_mode}")
    return 0 if bench_mirdata(args.bench, Path(args.data_home), args.limit, args.clean_mode, args.chords, args.all_tracks, args.version,
                              args.diagnose_root, sweep) else 1


if __name__ == '__main__':
    sys.exit(main())

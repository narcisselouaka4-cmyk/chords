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
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
VENV_PY = PROJECT / '.venv' / 'bin' / 'python'
PROCESSOR = PROJECT / 'electron' / 'audio-processor.py'
MIDI_TO_GRID = PROJECT / 'scripts' / 'midi-to-grid.mjs'

CORPORA = {
    'guitarset': {
        'tier': 'LIBRE',
        'mirdata_id': 'guitarset',
        'audio': 'inclus (CC BY 4.0)',
        'size': '360 extraits · ~3 Go',
        'why': "Audio redistribuable ET accords horodatés. Le seul corpus utilisable sans rien fournir.",
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
        'size': '2100 morceaux · ~100 Go (baby : ~5 Go)',
        'why': "Multi-instrument synthétisé depuis du MIDI : pistes séparées et grille exacte.",
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


def fetch(name, data_home):
    try:
        import mirdata
    except ImportError:
        sys.exit("mirdata absent : pip install mirdata")
    conf = CORPORA.get(name)
    if not conf:
        sys.exit(f"Corpus inconnu : {name}")
    ds = mirdata.initialize(conf['mirdata_id'], data_home=str(data_home))
    print(f"Téléchargement de {name} vers {data_home} — {conf['size']}")
    if conf['audio'] == 'À FOURNIR':
        print("  Annotations seules : l'audio devra être déposé à côté, légalement obtenu.")
    ds.download()
    print("Vérification…")
    missing, invalid = ds.validate()
    print(f"  manquants : {sum(len(v) for v in missing.values())} · invalides : {sum(len(v) for v in invalid.values())}")


def run_audio_engine(wav_path, clean_mode='legacy'):
    """La grille produite par le moteur audio, telle que l'app la calcule."""
    python = str(VENV_PY) if VENV_PY.exists() else sys.executable
    out = subprocess.run([python, str(PROCESSOR), 'analyze-chords', str(wav_path), clean_mode],
                         capture_output=True, text=True, timeout=900)
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
        out[metric] = 100 * mir_eval.chord.weighted_accuracy(comparison, durations)
    return out


def bench_pairs(pairs, clean_mode='legacy'):
    """pairs : [(nom, wav, chemin .lab de référence)]"""
    rows, failures = [], []
    for name, wav, ref in pairs:
        analysis, err = run_audio_engine(wav, clean_mode)
        if not analysis or not analysis.get('chords'):
            failures.append((name, err or ['aucun accord']))
            continue
        ref_i, ref_l = read_lab(ref)
        est_i, est_l = intervals_labels(analysis['chords'])
        try:
            rows.append((name, score(ref_i, ref_l, est_i, est_l), len(analysis['chords']), len(ref_l)))
        except Exception as exc:  # une grille vide ou dégénérée ne doit pas tout arrêter
            failures.append((name, [str(exc)[:70]]))
    return rows, failures


def report(rows, failures):
    if rows:
        print(f"\n{'morceau':44s} {'root':>7s} {'majmin':>7s} {'triads':>7s} {'7es':>7s}  {'est':>4s}/{'réf':>4s}")
        print('─' * 92)
        for name, s, n_est, n_ref in rows:
            print(f"{name[:44]:44s} {s['root']:6.1f}% {s['majmin']:6.1f}% {s['triads']:6.1f}% {s['sevenths']:6.1f}%  {n_est:4d}/{n_ref:4d}")
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
        print(f"{len(pairs)} morceaux avec vérité terrain fournie — moteur audio « {clean_mode} »")
        return report(*bench_pairs(pairs, clean_mode))


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


def bench_mirdata(name, data_home, limit, clean_mode='legacy'):
    try:
        import mirdata
    except ImportError:
        sys.exit("mirdata absent : pip install mirdata")
    conf = CORPORA.get(name)
    if not conf:
        sys.exit(f"Corpus inconnu : {name}")
    ds = mirdata.initialize(conf['mirdata_id'], data_home=str(data_home))
    tracks = ds.load_tracks()
    with tempfile.TemporaryDirectory() as tmp:
        pairs = []
        for track_id, track in tracks.items():
            audio = getattr(track, 'audio_path', None)
            chords = getattr(track, 'chords', None)
            if not audio or not os.path.exists(audio) or chords is None:
                continue
            lab = Path(tmp) / f'{track_id.replace("/", "_")}.lab'
            lab.write_text('\n'.join(
                f'{s:.6f}\t{e:.6f}\t{l}' for (s, e), l in zip(chords.intervals, chords.labels)) + '\n')
            pairs.append((track_id, audio, lab))
            if limit and len(pairs) >= limit:
                break
        if not pairs:
            sys.exit(f"{name} : aucun morceau avec audio ET annotations sous {data_home}.\n"
                     f"  {conf['why']}\n  Audio : {conf['audio']}")
        print(f"{len(pairs)} morceaux de {name} — moteur audio « {clean_mode} »")
        return report(*bench_pairs(pairs, clean_mode))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--list', action='store_true', help='les corpus déclarés et ce qu\'ils exigent')
    p.add_argument('--fetch', metavar='CORPUS', help='télécharge un corpus (réseau requis)')
    p.add_argument('--bench', metavar='CORPUS', help='mesure le moteur audio sur un corpus mirdata')
    p.add_argument('--bench-local', metavar='DOSSIER', help='mesure sur des triplets locaux (vérité terrain fournie)')
    p.add_argument('--bridge', metavar='DOSSIER_MIDI', help='vérité terrain produite par le moteur MIDI')
    p.add_argument('--audio', metavar='DOSSIER', help='audio correspondant, pour --bridge')
    p.add_argument('--data-home', default=os.path.expanduser('~/zic-corpus'))
    p.add_argument('--limit', type=int, default=0, help='nombre de morceaux (0 = tous)')
    p.add_argument('--clean-mode', default='legacy')
    args = p.parse_args()

    if args.list or not any([args.fetch, args.bench, args.bench_local, args.bridge]):
        list_corpora()
        return 0
    if args.fetch:
        fetch(args.fetch, Path(args.data_home))
        return 0
    if args.bench_local:
        return 0 if bench_local(args.bench_local, args.clean_mode) else 1
    if args.bridge:
        if not args.audio:
            sys.exit('--bridge demande --audio <dossier>')
        return 0 if bench_bridge(args.bridge, args.audio, args.clean_mode) else 1
    return 0 if bench_mirdata(args.bench, Path(args.data_home), args.limit, args.clean_mode) else 1


if __name__ == '__main__':
    sys.exit(main())

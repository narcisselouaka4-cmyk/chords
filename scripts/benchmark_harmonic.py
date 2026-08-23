#!/usr/bin/env python3
"""Harnais de mesure du moteur harmonique — corpus réel, métriques reproductibles.

Sans ce harnais, une cible du type « 95 % de réussite » n'est pas vérifiable :
les chiffres historiques du projet proviennent de corpus différents et ne sont
pas comparables entre eux.

Sous-commandes
--------------
  sheet   : analyse un morceau et produit une fiche de correction (Markdown)
            + un brouillon de vérité terrain (JSON) à valider par l'utilisateur.
  run     : exécute le moteur sur tout le corpus validé et écrit un rapport.
  compare : compare deux rapports (avant / après une modification du moteur).

Exemples
--------
  python3 scripts/benchmark_harmonic.py sheet --track you-are-yahweh
  python3 scripts/benchmark_harmonic.py run --label baseline
  python3 scripts/benchmark_harmonic.py compare baseline apres-alignement
"""

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from datetime import datetime

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AP_PATH = os.path.join(PROJECT, 'electron', 'audio-processor.py')
CORPUS_PATH = os.path.join(PROJECT, 'tests', 'corpus', 'corpus.json')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'harmonic')
CACHE_DIR = os.path.join(OUT_DIR, 'cache')

# Tolérance de rattachement d'une frontière prédite à une frontière attendue.
BOUNDARY_TOLERANCE_S = 0.25

# Zone neutralisée de part et d'autre de chaque frontière attendue, pour le
# score tolérant. À ajuster si les vérités terrain gagnent en précision.
BOUNDARY_BLUR_S = 0.5

_ap = None


def ap():
    """Charge audio-processor.py (nom de fichier non importable directement)."""
    global _ap
    if _ap is None:
        spec = importlib.util.spec_from_file_location('audio_processor', AP_PATH)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _ap = mod
    return _ap


# --------------------------------------------------------------------------
# Normalisation des étiquettes d'accord
# --------------------------------------------------------------------------

# _parse_chord_label du moteur n'accepte que les dièses : une vérité terrain
# écrite en bémols (Bb, Eb, Ab — courant en gospel) serait silencieusement
# comptée fausse partout. On convertit donc avant de parser.
_FLAT_TO_SHARP = {'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E',
                  'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'}


def _to_sharp(label):
    """Réécrit la fondamentale en dièses et normalise les symboles unicode."""
    label = (label or '').replace('\u266d', 'b').replace('\u266f', '#')
    # \u03947 et \u0394 notent tous deux la septième majeure : traiter le plus long d'abord.
    label = label.replace('\u03947', 'maj7').replace('\u0394', 'maj7')
    # Notations de real book : Aø7 = demi-diminué, G-7 = mineur 7.
    label = label.replace('\u00f87', 'm7b5').replace('\u00f8', 'm7b5')
    label = label.replace('-7', 'm7').replace('-', 'm')
    if len(label) >= 2 and label[:2] in _FLAT_TO_SHARP:
        label = _FLAT_TO_SHARP[label[:2]] + label[2:]
    return label


def normalize_label(label, apply_vocabulary=True):
    """(pitch class, suffixe) ou None. Rend la comparaison insensible à
    l'enharmonie (F#m == Gbm) et aux slash chords.

    `apply_vocabulary` projette l'étiquette dans le vocabulaire de sortie
    actuellement actif du moteur. Sans cela, une vérité terrain écrite en
    notation complète (Aø7, Bbmaj7) est comptée fausse face à un moteur dont
    le mode vocabulaire simple est activé — on mesurerait alors une décision
    produit, pas une erreur de détection.
    """
    if not label or label == 'N':
        return None
    if '/' in label:
        label = label.split('/')[0]
    label = _to_sharp(label)
    root, suffix = ap()._parse_chord_label(label)
    if root is None:
        return None
    suffix = suffix or ''
    if apply_vocabulary:
        suffix = simplify_suffix(suffix)
    return (root % 12, suffix)


def simplify_suffix(suffix):
    """Applique au suffixe la même projection que _simplify_chord_vocabulary."""
    m = ap()
    if not getattr(m, 'ENABLE_SIMPLE_CHORD_VOCABULARY', False):
        return suffix
    if suffix in m.SIMPLE_ALLOWED_SUFFIXES:
        return suffix
    if suffix in ('sus2', 'sus4'):
        return ''
    if suffix == 'm7b5':
        return 'dim'
    if suffix in m.SIMPLE_MINOR_FAMILY:
        return 'm'
    return ''


def same_chord(a, b):
    na, nb = normalize_label(a), normalize_label(b)
    return na is not None and na == nb


def same_root(a, b):
    na, nb = normalize_label(a), normalize_label(b)
    return na is not None and nb is not None and na[0] == nb[0]


# --------------------------------------------------------------------------
# Préparation audio
# --------------------------------------------------------------------------

def to_wav(media_path):
    """Convertit un média en WAV mono 22050 Hz, avec cache disque."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    # hash() est randomisé par processus en Python 3 : la clé changeait à
    # chaque exécution et le cache ne servait jamais. On indexe sur le contenu
    # identifiant du fichier (chemin, taille, date) pour que le cache soit
    # à la fois stable et invalidé si le média change.
    st = os.stat(media_path)
    key = f'{os.path.abspath(media_path)}|{st.st_size}|{int(st.st_mtime)}'
    stem = hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]
    wav_path = os.path.join(CACHE_DIR, f'{stem}.wav')
    if os.path.exists(wav_path):
        return wav_path
    from imageio_ffmpeg import get_ffmpeg_exe
    cmd = [get_ffmpeg_exe(), '-y', '-i', media_path, '-vn',
           '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', wav_path]
    proc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg a échoué sur {media_path}:\n{proc.stderr[-500:]}')
    return wav_path


def analyze(media_path):
    """Exécute le pipeline et mesure sa durée (métrique de performance)."""
    wav_path = to_wav(media_path)
    t0 = time.time()
    result = ap().analyze_chords(wav_path, 'legacy')
    elapsed = time.time() - t0
    return result, elapsed


# --------------------------------------------------------------------------
# Métriques
# --------------------------------------------------------------------------

def overlap(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def bounds(seg):
    """Le moteur émet startTime/endTime, les vérités terrain start/end."""
    if 'startTime' in seg:
        return float(seg['startTime']), float(seg['endTime'])
    return float(seg['start']), float(seg['end'])


def score_track(gt_segments, pred_segments):
    """Compare une prédiction à une vérité terrain.

    Le score principal est pondéré par la durée : un accord faux tenu 8 s
    coûte quatre fois plus qu'un accord faux tenu 2 s. C'est ce qui
    correspond à l'expérience réelle du pianiste.
    """
    total = sum(bounds(s)[1] - bounds(s)[0] for s in gt_segments)
    if total <= 0:
        raise ValueError('vérité terrain vide')

    exact = 0.0
    root_ok = 0.0
    covered = 0.0

    # Score tolérant : on neutralise une zone de flou autour de chaque frontière
    # attendue. Les vérités terrain saisies à la main ont une imprécision de
    # l'ordre de la seconde ; sans ce flou, on mesure autant l'imprécision de
    # l'annotation que l'erreur du moteur.
    blur = BOUNDARY_BLUR_S
    gt_edges = sorted({bounds(s)[0] for s in gt_segments} | {bounds(s)[1] for s in gt_segments})
    exact_tol = 0.0
    total_tol = 0.0

    for g in gt_segments:
        g0, g1 = bounds(g)
        for p in pred_segments:
            p0, p1 = bounds(p)
            ov = overlap(g0, g1, p0, p1)
            if ov <= 0:
                continue
            covered += ov
            hit = same_chord(g['chord'], p.get('chord'))
            if hit:
                exact += ov
            if same_root(g['chord'], p.get('chord')):
                root_ok += ov
            # Portion du recouvrement située hors des zones de flou.
            c0, c1 = max(g0, p0), min(g1, p1)
            clear = (c1 - c0) - sum(overlap(c0, c1, e - blur, e + blur) for e in gt_edges)
            clear = max(0.0, clear)
            total_tol += clear
            if hit:
                exact_tol += clear

    # Frontières : chaque frontière attendue est-elle retrouvée à temps ?
    gt_bounds = sorted({round(bounds(s)[0], 3) for s in gt_segments[1:]})
    pred_bounds = sorted({round(bounds(s)[0], 3) for s in pred_segments[1:]})
    deltas = []
    for gb in gt_bounds:
        if not pred_bounds:
            break
        deltas.append(min(abs(pb - gb) for pb in pred_bounds))
    deltas.sort()
    p50 = deltas[len(deltas) // 2] if deltas else None
    within = (sum(1 for d in deltas if d <= BOUNDARY_TOLERANCE_S) / len(deltas)) if deltas else None

    return {
        'chord_accuracy': round(exact / total, 4),
        'chord_accuracy_tolerant': round(exact_tol / total_tol, 4) if total_tol > 0 else None,
        'root_accuracy': round(root_ok / total, 4),
        'quality_accuracy_on_correct_root': round(exact / root_ok, 4) if root_ok > 0 else None,
        'coverage': round(covered / total, 4),
        'boundary_median_s': round(p50, 3) if p50 is not None else None,
        'boundary_within_tolerance': round(within, 4) if within is not None else None,
        'segments_gt': len(gt_segments),
        'segments_pred': len(pred_segments),
        'fragmentation': round(len(pred_segments) / len(gt_segments), 3),
        'gt_duration_s': round(total, 2),
    }


def score_tempo(pred, truth):
    """Compare un tempo à sa vérité terrain, en distinguant les erreurs
    d'octave (moitié / double) des erreurs franches. L'erreur d'octave est le
    mode de défaillance dominant des suiveurs de beats."""
    out = {'tempo_pred': pred, 'tempo_gt': truth, 'tempo_verdict': None,
           'tempo_error_pct': None}
    if not pred or not truth:
        return out
    ratio = pred / truth
    out['tempo_error_pct'] = round((ratio - 1.0) * 100, 1)
    for verdict, target in (('exact', 1.0), ('double', 2.0), ('moitié', 0.5),
                            ('quadruple', 4.0), ('quart', 0.25)):
        if abs(ratio - target) / target < 0.06:
            out['tempo_verdict'] = verdict
            break
    else:
        out['tempo_verdict'] = 'faux'
    return out


# --------------------------------------------------------------------------
# Reproductibilité
# --------------------------------------------------------------------------

def engine_snapshot():
    """Capture ce qui permet de rejouer exactement un résultat."""
    flags = {name: getattr(ap(), name) for name in dir(ap())
             if name.startswith('ENABLE_')}
    try:
        commit = subprocess.run(['git', '-C', PROJECT, 'rev-parse', '--short', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
        dirty = bool(subprocess.run(['git', '-C', PROJECT, 'status', '--porcelain',
                                     'electron/audio-processor.py'],
                                    capture_output=True, text=True).stdout.strip())
    except Exception:
        commit, dirty = 'unknown', False
    return {
        'commit': commit,
        'audio_processor_modified': dirty,
        'flags': flags,
        'vocabulary': sorted(getattr(ap(), 'SIMPLE_ALLOWED_SUFFIXES', [])),
        'date': datetime.now().isoformat(timespec='seconds'),
    }


def load_corpus():
    with open(CORPUS_PATH, encoding='utf-8') as f:
        return json.load(f)


# --------------------------------------------------------------------------
# Commandes
# --------------------------------------------------------------------------

def cmd_sheet(args):
    """Produit une fiche de correction pour validation humaine."""
    corpus = load_corpus()
    track = next((t for t in corpus['tracks'] if t['id'] == args.track), None)
    if track is None:
        sys.exit(f"morceau inconnu : {args.track}")

    print(f"Analyse de « {track['title'] }» …")
    result, elapsed = analyze(track['media'])
    chords = result.get('chords', [])
    print(f"  {len(chords)} segments en {elapsed:.1f}s (tempo détecté : {result.get('tempo')})")

    gt_path = os.path.join(PROJECT, 'tests', 'corpus', 'gt', f"{track['id']}.json")
    if os.path.exists(gt_path) and not args.force:
        with open(gt_path, encoding='utf-8') as f:
            existing = json.load(f)
        if existing.get('status') in ('validated', 'provisional'):
            sys.exit(f"{gt_path} porte le statut « {existing['status']} » : "
                     f"l'écraser détruirait une vérité terrain relue. "
                     f"Utilise --force si c'est bien l'intention.")
    draft = {
        'trackId': track['id'],
        'title': track['title'],
        'media': track['media'],
        'status': 'draft',
        'key': result.get('key'),
        'tempo': result.get('tempo'),
        'segments': [{'start': round(bounds(c)[0], 2), 'end': round(bounds(c)[1], 2),
                      'chord': c.get('chord', 'N')} for c in chords],
    }
    with open(gt_path, 'w', encoding='utf-8') as f:
        json.dump(draft, f, ensure_ascii=False, indent=2)

    md_path = os.path.join(OUT_DIR, f"fiche-{track['id']}.md")
    lines = [
        f"# Fiche de correction — {track['title']}",
        '',
        f"Tonalité détectée : **{result.get('key')}** · tempo : **{result.get('tempo')} BPM**",
        f"· {len(chords)} segments · analyse en {elapsed:.1f}s",
        '',
        '> Corrige la colonne **Correct** uniquement quand l\'accord détecté est faux.',
        '> Laisse vide si le détecté est bon. Reporte ensuite tes corrections dans',
        f"> `tests/corpus/gt/{track['id']}.json` (ou dis-moi les lignes fausses).",
        '',
        '| # | Début | Fin | Durée | Détecté | Correct |',
        '|--:|------:|----:|------:|---------|---------|',
    ]
    for i, c in enumerate(chords, 1):
        c0, c1 = bounds(c)
        dur = c1 - c0
        lines.append(f"| {i} | {fmt_time(c0)} | {fmt_time(c1)} "
                     f"| {dur:.1f}s | `{c.get('chord', 'N')}` | |")
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    print(f"  fiche  : {md_path}")
    print(f"  brouillon vérité terrain : {gt_path}")


def fmt_time(t):
    return f"{int(t // 60)}:{t % 60:05.2f}"


def audio_onset(wav_path, rel_threshold=0.02):
    """Instant du premier son du fichier, en secondes.

    Sert de garde-fou d'alignement : une vérité terrain relevée sur une vidéo
    ou un autre montage peut être décalée par rapport au fichier analysé. Un
    décalage de quelques secondes suffit à faire chuter le score de 30 points
    et à envoyer l'agent suivant corriger un moteur qui n'a rien fait de mal.
    C'est exactement ce qui s'est produit sur « You Are Yahweh » : 18,09 s de
    silence en tête du fichier, découvertes le 2026-08-23.
    """
    import librosa
    import numpy as np
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    if len(rms) == 0 or rms.max() <= 0:
        return 0.0
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=512)
    return float(times[int(np.argmax(rms > rms.max() * rel_threshold))])


def check_alignment(track_id, wav_path, gt_segments, tolerance=1.5):
    """Compare le début du son au début de la vérité terrain.

    Retourne un message d'alerte, ou None si l'alignement est plausible.
    """
    onset = audio_onset(wav_path)
    gt_start = min(bounds(s)[0] for s in gt_segments)
    delta = onset - gt_start
    if abs(delta) <= tolerance:
        return None
    return ("  [ALERTE] " + track_id + " : le son commence a "
            + format(onset, '.2f') + "s mais la verite terrain a "
            + format(gt_start, '.2f') + "s (ecart " + format(delta, '+.2f')
            + "s). Un decalage d'axe de temps fausse la mesure bien plus que "
            "le moteur lui-meme : verifie avant d'exploiter ce chiffre.")


def cmd_run(args):
    corpus = load_corpus()
    # `validated` forme le chiffre de référence ; `provisional` est mesuré et
    # affiché à part (annotation plausible mais de provenance non confirmée) :
    # utile au suivi de non-régression, jamais mêlé au chiffre officiel.
    wanted = ('validated', 'provisional')
    tracks = [t for t in corpus['tracks']
              if t.get('status') in wanted and (not args.only or t['id'] == args.only)]
    if not tracks:
        sys.exit("aucun morceau mesurable dans le corpus — commence par `sheet`, "
                 "fais valider la fiche, puis passe le morceau en status=validated")

    report = {'label': args.label, 'engine': engine_snapshot(), 'tracks': {},
              'status': {t['id']: t.get('status') for t in tracks}}
    for track in tracks:
        gt_path = os.path.join(PROJECT, 'tests', 'corpus', 'gt', f"{track['id']}.json")
        with open(gt_path, encoding='utf-8') as f:
            gt = json.load(f)
        warning = check_alignment(track['id'], to_wav(track['media']), gt['segments'])
        if warning:
            print(warning)
        result, elapsed = analyze(track['media'])
        metrics = score_track(gt['segments'], result.get('chords', []))
        metrics['alignment_warning'] = warning
        metrics['analysis_seconds'] = round(elapsed, 1)
        metrics['realtime_factor'] = round(elapsed / max(metrics['gt_duration_s'], 1e-6), 3)
        metrics.update(score_tempo(result.get('tempo'), gt.get('tempo')))
        metrics['tempo_confidence'] = gt.get('tempoConfidence')
        metrics['key_pred'] = result.get('key')
        metrics['key_gt'] = gt.get('key')
        metrics['status'] = track.get('status')
        report['tracks'][track['id']] = metrics
        print(f"{track['id']:<28} accord {metrics['chord_accuracy']:.1%} "
              f"(tolérant {fmt_pct(metrics['chord_accuracy_tolerant'])}) "
              f"· fondamentale {metrics['root_accuracy']:.1%} "
              f"· frontières ±{BOUNDARY_TOLERANCE_S}s {fmt_pct(metrics['boundary_within_tolerance'])} "
              f"· tempo {metrics['tempo_pred']} vs {metrics['tempo_gt']} ({metrics['tempo_verdict']})")

    # Moyenne pondérée par la durée : un morceau de 4 min pèse plus qu'un de 1 min.
    def aggregate(subset):
        total = sum(m['gt_duration_s'] for m in subset)
        if total <= 0:
            return None
        return {
            'chord_accuracy': round(sum(m['chord_accuracy'] * m['gt_duration_s']
                                        for m in subset) / total, 4),
            'root_accuracy': round(sum(m['root_accuracy'] * m['gt_duration_s']
                                       for m in subset) / total, 4),
            'tempo_exact': sum(1 for m in subset if m.get('tempo_verdict') == 'exact'),
            'tracks': len(subset),
            'total_duration_s': round(total, 1),
        }

    validated = [m for m in report['tracks'].values() if m.get('status') == 'validated']
    provisional = [m for m in report['tracks'].values() if m.get('status') == 'provisional']
    report['global'] = aggregate(validated) or aggregate(list(report['tracks'].values()))
    report['global_provisional'] = aggregate(provisional)
    total = report['global']['total_duration_s']
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{args.label}.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nGLOBAL (validés) accord {report['global']['chord_accuracy']:.1%} "
          f"· fondamentale {report['global']['root_accuracy']:.1%} "
          f"({report['global']['tracks']} morceaux, {total / 60:.1f} min)")
    gp = report.get('global_provisional')
    if gp:
        print(f"       (provisoires, hors chiffre de référence) accord "
              f"{gp['chord_accuracy']:.1%} · fondamentale {gp['root_accuracy']:.1%} "
              f"({gp['tracks']} morceaux, {gp['total_duration_s'] / 60:.1f} min)")
    print(f"rapport : {out}")


def fmt_pct(v):
    return '—' if v is None else f'{v:.1%}'


def cmd_compare(args):
    def load(label):
        with open(os.path.join(OUT_DIR, f'{label}.json'), encoding='utf-8') as f:
            return json.load(f)
    a, b = load(args.before), load(args.after)
    print(f"{'morceau':<28} {'avant':>8} {'après':>8} {'écart':>8}")
    for tid in sorted(set(a['tracks']) | set(b['tracks'])):
        va = a['tracks'].get(tid, {}).get('chord_accuracy')
        vb = b['tracks'].get(tid, {}).get('chord_accuracy')
        if va is None or vb is None:
            print(f"{tid:<28} {'—':>8} {'—':>8} {'absent':>8}")
            continue
        print(f"{tid:<28} {va:>7.1%} {vb:>8.1%} {vb - va:>+8.1%}")
    ga, gb = a['global']['chord_accuracy'], b['global']['chord_accuracy']
    print(f"{'GLOBAL':<28} {ga:>7.1%} {gb:>8.1%} {gb - ga:>+8.1%}")
    if a['engine']['flags'] != b['engine']['flags']:
        print('\nFlags modifiés entre les deux exécutions :')
        for k in sorted(set(a['engine']['flags']) | set(b['engine']['flags'])):
            fa, fb = a['engine']['flags'].get(k), b['engine']['flags'].get(k)
            if fa != fb:
                print(f'  {k}: {fa} → {fb}')


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_sheet = sub.add_parser('sheet', help='fiche de correction pour validation humaine')
    p_sheet.add_argument('--track', required=True)
    p_sheet.add_argument('--force', action='store_true',
                         help='écraser une vérité terrain validée ou provisoire')
    p_sheet.set_defaults(func=cmd_sheet)

    p_run = sub.add_parser('run', help='mesure sur le corpus validé')
    p_run.add_argument('--label', default='run')
    p_run.add_argument('--only', default=None)
    p_run.set_defaults(func=cmd_run)

    p_cmp = sub.add_parser('compare', help='compare deux rapports')
    p_cmp.add_argument('before')
    p_cmp.add_argument('after')
    p_cmp.set_defaults(func=cmd_compare)

    for sub_parser in (p_run, p_sheet):
        sub_parser.add_argument(
            '--flag', action='append', default=[], metavar='NOM=VALEUR',
            help="force un flag ENABLE_* du moteur, ex. --flag "
                 "ENABLE_UPPER_VOICE_STABILITY_GUARD=False. Répétable. Le "
                 "rapport enregistre l'état effectif de tous les flags.")

    args = parser.parse_args()
    for assignment in getattr(args, 'flag', []) or []:
        name, _, raw = assignment.partition('=')
        name = name.strip()
        if not hasattr(ap(), name):
            sys.exit(f'flag inconnu : {name}')
        value = raw.strip().lower()
        if value in ('true', '1', 'on'):
            parsed = True
        elif value in ('false', '0', 'off'):
            parsed = False
        else:
            try:
                parsed = float(raw)
            except ValueError:
                sys.exit(f'valeur non interprétable pour {name} : {raw!r}')
        setattr(ap(), name, parsed)
        print(f'  flag forcé : {name} = {parsed}')
    args.func(args)


if __name__ == '__main__':
    main()

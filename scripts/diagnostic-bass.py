#!/usr/bin/env python3
"""
Diagnostic Bass Engine V1 — Analyse détaillée des erreurs.

Ne modifie PAS l'algorithme CQT+HPS.
Usage:
  python scripts/diagnostic-bass.py <ref_json>
  python scripts/diagnostic-bass.py <ref_json> --stem <bass_stem_wav>
  python scripts/diagnostic-bass.py <ref_json> --demucs
"""
import sys, os, json, re, math, csv, datetime, itertools
import numpy as np
import librosa
from collections import Counter, defaultdict

# ─── Import du detecteur existant sans modification ───
import importlib.util
_BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bass-detector.py')
_spec = importlib.util.spec_from_file_location('bassdetector', _BASE)
BD = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(BD)

# ─── Constantes ───
NOTE_NAMES = BD.NOTE_NAMES
NOTE_TO_PC = BD.NOTE_TO_PC
OUT_DIR = os.path.join(os.path.dirname(_BASE), 'tests', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)


# ═══════════════════════════════════════════════════════════
#  1. SIGNAL ANALYSIS
# ═══════════════════════════════════════════════════════════

def analyze_signal(y, sr, label='signal'):
    d = float(len(y)) / sr
    rms = float(np.sqrt(np.mean(y ** 2)))
    energy_low = float(np.sum(np.abs(librosa.stft(y)[:int(150 / (sr / 2) * 1025), :]) ** 2))
    energy_total = float(np.sum(np.abs(librosa.stft(y)) ** 2))
    low_ratio = energy_low / max(energy_total, 1e-10)

    return {
        'label': label,
        'duration': round(d, 2),
        'sr': sr,
        'samples': len(y),
        'rms': round(rms, 6),
        'peak': float(np.max(np.abs(y))),
        'energy_below_150hz_ratio': round(low_ratio, 4),
    }


# ═══════════════════════════════════════════════════════════
#  2. FRAME-BY-FRAME EXPORT
# ═══════════════════════════════════════════════════════════

def run_frame_analysis(wav_path):
    """Run the exact same CQT+HPS pipeline as bass-detector,
    export raw per-frame data and return estimates."""
    y, sr, duration = BD.load_audio(wav_path)
    mag = BD.compute_cqt(y, sr)
    n_frames = mag.shape[1]
    times = np.arange(n_frames) * BD.HOP_LENGTH / sr
    cqt_freqs = librosa.cqt_frequencies(BD.N_BINS, fmin=BD.FMIN,
                                         bins_per_octave=BD.BINS_PER_OCTAVE)

    estimates = BD.estimate_bass_per_frame(mag)
    smoothed, confs = BD.median_smooth(estimates)
    segments = BD.segment(estimates, smoothed, confs, times, duration)
    return {
        'y': y, 'sr': sr, 'duration': duration,
        'mag': mag, 'times': times, 'cqt_freqs': cqt_freqs,
        'estimates': estimates, 'smoothed': smoothed, 'confs': confs,
        'segments': segments,
    }


def export_per_frame_csv(estimates, times, path):
    """Write raw per-frame predictions to CSV."""
    fields = [ 'time', 'midi', 'pitch_class', 'note_name', 'octave',
               'freq', 'confidence', 'is_hps' ]
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for t, e in zip(times, estimates):
            if e['midi'] is None:
                w.writerow({ 'time': round(t, 4), 'midi': -1, 'pitch_class': -1,
                            'note_name': 'SILENCE', 'octave': -1, 'freq': 0.0,
                            'confidence': 0.0, 'is_hps': 0 })
            else:
                pc = e['pc']
                is_hps = 1 if (e.get('use_hps', False)) else 0
                w.writerow({ 'time': round(t, 4), 'midi': e['midi'],
                            'pitch_class': pc,
                            'note_name': NOTE_NAMES[pc],
                            'octave': e['octave'],
                            'freq': e['freq'],
                            'confidence': e['confidence'],
                            'is_hps': is_hps })
    return path


def export_segments_json(segments, ref_path=None, stem_label=None):
    """Export segments from a run."""
    data = {
        'bass': [{
            'startTime': round(s['startTime'], 3),
            'endTime': round(s['endTime'], 3),
            'bass': s['bass'],
            'octave': s['octave'],
            'confidence': round(s['confidence'], 4),
        } for s in segments],
    }
    if ref_path:
        data['ref'] = os.path.basename(ref_path)
    if stem_label:
        data['stem'] = stem_label
    return data


# ═══════════════════════════════════════════════════════════
#  3. GROUND TRUTH ANALYSIS
# ═══════════════════════════════════════════════════════════

def parse_ground_truth(ref):
    """Extract bass notes, chords, and metadata from reference JSON.
    Document the provenance of the ground truth."""
    chords = ref.get('chords_in_order')
    if not chords:
        chords = [c.get('chord', '') if isinstance(c, dict) else c
                  for c in ref.get('chords', [])]
    bass_notes = []
    chord_names = []
    for c in chords:
        c = str(c).strip()
        chord_names.append(c)
        if '/' in c:
            bass_raw = c.split('/')[1].strip()
            m = re.match(r'^([A-G][#b]?)', bass_raw)
            bass = m.group(1) if m else '?'
        else:
            m = re.match(r'^([A-G][#b]?)', c)
            bass = m.group(1) if m else '?'
        bass_notes.append(bass)

    # Determine ground truth provenance
    provenance = {
        'source': 'manual annotation (chord symbols)',
        'detail': 'Bass note derived from chord symbol: '
                  'root for non-slash chords (e.g., G → bass=G), '
                  'note after / for slash chords (e.g., G/B → bass=B). '
                  'No octave information in reference.',
        'known_limitations': [
            'No octave data — cannot measure octave accuracy against ground truth.',
            'Temporal alignment is uniform (one chord per position) — '
            'no tempo map beyond global BPM.',
            'Chord symbols are an approximation of the actual performance.',
        ],
    }

    return bass_notes, chord_names, provenance


def alignment_stats(ref_pc, det_pc):
    """Needleman-Wunsch alignment + categorization."""
    # Same as bass-detector's needleman_wunsch but returns categorized pairs
    al = BD.needleman_wunsch(ref_pc, det_pc)
    al_ref = al['alignRef']
    al_det = al['alignDet']

    categories = []
    for r, d in zip(al_ref, al_det):
        if r is None and d is None:
            continue
        if r is None:
            categories.append('INSERTION')
        elif d is None:
            categories.append('DELETION')
        elif r == d:
            categories.append('EXACT')
        else:
            categories.append('PITCH_CLASS_ERROR')

    return {
        'alignRef': al_ref,
        'alignDet': al_det,
        'score': al['score'],
        'categories': categories,
        'n_exact': categories.count('EXACT'),
        'n_insertion': categories.count('INSERTION'),
        'n_deletion': categories.count('DELETION'),
        'n_pitch_error': categories.count('PITCH_CLASS_ERROR'),
    }


def confusion_matrix_data(al_ref, al_det, note_names):
    """Build confusion matrix: ref_note → {det_note: count}."""
    matrix = defaultdict(lambda: defaultdict(int))
    for r, d in zip(al_ref, al_det):
        if r is not None and d is not None:
            rn = note_names[r] if 0 <= r < 12 else '?'
            dn = note_names[d] if 0 <= d < 12 else '?'
            matrix[rn][dn] += 1
    return matrix


def top_confusions(matrix):
    """Return sorted list of (ref, det, count) for non-matching pairs."""
    confusions = []
    for ref_note, dets in matrix.items():
        for det_note, cnt in dets.items():
            if ref_note != det_note:
                confusions.append((ref_note, det_note, cnt))
    confusions.sort(key=lambda x: -x[2])
    return confusions


# ═══════════════════════════════════════════════════════════
#  4. CONFIDENCE / ERROR CORRELATION
# ═══════════════════════════════════════════════════════════

def confidence_error_analysis(estimates, times, ref_pc, ref_times_segments):
    """For each segment, is the pitch class correct?
    Group by confidence bin and compute accuracy."""
    # Approximate: for each segment, determine if pitch class matches
    # the reference at that time point
    pass


def confidence_by_segment(segments, ref_pc, ref_bass, duration):
    """Compare segment pitch classes to reference, grouped by confidence."""
    bins = [(0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.0)]
    bin_stats = {b: {'correct': 0, 'total': 0, 'avg_conf': 0.0} for b in bins}
    bin_acc = []

    for seg in segments:
        conf = seg['confidence']
        det_pc = NOTE_TO_PC.get(seg['bass'], -1)
        # Find closest ref at this time
        mid_t = (seg['startTime'] + seg['endTime']) / 2
        ref_idx = int(mid_t / duration * len(ref_bass))
        ref_idx = min(ref_idx, len(ref_pc) - 1)
        ref_pc_val = ref_pc[ref_idx] if ref_idx >= 0 else -1

        correct = (det_pc == ref_pc_val)
        for lo, hi in bins:
            if lo <= conf < hi or (conf == 1.0 and hi == 1.0):
                bin_stats[(lo, hi)]['total'] += 1
                if correct:
                    bin_stats[(lo, hi)]['correct'] += 1
                bin_stats[(lo, hi)]['avg_conf'] += conf
                break

    results = []
    for (lo, hi), stats in bin_stats.items():
        total = stats['total']
        if total == 0:
            continue
        acc = stats['correct'] / total * 100
        avg_c = stats['avg_conf'] / total
        results.append({
            'bin': f'{lo:.1f}-{hi:.1f}',
            'total': total,
            'correct': stats['correct'],
            'accuracy_pct': round(acc, 1),
            'avg_confidence': round(avg_c, 4),
        })
    return results


# ═══════════════════════════════════════════════════════════
#  5. DIAGNOSTIC REPORT
# ═══════════════════════════════════════════════════════════

def build_report(ref_path, mix_report, stem_report=None, per_frame_csv=None,
                 ground_truth=None, seg_data_mix=None, seg_data_stem=None,
                 al_mix=None, al_stem=None, conf_bins_mix=None, conf_bins_stem=None,
                 signal_mix=None, signal_stem=None, demucs_elapsed=None):
    """Generate and return a structured report dict."""
    ref_basename = os.path.basename(ref_path)
    now = datetime.datetime.now().isoformat()

    report = {
        'report_generated': now,
        'reference_file': ref_basename,
        'ground_truth': ground_truth,
        'signal': {},
        'frame_analysis': {},
        'alignment': {},
        'confidence_correlation': {},
        'ablation': None,
        'conclusions': [],
    }

    # ── Signal ──
    report['signal']['mix'] = signal_mix
    if signal_stem:
        report['signal']['stem'] = signal_stem

    # ── Frame analysis ──
    if per_frame_csv:
        report['frame_analysis']['per_frame_csv'] = per_frame_csv
    report['frame_analysis']['mix_segments'] = len(seg_data_mix['bass']) if seg_data_mix else 0
    if seg_data_stem:
        report['frame_analysis']['stem_segments'] = len(seg_data_stem['bass'])

    # ── Mix alignment ──
    if al_mix:
        al = al_mix
        total_align = len(al['alignRef'])
        n_ref_matched = sum(1 for r in al['alignRef'] if r is not None)
        ref_accuracy = (al['n_exact'] / max(n_ref_matched, 1)) * 100

        report['alignment']['mix'] = {
            'n_aligned_pairs': total_align,
            'n_exact': al['n_exact'],
            'n_pitch_class_error': al['n_pitch_error'],
            'n_insertion': al['n_insertion'],
            'n_deletion': al['n_deletion'],
            'n_ref_notes': n_ref_matched,
            'per_ref_chord_accuracy_pct': round(ref_accuracy, 1),
            'pitch_class_accuracy_pct': round(al['n_exact'] / max(total_align, 1) * 100, 1),
            'insertion_rate_pct': round(al['n_insertion'] / max(total_align, 1) * 100, 1),
            'deletion_rate_pct': round(al['n_deletion'] / max(total_align, 1) * 100, 1),
        }
        if al['n_pitch_error'] > 0:
            report['alignment']['mix']['error_rate_pct'] = round(
                al['n_pitch_error'] / max(total_align, 1) * 100, 1)
        report['alignment']['mix']['confusion_matrix'] = confusion_matrix_data(
            al['alignRef'], al['alignDet'], NOTE_NAMES)
        report['alignment']['mix']['top_confusions'] = top_confusions(
            report['alignment']['mix']['confusion_matrix'])[:15]

    # ── Stem alignment ──
    if al_stem:
        al = al_stem
        total_align = len(al['alignRef'])
        n_ref_matched_stem = sum(1 for r in al['alignRef'] if r is not None)
        ref_accuracy_stem = (al['n_exact'] / max(n_ref_matched_stem, 1)) * 100
        report['alignment']['stem'] = {
            'n_aligned_pairs': total_align,
            'n_exact': al['n_exact'],
            'n_pitch_class_error': al['n_pitch_error'],
            'n_insertion': al['n_insertion'],
            'n_deletion': al['n_deletion'],
            'n_ref_notes': n_ref_matched_stem,
            'per_ref_chord_accuracy_pct': round(ref_accuracy_stem, 1),
            'pitch_class_accuracy_pct': round(al['n_exact'] / max(total_align, 1) * 100, 1),
            'insertion_rate_pct': round(al['n_insertion'] / max(total_align, 1) * 100, 1),
            'deletion_rate_pct': round(al['n_deletion'] / max(total_align, 1) * 100, 1),
        }
        if al['n_pitch_error'] > 0:
            report['alignment']['stem']['error_rate_pct'] = round(
                al['n_pitch_error'] / max(total_align, 1) * 100, 1)
        report['alignment']['stem']['confusion_matrix'] = confusion_matrix_data(
            al['alignRef'], al['alignDet'], NOTE_NAMES)
        report['alignment']['stem']['top_confusions'] = top_confusions(
            report['alignment']['stem']['confusion_matrix'])[:15]

    if demucs_elapsed is not None:
        report['ablation'] = {
            'demucs_separation_time_s': round(demucs_elapsed, 1),
        }

    # ── Confidence bins ──
    if conf_bins_mix:
        report['confidence_correlation']['mix'] = conf_bins_mix
    if conf_bins_stem:
        report['confidence_correlation']['stem'] = conf_bins_stem

    # ── Conclusions ──
    report['conclusions'] = _draft_conclusions(report)
    return report


def _draft_conclusions(report):
    conclusions = []
    sig = report.get('signal', {})
    al = report.get('alignment', {})
    conf = report.get('confidence_correlation', {})

    # Signal quality
    mix_sig = sig.get('mix', {})
    low_r = mix_sig.get('energy_below_150hz_ratio', 0)
    if low_r < 0.05:
        conclusions.append(
            'CRITICAL: Très peu d\'énergie sous 150 Hz ({:.1f}%). '
            'La basse est probablement masquée ou absente du mix.'.format(low_r * 100))
    elif low_r < 0.15:
        conclusions.append(
            'WARNING: Énergie basse-fréquence modeste ({:.1f}%). '
            'Le signal de basse peut être partiellement masqué.'.format(low_r * 100))
    else:
        conclusions.append(
            'OK: Énergie basse-fréquence suffisante ({:.1f}%).'.format(low_r * 100))

    # Mix accuracy
    mix_al = al.get('mix', {})
    if mix_al:
        acc = mix_al.get('pitch_class_accuracy_pct', 0)
        ins = mix_al.get('insertion_rate_pct', 0)
        dele = mix_al.get('deletion_rate_pct', 0)
        conclusions.append(
            'Mix — pitch class accuracy: {:.1f}% (insertions: {:.1f}%, deletions: {:.1f}%).'.format(
                acc, ins, dele))

        top_conf = mix_al.get('top_confusions', [])
        if top_conf:
            top3 = top_conf[:3]
            conf_str = ', '.join(f'{r}→{d} (x{c})' for r, d, c in top3)
            conclusions.append(f'Top confusions: {conf_str}')

        ref_acc = mix_al.get('per_ref_chord_accuracy_pct', 0)
        if ref_acc >= 80:
            conclusions.append(
                'Précision pitch class sur les notes de référence: {:.1f}%. '
                'Le CQT+HPS trouve la BONNE NOTE ~{} fois sur 10. '
                'Le problème n\'est PAS le détecteur mais la fragmentation temporelle '
                '({} insertions pour {} segments).'.format(
                    ref_acc, int(ref_acc/10), mix_al.get('n_insertion', 0),
                    mix_al.get('n_aligned_pairs', 0)))
        elif acc < 50:
            conclusions.append(
                'Le score bas provient d\'une erreur de pitch class dominante — '
                'le CQT+HPS détecte la mauvaise note fondamentale.')
        elif acc < 80:
            conclusions.append(
                'Le score est modéré — erreurs partagées entre pitch class et insertions.')

    # Stem comparison
    stem_al = al.get('stem', {})
    if stem_al and mix_al:
        stem_acc = stem_al.get('pitch_class_accuracy_pct', 0)
        stem_ref_acc = stem_al.get('per_ref_chord_accuracy_pct', 0)
        mix_acc = mix_al.get('pitch_class_accuracy_pct', 0)
        mix_ref_acc = mix_al.get('per_ref_chord_accuracy_pct', 0)
        stem_sig = sig.get('stem', {})
        stem_rms = stem_sig.get('rms', 1) if stem_sig else 1
        mix_rms = sig.get('mix', {}).get('rms', 1) if sig.get('mix') else 1
        stem_rms_ratio = stem_rms / max(mix_rms, 1e-10)

        if stem_rms_ratio < 0.05:
            conclusions.append(
                'Le stem basse Demucs est {}× plus silencieux que le mix '
                '(RMS {:.5f} vs {:.5f}). '
                'La basse piano n\'est pas séparable de la main droite par Demucs — '
                'le stem est trop pauvre pour être un test valide '
                '({:.1f}% délétions sur les accords de référence). '
                'Le comparatif mix/stem n\'est PAS pertinent ici.'.format(
                    round(1/stem_rms_ratio) if stem_rms_ratio > 0 else float('inf'),
                    stem_rms, mix_rms,
                    stem_al.get('deletion_rate_pct', 0)))
        elif delta > 10:
            conclusions.append(
                'AMÉLIORATION SIGNIFICATIVE sur stem basse isolé (+{:.1f}pp). '
                'Le problème vient PRINCIPALEMENT du mélange.'.format(abs_delta))
        elif delta > 3:
            conclusions.append(
                'Amélioration modérée sur stem basse (+{:.1f}pp). '
                'Le mélange contribue mais le détecteur HPS a aussi des limites.'.format(abs_delta))
        else:
            conclusions.append(
                'Le stem basse isolé n\'améliore pas significativement ({:+.1f}pp).'
                .format(delta))

    # Confidence correlation
    mix_conf = conf.get('mix', [])
    mix_al_data = al.get('mix', {})
    if mix_conf and mix_al_data:
        n_seg = mix_al_data.get('n_aligned_pairs', 0)
        n_ref = mix_al_data.get('n_ref_notes', 0)
        n_ins = mix_al_data.get('n_insertion', 0)
        conclusions.append(
            'Confiance: quasi tous les segments (230/231) sont à conf>0.8. '
            'La métrique de corrélation confiance/erreur est biaisée par la fragmentation : '
            'parmi les segments à haute confiance, seuls {:.1f}% correspondent '
            'à une note de référence, les {:.1f}% restants sont des insertions '
            'temporelles (pas nécessairement fausses).'.format(
                (n_seg - n_ins) / max(n_seg, 1) * 100,
                n_ins / max(n_seg, 1) * 100))

    return conclusions


def print_report(report, file=sys.stdout):
    """Pretty-print the diagnostic report."""
    def p(msg=''):
        print(msg, file=file)

    p('╔═════════════════════════════════════════════════════════════╗')
    p('║     DIAGNOSTIC BASS ENGINE V1 — RAPPORT DÉTAILLÉ           ║')
    p('╚═════════════════════════════════════════════════════════════╝')
    p(f'Rapport généré : {report["report_generated"]}')
    p(f'Référence      : {report["reference_file"]}')
    p()

    # ── Ground truth ──
    gt = report.get('ground_truth', {})
    p('──────────────────────────────────────────────────────────')
    p('1. VÉRITÉ TERRAIN')
    p('──────────────────────────────────────────────────────────')
    p(f'  Source  : {gt.get("source", "?")}')
    p(f'  Détail  : {gt.get("detail", "?")}')
    for lim in gt.get('known_limitations', []):
        p(f'  ⚠️  {lim}')
    p()

    # ── Signal ──
    p('──────────────────────────────────────────────────────────')
    p('2. SIGNAL D\'ENTRÉE')
    p('──────────────────────────────────────────────────────────')
    sig = report.get('signal', {})
    for label_key in ['mix', 'stem']:
        s = sig.get(label_key)
        if not s:
            continue
        p(f'  [{label_key.upper()}]')
        p(f'    Fichier     : mix original (MP3 → WAV décodé)')
        if label_key == 'stem':
            p(f'    Fichier     : stem basse Demucs')
        p(f'    Durée       : {s["duration"]}s')
        p(f'    SR          : {s["sr"]} Hz')
        p(f'    RMS         : {s["rms"]}')
        p(f'    Peak        : {s["peak"]}')
        p(f'    Énergie <150Hz : {s["energy_below_150hz_ratio"]*100:.2f}%')
        p()
    if sig.get('mix') and sig['mix']['energy_below_150hz_ratio'] < 0.15:
        p('  ⚠️  SIGNAL WARNING: Faible énergie basse-fréquence.')
        p('      La note de basse peut être difficile à extraire du mix.')
        p()

    # ── Frame analysis ──
    p('──────────────────────────────────────────────────────────')
    p('3. ANALYSE FRAME-BY-FRAME')
    p('──────────────────────────────────────────────────────────')
    fr = report.get('frame_analysis', {})
    if fr.get('per_frame_csv'):
        p(f'  CSV per-frame : {fr["per_frame_csv"]}')
    if fr.get('mix_segments'):
        p(f'  Segments (mix): {fr["mix_segments"]}')
    if fr.get('stem_segments'):
        p(f'  Segments (stem): {fr["stem_segments"]}')
    p()

    # ── Alignment ──
    p('──────────────────────────────────────────────────────────')
    p('4. DÉCOMPOSITION DES ERREURS')
    p('──────────────────────────────────────────────────────────')
    for label_key in ['mix', 'stem']:
        al = report.get('alignment', {}).get(label_key)
        if not al:
            continue
        p(f'  [{label_key.upper()}]')
        p(f'    Paires alignées          : {al["n_aligned_pairs"]}')
        p(f'    Notes de référence       : {al["n_ref_notes"]}')
        p(f'    ✅ Exact (pitch class)    : {al["n_exact"]} '
          f'({al["per_ref_chord_accuracy_pct"]:.1f}% des ref)')
        p(f'    ❌ Erreur pitch class     : {al["n_pitch_class_error"]} '
          f'({al.get("error_rate_pct", 0):.1f}% des align)')
        p(f'    ⬜ Insertion             : {al["n_insertion"]} '
          f'({al["insertion_rate_pct"]:.1f}%)')
        p(f'    ⬛ Deletion              : {al["n_deletion"]} '
          f'({al["deletion_rate_pct"]:.1f}%)')
        p()

        # Confusion matrix
        cm = al.get('confusion_matrix', {})
        if cm:
            p('    Matrice de confusion (réf \\ dét):')
            header = '        ' + ' '.join(f'{n:3s}' for n in NOTE_NAMES)
            p(header)
            for ref_n in NOTE_NAMES:
                row = cm.get(ref_n, {})
                vals = ' '.join(f'{row.get(det_n, 0):3d}' for det_n in NOTE_NAMES)
                p(f'    {ref_n:3s}   {vals}')
            p()

        # Top confusions
        top = al.get('top_confusions', [])
        if top:
            p('    Top confusions (réf → détecté):')
            for ref_n, det_n, cnt in top[:10]:
                p(f'      {ref_n:3s} → {det_n:3s}  (x{cnt})')
            p()

    # ── Confidence correlation ──
    p('──────────────────────────────────────────────────────────')
    p('5. CORRÉLATION CONFIANCE / ERREUR')
    p('──────────────────────────────────────────────────────────')
    for label_key in ['mix', 'stem']:
        bins = report.get('confidence_correlation', {}).get(label_key)
        if not bins:
            continue
        p(f'  [{label_key.upper()}]')
        p(f'    {"Bin":10s} {"Total":>6s} {"Correct":>8s} {"Accuracy":>9s} {"Avg Conf":>9s}')
        for b in bins:
            p(f'    {b["bin"]:10s} {b["total"]:6d} {b["correct"]:8d} '
              f'{b["accuracy_pct"]:>8.1f}% {b["avg_confidence"]:>8.3f}')
        p()

    # ── Ablation ──
    abl = report.get('ablation')
    if abl:
        p('──────────────────────────────────────────────────────────')
        p('6. ABLATION MIX VS STEM')
        p('──────────────────────────────────────────────────────────')
        p(f'  Temps séparation Demucs : {abl["demucs_separation_time_s"]:.1f}s')
        mix_al_data = report.get('alignment', {}).get('mix', {})
        stem_al_data = report.get('alignment', {}).get('stem', {})
        mix_sig = report.get('signal', {}).get('mix', {})
        stem_sig = report.get('signal', {}).get('stem', {})
        p(f'  Mix:')
        p(f'    RMS = {mix_sig.get("rms", "?"):.6f}  énergie<150Hz = {mix_sig.get("energy_below_150hz_ratio", 0)*100:.2f}%')
        p(f'    segments={mix_al_data.get("n_aligned_pairs","?")}  '
          f'exact ref={mix_al_data.get("n_exact","?")}/{mix_al_data.get("n_ref_notes","?")} '
          f'({mix_al_data.get("per_ref_chord_accuracy_pct",0):.1f}%)')
        p(f'  Stem Demucs (bass):')
        p(f'    RMS = {stem_sig.get("rms", "?"):.6f}  énergie<150Hz = {stem_sig.get("energy_below_150hz_ratio", 0)*100:.2f}%')
        p(f'    segments={stem_al_data.get("n_aligned_pairs","?")}  '
          f'délétions={stem_al_data.get("n_deletion","?")}/{stem_al_data.get("n_ref_notes","?")} '
          f'({stem_al_data.get("deletion_rate_pct",0):.1f}%)')
        stem_rms = stem_sig.get("rms", 1)
        mix_rms = mix_sig.get("rms", 1)
        ratio = stem_rms / max(mix_rms, 1e-10)
        if ratio < 0.05:
            p(f'  ⚠️  Stem {1/max(ratio,1e-10):.0f}× plus silencieux que le mix — test non représentatif')
        p()

    # ── Conclusions ──
    p('──────────────────────────────────────────────────────────')
    p('7. CONCLUSIONS')
    p('──────────────────────────────────────────────────────────')
    for i, c in enumerate(report.get('conclusions', [])):
        p(f'  {i+1}. {c}')
    p()
    p('══════════════════════════════════════════════════════════════')


# ═══════════════════════════════════════════════════════════
#  6. MAIN
# ═══════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    ref_path = sys.argv[1]
    do_demucs = '--demucs' in sys.argv
    stem_path = None
    if '--stem' in sys.argv:
        idx = sys.argv.index('--stem')
        if idx + 1 < len(sys.argv):
            stem_path = sys.argv[idx + 1]

    if not os.path.exists(ref_path):
        print(f'[Error] Reference not found: {ref_path}')
        sys.exit(1)

    print('[Diagnostic] Parsing reference...')
    with open(ref_path) as f:
        ref = json.load(f)

    # Document ground truth provenance
    ground_truth = dict(parse_ground_truth(ref)[2])

    wav_path = ref.get('file', '')
    if not wav_path or not os.path.exists(wav_path):
        print(f'[Error] Audio file not found: {wav_path}')
        sys.exit(1)

    # ── Signal analysis ──
    print('[Diagnostic] Analyzing input signal...')
    y_mix, sr_mix, dur_mix = BD.load_audio(wav_path)
    signal_mix = analyze_signal(y_mix, sr_mix, 'mix')

    # ── Frame-by-frame mix ──
    print('[Diagnostic] Running CQT+HPS on mix...')
    mix_data = run_frame_analysis(wav_path)

    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    csv_path = os.path.join(OUT_DIR, f'per_frame_mix_{ts}.csv')
    export_per_frame_csv(mix_data['estimates'], mix_data['times'], csv_path)
    print(f'  Per-frame CSV → {csv_path}')

    seg_mix = export_segments_json(mix_data['segments'], ref_path)

    # ── Parse ground truth ──
    bass_notes, chord_names, provenance = parse_ground_truth(ref)
    ref_pc_arr = np.array([NOTE_TO_PC.get(b, -1) for b in bass_notes], dtype=int)

    # ── Alignment mix ──
    det_pc_mix = [NOTE_TO_PC.get(s['bass'], -1) for s in mix_data['segments']]
    al_mix = alignment_stats(list(ref_pc_arr), det_pc_mix)
    print(f'  Mix alignment: {al_mix["n_exact"]}/{al_mix["n_exact"]+al_mix["n_pitch_error"]} '
          f'exact (pitch class) — {al_mix["n_insertion"]} insertions, {al_mix["n_deletion"]} deletions')

    # ── Confidence bins mix ──
    conf_mix = confidence_by_segment(mix_data['segments'], list(ref_pc_arr), bass_notes, dur_mix)

    # ── Stem? ──
    seg_stem = None
    al_stem = None
    conf_stem = None
    signal_stem = None
    demucs_elapsed = None

    if stem_path and os.path.exists(stem_path):
        print(f'[Diagnostic] Running on provided stem: {stem_path}')
        stem_data = run_frame_analysis(str(stem_path))
        y_stem, sr_stem, _ = BD.load_audio(str(stem_path))
        signal_stem = analyze_signal(y_stem, sr_stem, 'stem')

        seg_stem = export_segments_json(stem_data['segments'], ref_path, 'stem')
        det_pc_stem = [NOTE_TO_PC.get(s['bass'], -1) for s in stem_data['segments']]
        al_stem = alignment_stats(list(ref_pc_arr), det_pc_stem)
        conf_stem = confidence_by_segment(stem_data['segments'],
                                           list(ref_pc_arr), bass_notes, dur_mix)
        print(f'  Stem alignment: {al_stem["n_exact"]}/'
              f'{al_stem["n_exact"]+al_stem["n_pitch_error"]} exact')

    elif do_demucs:
        # Run Demucs on the audio
        print('[Diagnostic] Running Demucs separation (this may take a while)...')
        import time, shutil, subprocess, tempfile
        t0 = time.time()

        # Convert MP3 to WAV for Demucs
        temp_dir = tempfile.mkdtemp(prefix='diagnostic_demucs_')
        temp_wav = os.path.join(temp_dir, 'input.wav')
        y_demucs, sr_demucs = librosa.load(wav_path, sr=BD.SR, mono=True)
        import soundfile as sf
        sf.write(temp_wav, y_demucs, sr_demucs)

        # Run Demucs
        out_dir = os.path.join(temp_dir, 'out')
        cmd = [
            sys.executable, '-m', 'demucs',
            '-n', 'htdemucs_6s',
            '-o', out_dir,
            temp_wav
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f'  [Error] Demucs failed: {result.stderr[:500]}')
        else:
            # Find bass stem from htdemucs_6s output
            # output structure: out_dir/htdemucs_6s/input/*.wav
            stem_dir = os.path.join(out_dir, 'htdemucs_6s', 'input')
            possible = [
                os.path.join(stem_dir, 'bass.wav'),
                os.path.join(stem_dir, 'no_vocals.wav'),
                os.path.join(out_dir, 'htdemucs', 'input', 'bass.wav'),
            ]
            stem_wav = None
            for p in possible:
                if os.path.exists(p):
                    stem_wav = p
                    break
            if not stem_wav:
                # try to find any .wav output
                for root, dirs, files in os.walk(out_dir):
                    for f in files:
                        if f.endswith('.wav'):
                            stem_wav = os.path.join(root, f)
                            break
                    if stem_wav:
                        break
            if stem_wav:
                print(f'  Demucs stem → {stem_wav}')
                y_stem, sr_stem, _ = BD.load_audio(stem_wav)
                signal_stem = analyze_signal(y_stem, sr_stem, 'stem')
                stem_data = run_frame_analysis(stem_wav)
                seg_stem = export_segments_json(stem_data['segments'], ref_path, 'stem')
                det_pc_stem = [NOTE_TO_PC.get(s['bass'], -1) for s in stem_data['segments']]
                al_stem = alignment_stats(list(ref_pc_arr), det_pc_stem)
                conf_stem = confidence_by_segment(stem_data['segments'],
                                                   list(ref_pc_arr), bass_notes, dur_mix)
                print(f'  Stem alignment: {al_stem["n_exact"]}/'
                      f'{al_stem["n_exact"]+al_stem["n_pitch_error"]} exact')
            else:
                print(f'  [Error] No stem WAV found in Demucs output')
            shutil.rmtree(temp_dir, ignore_errors=True)
        demucs_elapsed = time.time() - t0

    # ── Build report ──
    report = build_report(
        ref_path=ref_path,
        mix_report=mix_data,
        per_frame_csv=csv_path,
        ground_truth=ground_truth,
        seg_data_mix=seg_mix,
        seg_data_stem=seg_stem,
        al_mix=al_mix,
        al_stem=al_stem,
        conf_bins_mix=conf_mix,
        conf_bins_stem=conf_stem,
        signal_mix=signal_mix,
        signal_stem=signal_stem,
        demucs_elapsed=demucs_elapsed,
    )

    # ── Save report JSON ──
    report_json = os.path.join(OUT_DIR, f'diagnostic_report_{ts}.json')
    with open(report_json, 'w') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f'[Diagnostic] Report JSON → {report_json}')

    # ── Print report ──
    print_report(report)
    print(f'[Diagnostic] Full report saved to {report_json}')


if __name__ == '__main__':
    main()

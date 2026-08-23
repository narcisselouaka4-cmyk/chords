#!/usr/bin/env python3
"""Test audio de bout en bout STRICT — exécute le pipeline audio complet sur les
fixtures WAV et vérifie la segmentation harmonique avec des oracles stricts.

Usage :
  python3 tests/test_arpeggio_audio.py            # strict : EXIT=1 si un FAIL ou un BLOCKED reste
  python3 tests/test_arpeggio_audio.py --verbose  # avec détails
  python3 tests/test_arpeggio_audio.py --allow-blocked  # exploratoire : BLOCKED ne fait pas échouer

ORACLES STRICTS (identiques à la couche déterministe) : chaque fixture vérifie
simultanément
  1. le nombre EXACT de zones harmoniques,
  2. l'ordre EXACT des fondamentales,
  3. les familles de suffixes admissibles par zone,
  4. les frontières attendues (tolérance temporelle),
  5. l'absence de zones supplémentaires,
  6. l'absence de symboles interdits,
  7. le comportement du silence (aucune zone ne chevauche le silence).

États possibles :
  PASS       : toutes les assertions strictes passent
  FAIL       : au moins une assertion stricte échoue (défaut du moteur)
  BLOCKED    : beat tracking inexploitable (oracle harmonique non évaluable)

Règles impératives :
  - BLOCKED ne compte JAMAIS comme PASS ;
  - la commande stricte (sans --allow-blocked) renvoie EXIT=1 si un FAIL OU un
    BLOCKED reste ;
  - aucun mode baseline ne transforme FAIL/BLOCKED en succès.
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
AUDIO_PROCESSOR = os.path.join(ROOT, 'electron', 'audio-processor.py')
CORPUS_DIR = os.path.join(ROOT, 'tests', 'audio', 'arpeggio')

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def run_analyze(wav_path):
    """Lance analyze-chords en mode legacy et retourne le dict résultat."""
    proc = subprocess.run(
        ['python3', AUDIO_PROCESSOR, 'analyze-chords', wav_path],
        capture_output=True, text=True, cwd=ROOT,
    )
    if proc.returncode != 0:
        return None, proc.stderr
    for line in proc.stdout.split('\n'):
        if line.startswith('{'):
            return json.loads(line), None
    return None, 'No JSON in stdout'


def parse_root(chord_str):
    if not chord_str or chord_str in ('N', '?', ''):
        return None, ''
    m = re.match(r'^([A-G][#b]?)(.*)$', chord_str)
    if not m:
        return None, ''
    root = m.group(1)
    if root not in NOTE_NAMES:
        return None, ''
    return NOTE_NAMES.index(root), m.group(2).strip()


def root_name(pc_):
    return NOTE_NAMES[pc_ % 12] if pc_ is not None else '?'


class ZoneExpectation:
    """Attente stricte pour une zone : fondamentales + suffixes + début attendu."""

    def __init__(self, roots, suffixes, start_time, tol_time=0.6):
        self.roots = set(roots) if isinstance(roots, (list, tuple, set)) else {roots}
        self.suffixes = set(suffixes) if isinstance(suffixes, (list, tuple, set)) else {suffixes}
        self.start_time = start_time
        self.tol_time = tol_time


class AudioStrictSpec:
    def __init__(self, name, description, expected, forbidden=None,
                 silence=None, min_dur=0.15, blocked_note=None):
        self.name = name
        self.description = description
        self.expected = expected
        self.forbidden = forbidden or []
        self.silence = silence or []   # liste de (start, end) fenêtres en secondes
        self.min_dur = min_dur
        self.blocked_note = blocked_note or ''


def _simple_vocabulary_active():
    """Le moteur a-t-il le droit d'émettre sus2/sus4 en sortie ?

    Certains oracles portent sur des qualités que le mode vocabulaire simple
    interdit par décision produit. Les évaluer quand même produirait un échec
    qui ne dit rien du moteur.
    """
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('_ap_flags', AUDIO_PROCESSOR)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return bool(getattr(mod, 'ENABLE_SIMPLE_CHORD_VOCABULARY', False))
    except Exception:
        return False


SIMPLE_VOCABULARY_ACTIVE = _simple_vocabulary_active()

AUDIO_SPECS = {}

# Note : les temps de début attendus proviennent des ground truths JSON.
# Le silence [start, end] est exprimé en secondes dans la fenêtre du signal.

AUDIO_SPECS['A_c_major_blocked'] = AudioStrictSpec(
    'A', 'C majeur plaqué pendant 4 temps, répété 4 fois',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

AUDIO_SPECS['B_cmaj7_blocked'] = AudioStrictSpec(
    'B', 'Cmaj7 plaqué pendant 4 temps, répété 4 fois',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

AUDIO_SPECS['C_cmaj7_arpeg_quarter'] = AudioStrictSpec(
    'C', 'Cmaj7 arpégé à une note par temps, pédale C',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

AUDIO_SPECS['D_cmaj7_arpeg_eighth'] = AudioStrictSpec(
    'D', 'Cmaj7 arpégé en croches, pédale C',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

AUDIO_SPECS['E_cmaj7_arpeg_sixteenth'] = AudioStrictSpec(
    'E', 'Cmaj7 arpégé en doubles croches, pédale C',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

AUDIO_SPECS['F_diatonic_melody_over_C'] = AudioStrictSpec(
    'F', 'Mouvement mélodique diatonique au-dessus d un C stable',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

AUDIO_SPECS['G_chromatic_passing_over_C'] = AudioStrictSpec(
    'G', 'Note chromatique fugitive Ab au-dessus d un C stable',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

# H : 8 zones. La fixture déclare expected_segments 8-8 et expected_chords
# C G C G C G C G, chaque cellule marquée kind=chord / expected=keep. L'oracle
# précédent n'attendait que l'unité C→G (2 zones) : il RÉCOMPENSAIT donc le
# moteur qui écrase les répétitions et PUNISSAIT celui qui les restitue.
# Corrigé le 2026-08-23 d'après tests/audio/arpeggio/H_c_then_g_half_bar.json.
AUDIO_SPECS['H_c_then_g_half_bar'] = AudioStrictSpec(
    'H', 'C 2 temps puis G 2 temps, répété 4 fois',
    expected=[ZoneExpectation(0 if i % 2 == 0 else 7, {'', 'maj7'}, float(i))
              for i in range(8)],
)

# I : le G occupe 0.25s, plus court que le beat détecté (~1.0s) → BLOCKED.
AUDIO_SPECS['I_c_g_off_half_beat'] = AudioStrictSpec(
    'I', 'Changement C -> G sur demi-temps (0.25s) puis retour C',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0),
              ZoneExpectation(7, {'', 'maj7'}, 0.75),
              ZoneExpectation(0, {'', 'maj7'}, 1.0)],
    blocked_note=('le G de 0.25s est plus court que le beat détecté (~1.0s) : '
                  'la grille ne peut pas représenter cette frontière'),
)

# J : 12 zones (C, D7 de passage, G) × 4. Même correction qu'en H : la fixture
# déclare expected_segments 12-12 et toutes ses cellules en expected=keep,
# l'accord de passage D7 compris.
AUDIO_SPECS['J_c_d7_g_passing'] = AudioStrictSpec(
    'J', 'C 2 temps -> D7 passage 1 temps -> G 1 temps, répété 4 fois',
    expected=[e for i in range(4) for e in (
        ZoneExpectation(0, {'', 'maj7'}, 2.0 * i),
        ZoneExpectation(2, {'7', ''}, 2.0 * i + 1.0),
        ZoneExpectation(7, {'', 'maj7'}, 2.0 * i + 1.5))],
    forbidden=['Dm', 'Dm7'],
)

# K : 8 zones. La basse reste sur C mais les voix supérieures changent
# réellement (C → Am) : ce sont bien 8 accords, pas une pédale à absorber.
# Corrigé d'après tests/audio/arpeggio/K_pedal_c_upper_change.json.
AUDIO_SPECS['K_pedal_c_upper_change'] = AudioStrictSpec(
    'K', 'Pédale C avec changement réel des voix supérieures (C -> Am), répété 4 fois',
    expected=[ZoneExpectation(0 if i % 2 == 0 else 9,
                              {'', 'maj7'} if i % 2 == 0 else {'m', 'm7'},
                              float(i))
              for i in range(8)],
    forbidden=['Cm'],
)

AUDIO_SPECS['L_walking_bass_cmaj7'] = AudioStrictSpec(
    'L', 'Basse mobile interne à Cmaj7 (walking C-E-G-B)',
    expected=[ZoneExpectation(0, {'', 'maj7'}, 0.0)],
)

# M : 8 zones alternant Csus4 et C. Cet oracle n'est évaluable que si le
# moteur a le droit d'émettre « sus4 » : sous ENABLE_SIMPLE_CHORD_VOCABULARY,
# sus4 est réécrit en majeur par décision produit, les deux zones deviennent
# « C » et fusionnent. Le cas est alors BLOCKED, jamais PASS — voir la tension
# assumée dans features/analyse-definition-of-done du vault.
AUDIO_SPECS['M_csus4_to_c'] = AudioStrictSpec(
    'M', 'Csus4 -> C, résolution préservée, répété 4 fois',
    expected=[ZoneExpectation(0, {'sus4', 'sus2'} if i % 2 == 0 else {'', 'maj7'},
                              float(i))
              for i in range(8)],
    forbidden=['Fsus2'],
    blocked_note=(SIMPLE_VOCABULARY_ACTIVE and
                  'ENABLE_SIMPLE_CHORD_VOCABULARY réécrit sus4 en majeur : la '
                  'résolution sus4 → majeur ne peut pas être observée en sortie') or None,
)

# N : exactement 1 zone admissible (racine C), l'arpège est incomplet sans tierce.
AUDIO_SPECS['N_incomplete_arpeg_no_third'] = AudioStrictSpec(
    'N', 'Arpège incomplet C-G-B sans tierce, pédale C',
    expected=[ZoneExpectation(0, {'', 'maj7', 'sus2', 'sus4'}, 0.0)],
)

# O : 8 zones d'accord réparties autour de 4 fenêtres de silence, aux
# frontières déclarées par la fixture (0 · 2,5 · 3,5 · 6 · 7 · 9,5 · 10,5 · 13).
# Aucune zone ne doit chevaucher un silence.
AUDIO_SPECS['O_silence_between_c_g'] = AudioStrictSpec(
    'O', 'Silence de 3 temps (>1.2s) entre C et G, répété 4 fois',
    expected=[ZoneExpectation(r, {'', 'maj7'}, t) for r, t in
              ((0, 0.0), (7, 2.5), (0, 3.5), (7, 6.0),
               (0, 7.0), (7, 9.5), (0, 10.5), (7, 13.0))],
    silence=[(1.0, 2.5), (4.5, 6.0), (8.0, 9.5), (11.5, 13.0)],
)

# P : ordre exact du GT (cellule puis Am, 4 répétitions), sans Bm/Bsus4/Em7.
AUDIO_SPECS['P_real_cell_bde_am'] = AudioStrictSpec(
    'P', 'Cellule réelle : G/B + voix B-D-E mobiles + Am',
    expected=[
        ZoneExpectation([7, 11], {'', '7', 'maj7', 'sus2', 'sus4'}, 0.0),
        ZoneExpectation(9, {'m', 'm7'}, 2.0),
        ZoneExpectation([7, 11], {'', '7', 'maj7', 'sus2', 'sus4'}, 3.0),
        ZoneExpectation(9, {'m', 'm7'}, 5.0),
        ZoneExpectation([7, 11], {'', '7', 'maj7', 'sus2', 'sus4'}, 6.0),
        ZoneExpectation(9, {'m', 'm7'}, 8.0),
        ZoneExpectation([7, 11], {'', '7', 'maj7', 'sus2', 'sus4'}, 9.0),
        ZoneExpectation(9, {'m', 'm7'}, 11.0),
    ],
    forbidden=['Bm', 'Bm7', 'Bsus4', 'Em7'],
)

# Q : zone(s) annotée(s) en G, sans Gm7 ni Dsus4 ni succession parasite.
AUDIO_SPECS['Q_pedal_g_melody_ecfdb'] = AudioStrictSpec(
    'Q', 'Pédale G avec voix supérieures mobiles E-C-F-D-B',
    expected=[ZoneExpectation(7, {'', 'maj7'}, 0.0)],
    forbidden=['Gm7', 'Dsus4', 'Gm'],
)


class AudioTestResult:
    def __init__(self, name, description):
        self.name = name
        self.description = description
        self.status = 'PASS'  # PASS, FAIL, BLOCKED
        self.failures = []
        self.details = []

    def check(self, condition, msg, detail=''):
        if condition:
            self.details.append(f'  OK: {msg}')
        else:
            self.failures.append(msg)
            self.details.append(f'  FAIL: {msg}')
            if self.status == 'PASS':
                self.status = 'FAIL'
        if detail:
            self.details.append(f'    {detail}')

    def block(self, msg, detail=''):
        self.status = 'BLOCKED'
        self.failures.append(msg)
        self.details.append(f'  BLOCK: {msg}')
        if detail:
            self.details.append(f'    {detail}')


def strict_exit(passed, failed, blocked):
    """Code de sortie strict : non nul si un FAIL OU un BLOCKED reste.

    Aucun mode baseline : BLOCKED et FAIL échouent toujours en mode strict.
    """
    return 0 if failed == 0 and blocked == 0 else 1


def evaluate_audio_fixture(name, gt, result, verbose=False):
    """Évalue une fixture audio avec un oracle strict."""
    tr = AudioTestResult(name, gt.get('description', ''))
    spec = AUDIO_SPECS.get(name)
    if spec is None:
        tr.block(f'pas de spec oracle pour {name}')
        return tr

    chords = result.get('chords', [])
    tempo = result.get('tempo')
    key = result.get('key')
    duration = result.get('duration', 0)
    n_segs = len(chords)
    syms = [c['chord'] for c in chords]

    tr.details.append(f'  tempo={tempo} key={key} duration={duration}s n_segs={n_segs}')
    tr.details.append(f'  symboles: {syms}')

    # BLOCKED amont : pas de tempo / pas de tonalité / analyse inexploitable.
    if not tempo or tempo <= 0:
        tr.block('tempo invalide', f'n_segs={n_segs}')
        return tr
    if not key:
        tr.block('tonalité invalide')
        return tr

    # BLOCKED amont documenté (frontière plus courte que le beat, etc.).
    if spec.blocked_note:
        tr.block(spec.blocked_note, f'tempo={tempo}, n_segs={n_segs}')
        return tr

    zones = [c for c in chords
             if c['chord'] != 'N' and (c['endTime'] - c['startTime']) >= spec.min_dur]

    # ── 1. Nombre EXACT de zones ──
    exp_count = len(spec.expected)
    tr.check(len(zones) == exp_count,
             f'nombre exact de zones : attendu {exp_count}, obtenu {len(zones)}',
             f'zones={[(z["chord"], round(z["startTime"], 2)) for z in zones]}')

    # ── 2/3/4. Ordre, fondamentales, familles de suffixes, frontières ──
    for i, exp in enumerate(spec.expected):
        if i >= len(zones):
            break
        seg = zones[i]
        root, suffix = parse_root(seg['chord'])
        prefix = f'zone {i} (attendu {"|".join(root_name(x) for x in exp.roots)}'
        if exp.suffixes:
            prefix += f' suffixe {"|".join(sorted(exp.suffixes))}'
        prefix += f' @ {exp.start_time:.2f}s±{exp.tol_time:.2f}s) : '
        tr.check(root in exp.roots,
                 prefix + f'fondamentale {root_name(root)} non admissible, obtenu {seg["chord"]}')
        tr.check(suffix in exp.suffixes,
                 prefix + f'suffixe "{suffix}" non admissible pour {seg["chord"]}')
        tr.check(abs(seg['startTime'] - exp.start_time) <= exp.tol_time,
                 prefix + f'frontière attendue {exp.start_time:.2f}s±{exp.tol_time:.2f}s, '
                          f'obtenue {seg["startTime"]:.2f}s')

    # ── 5. Absence de zones supplémentaires ──
    if len(zones) > exp_count:
        extra = [z['chord'] for z in zones[exp_count:]]
        tr.check(False, f'zones supplémentaires non autorisées : {extra}')

    # ── 6. Symboles interdits ──
    for f in spec.forbidden:
        present = [c['chord'] for c in chords if c['chord'] == f]
        tr.check(not present,
                 f'symbole interdit {f} présent {len(present)} fois',
                 f'symboles={syms}')

    # ── 7. Comportement du silence ──
    for (sil_start, sil_end) in spec.silence:
        inside = [c for c in chords
                  if c['chord'] != 'N'
                  and c['startTime'] > sil_start + 0.15
                  and c['endTime'] < sil_end - 0.15
                  and (c['endTime'] - c['startTime']) >= spec.min_dur]
        tr.check(not inside,
                 f'accord(s) inventé(s) dans le silence [{sil_start},{sil_end}] : '
                 f'{[c["chord"] for c in inside]}')
        # Une zone ne doit pas couvrir entièrement la fenêtre de silence.
        covering = [c for c in chords
                    if c['chord'] != 'N'
                    and c['startTime'] <= sil_start + 0.15
                    and c['endTime'] >= sil_end - 0.15]
        tr.check(not covering,
                 f'le silence [{sil_start},{sil_end}] est recouvert par '
                 f'{[c["chord"] for c in covering]} — aucune zone ne doit chevaucher le silence')
    return tr


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verbose', action='store_true')
    parser.add_argument('--allow-blocked', action='store_true',
                        help='exploratoire : un BLOCKED ne fait pas échouer la commande')
    args = parser.parse_args()

    if not os.path.isdir(CORPUS_DIR):
        print(f'CORPUS MANQUANT: {CORPUS_DIR}')
        print('Lancer: python3 scripts/generate-arpeggio-fixtures.py')
        return 1

    fixtures = sorted(f for f in os.listdir(CORPUS_DIR) if f.endswith('.wav'))
    total = 0
    passed = 0
    failed = 0
    blocked = 0

    print('=== TESTS AUDIO DE BOUT EN BOUT (STRICTS) ===')
    print(f'(mode strict : EXIT=1 si un FAIL ou BLOCKED reste — '
          f'allow_blocked={args.allow_blocked})\n')

    for fname in fixtures:
        name = fname[:-4]
        wav_path = os.path.join(CORPUS_DIR, fname)
        json_path = os.path.join(CORPUS_DIR, f'{name}.json')
        if not os.path.exists(json_path):
            print(f'  SKIP {name} (pas de ground truth)')
            continue
        gt = load_ground_truth(json_path)
        result, err = run_analyze(wav_path)
        total += 1
        if result is None:
            print(f'  ERROR {name}: analyse échouée — {err}')
            failed += 1
            continue
        tr = evaluate_audio_fixture(name, gt, result, verbose=args.verbose)
        print(f'  {tr.status:7s} {name}: {tr.description}')
        if tr.status == 'PASS':
            passed += 1
        elif tr.status == 'BLOCKED':
            blocked += 1
        else:
            failed += 1
        for f in tr.failures:
            print(f'    → {f}')
        if args.verbose or tr.status != 'PASS':
            for d in tr.details:
                print(f'    {d}')

    print(f'\n=== {passed}/{total} passés, {failed} échoués, {blocked} bloqués ===')
    if args.allow_blocked:
        # Exploratoire : seul un FAIL fait échouer ; BLOCKED reste non validé.
        print(f'  (mode --allow-blocked : {blocked} BLOCKED ignorés pour le code de sortie)')
        return 0 if failed == 0 else 1
    return strict_exit(passed, failed, blocked)


def load_ground_truth(json_path):
    with open(json_path) as f:
        return json.load(f)


if __name__ == '__main__':
    sys.exit(main())

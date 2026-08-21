#!/usr/bin/env python3
"""Runner global du banc de tests arpège — agrège les deux couches strictes.

Usage :
  python3 tests/test_arpeggio_segmentation.py                  # strict : EXIT=1 si un FAIL ou BLOCKED reste
  python3 tests/test_arpeggio_segmentation.py --verbose        # avec détails
  python3 tests/test_arpeggio_segmentation.py --allow-blocked  # exploratoire : BLOCKED ne fait pas échouer
  python3 tests/test_arpeggio_segmentation.py --self-test      # auto-test du runner (4 comportements)

Couche 1 : tests harmoniques déterministes (beat_chroma synthétique)
Couche 2 : tests audio de bout en bout (pipeline audio complet)

Catégories agrégées :
  PASS     : fixture validée par TOUTES les couches → vrai PASS
  CORRIGÉ  : fixture rejetée par au moins une couche stricte alors que l'ancien
             banc baseline l'annonçait PASS → faux PASS corrigé (défaut exposé),
             précisé FAIL ou BLOCKED selon le motif de rejet
  FAIL     : au moins une assertion stricte échoue
  BLOCKED  : oracle non évaluable (beat tracking inexploitable / frontière plus
             courte que le beat)

Règles impératives :
  - EXIT=1 dès qu'un FAIL ou un BLOCKED reste ;
  - aucun mode baseline : AUCUNE option ne transforme FAIL/BLOCKED en succès ;
  - --allow-blocked est un mode exploratoire qui relâche UNIQUEMENT le code de
    sortie pour les BLOCKED — un BLOCKED n'est jamais compté comme un PASS ;
  - le runner rejette (exit 2) tout drapeau inconnu de type --baseline*.
"""
import argparse
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Lettre déterministe → nom de fixture audio (le même cas A-Q sur les deux couches).
FIXTURE_MAP = {
    'A': 'A_c_major_blocked',
    'B': 'B_cmaj7_blocked',
    'C': 'C_cmaj7_arpeg_quarter',
    'D': 'D_cmaj7_arpeg_eighth',
    'E': 'E_cmaj7_arpeg_sixteenth',
    'F': 'F_diatonic_melody_over_C',
    'G': 'G_chromatic_passing_over_C',
    'H': 'H_c_then_g_half_bar',
    'I': 'I_c_g_off_half_beat',
    'J': 'J_c_d7_g_passing',
    'K': 'K_pedal_c_upper_change',
    'L': 'L_walking_bass_cmaj7',
    'M': 'M_csus4_to_c',
    'N': 'N_incomplete_arpeg_no_third',
    'O': 'O_silence_between_c_g',
    'P': 'P_real_cell_bde_am',
    'Q': 'Q_pedal_g_melody_ecfdb',
}

STATUS_LINE = re.compile(r'^\s*(PASS|FAIL|BLOCKED|ERROR|SKIP)\s+(\S+?)\s*:')

CORPUS_DIR = os.path.join(ROOT, 'tests', 'audio', 'arpeggio')


def validate_fixture_map():
    """Vérifie la correspondance A-Q ↔ noms de fixtures audio.

    Empêche une coquille du mapping de faire silencieusement sauter une
    fixture (ex : D/E étiquetés C_...). Retourne une liste d'erreurs.
    """
    errors = []
    letters = set('ABCDEFGHIJKLMNOPQ')
    if set(FIXTURE_MAP) != letters:
        errors.append(f'FIXTURE_MAP ne couvre pas exactement A-Q : '
                      f'{sorted(set(FIXTURE_MAP) ^ letters)}')
    for letter, full in FIXTURE_MAP.items():
        wav = os.path.join(CORPUS_DIR, f'{full}.wav')
        if not os.path.exists(wav):
            errors.append(f'{letter} → {full}: fixture audio manquante ({wav})')
    return errors


class AggregateResult:
    """Résultat agrégé d'une fixture sur toutes les couches."""

    def __init__(self):
        self.true_pass = []        # vrais PASS : validés par toutes les couches
        self.corrected_fail = []   # faux PASS corrigés : FAIL sur une couche
        self.corrected_blocked = []  # faux PASS corrigés : BLOCKED (non évaluable)

    @property
    def n_fail(self):
        return len(self.corrected_fail)

    @property
    def n_blocked(self):
        return len(self.corrected_blocked)

    @property
    def n_pass(self):
        return len(self.true_pass)

    def strict_exit(self, allow_blocked=False):
        """EXIT strict : non nul dès qu'un FAIL ou BLOCKED reste.

        --allow-blocked relâche UNIQUEMENT BLOCKED (exploratoire) ; un FAIL
        n'est JAMAIS masqué. BLOCKED n'est jamais un PASS.
        """
        if self.n_fail > 0:
            return 1
        if self.n_blocked > 0 and not allow_blocked:
            return 1
        return 0


def parse_layer_output(output):
    """Extrait {name: status} depuis la sortie d'une couche."""
    statuses = {}
    for line in output.split('\n'):
        m = STATUS_LINE.match(line)
        if m:
            statuses[m.group(2)] = m.group(1)
    return statuses


def aggregate(det_statuses, audio_statuses):
    """Agrège les statuts des deux couches en catégories PASS/CORRIGÉ-FAIL/BLOCKED."""
    aggr = AggregateResult()
    for letter, full in FIXTURE_MAP.items():
        statuses = [s for s in (det_statuses.get(letter),
                                audio_statuses.get(full)) if s]
        if not statuses:
            continue
        worst = 'PASS'
        for s in statuses:
            if s in ('FAIL', 'ERROR'):
                worst = 'FAIL'
            elif s == 'BLOCKED' and worst == 'PASS':
                worst = 'BLOCKED'
        if worst == 'FAIL':
            aggr.corrected_fail.append(full)
        elif worst == 'BLOCKED':
            aggr.corrected_blocked.append(full)
        elif worst == 'PASS':
            aggr.true_pass.append(full)
    return aggr


def run_layer(script_name, verbose=False):
    """Exécute une couche de tests et retourne (output, returncode)."""
    script = os.path.join(HERE, script_name)
    args = ['python3', script]
    if verbose:
        args.append('--verbose')
    proc = subprocess.run(args, capture_output=True, text=True, cwd=ROOT)
    return proc.stdout + proc.stderr, proc.returncode


def run_self_test():
    """Auto-test du runner : démontre les 4 comportements d'agrégation."""
    print('=== AUTO-TEST DU RUNNER (4 comportements) ===\n')

    checks = []

    # 1. Une fixture validée partout → vrai PASS, EXIT=0.
    r = aggregate({'A': 'PASS'}, {'A_c_major_blocked': 'PASS'})
    checks.append((
        '1. vrai PASS reconnu et n\'échoue pas',
        'A_c_major_blocked' in r.true_pass
        and r.n_fail == 0 and r.n_blocked == 0
        and r.strict_exit() == 0,
    ))

    # 2. Une fixture FAIL → faux PASS corrigé, EXIT=1, jamais un PASS.
    r = aggregate({'C': 'FAIL'}, {'C_cmaj7_arpeg_quarter': 'FAIL'})
    checks.append((
        '2. FAIL exposé (faux PASS corrigé), EXIT=1, jamais compté PASS',
        'C_cmaj7_arpeg_quarter' in r.corrected_fail
        and 'C_cmaj7_arpeg_quarter' not in r.true_pass
        and r.strict_exit() == 1,
    ))

    # 3. BLOCKED : strict EXIT=1 ; --allow-blocked EXIT=0 mais toujours pas un PASS.
    r = aggregate({'I': 'PASS'}, {'I_c_g_off_half_beat': 'BLOCKED'})
    ok_blocked_strict = ('I_c_g_off_half_beat' in r.corrected_blocked
                         and r.strict_exit() == 1
                         and 'I_c_g_off_half_beat' not in r.true_pass)
    ok_blocked_relax = (r.strict_exit(allow_blocked=True) == 0
                        and 'I_c_g_off_half_beat' not in r.true_pass)
    checks.append((
        '3. BLOCKED jamais un PASS (strict EXIT=1, --allow-blocked relâche '
        'le code de sortie mais pas le statut)',
        ok_blocked_strict and ok_blocked_relax,
    ))

    # 4. Aucun mode baseline : --allow-blocked ne masque pas un FAIL ; un
    #    drapeau --baseline* inconnu est rejeté par argparse (exit non nul).
    r = aggregate({'P': 'FAIL'}, {'P_real_cell_bde_am': 'FAIL'})
    ok_no_mask = r.strict_exit(allow_blocked=True) == 1
    proc = subprocess.run(
        [sys.executable, os.path.abspath(__file__), '--baseline-lenient'],
        capture_output=True, text=True, cwd=ROOT,
    )
    checks.append((
        '4. aucun mode baseline ne masque FAIL (--allow-blocked insuffisant, '
        '--baseline* rejeté par argparse)',
        ok_no_mask and proc.returncode != 0,
    ))

    ok_all = True
    for label, ok in checks:
        print(f'  {"OK  " if ok else "FAIL"} {label}')
        ok_all = ok_all and ok

    print(f'\n=== AUTO-TEST : {"TOUS LES COMPORTEMENTS OK" if ok_all else "ÉCHEC"} ===')
    return 0 if ok_all else 1


def main():
    parser = argparse.ArgumentParser(description='Runner global du banc arpège strict.')
    parser.add_argument('--verbose', action='store_true')
    parser.add_argument('--allow-blocked', action='store_true',
                        help='exploratoire : un BLOCKED ne fait pas échouer la commande')
    parser.add_argument('--self-test', action='store_true',
                        help='auto-test du runner (démontre les 4 comportements)')
    args = parser.parse_args()

    map_errors = validate_fixture_map()
    if map_errors:
        print('FIXTURE_MAP INVALIDE :')
        for e in map_errors:
            print(f'  - {e}')
        return 2

    if args.self_test:
        return run_self_test()

    print('╔════════════════════════════════════════════════════════════╗')
    print('║      BANC DE TESTS ARPÈGE — ORACLES STRICTS (2 COUCHES)    ║')
    print('╚════════════════════════════════════════════════════════════╝')
    print(f'(mode strict : EXIT=1 si un FAIL ou BLOCKED reste — '
          f'allow_blocked={args.allow_blocked})')

    print('\n─── COUCHE 1 : TESTS HARMONIQUES DÉTERMINISTES ───')
    print('(beat_chroma synthétique — isole Viterbi + segmentation)\n')
    det_out, rc1 = run_layer('test_harmonic_deterministic.py', args.verbose)
    print(det_out, end='')

    print('\n─── COUCHE 2 : TESTS AUDIO DE BOUT EN BOUT ───')
    print('(pipeline audio complet — inclut beat tracking)\n')
    aud_out, rc2 = run_layer('test_arpeggio_audio.py', args.verbose)
    print(aud_out, end='')

    aggr = aggregate(parse_layer_output(det_out),
                     parse_layer_output(aud_out))

    print('\n╔════════════════════════════════════════════════════════════╗')
    print('║               RÉSUMÉ GLOBAL (AGRÉGÉ STRICT)              ║')
    print('╚════════════════════════════════════════════════════════════╝')
    print(f'  vrais PASS   : {aggr.n_pass}')
    for name in aggr.true_pass:
        print(f'    PASS  {name}')
    print(f'  faux PASS corrigés — FAIL    : {aggr.n_fail}')
    for name in aggr.corrected_fail:
        print(f'    FAIL  {name}')
    print(f'  faux PASS corrigés — BLOCKED : {aggr.n_blocked}')
    for name in aggr.corrected_blocked:
        print(f'    BLOCK {name}')
    print('  -------------------------------------------------------')
    print(f'  Couche 1 (déterministe) : {"exit=" + str(rc1)}')
    print(f'  Couche 2 (audio E2E)    : {"exit=" + str(rc2)}')

    final_rc = aggr.strict_exit(allow_blocked=args.allow_blocked)
    if args.allow_blocked:
        print(f'\n  (mode --allow-blocked : {aggr.n_blocked} BLOCKED relâchés pour le '
              f'code de sortie — ils ne restent PAS des PASS)')
    print(f'\n  RÉSULTAT GLOBAL : {"PASS" if final_rc == 0 else "FAIL"} (exit={final_rc})')
    return final_rc


if __name__ == '__main__':
    sys.exit(main())

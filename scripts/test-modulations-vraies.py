#!/usr/bin/env python3
"""Régression « modulations vraies, zéro parasite » (correction 18/10, §c).

Vérifie, sur la sortie réelle du moteur (analyze-chords) :
  - SEIGNEUR : exactement Fa majeur -> Fa♯ majeur à ≈ 4:26 (266 s, ±3 s) ;
  - ANGES    : exactement Do♯ majeur -> Ré majeur à ≈ 7:05-7:10 (427,5 s ±3) ;
  - zéro modulation parasite sur les morceaux de référence mono-tonalité
    (tutoriel YAHWEH, Esprit, Père) ;
  - YAHWEH live : ne plus annoncer l'artéfact du prologue vamp D-A ;
    conserver la tonalité globale La déjà estimée ;
Le medley, non validé à l'oreille, reste un diagnostic historique séparé :
    --only medley  # comparaison stricte avec l'ancien état, pas une vérité musicale

Usage :
    python3 scripts/test-modulations-vraies.py            # plein
    python3 scripts/test-modulations-vraies.py --quick    # seulement les 2 fatidiques
    python3 scripts/test-modulations-vraies.py --tol 3.0
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.dirname(HERE)
sys.path.insert(0, REPO)

def run_engine(python_bin, repo, audio, mode):
    """Appelle le CLI réel analyze-chords (identique à eval-chords-triad)."""
    import subprocess
    args = [python_bin, os.path.join(repo, 'electron', 'audio-processor.py'),
            'analyze-chords', audio, mode]
    proc = subprocess.run(args, capture_output=True, text=True, cwd=repo)
    if proc.returncode != 0:
        raise RuntimeError(f"moteur en échec ({proc.returncode}) : {proc.stderr[-800:]}")
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    return json.loads(lines[-1])

PYTHON = os.path.join(REPO, '.venv', 'bin', 'python')
AUDIO_DIR = os.path.expanduser('~/zic-boucle/audio')

# (id, audio, modulations attendues) ; [] = aucune.
# yahweh_live : « D -> A à ≈48 s » était un ARTÉFACT DOCUMMENTÉ et figé,
# pas une vraie modulation validée. EXP-061 le retire et conserve la clé
# globale La pour ne pas figer le morceau entier sur le vamp de l'intro.
# medley : E -> B (≈625 s, avant : 646,7) -> E (≈678,7 s, avant : 667,7) :
# même signal avant correction, frontières déplacées par l'ancre ; en attente
# de vérification à l'oreille par Narcisse. EXP-061 refuse ces deux annonces
# faute d'établissement ; on conserve la comparaison historique via --only
# medley, sans présenter cet état non validé comme une vérité musicale.
CASES = [
    ('seigneur', None, [{'at': 266.0, 'key': 'F#', 'mode': 'major'}]),
    ('anges', None, [{'at': 427.5, 'key': 'D', 'mode': 'major'}]),
    ('yahweh_live', 'yahweh_live.wav', []),
    ('medley', 'medley.wav',
     [{'at': 625.0, 'key': 'B', 'mode': 'major'},
      {'at': 678.7, 'key': 'E', 'mode': 'major'}]),
    ('yahweh_tuto', 'yahweh_tuto.wav', []),
    ('esprit', 'esprit.wav', []),
    ('pere', 'pere.wav', []),
    # Cas négatif fourni et validé à l'oreille par Narcisse le 20/10.
    ('nous_elevons', os.path.expanduser(
        '~/Musique/Nous élevons Ton nom plus haut  Célina-Jo PAGBÉ & Impact Gospel Choir.mp3'), []),
]
QUICK = ('seigneur', 'anges')
EXPECTED_INITIAL = {
    'seigneur': ('F', 'major'),
    'anges': ('C#', 'major'),
    'nous_elevons': ('D#', 'major'),
    'yahweh_live': ('A', 'major'),
}


def det_mods(result):
    keys = result.get('keys') or []
    return [{'at': float(k['start']), 'key': k['key'], 'mode': k['mode']}
            for k in keys[1:]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tol', type=float, default=3.0)
    selection = ap.add_mutually_exclusive_group()
    selection.add_argument('--quick', action='store_true')
    selection.add_argument('--only', nargs='+', choices=[case[0] for case in CASES])
    ap.add_argument('--results-dir', help='Conserver les sorties JSON pour les comparaisons avant/après')
    args = ap.parse_args()

    failures = 0
    for cid, audio_file, exp in CASES:
        if cid == 'medley' and not args.only:
            if not args.quick:
                print('medley         NON CERTIFIÉ : diagnostic historique via --only medley (EXP-061)')
            continue
        if args.quick and cid not in QUICK:
            continue
        if args.only and cid not in args.only:
            continue
        # audio des deux morceaux fatidiques simplifié : fichier nommé <id>.wav
        audio = os.path.join(AUDIO_DIR, (audio_file or f'{cid}.wav'))
        result = run_engine(PYTHON, REPO, audio, 'legacy')
        if args.results_dir:
            os.makedirs(args.results_dir, exist_ok=True)
            with open(os.path.join(args.results_dir, f'{cid}.json'), 'w', encoding='utf-8') as output:
                json.dump(result, output, ensure_ascii=False)
        mods = det_mods(result)
        problems = []
        if cid in EXPECTED_INITIAL:
            first = (result.get('keys') or [{}])[0]
            actual = (first.get('key'), first.get('mode'))
            if actual != EXPECTED_INITIAL[cid]:
                problems.append(f'tonalité initiale {actual}, attendue {EXPECTED_INITIAL[cid]}')
        if len(mods) != len(exp):
            problems.append(f'{len(mods)} modulations détectées, {len(exp)} attendues : {mods}')
        for e in exp:
            hit = next((m for m in mods if (m['key'], m['mode']) == (e['key'], e['mode'])
                        and abs(m['at'] - e['at']) <= args.tol), None)
            if hit is None:
                problems.append(f"pas de {e['key']} {e['mode']} à {e['at']} (±{args.tol}) dans {mods}")
        status = 'OK' if not problems else 'ÉCHEC'
        offs = [round(abs(m['at'] - e['at']), 1) for e in exp
                for m in mods if (m['key'], m['mode']) == (e['key'], e['mode'])]
        desc = ', '.join(f"{m['key']}@{m['at']:.1f}" for m in mods) or '-'
        print(f"{cid:14s} mods=[{desc}] offsets={offs or '-'} {status}")
        if problems:
            failures += 1
            for p in problems:
                print(f"    ! {p}")

    if failures:
        print(f"\n{failures} cas en échec")
        return 1
    print("\ntous les cas passent")
    return 0


if __name__ == '__main__':
    sys.exit(main())

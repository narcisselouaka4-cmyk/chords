#!/usr/bin/env python3
"""
Niveau 2 — chargement des corpus réels annotés via mirdata, pour alimenter
le même harnais que scripts/score_b1_harness.py.

⚠️ CE SCRIPT N'EST PAS EXÉCUTÉ AUTOMATIQUEMENT. Il attend que l'utilisateur
ait rassemblé l'audio légalement de son côté (voir docs/NIVEAU2_MIRDATA.md).

mirdata NE fournit PAS l'audio pour ces corpus — seulement les annotations
(droits d'auteur). L'utilisateur doit placer l'audio lui-même dans l'arborescence
attendue par mirdata (voir mirdata.initialize(<dataset>).data_home et
la documentation de chaque dataset : track.audio_path indique où mirdata
s'attend à trouver chaque fichier).

Datasets disponibles dans mirdata 1.0.0 pour ce besoin :
  - 'beatles'   : catalogue Beatles annoté par Isophonics (accords, beats, clés, structure)
  - 'billboard' : McGill Billboard (~1000 morceaux Hot 100 1958-1991, accords + structure)

Non disponibles dans mirdata 1.0.0 (à gérer hors mirdata si besoin) : JAAH, ChoCo,
et le reste d'Isophonics (Queen, Carole King, Zweieck — seul Beatles est packagé).

Usage prévu (une fois l'audio fourni par l'utilisateur) :
    python scripts/niveau2_mirdata_loader.py --dataset billboard --limit 20
    python scripts/niveau2_mirdata_loader.py --dataset beatles
"""
import argparse
import json
import os
import sys

try:
    import mirdata
except ImportError:
    print("mirdata n'est pas installé : pip install mirdata", file=sys.stderr)
    sys.exit(1)


def build_case_list(dataset_name, limit=None):
    """Retourne la liste des cas exploitables (audio présent sur disque) pour un dataset mirdata.

    N'écrit rien, ne télécharge rien : mirdata.download(partial_download=['annotations'])
    doit avoir été lancé au préalable par l'utilisateur (télécharge SEULEMENT les
    annotations, jamais l'audio protégé). L'utilisateur place ensuite l'audio lui-même.
    """
    ds = mirdata.initialize(dataset_name)
    track_ids = ds.track_ids
    if limit:
        track_ids = track_ids[:limit]

    cases = []
    missing_audio = 0
    for tid in track_ids:
        track = ds.track(tid)
        audio_path = getattr(track, 'audio_path', None)
        if not audio_path or not os.path.isfile(audio_path):
            missing_audio += 1
            continue

        # Le format des annotations d'accords diffère selon les datasets ; on
        # normalise ici vers {start, end, label} comme dans score_b1_harness.py.
        chords_data = track.chords  # objet jams.Annotation-like ou mir_eval-style selon dataset
        intervals, labels = chords_data.intervals, chords_data.labels

        cases.append({
            'id': tid,
            'audio': audio_path,
            'chords': [{'start': float(s), 'end': float(e), 'label': l}
                       for (s, e), l in zip(intervals, labels)],
        })

    print(f'{dataset_name}: {len(cases)} cas exploitables (audio présent), '
          f'{missing_audio} manquants (audio non fourni par l\'utilisateur)', file=sys.stderr)
    return cases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', choices=['billboard', 'beatles'], required=True)
    ap.add_argument('--limit', type=int, default=None)
    ap.add_argument('--out', default=None, help='fichier manifest JSON de sortie, format compatible score_b1_harness.py')
    args = ap.parse_args()

    cases = build_case_list(args.dataset, args.limit)
    if not cases:
        print('Aucun cas exploitable : aucun audio trouvé. '
              'Voir docs/NIVEAU2_MIRDATA.md pour où placer les fichiers.', file=sys.stderr)
        return 1

    out_path = args.out or f'data/niveau2_{args.dataset}_manifest.json'
    with open(out_path, 'w') as f:
        json.dump(cases, f, indent=2, ensure_ascii=False)
    print(f'Manifest écrit : {out_path} ({len(cases)} cas)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

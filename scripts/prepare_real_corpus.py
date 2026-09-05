#!/usr/bin/env python3
"""Prepare tooling for Level 2 real corpora (Isophonics, McGill Billboard, JAAH).

This script sets up the mirdata loaders and documents what the user needs
to provide (audio files) since these corpora only distribute annotations.

Usage:
  python3 scripts/prepare_real_corpus.py --list          # Show available datasets
  python3 scripts/prepare_real_corpus.py --check PATH    # Check if audio exists for a dataset
  python3 scripts/prepare_real_corpus.py --run DATASET   # Run both engines on available audio
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import mirdata
except ImportError:
    sys.exit('mirdata non installé : pip install mirdata')

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Dataset configurations
DATASETS = {
    'isophonics': {
        'name': 'Isophonics',
        'description': '~180 tracks (Beatles, Queen, Carole King, etc.) with professional chord annotations',
        'mirdata_id': 'isophonics',
        'annotation_types': ['chords', 'beats', 'keys', 'sections'],
        'expected_audio_formats': ['.mp3', '.wav', '.flac'],
        'notes': 'Annotations only. User must provide audio files legally obtained.',
    },
    'billboard': {
        'name': 'McGill Billboard',
        'description': '~1000 tracks from Billboard "Hot 100" with chord annotations',
        'mirdata_id': 'billboard',
        'annotation_types': ['chords', 'beats', 'sections'],
        'expected_audio_formats': ['.mp3', '.wav'],
        'notes': 'Annotations only. Audio must be legally obtained (purchased, owned, or institutional access).',
    },
    'jaah': {
        'name': 'JAAH (Jazz Audio Alignment and Harmony)',
        'description': '113 jazz tracks with chord, key, and structure annotations',
        'mirdata_id': 'jaah',
        'annotation_types': ['chords', 'keys', 'sections', 'beats'],
        'expected_audio_formats': ['.wav', '.aiff'],
        'notes': 'Jazz-focused, highly relevant for this project. Annotations only.',
    },
}

# Studio tracks already available
STUDIO_TRACKS = [
    {'id': 'Track_002', 'name': 'Père nous tadorons', 'source': 'gospel'},
    {'id': 'Track_003', 'name': 'Nous élevons Ton nom plus haut (Célina-Jo PAGBÉ)', 'source': 'gospel'},
    {'id': 'Track_004', 'name': 'Car il est glorieux / Gloire à l\'Agneau', 'source': 'gospel'},
    {'id': 'Track_006', 'name': 'Saint Esprit (MLK Music)', 'source': 'gospel'},
    {'id': 'Track_007', 'name': 'Hosanna (Dena Mwana)', 'source': 'gospel/worship'},
    {'id': 'Track_008', 'name': 'You Are Yahweh (Steve Crown) - Live', 'source': 'worship'},
    {'id': 'Track_010', 'name': 'Les Cieux Proclament (Momentum musique)', 'source': 'worship'},
    {'id': 'Track_011', 'name': 'I Surrender All (Betacustic tutorial)', 'source': 'tutorial'},
    {'id': 'Track_013', 'name': 'You Are Yahweh (Extreme Midi tutorial)', 'source': 'tutorial'},
    {'id': 'Track_015', 'name': 'Saint Esprit (2nd version)', 'source': 'gospel'},
    {'id': 'Track_016', 'name': 'Saint Esprit (dup Track_006)', 'source': 'gospel'},
    {'id': 'Track_017', 'name': 'Nous élevons Ton nom (dup Track_003)', 'source': 'gospel'},
]

def list_datasets():
    print("=== NIVEAU 2 — Corpus réels académiques (via mirdata) ===\n")
    for key, ds in DATASETS.items():
        print(f"📦 {ds['name']} ({key})")
        print(f"   {ds['description']}")
        print(f"   Types d'annotations: {', '.join(ds['annotation_types'])}")
        print(f"   Formats audio attendus: {', '.join(ds['expected_audio_formats'])}")
        print(f"   ⚠️  {ds['notes']}")
        print()

def check_dataset(dataset_key, data_home=None):
    if dataset_key not in DATASETS:
        sys.exit(f'Dataset inconnu: {dataset_key}. Disponibles: {list(DATASETS.keys())}')
    
    ds = DATASETS[dataset_key]
    print(f"=== Vérification {ds['name']} ===\n")
    
    try:
        dataset = mirdata.initialize(ds['mirdata_id'], data_home=data_home)
        print(f"✓ mirdata peut charger le dataset")
        
        # Check a few tracks
        track_ids = dataset.track_ids[:5] if hasattr(dataset, 'track_ids') else []
        print(f"   Premiers IDs: {track_ids}")
        
        # Check for audio
        missing_audio = 0
        for tid in track_ids[:10]:
            track = dataset.track(tid)
            audio_path = track.audio_path
            if audio_path and os.path.exists(audio_path):
                print(f"   ✓ {tid}: audio trouvé ({audio_path})")
            else:
                print(f"   ✗ {tid}: audio MANQUANT")
                missing_audio += 1
        
        if missing_audio > 0:
            print(f"\n   {missing_audio}/10 premiers morceaux manquent d'audio.")
            print("   L'utilisateur doit placer les fichiers audio au bon endroit.")
            print(f"   Dossier de données mirdata: {dataset.data_home}")
            
    except Exception as e:
        print(f"✗ Erreur: {e}")

def list_studio_tracks():
    print("=== Pistes déjà disponibles dans le Studio de l'utilisateur ===\n")
    print("Ces fichiers sont déjà importés et peuvent servir de cas réels supplémentaires\n")
    print(f"{'ID':<12} {'Nom':<55} {'Type'}")
    print("-" * 80)
    for t in STUDIO_TRACKS:
        print(f"{t['id']:<12} {t['name']:<55} {t['source']}")

def main():
    parser = argparse.ArgumentParser(description='Préparation Level 2 - Corpus réels')
    parser.add_argument('--list', action='store_true', help='Lister les datasets disponibles')
    parser.add_argument('--check', metavar='DATASET', help='Vérifier la disponibilité audio pour un dataset')
    parser.add_argument('--data-home', metavar='PATH', help='Chemin vers le dossier de données mirdata')
    parser.add_argument('--studio', action='store_true', help='Lister les pistes du Studio')
    args = parser.parse_args()

    if args.list:
        list_datasets()
    elif args.check:
        check_dataset(args.check, args.data_home)
    elif args.studio:
        list_studio_tracks()
    else:
        parser.print_help()

if __name__ == '__main__':
    main()

import sys

# Use soundfile backend via environment before importing torchaudio.
import os
os.environ['TORCHAUDIO_BACKEND'] = 'soundfile'

import demucs.separate

if __name__ == '__main__':
    output_dir = sys.argv[1]
    input_path = sys.argv[2]
    sys.argv = [
        'demucs',
        '-n', 'htdemucs_6s',
        '--out', output_dir,
        '--filename', '{stem}.{ext}',
        input_path,
    ]
    demucs.separate.main()

from __future__ import annotations
from dataclasses import dataclass


@dataclass
class StyleProfile:
    name: str
    quality_priors: dict
    rootless_cost_mult: float = 1.0
    no5_cost_mult: float = 1.0
    bass_weight_mult: float = 1.0
    status: str = 'VALIDATED'

    def __post_init__(self):
        if self.name == 'neutral':
            self.status = 'VALIDATED'


NEUTRAL = StyleProfile(
    name='neutral',
    quality_priors={'major': 1.0, 'minor': 1.0, 'dim': 1.0,
                    'sus2': 1.0, 'sus4': 1.0},
    rootless_cost_mult=1.0,
    no5_cost_mult=1.0,
    bass_weight_mult=1.0,
)

POP_ROCK = StyleProfile(
    name='pop_rock',
    quality_priors={'major': 1.05, 'minor': 1.0, 'dim': 1.0,
                    'sus2': 1.03, 'sus4': 1.0},
    rootless_cost_mult=0.9,
    no5_cost_mult=0.9,
    bass_weight_mult=1.1,
    status='UNVALIDATED',
)

JAZZ_GOSPEL = StyleProfile(
    name='jazz_gospel',
    quality_priors={'major': 1.0, 'minor': 1.02, 'dim': 1.05,
                    'sus2': 1.0, 'sus4': 1.0},
    rootless_cost_mult=0.8,
    no5_cost_mult=0.8,
    bass_weight_mult=1.0,
    status='UNVALIDATED',
)

LATIN_SALSA = StyleProfile(
    name='latin_salsa',
    quality_priors={'major': 1.05, 'minor': 1.0, 'dim': 1.0,
                    'sus2': 1.0, 'sus4': 1.03},
    rootless_cost_mult=0.9,
    no5_cost_mult=0.9,
    bass_weight_mult=1.1,
    status='UNVALIDATED',
)


STYLE_PROFILES = {
    'neutral': NEUTRAL,
    'pop_rock': POP_ROCK,
    'jazz_gospel': JAZZ_GOSPEL,
    'latin_salsa': LATIN_SALSA,
}

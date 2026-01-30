"""Audio loading utilities."""

from dataclasses import dataclass
from typing import Optional

import numpy as np
from essentia.standard import MonoLoader


@dataclass
class AudioData:
    """Container for loaded audio data."""
    samples: np.ndarray
    sample_rate: int
    duration: float

    @property
    def num_samples(self) -> int:
        return len(self.samples)


class AudioLoader:
    """Load audio files at various sample rates."""

    SAMPLE_RATE_ANALYSIS = 44100  # For BPM/key analysis
    SAMPLE_RATE_ML = 16000  # For ML models (genre classification)
    RESAMPLE_QUALITY = 4

    def __init__(self, file_path: str):
        self.file_path = file_path
        self._cache: dict[int, AudioData] = {}

    def load(self, sample_rate: Optional[int] = None) -> AudioData:
        """Load audio at specified sample rate (cached)."""
        sr = sample_rate or self.SAMPLE_RATE_ANALYSIS

        if sr not in self._cache:
            samples = MonoLoader(
                filename=self.file_path,
                sampleRate=sr,
                resampleQuality=self.RESAMPLE_QUALITY
            )()
            self._cache[sr] = AudioData(
                samples=samples,
                sample_rate=sr,
                duration=len(samples) / sr
            )

        return self._cache[sr]

    def load_for_analysis(self) -> AudioData:
        """Load audio at 44.1kHz for BPM/key analysis."""
        return self.load(self.SAMPLE_RATE_ANALYSIS)

    def load_for_ml(self) -> AudioData:
        """Load audio at 16kHz for ML models."""
        return self.load(self.SAMPLE_RATE_ML)

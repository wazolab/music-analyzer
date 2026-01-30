"""Audio loading utilities with optimized resampling."""

from dataclasses import dataclass
from typing import Optional

import numpy as np
from essentia.standard import MonoLoader, Resample


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
    """Load audio files with in-memory resampling optimization.

    Audio is loaded once at the highest needed sample rate (44.1kHz),
    then resampled in memory for lower sample rates (16kHz for ML).
    This is faster than loading the file twice from disk.
    """

    SAMPLE_RATE_ANALYSIS = 44100  # For BPM/key analysis
    SAMPLE_RATE_ML = 16000  # For ML models (genre classification)
    RESAMPLE_QUALITY = 4

    def __init__(self, file_path: str):
        self.file_path = file_path
        self._cache: dict[int, AudioData] = {}
        self._base_audio: Optional[AudioData] = None

    def _load_base(self) -> AudioData:
        """Load audio at base sample rate (44.1kHz)."""
        if self._base_audio is None:
            samples = MonoLoader(
                filename=self.file_path,
                sampleRate=self.SAMPLE_RATE_ANALYSIS,
                resampleQuality=self.RESAMPLE_QUALITY,
            )()
            self._base_audio = AudioData(
                samples=samples,
                sample_rate=self.SAMPLE_RATE_ANALYSIS,
                duration=len(samples) / self.SAMPLE_RATE_ANALYSIS,
            )
            self._cache[self.SAMPLE_RATE_ANALYSIS] = self._base_audio
        return self._base_audio

    def _resample(self, audio: AudioData, target_sr: int) -> AudioData:
        """Resample audio in memory to target sample rate."""
        if audio.sample_rate == target_sr:
            return audio

        resampler = Resample(
            inputSampleRate=audio.sample_rate,
            outputSampleRate=target_sr,
            quality=self.RESAMPLE_QUALITY,
        )
        resampled = resampler(audio.samples)
        return AudioData(
            samples=resampled, sample_rate=target_sr, duration=len(resampled) / target_sr
        )

    def load(self, sample_rate: Optional[int] = None) -> AudioData:
        """Load audio at specified sample rate (cached, with in-memory resampling)."""
        sr = sample_rate or self.SAMPLE_RATE_ANALYSIS

        if sr not in self._cache:
            base = self._load_base()
            if sr == self.SAMPLE_RATE_ANALYSIS:
                return base
            # Resample in memory instead of reloading from disk
            self._cache[sr] = self._resample(base, sr)

        return self._cache[sr]

    def load_for_analysis(self) -> AudioData:
        """Load audio at 44.1kHz for BPM/key analysis."""
        return self.load(self.SAMPLE_RATE_ANALYSIS)

    def load_for_ml(self) -> AudioData:
        """Load audio at 16kHz for ML models (resampled in memory)."""
        return self.load(self.SAMPLE_RATE_ML)

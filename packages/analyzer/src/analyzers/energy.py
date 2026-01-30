"""Energy level analysis using Essentia's emomusic arousal model."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
from essentia.standard import TensorflowPredictMusiCNN, TensorflowPredict2D

from .audio import AudioData


@dataclass
class EnergyResult:
    """Result of energy analysis."""

    level: int  # 1-10 scale
    arousal: float  # Raw arousal value (1-9 scale from emomusic model)

    @property
    def label(self) -> str:
        """Human-readable energy label."""
        if self.level <= 3:
            return "Low"
        elif self.level <= 6:
            return "Medium"
        else:
            return "High"


class EnergyAnalyzer:
    """Analyze perceived energy level using Essentia's emomusic arousal model.

    Uses the MSD-MusiCNN embedding model with the emomusic classification head
    to predict arousal (musical energy/intensity) on a 1-9 scale.
    """

    DEFAULT_MODELS_DIR = Path("/app/models")
    MIN_LEVEL = 1
    MAX_LEVEL = 10

    def __init__(self, models_dir: Optional[Path] = None):
        """
        Initialize energy analyzer.

        Args:
            models_dir: Path to models directory
        """
        self.models_dir = models_dir or self.DEFAULT_MODELS_DIR
        self._embedding_model = None
        self._arousal_model = None

    def load(self) -> "EnergyAnalyzer":
        """Load models. Call before analyze()."""
        embedding_path = self.models_dir / "msd-musicnn-1.pb"
        arousal_path = self.models_dir / "emomusic-msd-musicnn-2.pb"

        # MSD-MusiCNN extracts embeddings from 16kHz audio
        self._embedding_model = TensorflowPredictMusiCNN(
            graphFilename=str(embedding_path),
            output="model/dense/BiasAdd"
        )

        # Emomusic predicts arousal and valence from embeddings
        self._arousal_model = TensorflowPredict2D(
            graphFilename=str(arousal_path),
            output="model/Identity"
        )

        return self

    def analyze(self, audio: AudioData) -> EnergyResult:
        """
        Analyze audio and extract energy level using arousal prediction.

        Uses the emomusic model which predicts arousal (energy/intensity)
        on a 1-9 scale based on musical content, not just loudness.

        Args:
            audio: Audio data at 16kHz

        Returns:
            EnergyResult with energy level (1-10) and raw arousal value
        """
        if self._embedding_model is None or self._arousal_model is None:
            raise RuntimeError("Models not loaded. Call load() first.")

        # Extract embeddings using MSD-MusiCNN
        embeddings = self._embedding_model(audio.samples)

        # Predict arousal and valence
        # Output shape: (num_patches, 2) where [0] is valence, [1] is arousal
        predictions = self._arousal_model(embeddings)

        # Average arousal across all patches (arousal is index 1)
        arousal = float(np.mean(predictions[:, 1]))

        # Arousal is on 1-9 scale, map to 1-10
        # arousal 1 -> level 1, arousal 9 -> level 10
        normalized = (arousal - 1) / 8  # 0-1 range
        level = int(round(normalized * 9 + 1))  # 1-10 range
        level = max(self.MIN_LEVEL, min(self.MAX_LEVEL, level))

        return EnergyResult(level=level, arousal=arousal)

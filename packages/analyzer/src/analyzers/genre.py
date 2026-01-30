"""Genre classification using Discogs-Effnet model."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from essentia.standard import TensorflowPredictEffnetDiscogs

from .audio import AudioData


@dataclass
class GenrePrediction:
    """Single genre prediction."""

    genre: str
    confidence: float

    @property
    def percentage(self) -> float:
        return self.confidence * 100


@dataclass
class GenreResult:
    """Result of genre classification."""

    top_genres: List[str]
    predictions: List[GenrePrediction] = field(default_factory=list)

    @property
    def primary_genre(self) -> Optional[str]:
        """Get the top predicted genre."""
        return self.top_genres[0] if self.top_genres else None

    def get_subgenre(self, genre: str) -> Optional[str]:
        """Extract subgenre from 'Parent---Subgenre' format."""
        if "---" in genre:
            return genre.split("---")[1]
        return genre


class GenreClassifier:
    """Classify audio genres using Discogs-Effnet model."""

    DEFAULT_MODELS_DIR = Path("/app/models")
    CONFIDENCE_THRESHOLD = 0.05  # 5% minimum confidence
    MIN_GENRES = 3
    MAX_GENRES = 10

    def __init__(self, models_dir: Optional[Path] = None):
        """
        Initialize genre classifier.

        Args:
            models_dir: Path to models directory
        """
        self.models_dir = models_dir or self.DEFAULT_MODELS_DIR
        self._model = None
        self._labels = None

    def load(self) -> "GenreClassifier":
        """Load model and labels. Call before analyze()."""
        self._labels = self._load_labels()
        self._model = self._load_model()
        return self

    def _load_labels(self) -> List[str]:
        """Load genre labels from JSON."""
        labels_path = self.models_dir / "genre_discogs400-discogs-effnet-1.json"
        with open(labels_path) as f:
            data = json.load(f)
        return data["classes"]

    def _load_model(self):
        """Load TensorFlow model."""
        model_path = self.models_dir / "discogs-effnet"
        return TensorflowPredictEffnetDiscogs(
            graphFilename="", savedModel=str(model_path), output="PartitionedCall"
        )

    @property
    def labels(self) -> List[str]:
        """Get loaded genre labels."""
        if self._labels is None:
            raise RuntimeError("Model not loaded. Call load() first.")
        return self._labels

    @property
    def num_labels(self) -> int:
        """Number of genre labels."""
        return len(self.labels)

    def analyze(self, audio: AudioData) -> GenreResult:
        """
        Classify audio genre.

        Args:
            audio: Audio data at 16kHz

        Returns:
            GenreResult with genre predictions
        """
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        # Run inference
        predictions = self._model(audio.samples)

        # Average predictions across all patches
        avg_predictions = predictions.mean(axis=0)

        # Create sorted predictions list
        all_predictions = [
            GenrePrediction(genre=self._labels[i], confidence=float(avg_predictions[i]))
            for i in range(len(self._labels))
        ]
        all_predictions.sort(key=lambda x: x.confidence, reverse=True)

        # Get top genres above threshold
        top_genres = [
            p.genre
            for p in all_predictions[: self.MAX_GENRES]
            if p.confidence > self.CONFIDENCE_THRESHOLD
        ]

        # Ensure minimum genres
        if len(top_genres) < self.MIN_GENRES:
            top_genres = [p.genre for p in all_predictions[: self.MIN_GENRES]]

        return GenreResult(top_genres=top_genres, predictions=all_predictions[: self.MAX_GENRES])

    def format_predictions(self, result: GenreResult, top_n: int = 10) -> str:
        """Format predictions as readable string."""
        lines = []
        for i, pred in enumerate(result.predictions[:top_n]):
            bar = "█" * int(pred.confidence * 50)
            lines.append(f"  {i + 1}. {pred.genre:<35} {pred.percentage:>5.1f}% {bar}")
        return "\n".join(lines)

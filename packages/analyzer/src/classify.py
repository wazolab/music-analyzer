#!/usr/bin/env python3
"""
Audio analyzer CLI - Extract BPM, key, energy, and genre from audio files.

Uses Essentia's Discogs-Effnet models for genre classification.

TODO: Audio is loaded twice (44100Hz for BPM/key, 16000Hz for genre model).
      Could resample in memory instead for better performance.
"""

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

from analyzers import (
    AudioLoader,
    RhythmAnalyzer,
    KeyAnalyzer,
    EnergyAnalyzer,
    GenreClassifier,
    AudioTagger,
    TagData,
)
from utils import parse_filename, find_audio_files


@dataclass
class AnalysisResult:
    """Complete analysis result for a track."""
    file: str
    artist: str
    title: str
    bpm: int
    key: str
    energy: int
    genres: List[str]

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class AudioAnalyzer:
    """Main analyzer orchestrating all analysis modules."""

    def __init__(self, verbose: bool = True, write_tags: bool = False):
        self.verbose = verbose
        self.write_tags = write_tags
        self.rhythm = RhythmAnalyzer()
        self.key = KeyAnalyzer()
        self.energy = EnergyAnalyzer()
        self.genre = GenreClassifier()
        self.tagger = AudioTagger()

    def load_models(self) -> "AudioAnalyzer":
        """Load ML models. Call before analyzing."""
        self._log("Loading model...")
        self.genre.load()
        self._log(f"Loaded {self.genre.num_labels} genre labels")
        return self

    def analyze(self, file_path: str) -> AnalysisResult:
        """
        Analyze a single audio file.

        Args:
            file_path: Path to audio file

        Returns:
            AnalysisResult with all extracted features
        """
        filename = os.path.basename(file_path)
        self._log(f"\nAnalyzing: {filename}")
        self._log("=" * 50)

        # Parse track info from filename
        track_info = parse_filename(filename)

        # Load audio (cached for different sample rates)
        loader = AudioLoader(file_path)

        self._log("Loading audio...")
        audio_44k = loader.load_for_analysis()
        self._log(f"Loaded {audio_44k.num_samples} samples ({audio_44k.duration:.1f}s)")

        # Analyze rhythm (BPM)
        rhythm_result = self.rhythm.analyze(audio_44k)
        self._log(f"BPM: {rhythm_result.bpm}")

        # Analyze key
        key_result = self.key.analyze(audio_44k)
        self._log(f"Key: {key_result.notation} ({key_result.camelot})")

        # Analyze energy
        energy_result = self.energy.analyze(audio_44k)
        self._log(f"Energy: {energy_result.level}/10")

        # Classify genre (needs 16kHz audio)
        self._log("Running genre classification...")
        audio_16k = loader.load_for_ml()
        genre_result = self.genre.analyze(audio_16k)

        self._log(f"\nTop 10 genres:")
        self._log(self.genre.format_predictions(genre_result))

        # Build result
        result = AnalysisResult(
            file=filename,
            artist=track_info.artist,
            title=track_info.title,
            bpm=rhythm_result.bpm,
            key=key_result.camelot,
            energy=energy_result.level,
            genres=genre_result.top_genres,
        )

        # Write tags to file if enabled
        if self.write_tags:
            self._log("Writing tags to file...")
            tag_data = TagData(
                bpm=result.bpm,
                key=result.key,
                energy=result.energy,
                genres=result.genres,
            )
            if self.tagger.write(file_path, tag_data):
                self._log("✔ Tags written successfully")
            else:
                self._log("✗ Failed to write tags")

        # Output JSON for UI parsing
        self._log(f"\n__RESULT__: {result.to_json()}")

        return result

    def analyze_directory(
        self,
        directory: Path,
        recursive: bool = True
    ) -> Dict[str, AnalysisResult]:
        """
        Analyze all audio files in a directory.

        Args:
            directory: Directory to scan
            recursive: Whether to search subdirectories

        Returns:
            Dict mapping file paths to results
        """
        audio_files = find_audio_files(directory, recursive)
        self._log(f"Found {len(audio_files)} audio files")

        results = {}
        for i, audio_file in enumerate(audio_files, 1):
            self._log(f"\n[{i}/{len(audio_files)}] Processing...")
            try:
                result = self.analyze(str(audio_file))
                results[str(audio_file)] = result
                self._log(f"✔ Completed: {audio_file.name}")
            except Exception as e:
                self._log(f"✗ Failed: {audio_file.name} - {e}")

        return results

    def _log(self, message: str) -> None:
        """Print message if verbose mode is enabled."""
        if self.verbose:
            print(message)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze audio files for BPM, key, energy, and genre"
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Audio file or folder to analyze"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output directory (not used in current mode)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON"
    )
    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="Suppress verbose output"
    )
    parser.add_argument(
        "-w", "--write-tags",
        action="store_true",
        help="Write analysis results to file metadata (for Traktor/Serato)"
    )

    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        return

    # Initialize analyzer
    analyzer = AudioAnalyzer(verbose=not args.quiet, write_tags=args.write_tags)
    analyzer.load_models()

    input_path = Path(args.input)

    if input_path.is_dir():
        results = analyzer.analyze_directory(input_path)
    else:
        result = analyzer.analyze(str(input_path))
        results = {str(input_path): result}

    print(f"\nTotal files processed: {len(results)}")

    if args.json:
        output = {
            path: result.to_dict()
            for path, result in results.items()
        }
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

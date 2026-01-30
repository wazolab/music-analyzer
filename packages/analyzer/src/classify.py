#!/usr/bin/env python3
"""
Audio analyzer CLI - Extract BPM, key, energy, and genre from audio files.

Uses Essentia's Discogs-Effnet models for genre classification.

Optimizations:
- In-memory resampling (load once at 44.1kHz, resample to 16kHz)
- Skip already-analyzed files (checks ANALYZER tag)
- Parallel processing with multiprocessing
"""

# Suppress TensorFlow/Essentia warnings
import os

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"  # Suppress TF info/warnings

import argparse
import json
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from analyzers import (
    AudioLoader,
    AudioTagger,
    EnergyAnalyzer,
    GenreClassifier,
    KeyAnalyzer,
    RhythmAnalyzer,
    TagData,
    get_fingerprint,
    lookup_metadata,
)
from converter import convert_to_flac, needs_conversion
from utils import find_audio_files, parse_filename


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
    album: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    fingerprint: Optional[str] = None
    fingerprint_duration: Optional[int] = None

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class AudioAnalyzer:
    """Main analyzer orchestrating all analysis modules."""

    def __init__(
        self,
        verbose: bool = True,
        write_tags: bool = False,
        metadata_lookup: bool = False,
        convert_to_flac: bool = False,
        skip_analyzed: bool = False,
    ):
        self.verbose = verbose
        self.write_tags = write_tags
        self.metadata_lookup = metadata_lookup
        self.convert_to_flac_enabled = convert_to_flac
        self.skip_analyzed = skip_analyzed
        self.rhythm = RhythmAnalyzer()
        self.key = KeyAnalyzer()
        self.energy = EnergyAnalyzer()
        self.genre = GenreClassifier()
        self.tagger = AudioTagger()

    def load_models(self) -> "AudioAnalyzer":
        """Load ML models. Call before analyzing."""
        self._log("Loading models...")
        self.genre.load()
        self._log(f"Loaded {self.genre.num_labels} genre labels")
        self.energy.load()
        self._log("Loaded emomusic arousal model for energy detection")
        return self

    def analyze(self, file_path: str) -> Optional[AnalysisResult]:
        """
        Analyze a single audio file.

        Args:
            file_path: Path to audio file

        Returns:
            AnalysisResult with all extracted features, or None if skipped
        """
        filename = os.path.basename(file_path)
        self._log(f"\nAnalyzing: {filename}")
        self._log("=" * 50)

        # Skip if already analyzed by this tool
        if self.skip_analyzed and self.tagger.is_analyzed(file_path):
            self._log("⏭ Skipping (already analyzed)")
            return None

        # Convert to FLAC if enabled and needed
        if self.convert_to_flac_enabled and needs_conversion(file_path):
            self._log("Converting to FLAC...")
            new_path, success = convert_to_flac(
                file_path, delete_original=True, verbose=self.verbose
            )
            if success and new_path != file_path:
                file_path = new_path
                filename = os.path.basename(file_path)
                self._log(f"✔ Now analyzing: {filename}")
            elif not success:
                self._log("⚠ Conversion failed, analyzing original format")

        # Parse track info from filename
        track_info = parse_filename(filename)

        # Generate fingerprint (used for library tracking and metadata lookup)
        self._log("Generating fingerprint...")
        fingerprint, fingerprint_duration = get_fingerprint(file_path)
        if fingerprint:
            self._log(f"Fingerprint generated ({fingerprint_duration}s)")
        else:
            self._log("⚠ Could not generate fingerprint")

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

        # Load 16kHz audio for ML models
        audio_16k = loader.load_for_ml()

        # Analyze energy using emomusic arousal model (needs 16kHz)
        energy_result = self.energy.analyze(audio_16k)
        self._log(f"Energy: {energy_result.level}/10 (arousal: {energy_result.arousal:.2f})")

        # Classify genre (needs 16kHz audio)
        self._log("Running genre classification...")
        genre_result = self.genre.analyze(audio_16k)

        self._log("\nTop 10 genres:")
        self._log(self.genre.format_predictions(genre_result))

        # Correct BPM based on genre expectations
        bpm = rhythm_result.bpm
        detected_subgenres = {
            g.split("---")[1] if "---" in g else g for g in genre_result.top_genres[:3]
        }
        primary_subgenre = (
            genre_result.top_genres[0].split("---")[1]
            if "---" in genre_result.top_genres[0]
            else genre_result.top_genres[0]
        )

        # Fast genres: double BPM if detected < 100 (half-time detection)
        fast_genres = {"Juke", "Jungle", "Drum n Bass", "Footwork", "Breakcore", "Hardcore"}
        if detected_subgenres & fast_genres and bpm < 100 and primary_subgenre != "Halftime":
            bpm = bpm * 2
            self._log(f"Corrected half-time BPM: {rhythm_result.bpm} -> {bpm}")

        # Slow genres: halve BPM if detected > 130 (double-time detection)
        slow_genres = {"Dubstep", "Downtempo", "Ambient", "Chillwave", "Trip Hop", "Dub"}
        if primary_subgenre in slow_genres and bpm > 130:
            bpm = bpm // 2
            self._log(f"Corrected double-time BPM: {rhythm_result.bpm} -> {bpm}")

        # Metadata lookup via AcoustID + MusicBrainz
        artist = track_info.artist
        title = track_info.title
        album = None
        label = None
        year = None

        if self.metadata_lookup:
            self._log("Looking up metadata...")
            metadata = lookup_metadata(
                file_path, hint_artist=track_info.artist, hint_title=track_info.title
            )
            if metadata.title:
                # Determine source based on what fields are set
                if metadata.musicbrainz_id:
                    source = "MusicBrainz"
                elif metadata.confidence > 0 and metadata.confidence < 1:
                    # Discogs and Bandcamp use text similarity scores < 1.0
                    # Check if label looks like a Bandcamp subdomain pattern
                    source = "Discogs/Bandcamp"
                else:
                    source = "Discogs"
                self._log(f"Found match via {source} (confidence: {metadata.confidence:.0%})")
                if metadata.artist:
                    artist = metadata.artist
                    self._log(f"  Artist: {artist}")
                if metadata.title:
                    title = metadata.title
                    self._log(f"  Title: {title}")
                if metadata.album:
                    album = metadata.album
                    self._log(f"  Album: {album}")
                if metadata.label:
                    label = metadata.label
                    self._log(f"  Label: {label}")
                if metadata.year:
                    year = metadata.year
                    self._log(f"  Year: {year}")
            else:
                self._log("No match found in MusicBrainz, Discogs, or Bandcamp")

        # Build result
        result = AnalysisResult(
            file=filename,
            artist=artist,
            title=title,
            bpm=bpm,
            key=key_result.camelot,
            energy=energy_result.level,
            genres=genre_result.top_genres,
            album=album,
            label=label,
            year=year,
            fingerprint=fingerprint,
            fingerprint_duration=fingerprint_duration,
        )

        # Write tags to file if enabled
        if self.write_tags:
            self._log("Writing tags to file...")
            tag_data = TagData(
                bpm=result.bpm,
                key=result.key,
                energy=result.energy,
                genres=result.genres,
                year=result.year,
                fingerprint=result.fingerprint,
                fingerprint_duration=result.fingerprint_duration,
            )
            if self.tagger.write(file_path, tag_data):
                self._log("✔ Tags written successfully")
                written = self.tagger.read_existing(file_path)
                self._log("\nFile tags:")
                self._log(f"  BPM: {written.bpm}")
                self._log(f"  KEY: {written.key}")
                self._log(f"  ENERGY: {written.energy}")
                self._log(f"  GENRE: {written.genres}")
            else:
                self._log("✗ Failed to write tags")

        # Output JSON for UI parsing
        self._log(f"\n__RESULT__: {result.to_json()}")

        return result

    def analyze_directory(
        self, directory: Path, recursive: bool = True
    ) -> Dict[str, AnalysisResult]:
        """
        Analyze all audio files in a directory (sequential).

        Args:
            directory: Directory to scan
            recursive: Whether to search subdirectories

        Returns:
            Dict mapping file paths to results
        """
        audio_files = find_audio_files(directory, recursive)
        self._log(f"Found {len(audio_files)} audio files")

        results = {}
        skipped = 0
        for i, audio_file in enumerate(audio_files, 1):
            self._log(f"\n[{i}/{len(audio_files)}] Processing...")
            try:
                result = self.analyze(str(audio_file))
                if result is None:
                    skipped += 1
                else:
                    results[str(audio_file)] = result
                    self._log(f"✔ Completed: {audio_file.name}")
            except Exception as e:
                self._log(f"✗ Failed: {audio_file.name} - {e}")

        if skipped > 0:
            self._log(f"\n⏭ Skipped {skipped} already-analyzed files")

        return results

    def _log(self, message: str) -> None:
        """Print message if verbose mode is enabled."""
        if self.verbose:
            print(message)


# Worker function for parallel processing (must be at module level for pickling)
def _analyze_file_worker(args: Tuple[str, dict]) -> Tuple[str, Optional[dict], Optional[str]]:
    """
    Worker function to analyze a single file in a separate process.

    Args:
        args: Tuple of (file_path, analyzer_config)

    Returns:
        Tuple of (file_path, result_dict or None, error_message or None)
    """
    file_path, config = args
    try:
        # Create analyzer in worker process (loads model)
        analyzer = AudioAnalyzer(
            verbose=False,  # Quiet in workers
            write_tags=config.get("write_tags", False),
            metadata_lookup=config.get("metadata_lookup", False),
            convert_to_flac=config.get("convert_to_flac", False),
            skip_analyzed=config.get("skip_analyzed", False),
        )
        analyzer.load_models()

        result = analyzer.analyze(file_path)
        if result is None:
            return (file_path, None, "skipped")
        return (file_path, result.to_dict(), None)
    except Exception as e:
        return (file_path, None, str(e))


def analyze_directory_parallel(
    directory: Path,
    workers: int = 4,
    recursive: bool = True,
    write_tags: bool = False,
    metadata_lookup: bool = False,
    convert_to_flac: bool = False,
    skip_analyzed: bool = False,
    verbose: bool = True,
) -> Dict[str, AnalysisResult]:
    """
    Analyze all audio files in a directory using parallel processing.

    Args:
        directory: Directory to scan
        workers: Number of parallel workers
        recursive: Whether to search subdirectories
        write_tags: Write tags to files
        metadata_lookup: Look up metadata
        convert_to_flac: Convert to FLAC
        skip_analyzed: Skip already-analyzed files
        verbose: Print progress

    Returns:
        Dict mapping file paths to results
    """
    audio_files = find_audio_files(directory, recursive)
    total = len(audio_files)

    if verbose:
        print(f"Found {total} audio files")
        print(f"Using {workers} parallel workers")

    config = {
        "write_tags": write_tags,
        "metadata_lookup": metadata_lookup,
        "convert_to_flac": convert_to_flac,
        "skip_analyzed": skip_analyzed,
    }

    results = {}
    completed = 0
    skipped = 0
    failed = 0

    # Prepare work items
    work_items = [(str(f), config) for f in audio_files]

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_analyze_file_worker, item): item[0] for item in work_items}

        for future in as_completed(futures):
            file_path = futures[future]
            filename = os.path.basename(file_path)
            completed += 1

            try:
                path, result_dict, error = future.result()

                if error == "skipped":
                    skipped += 1
                    if verbose:
                        print(f"[{completed}/{total}] ⏭ Skipped: {filename}")
                elif error:
                    failed += 1
                    if verbose:
                        print(f"[{completed}/{total}] ✗ Failed: {filename} - {error}")
                else:
                    # Reconstruct AnalysisResult from dict
                    result = AnalysisResult(**result_dict)
                    results[path] = result
                    if verbose:
                        print(
                            f"[{completed}/{total}] ✔ {filename} - {result.bpm} BPM, {result.key}"
                        )
                    # Print JSON for UI parsing
                    print(f"__RESULT__: {json.dumps(result_dict)}")
            except Exception as e:
                failed += 1
                if verbose:
                    print(f"[{completed}/{total}] ✗ Failed: {filename} - {e}")

    if verbose:
        print(f"\nCompleted: {len(results)}, Skipped: {skipped}, Failed: {failed}")

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Analyze audio files for BPM, key, energy, and genre"
    )
    parser.add_argument("input", nargs="?", help="Audio file or folder to analyze")
    parser.add_argument("-o", "--output", help="Output directory (not used in current mode)")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress verbose output")
    parser.add_argument(
        "-w",
        "--write-tags",
        action="store_true",
        help="Write analysis results to file metadata (for Traktor/Serato)",
    )
    parser.add_argument(
        "-l",
        "--lookup",
        action="store_true",
        help="Look up metadata via AcoustID + MusicBrainz (requires ACOUSTID_API_KEY)",
    )
    parser.add_argument(
        "-c",
        "--convert",
        action="store_true",
        help="Convert non-FLAC files to FLAC before analysis (requires ffmpeg)",
    )
    parser.add_argument(
        "-s",
        "--skip-analyzed",
        action="store_true",
        help="Skip files already processed by this analyzer (checks ANALYZER tag)",
    )
    parser.add_argument(
        "-p",
        "--parallel",
        type=int,
        metavar="N",
        default=0,
        help="Use N parallel workers (0 = sequential, default)",
    )

    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        return

    input_path = Path(args.input)

    # Use parallel processing for directories if requested
    if input_path.is_dir() and args.parallel > 0:
        results = analyze_directory_parallel(
            input_path,
            workers=args.parallel,
            recursive=True,
            write_tags=args.write_tags,
            metadata_lookup=args.lookup,
            convert_to_flac=args.convert,
            skip_analyzed=args.skip_analyzed,
            verbose=not args.quiet,
        )
    else:
        # Sequential processing
        analyzer = AudioAnalyzer(
            verbose=not args.quiet,
            write_tags=args.write_tags,
            metadata_lookup=args.lookup,
            convert_to_flac=args.convert,
            skip_analyzed=args.skip_analyzed,
        )
        analyzer.load_models()

        if input_path.is_dir():
            results = analyzer.analyze_directory(input_path)
        else:
            result = analyzer.analyze(str(input_path))
            results = {str(input_path): result} if result else {}

    print(f"\nTotal files processed: {len(results)}")

    if args.json:
        output = {path: result.to_dict() for path, result in results.items()}
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

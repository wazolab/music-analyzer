#!/usr/bin/env python3
"""
Genre classification using Essentia's Discogs-Effnet models.
Uses TensorflowPredictEffnetDiscogs algorithm from essentia-tensorflow.
"""

import argparse
import json
import os
import re
from pathlib import Path

from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs

MODELS_DIR = Path("/app/models")


def load_labels() -> list:
    """Load genre labels from the model's JSON."""
    labels_path = MODELS_DIR / "genre_discogs400-discogs-effnet-1.json"
    with open(labels_path) as f:
        data = json.load(f)
    return data["classes"]


def parse_filename(filename: str) -> tuple[str, str]:
    """Extract artist and title from filename.

    Handles formats like:
    - "Artist - Title.flac"
    - "01 - Title.flac" (track number prefix)
    - "Artist - Title (feat. Someone).flac"
    """
    # Remove extension
    name = Path(filename).stem

    # Try to split by " - "
    if " - " in name:
        parts = name.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

        # Check if first part is a track number
        if re.match(r'^\d+$', artist):
            # No artist, just track number and title
            return "", title

        return artist, title

    # No separator, use filename as title
    return "", name


def analyze_file(file_path: str, labels: list, model) -> dict:
    """Analyze a single audio file."""
    filename = os.path.basename(file_path)
    print(f"\nAnalyzing: {filename}")
    print("=" * 50)

    # Parse artist/title from filename
    artist, title = parse_filename(filename)

    # Load audio at 16kHz mono
    print("Loading audio...")
    audio = MonoLoader(filename=file_path, sampleRate=16000, resampleQuality=4)()
    print(f"Loaded {len(audio)} samples ({len(audio) / 16000:.1f}s)")

    # Run prediction
    print("Running genre classification...")
    predictions = model(audio)
    print(f"Predictions shape: {predictions.shape}")

    # Average predictions across all patches
    avg_predictions = predictions.mean(axis=0)

    # Sort by confidence
    results = [
        {"genre": labels[i], "confidence": float(avg_predictions[i])}
        for i in range(len(labels))
    ]
    results.sort(key=lambda x: x["confidence"], reverse=True)

    # Get top genres (confidence > 5%)
    top_genres = [r["genre"] for r in results[:10] if r["confidence"] > 0.05]

    # If no genres above 5%, take top 3
    if not top_genres:
        top_genres = [r["genre"] for r in results[:3]]

    print("\nTop 10 genres:")
    for i, p in enumerate(results[:10]):
        bar = "█" * int(p["confidence"] * 50)
        print(f"  {i+1}. {p['genre']:<35} {p['confidence']*100:>5.1f}% {bar}")

    # Output JSON result for parsing by UI
    result = {
        "artist": artist,
        "title": title,
        "genres": top_genres,
        "file": filename
    }
    print(f"\n__RESULT__: {json.dumps(result)}")

    return {
        "artist": artist,
        "title": title,
        "genres": top_genres,
        "all_predictions": results
    }


def main():
    parser = argparse.ArgumentParser(
        description="Analyze audio files for genre classification"
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Audio file or folder to analyze"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output directory (not used in genre-only mode)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON"
    )

    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        return

    # Load labels and model once
    print("Loading model...")
    labels = load_labels()
    print(f"Loaded {len(labels)} genre labels")

    model_path = MODELS_DIR / "discogs-effnet"
    model = TensorflowPredictEffnetDiscogs(
        graphFilename="",
        savedModel=str(model_path),
        output="PartitionedCall"
    )

    input_path = Path(args.input)
    all_results = {}

    if input_path.is_dir():
        audio_files = list(input_path.glob("**/*.flac")) + \
                     list(input_path.glob("**/*.mp3")) + \
                     list(input_path.glob("**/*.wav"))
        print(f"Found {len(audio_files)} audio files")

        for i, audio_file in enumerate(audio_files, 1):
            print(f"\n[{i}/{len(audio_files)}] Processing...")
            try:
                results = analyze_file(str(audio_file), labels, model)
                all_results[str(audio_file)] = results
                print(f"✔ Completed: {audio_file.name}")
            except Exception as e:
                print(f"✗ Failed: {audio_file.name} - {e}")
    else:
        results = analyze_file(str(input_path), labels, model)
        all_results[str(input_path)] = results

    print(f"\nTotal files processed: {len(all_results)}")

    if args.json:
        print(json.dumps(all_results, indent=2))


if __name__ == "__main__":
    main()

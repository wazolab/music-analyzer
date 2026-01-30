#!/usr/bin/env python3
"""
Genre classification using Essentia's Discogs-Effnet models.
Uses TensorflowPredictEffnetDiscogs algorithm from essentia-tensorflow.
"""

import argparse
import json
import os
from pathlib import Path

from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs

MODELS_DIR = Path("/app/models")


def load_labels() -> list:
    """Load genre labels from the model's JSON."""
    labels_path = MODELS_DIR / "genre_discogs400-discogs-effnet-1.json"
    with open(labels_path) as f:
        data = json.load(f)
    return data["classes"]


def analyze_file(file_path: str, labels: list):
    """Analyze a single audio file."""
    print(f"\nAnalyzing: {os.path.basename(file_path)}")
    print("=" * 50)

    # Load audio at 16kHz mono
    print("Loading audio...")
    audio = MonoLoader(filename=file_path, sampleRate=16000, resampleQuality=4)()
    print(f"Loaded {len(audio)} samples ({len(audio) / 16000:.1f}s)")

    # Run prediction using Essentia's TensorflowPredictEffnetDiscogs
    print("Running genre classification...")
    model_path = MODELS_DIR / "discogs-effnet"
    model = TensorflowPredictEffnetDiscogs(
        graphFilename="",
        savedModel=str(model_path),
        output="PartitionedCall"
    )

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

    print("\nTop 10 genres:")
    for i, p in enumerate(results[:10]):
        bar = "█" * int(p["confidence"] * 50)
        print(f"  {i+1}. {p['genre']:<35} {p['confidence']*100:>5.1f}% {bar}")

    return results


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
        help="Output directory (not used in console mode)"
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

    # Load labels
    print("Loading labels...")
    labels = load_labels()
    print(f"Loaded {len(labels)} genre labels")

    input_path = Path(args.input)
    all_results = {}

    if input_path.is_dir():
        audio_files = list(input_path.glob("*.flac")) + \
                     list(input_path.glob("*.mp3")) + \
                     list(input_path.glob("*.wav"))
        print(f"Found {len(audio_files)} audio files")

        for audio_file in audio_files:
            results = analyze_file(str(audio_file), labels)
            all_results[str(audio_file)] = results
    else:
        results = analyze_file(str(input_path), labels)
        all_results[str(input_path)] = results

    if args.json:
        print(json.dumps(all_results, indent=2))


if __name__ == "__main__":
    main()

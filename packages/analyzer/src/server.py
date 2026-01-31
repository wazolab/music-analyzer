#!/usr/bin/env python3
"""
HTTP service wrapper for the audio analyzer.

Runs the analyzer as a persistent service to avoid model loading overhead.
Models are loaded once at startup and kept in memory for fast analysis.
"""

import json
import os
import sys
import traceback
from pathlib import Path
from threading import Lock

import numpy as np
from flask import Flask, jsonify, request

# Suppress TensorFlow warnings before importing analyzers
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from analyzers import (
    AudioLoader,
    AudioTagger,
    EnergyAnalyzer,
    GenreClassifier,
    KeyAnalyzer,
    RhythmAnalyzer,
    TagData,
    get_fingerprint,
    lookup_by_musicbrainz_id,
    lookup_metadata,
    submit_fingerprint_to_acoustid,
)
from converter import convert_to_flac, needs_conversion
from utils import parse_filename

app = Flask(__name__)

# Global analyzer instance (loaded once at startup)
analyzer = None
analyzer_lock = Lock()


class AnalyzerService:
    """Persistent analyzer with pre-loaded models."""

    def __init__(self):
        self.rhythm = RhythmAnalyzer()
        self.key = KeyAnalyzer()
        self.energy = EnergyAnalyzer()
        self.genre = GenreClassifier()
        self.tagger = AudioTagger()
        self._loaded = False

    def load_models(self):
        """Load ML models (call once at startup)."""
        if self._loaded:
            return
        print("Loading models...", file=sys.stderr)
        self.genre.load()
        print(f"Loaded {self.genre.num_labels} genre labels", file=sys.stderr)
        self.energy.load()
        print("Loaded emomusic arousal model", file=sys.stderr)
        self._loaded = True
        self._warmup()

    def _warmup(self):
        """Warm up models with dummy inference to pre-initialize TensorFlow graphs."""
        print("Warming up models...", file=sys.stderr)
        from analyzers.audio import AudioData

        # Create 3 seconds of silence at 16kHz (ML models expect 16kHz)
        dummy_audio = AudioData(
            samples=np.zeros(16000 * 3, dtype=np.float32),
            sample_rate=16000,
            duration=3.0,
        )

        # Run dummy inference to initialize TensorFlow graphs
        try:
            self.genre.analyze(dummy_audio)
            self.energy.analyze(dummy_audio)
            print("Models warmed up", file=sys.stderr)
        except Exception as e:
            print(f"Warmup failed (non-critical): {e}", file=sys.stderr)

    def analyze(
        self,
        file_path: str,
        write_tags: bool = False,
        metadata_lookup: bool = False,
        convert: bool = False,
        skip_analyzed: bool = False,
    ) -> dict:
        """
        Analyze a single audio file.

        Returns dict with analysis results or raises exception.
        """
        filename = os.path.basename(file_path)

        # Skip if already analyzed
        if skip_analyzed and self.tagger.is_analyzed(file_path):
            return {"skipped": True, "file": filename, "reason": "already_analyzed"}

        # Convert to FLAC if needed
        if convert and needs_conversion(file_path):
            new_path, success = convert_to_flac(file_path, delete_original=True, verbose=False)
            if success and new_path != file_path:
                file_path = new_path
                filename = os.path.basename(file_path)

        # Parse track info from filename
        track_info = parse_filename(filename)

        # Generate fingerprint
        fingerprint, fingerprint_duration = get_fingerprint(file_path)

        # Load audio
        loader = AudioLoader(file_path)
        audio_44k = loader.load_for_analysis()
        audio_16k = loader.load_for_ml()

        # Analyze rhythm (BPM)
        rhythm_result = self.rhythm.analyze(audio_44k)

        # Analyze key
        key_result = self.key.analyze(audio_44k)

        # Analyze energy
        energy_result = self.energy.analyze(audio_16k)

        # Classify genre
        genre_result = self.genre.analyze(audio_16k)

        # BPM correction based on genre
        bpm = rhythm_result.bpm
        detected_subgenres = {
            g.split("---")[1] if "---" in g else g for g in genre_result.top_genres[:3]
        }
        primary_subgenre = (
            genre_result.top_genres[0].split("---")[1]
            if "---" in genre_result.top_genres[0]
            else genre_result.top_genres[0]
        )

        fast_genres = {"Juke", "Jungle", "Drum n Bass", "Footwork", "Breakcore", "Hardcore"}
        if detected_subgenres & fast_genres and bpm < 100 and primary_subgenre != "Halftime":
            bpm = bpm * 2

        slow_genres = {"Dubstep", "Downtempo", "Ambient", "Chillwave", "Trip Hop", "Dub"}
        if primary_subgenre in slow_genres and bpm > 130:
            bpm = bpm // 2

        # Metadata lookup
        artist = track_info.artist
        title = track_info.title
        album = None
        label = None
        year = None
        musicbrainz_id = None
        debug_info = {
            "parsed_artist": track_info.artist,
            "parsed_title": track_info.title,
            "fingerprint_found": fingerprint is not None,
            "fingerprint_duration": fingerprint_duration,
            "metadata_lookup_enabled": metadata_lookup,
            "metadata_result": None,
        }

        if metadata_lookup:
            print(f"[DEBUG] Looking up metadata for: {track_info.artist} - {track_info.title}", file=sys.stderr)
            metadata = lookup_metadata(
                file_path, hint_artist=track_info.artist, hint_title=track_info.title
            )
            debug_info["metadata_result"] = {
                "title": metadata.title,
                "artist": metadata.artist,
                "album": metadata.album,
                "label": metadata.label,
                "year": metadata.year,
                "musicbrainz_id": metadata.musicbrainz_id,
                "confidence": metadata.confidence,
            }
            print(f"[DEBUG] Metadata result: {debug_info['metadata_result']}", file=sys.stderr)
            if metadata.title:
                if metadata.artist:
                    artist = metadata.artist
                if metadata.title:
                    title = metadata.title
                if metadata.album:
                    album = metadata.album
                if metadata.label:
                    label = metadata.label
                if metadata.year:
                    year = metadata.year
                if metadata.musicbrainz_id:
                    musicbrainz_id = metadata.musicbrainz_id
            else:
                print(f"[DEBUG] No metadata found, using parsed info", file=sys.stderr)

        result = {
            "file": filename,
            "artist": artist,
            "title": title,
            "bpm": bpm,
            "key": key_result.camelot,
            "energy": energy_result.level,
            "genres": genre_result.top_genres,
            "album": album,
            "label": label,
            "year": year,
            "fingerprint": fingerprint,
            "fingerprint_duration": fingerprint_duration,
            "musicbrainz_id": musicbrainz_id,
            "debug": debug_info,
        }

        # Write tags if enabled
        if write_tags:
            tag_data = TagData(
                bpm=result["bpm"],
                key=result["key"],
                energy=result["energy"],
                genres=result["genres"],
                year=result["year"],
                fingerprint=result["fingerprint"],
                fingerprint_duration=result["fingerprint_duration"],
            )
            self.tagger.write(file_path, tag_data)

        return result


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "models_loaded": analyzer._loaded if analyzer else False})


@app.route("/analyze", methods=["POST"])
def analyze_file():
    """
    Analyze a single audio file.

    Request body:
        {
            "file_path": "/path/to/file.flac",
            "write_tags": true,
            "metadata_lookup": true,
            "convert": true,
            "skip_analyzed": false
        }

    Returns:
        Analysis result or error
    """
    global analyzer

    if not analyzer:
        return jsonify({"error": "Analyzer not initialized"}), 503

    data = request.get_json()
    if not data or "file_path" not in data:
        return jsonify({"error": "file_path is required"}), 400

    file_path = data["file_path"]
    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    try:
        with analyzer_lock:
            result = analyzer.analyze(
                file_path,
                write_tags=data.get("write_tags", False),
                metadata_lookup=data.get("metadata_lookup", False),
                convert=data.get("convert", False),
                skip_analyzed=data.get("skip_analyzed", False),
            )
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/analyze/batch", methods=["POST"])
def analyze_batch():
    """
    Analyze multiple files.

    Request body:
        {
            "files": ["/path/to/file1.flac", "/path/to/file2.flac"],
            "write_tags": true,
            "metadata_lookup": true,
            "convert": true,
            "skip_analyzed": false
        }

    Returns:
        Array of results (one per file)
    """
    global analyzer

    if not analyzer:
        return jsonify({"error": "Analyzer not initialized"}), 503

    data = request.get_json()
    if not data or "files" not in data:
        return jsonify({"error": "files array is required"}), 400

    files = data["files"]
    results = []

    with analyzer_lock:
        for file_path in files:
            if not os.path.exists(file_path):
                results.append({"file": file_path, "error": "File not found"})
                continue

            try:
                result = analyzer.analyze(
                    file_path,
                    write_tags=data.get("write_tags", False),
                    metadata_lookup=data.get("metadata_lookup", False),
                    convert=data.get("convert", False),
                    skip_analyzed=data.get("skip_analyzed", False),
                )
                results.append(result)
            except Exception as e:
                results.append({"file": file_path, "error": str(e)})

    return jsonify(results)


@app.route("/lookup/musicbrainz", methods=["POST"])
def lookup_musicbrainz():
    """
    Look up metadata directly from MusicBrainz using a recording ID.

    Request body:
        {
            "recording_id": "943e90e3-0665-4b96-8163-b528eaef22cc"
        }

    Returns:
        Metadata from MusicBrainz
    """
    data = request.get_json()
    if not data or "recording_id" not in data:
        return jsonify({"error": "recording_id is required"}), 400

    recording_id = data["recording_id"]

    # Validate UUID format
    import re
    if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", recording_id.lower()):
        return jsonify({"error": "Invalid MusicBrainz recording ID format"}), 400

    try:
        result = lookup_by_musicbrainz_id(recording_id)
        return jsonify({
            "title": result.title,
            "artist": result.artist,
            "album": result.album,
            "label": result.label,
            "year": result.year,
            "musicbrainz_id": result.musicbrainz_id,
            "confidence": result.confidence,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/submit/fingerprint", methods=["POST"])
def submit_fingerprint():
    """
    Submit a fingerprint to AcoustID linked to a MusicBrainz recording.

    Request body:
        {
            "file_path": "/path/to/file.flac",
            "musicbrainz_id": "943e90e3-0665-4b96-8163-b528eaef22cc"
        }

    Returns:
        Success status
    """
    data = request.get_json()
    if not data or "file_path" not in data or "musicbrainz_id" not in data:
        return jsonify({"error": "file_path and musicbrainz_id are required"}), 400

    file_path = data["file_path"]
    musicbrainz_id = data["musicbrainz_id"]

    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    # Validate UUID format
    import re
    if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", musicbrainz_id.lower()):
        return jsonify({"error": "Invalid MusicBrainz recording ID format"}), 400

    try:
        # Get fingerprint
        fingerprint, duration = get_fingerprint(file_path)
        if not fingerprint:
            return jsonify({"error": "Could not generate fingerprint for file"}), 500

        # Submit to AcoustID
        success = submit_fingerprint_to_acoustid(fingerprint, duration, musicbrainz_id)

        if success:
            return jsonify({
                "success": True,
                "message": f"Fingerprint submitted for recording {musicbrainz_id}",
                "fingerprint_duration": duration,
            })
        else:
            return jsonify({
                "success": False,
                "error": "Submission failed - check ACOUSTID_USER_KEY is set",
            }), 500

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/tags/read", methods=["POST"])
def read_tags():
    """
    Read metadata tags from an audio file.

    Request body:
        {
            "file_path": "/path/to/file.flac"
        }

    Returns:
        Tag data from the file
    """
    global analyzer

    if not analyzer:
        return jsonify({"error": "Analyzer not initialized"}), 503

    data = request.get_json()
    if not data or "file_path" not in data:
        return jsonify({"error": "file_path is required"}), 400

    file_path = data["file_path"]
    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    try:
        tag_data = analyzer.tagger.read_existing(file_path)

        # Convert TagData to dict, handling genres properly
        genres = tag_data.genres
        if isinstance(genres, str):
            # Split "Genre1 / Genre2" format back to list
            genres = [g.strip() for g in genres.split('/')]
        elif genres is None:
            genres = []

        return jsonify({
            "artist": tag_data.artist,
            "title": tag_data.title,
            "album": tag_data.album,
            "label": tag_data.label,
            "year": tag_data.year,
            "bpm": tag_data.bpm,
            "key": tag_data.key,
            "energy": tag_data.energy,
            "genres": genres,
            "fingerprint": tag_data.fingerprint,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/tags/write", methods=["POST"])
def write_tags():
    """
    Write metadata tags to an audio file without re-analyzing.

    Request body:
        {
            "file_path": "/path/to/file.flac",
            "artist": "Artist Name",
            "title": "Track Title",
            "album": "Album Name",
            "label": "Label Name",
            "year": 2024,
            "bpm": 128,
            "key": "8A",
            "energy": 7,
            "genres": ["Techno", "House"]
        }

    Returns:
        Success status
    """
    global analyzer

    if not analyzer:
        return jsonify({"error": "Analyzer not initialized"}), 503

    data = request.get_json()
    if not data or "file_path" not in data:
        return jsonify({"error": "file_path is required"}), 400

    file_path = data["file_path"]
    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    try:
        # Build TagData from request
        tag_data = TagData(
            artist=data.get("artist"),
            title=data.get("title"),
            album=data.get("album"),
            label=data.get("label"),
            year=data.get("year"),
            bpm=int(data["bpm"]) if data.get("bpm") is not None else None,
            key=data.get("key"),
            energy=int(data["energy"]) if data.get("energy") is not None else None,
            genres=data.get("genres"),
        )

        success = analyzer.tagger.write(file_path, tag_data)

        return jsonify({"success": success})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def main():
    global analyzer

    # Initialize and load models
    analyzer = AnalyzerService()
    analyzer.load_models()

    # Start server
    port = int(os.environ.get("PORT", 8000))
    print(f"Analyzer service starting on port {port}...", file=sys.stderr)
    app.run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    main()

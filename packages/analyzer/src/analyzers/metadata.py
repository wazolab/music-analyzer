"""Metadata lookup via AcoustID fingerprinting and MusicBrainz."""

import os
import subprocess
from dataclasses import dataclass
from typing import Optional, List
import json
import urllib.request
import urllib.parse
import time


@dataclass
class MetadataResult:
    """Metadata from MusicBrainz lookup."""
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    musicbrainz_id: Optional[str] = None
    confidence: float = 0.0


class MetadataLookup:
    """Look up track metadata using AcoustID fingerprinting and MusicBrainz."""

    ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"
    MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2"
    USER_AGENT = "MusicAnalyzer/1.0 (https://github.com/music-analyzer)"

    def __init__(self, acoustid_api_key: Optional[str] = None):
        """
        Initialize metadata lookup.

        Args:
            acoustid_api_key: AcoustID API key. If not provided, uses ACOUSTID_API_KEY env var.
        """
        self.api_key = acoustid_api_key or os.environ.get("ACOUSTID_API_KEY")
        if not self.api_key:
            raise ValueError(
                "AcoustID API key required. Set ACOUSTID_API_KEY environment variable "
                "or get a free key at https://acoustid.org/api-key"
            )

    def lookup(self, file_path: str) -> MetadataResult:
        """
        Look up metadata for an audio file.

        Args:
            file_path: Path to audio file

        Returns:
            MetadataResult with track metadata
        """
        # Generate fingerprint
        fingerprint, duration = self._get_fingerprint(file_path)
        if not fingerprint:
            return MetadataResult()

        # Query AcoustID
        recording_id, confidence = self._query_acoustid(fingerprint, duration)
        if not recording_id:
            return MetadataResult()

        # Query MusicBrainz for full metadata
        result = self._query_musicbrainz(recording_id)
        result.confidence = confidence
        result.musicbrainz_id = recording_id

        return result

    def _get_fingerprint(self, file_path: str) -> tuple[Optional[str], Optional[int]]:
        """Generate audio fingerprint using fpcalc (Chromaprint)."""
        try:
            result = subprocess.run(
                ["fpcalc", "-json", file_path],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode != 0:
                print(f"fpcalc error: {result.stderr}")
                return None, None

            data = json.loads(result.stdout)
            return data.get("fingerprint"), int(data.get("duration", 0))

        except FileNotFoundError:
            print("fpcalc not found. Install chromaprint-tools.")
            return None, None
        except subprocess.TimeoutExpired:
            print("fpcalc timed out")
            return None, None
        except Exception as e:
            print(f"Fingerprint error: {e}")
            return None, None

    def _query_acoustid(self, fingerprint: str, duration: int) -> tuple[Optional[str], float]:
        """Query AcoustID API to get MusicBrainz Recording ID."""
        params = {
            "client": self.api_key,
            "fingerprint": fingerprint,
            "duration": str(duration),
            "meta": "recordings"
        }

        url = f"{self.ACOUSTID_URL}?{urllib.parse.urlencode(params)}"

        try:
            req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            if data.get("status") != "ok":
                print(f"AcoustID error: {data.get('error', {}).get('message', 'Unknown error')}")
                return None, 0.0

            results = data.get("results", [])
            if not results:
                return None, 0.0

            # Get best match
            best = results[0]
            confidence = best.get("score", 0.0)

            recordings = best.get("recordings", [])
            if not recordings:
                return None, confidence

            # Return first recording ID
            return recordings[0].get("id"), confidence

        except Exception as e:
            print(f"AcoustID query error: {e}")
            return None, 0.0

    def _get_release_label(self, release_id: str) -> Optional[str]:
        """Query MusicBrainz for release label info."""
        url = f"{self.MUSICBRAINZ_URL}/release/{release_id}?inc=labels&fmt=json"

        try:
            # MusicBrainz rate limit: 1 request per second
            time.sleep(1)
            req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            label_info = data.get("label-info", [])
            if label_info and label_info[0].get("label"):
                return label_info[0]["label"].get("name")

            return None

        except Exception as e:
            print(f"Release label query error: {e}")
            return None

    def _query_musicbrainz(self, recording_id: str) -> MetadataResult:
        """Query MusicBrainz API for full metadata."""
        # Include releases to get album and year
        # Note: labels requires a separate release query
        url = (
            f"{self.MUSICBRAINZ_URL}/recording/{recording_id}"
            f"?inc=artist-credits+releases&fmt=json"
        )

        try:
            req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            # Extract artist
            artist = None
            artist_credits = data.get("artist-credit", [])
            if artist_credits:
                artist_names = []
                for credit in artist_credits:
                    artist_names.append(credit.get("name", ""))
                    if credit.get("joinphrase"):
                        artist_names.append(credit["joinphrase"])
                artist = "".join(artist_names)

            # Extract title
            title = data.get("title")

            # Find best release (prefer earliest with label info)
            album = None
            label = None
            year = None

            releases = data.get("releases", [])
            if releases:
                # Sort by date to get earliest release
                releases_with_date = [
                    r for r in releases
                    if r.get("date")
                ]
                releases_with_date.sort(key=lambda r: r.get("date", "9999"))

                # Prefer release with label
                best_release = None
                for release in releases_with_date:
                    if release.get("label-info"):
                        best_release = release
                        break

                if not best_release and releases_with_date:
                    best_release = releases_with_date[0]

                if not best_release and releases:
                    best_release = releases[0]

                if best_release:
                    album = best_release.get("title")

                    # Extract year from date
                    date_str = best_release.get("date", "")
                    if date_str and len(date_str) >= 4:
                        try:
                            year = int(date_str[:4])
                        except ValueError:
                            pass

                    # Query release for label info
                    release_id = best_release.get("id")
                    if release_id:
                        label = self._get_release_label(release_id)

            return MetadataResult(
                title=title,
                artist=artist,
                album=album,
                label=label,
                year=year
            )

        except Exception as e:
            print(f"MusicBrainz query error: {e}")
            return MetadataResult()


def lookup_metadata(file_path: str, api_key: Optional[str] = None) -> MetadataResult:
    """
    Convenience function to look up metadata for a file.

    Args:
        file_path: Path to audio file
        api_key: AcoustID API key (optional, uses env var if not provided)

    Returns:
        MetadataResult with track metadata
    """
    try:
        lookup = MetadataLookup(api_key)
        return lookup.lookup(file_path)
    except ValueError as e:
        print(f"Metadata lookup disabled: {e}")
        return MetadataResult()

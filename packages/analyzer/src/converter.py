"""Convert audio files to FLAC format for library integrity."""

import subprocess
from pathlib import Path
from typing import Optional, Tuple

# Formats that should be converted to FLAC
CONVERTIBLE_FORMATS = {".mp3", ".m4a", ".aac", ".wav", ".aiff", ".ogg", ".opus", ".wma"}


def needs_conversion(file_path: str) -> bool:
    """Check if file needs to be converted to FLAC."""
    ext = Path(file_path).suffix.lower()
    return ext in CONVERTIBLE_FORMATS


def convert_to_flac(
    file_path: str, delete_original: bool = True, verbose: bool = True
) -> Tuple[str, bool]:
    """
    Convert an audio file to FLAC format.

    Args:
        file_path: Path to audio file
        delete_original: Whether to delete the original file after conversion
        verbose: Print progress messages

    Returns:
        Tuple of (new_path, success)
        - If already FLAC: returns (original_path, True)
        - If converted: returns (flac_path, True)
        - If failed: returns (original_path, False)
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    # Already FLAC, no conversion needed
    if ext == ".flac":
        return file_path, True

    # Not a convertible format
    if ext not in CONVERTIBLE_FORMATS:
        if verbose:
            print(f"⚠ Unsupported format for conversion: {ext}")
        return file_path, False

    # Build output path
    flac_path = path.with_suffix(".flac")

    # Handle existing FLAC file with same name
    if flac_path.exists():
        # Add suffix to avoid overwriting
        counter = 1
        while flac_path.exists():
            flac_path = path.with_stem(f"{path.stem}_{counter}").with_suffix(".flac")
            counter += 1

    if verbose:
        print(f"Converting to FLAC: {path.name} -> {flac_path.name}")

    # Categorize source format
    lossy_formats = {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wma"}
    lossless_formats = {".wav", ".aiff"}
    is_lossy = ext in lossy_formats

    if is_lossy and verbose:
        print(f"⚠ Source is lossy ({ext}) - quality preserved but not improved")

    try:
        # Base ffmpeg command for maximum quality conversion
        # -y: overwrite output
        # -i: input file
        # -c:a flac: FLAC codec
        # -compression_level 5: balanced (0-12, doesn't affect quality, only file size/speed)
        # -map_metadata 0: preserve all metadata from input
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(path),
            "-vn",  # No video (but keep cover art via -map)
            "-c:a",
            "flac",
            "-compression_level",
            "5",
            "-map_metadata",
            "0",
        ]

        # For lossless sources, use 24-bit to preserve full quality
        # For lossy sources, preserve original bit depth (no point upscaling)
        if ext in lossless_formats:
            cmd.extend(["-sample_fmt", "s32"])  # 32-bit for WAV/AIFF

        cmd.append(str(flac_path))

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode != 0:
            if verbose:
                print(f"✗ Conversion failed: {result.stderr[:200]}")
            return file_path, False

        # Verify the output file exists and has content
        if not flac_path.exists() or flac_path.stat().st_size == 0:
            if verbose:
                print("✗ Conversion failed: output file is empty or missing")
            return file_path, False

        if verbose:
            original_size = path.stat().st_size / (1024 * 1024)
            new_size = flac_path.stat().st_size / (1024 * 1024)
            print(f"✔ Converted: {original_size:.1f}MB -> {new_size:.1f}MB")

        # Delete original if requested
        if delete_original:
            try:
                path.unlink()
                if verbose:
                    print(f"✔ Deleted original: {path.name}")
            except OSError as e:
                if verbose:
                    print(f"⚠ Could not delete original: {e}")

        return str(flac_path), True

    except subprocess.TimeoutExpired:
        if verbose:
            print("✗ Conversion timed out")
        return file_path, False
    except FileNotFoundError:
        if verbose:
            print("✗ ffmpeg not found - please install ffmpeg")
        return file_path, False
    except Exception as e:
        if verbose:
            print(f"✗ Conversion error: {e}")
        return file_path, False


def ensure_flac(file_path: str, verbose: bool = True) -> Optional[str]:
    """
    Ensure a file is in FLAC format, converting if necessary.

    Args:
        file_path: Path to audio file
        verbose: Print progress messages

    Returns:
        Path to FLAC file, or None if conversion failed
    """
    if not needs_conversion(file_path):
        ext = Path(file_path).suffix.lower()
        if ext == ".flac":
            return file_path
        return None

    new_path, success = convert_to_flac(file_path, delete_original=True, verbose=verbose)
    return new_path if success else None

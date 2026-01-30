# Music Analyzer - Project Context

## Project Guidelines

- **DRY / KISS**: Write DRY (Don't Repeat Yourself) and KISS (Keep It Simple, Stupid) code. Avoid unnecessary abstractions and over-engineering.
- **Minimal config**: Less configuration is better. Only add config when absolutely necessary.
- **Check documentation**: When something doesn't work as expected, consult official documentation before trying alternative approaches.
- **README updates**: Always update README.md when adding significant changes or new features (new CLI options, new functionality, architecture changes, new dependencies)
- **Keep dependencies up to date**: This project relies on external services (YouTube, SoundCloud, Soulseek) that frequently change their APIs. When encountering errors related to these services:
  - Update yt-dlp first: `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`
  - Run `npm update` to update Node.js dependencies
  - Check for breaking changes in essentia.js and TensorFlow.js if audio analysis fails
- **Use industry standards**: For audio analysis, prefer Essentia's built-in algorithms and industry standards (e.g., EBU R128 for loudness) over custom calculations. Essentia algorithms are well-tested and produce reliable, standardized results.

## Overview

A Node.js/TypeScript CLI for analyzing FLAC music files. Extracts audio features (BPM, key, genre, energy), looks up metadata via MusicBrainz, writes FLAC tags, and organizes files by year/genre/label.

## Tech Stack

- **Runtime**: Node.js 22+ with ES modules
- **Language**: TypeScript (strict mode)
- **Audio Analysis**: Essentia.js (WASM) + TensorFlow.js
- **CLI**: Commander.js
- **FLAC Tags**: music-metadata (read) + flac-tagger (write)

## Project Structure

```
src/
├── index.ts              # CLI entry point (Commander.js)
├── pipeline.ts           # Main orchestrator
├── types.ts              # Shared type definitions
├── utils.ts              # Helpers (logging, formatting)
├── analyzers/
│   ├── audio.ts          # Essentia.js: BPM, key, energy detection
│   ├── genre.ts          # TensorFlow.js: MusiCNN genre classifier
│   ├── beatgrid.ts       # Beat/downbeat analysis
│   └── fingerprint.ts    # AcoustID fingerprinting (fpcalc)
├── metadata/
│   ├── reader.ts         # Read FLAC tags (music-metadata)
│   ├── writer.ts         # Write FLAC tags (flac-tagger)
│   ├── lookup.ts         # Unified metadata lookup (all sources)
│   ├── bandcamp.ts       # Bandcamp web scraping
│   ├── beatport.ts       # Beatport API / web scraping
│   └── musicbrainz.ts    # MusicBrainz API client
├── workers/
│   ├── audio-worker.ts   # Worker thread for audio analysis
│   └── pool.ts           # Worker pool management
└── organizer/
    └── copy.ts           # File organization logic
```

## Key Components

### Audio Analysis (src/analyzers/audio.ts)
- Uses Essentia.js WASM module via CommonJS require
- Decodes FLAC to raw PCM using ffmpeg
- Extracts: KeyExtractor, RhythmExtractor2013, Energy

### Genre Classification (src/analyzers/genre.ts)
- TensorFlow.js with MusiCNN model (auto-downloaded to models/)
- Computes mel-spectrogram features manually via Essentia MelBands
- Classifies into 400 Discogs genre categories

### Tag Writing (src/metadata/writer.ts)
- Uses flac-tagger library
- Preserves existing tags and cover art
- Tags: BPM, KEY, INITIALKEY, ENERGY, GENRE, MUSICBRAINZ_TRACKID

## Build & Run

```bash
npm run build          # Compile TypeScript
npm start              # Run CLI
node dist/index.js analyze <folder> -o <output>
node dist/index.js analyze <folder> -o <output> -c 8 -w  # Fast mode with workers
```

## Environment Variables

- `ACOUSTID_API_KEY` - For MusicBrainz metadata lookup (optional)

## Common Tasks

- Add new analyzer: Create in src/analyzers/, integrate in audio.ts
- Add new tag: Update writer.ts and types.ts
- Add CLI option: Update src/index.ts (Commander.js)

## Dependencies Notes

- essentia.js uses CommonJS exports, imported via createRequire()
- @tensorflow/tfjs-node for GPU-accelerated inference
- Models auto-download to models/ directory on first run

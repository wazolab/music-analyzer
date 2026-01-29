# Music Analyzer - Project Context

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
│   └── musicbrainz.ts    # MusicBrainz API client
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

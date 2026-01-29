# Music Analyzer

A Node.js/TypeScript CLI application that analyzes FLAC files, extracts audio features (Key, BPM, Energy, Genre), looks up metadata via MusicBrainz, writes results to FLAC tags, and organizes files into a structured folder hierarchy.

## Features

- **Audio Analysis** (powered by Essentia.js)
  - BPM / Tempo detection
  - Musical key detection with Camelot notation (for DJ mixing)
  - Energy level calculation
  - Genre classification using TensorFlow.js (400 Discogs genres)
  - Beat grid / downbeat positions

- **Metadata Lookup**
  - AcoustID audio fingerprinting
  - MusicBrainz API integration
  - Retrieves: Artist, Title, Album, Label, Year

- **Tag Writing**
  - Writes analysis results to FLAC Vorbis comments
  - Preserves existing tags and cover art

- **File Organization**
  - Copies files to `output/by-year/YYYY/`
  - Copies files to `output/by-genre/Genre/`
  - Copies files to `output/by-label/Label/`

## Installation

### Prerequisites

- Node.js 22+
- ffmpeg (for audio decoding)
- fpcalc (for AcoustID fingerprinting)

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt install ffmpeg libchromaprint-tools

# Install Node.js dependencies
cd ~/Documents/sources/music-analyzer
npm install

# Build the project
npm run build
```

### AcoustID API Key (Optional)

To enable MusicBrainz metadata lookup:

1. Register at https://acoustid.org/
2. Create an application at https://acoustid.org/new-application
3. Copy the API key to `.env`:

```bash
cp .env.example .env
# Edit .env and add your API key
```

## Usage

```bash
# Analyze and organize FLAC files
node dist/index.js analyze <input-folder> -o <output-folder>

# Examples
node dist/index.js analyze ~/Music -o ~/Music/organized
node dist/index.js analyze ./downloads --dry-run
node dist/index.js analyze ./music --skip-lookup

# Check system status
node dist/index.js status
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output directory (default: `./output`) |
| `--dry-run` | Preview what would be done without copying files |
| `--skip-lookup` | Skip MusicBrainz lookup, use existing tags only |
| `--skip-analysis` | Skip audio analysis, only organize by existing tags |

## Output

### FLAC Tags Written

| Tag | Description | Example |
|-----|-------------|---------|
| `BPM` | Detected tempo | `128` |
| `INITIALKEY` | Musical key | `A minor` |
| `KEY` | Camelot notation | `8A` |
| `ENERGY` | Energy level (0-100) | `85` |
| `GENRE` | Detected genre | `Electronic - House` |
| `MUSICBRAINZ_TRACKID` | MusicBrainz Recording ID | `abc-123-...` |

### Folder Structure

```
output/
├── by-year/
│   ├── 2020/
│   │   └── Artist - Title.flac
│   ├── 2021/
│   └── unknown/
├── by-genre/
│   ├── Electronic House/
│   ├── Electronic Techno/
│   └── unknown/
└── by-label/
    ├── Kompakt/
    └── unknown/
```

## How It Works

```
Input Folder (FLAC files)
         │
         ▼
┌─────────────────────────────────────┐
│ 1. AUDIO ANALYSIS (Essentia.js)    │
│    • Decode FLAC to raw audio      │
│    • Extract key, BPM, energy      │
│    • Classify genre (TensorFlow)   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. METADATA LOOKUP (Optional)      │
│    • Generate AcoustID fingerprint │
│    • Query MusicBrainz API         │
│    • Get artist, title, label, year│
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 3. TAG WRITING                     │
│    • Write analysis to FLAC tags   │
│    • Preserve existing tags        │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 4. FILE ORGANIZATION               │
│    • Copy to by-year/              │
│    • Copy to by-genre/             │
│    • Copy to by-label/             │
└─────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript |
| Runtime | Node.js 22+ |
| Audio Analysis | Essentia.js (WASM) |
| Genre Classification | TensorFlow.js (MusiCNN model) |
| Fingerprinting | fpcalc (Chromaprint) |
| Metadata API | AcoustID + MusicBrainz |
| FLAC Tags | music-metadata + flac-tagger |
| CLI | Commander.js |

## Genre Classification

The genre classifier uses the MusiCNN model trained on the Discogs dataset with 400 genre/style categories. It analyzes mel-spectrogram features extracted from the audio.

Categories include:
- Electronic (House, Techno, Ambient, Experimental, etc.)
- Rock, Pop, Hip Hop, Jazz, Classical
- And many more from the Discogs taxonomy

The model is automatically downloaded on first run (~50MB).

## Camelot Key Notation

The analyzer outputs musical keys in Camelot notation for DJ mixing compatibility:

| Key | Camelot | Key | Camelot |
|-----|---------|-----|---------|
| C major | 8B | C minor | 5A |
| G major | 9B | G minor | 6A |
| D major | 10B | D minor | 7A |
| A major | 11B | A minor | 8A |
| E major | 12B | E minor | 9A |
| B major | 1B | B minor | 10A |
| F# major | 2B | F# minor | 11A |
| Db major | 3B | Db minor | 12A |
| Ab major | 4B | Ab minor | 1A |
| Eb major | 5B | Eb minor | 2A |
| Bb major | 6B | Bb minor | 3A |
| F major | 7B | F minor | 4A |

## Project Structure

```
music-analyzer/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── pipeline.ts           # Main orchestrator
│   ├── types.ts              # Type definitions
│   ├── utils.ts              # Helpers
│   ├── analyzers/
│   │   ├── audio.ts          # Essentia.js wrapper
│   │   ├── beatgrid.ts       # Beat detection
│   │   ├── fingerprint.ts    # AcoustID wrapper
│   │   └── genre.ts          # TensorFlow genre classifier
│   ├── metadata/
│   │   ├── reader.ts         # Read FLAC tags
│   │   ├── writer.ts         # Write FLAC tags
│   │   └── musicbrainz.ts    # MusicBrainz API client
│   └── organizer/
│       └── copy.ts           # File organization
├── models/                   # ML models (auto-downloaded)
├── package.json
├── tsconfig.json
├── .env                      # API keys (not committed)
└── .env.example
```

## License

MIT

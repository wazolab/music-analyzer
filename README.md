# Music Analyzer

A Node.js/TypeScript CLI application that analyzes FLAC files, extracts audio features (Key, BPM, Energy, Genre), looks up metadata via MusicBrainz, writes results to FLAC tags, and organizes files into a structured folder hierarchy.

## Features

- **Audio Analysis** (powered by Essentia.js)
  - BPM / Tempo detection
  - Musical key detection with Camelot notation (for DJ mixing)
  - Energy level calculation
  - Genre classification using TensorFlow.js (400 Discogs genres)
  - BPM/key-based heuristics to refine electronic subgenre detection
  - Beat grid / downbeat positions

- **Metadata Lookup** (multiple sources)
  - **Beatport**: BPM, key, genre, label (API or web scraping)
  - **Bandcamp**: Artist, album, label, year (web scraping)
  - **MusicBrainz**: AcoustID fingerprinting + API

- **Tag Writing**
  - Writes analysis results to FLAC Vorbis comments
  - Preserves existing tags and cover art

- **File Organization**
  - Copies files to `output/by-year/YYYY/`
  - Copies files to `output/by-genre/Genre/`
  - Copies files to `output/by-label/Label/`
  - Standardized output filenames: `Artist - Title.flac`
  - Label extraction from filename patterns (see below)

- **Performance Optimizations**
  - Parallel file processing with configurable concurrency
  - Worker threads for CPU-intensive audio analysis
  - Parallel metadata lookups (all sources queried simultaneously)

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

## Docker

The project includes a Docker Compose setup with a web UI and Soulseek daemon for downloading music.

### Quick Start

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| `ui` | 3000 | Web UI for managing the music pipeline |
| `slskd` | 5030, 5031 | Soulseek daemon for P2P music downloads |

### Environment Variables

Configure in your `.env` file:

```bash
# Soulseek credentials (auto-connects on startup)
SLSKD_USERNAME=your-username
SLSKD_PASSWORD=your-password

# Custom directories (optional, defaults to ./downloads and ./music)
DOWNLOADS_DIR=/path/to/downloads
MUSIC_DIR=/path/to/music
```

Then start the services:

```bash
docker compose up -d
```

### Useful Commands

```bash
# Rebuild after code changes
docker compose build

# Restart a specific service
docker compose restart ui

# View slskd logs only
docker compose logs -f slskd

# Remove volumes (warning: deletes all data)
docker compose down -v
```

### API Keys (Optional)

Copy the example environment file and configure as needed:

```bash
cp .env.example .env
```

**AcoustID** (for MusicBrainz fingerprint lookup):
1. Register at https://acoustid.org/
2. Create an application at https://acoustid.org/new-application
3. Add `ACOUSTID_API_KEY` to `.env`

**Beatport API** (optional - web scraping used if not set):
1. Email engineering@beatport.com to request OAuth2 credentials
2. Add credentials to `.env`:
   ```
   BEATPORT_CLIENT_ID=xxx
   BEATPORT_CLIENT_SECRET=xxx
   BEATPORT_USERNAME=xxx
   BEATPORT_PASSWORD=xxx
   ```

**Bandcamp**: No API key needed (uses web scraping)

## Usage

```bash
# Analyze and organize FLAC files
node dist/index.js analyze <input-folder> -o <output-folder>

# Examples
node dist/index.js analyze ~/Music -o ~/Music/organized
node dist/index.js analyze ./downloads --dry-run
node dist/index.js analyze ./music --skip-lookup
node dist/index.js analyze ./music -c 8        # Use 8 parallel file processing
node dist/index.js analyze ./music -c 8 -w     # 8 parallel + worker threads (fastest)

# Check system status
node dist/index.js status
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output directory (default: `./output`) |
| `-c, --concurrency <n>` | Number of files to process in parallel (default: `4`) |
| `-w, --workers` | Use worker threads for CPU-intensive analysis |
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
│       PARALLEL FILE PROCESSING      │
│  (configurable concurrency: -c N)   │
└─────────────────────────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼      (N files processed concurrently)
┌─────────────────────────────────────┐
│ 1. AUDIO ANALYSIS (Essentia.js)    │
│    • Decode FLAC to raw audio      │
│    • Extract key, BPM, energy      │
│    • Classify genre (TensorFlow)   │
│    • Optional: worker threads (-w) │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. METADATA LOOKUP (parallel)      │
│    • Beatport ─┐                   │
│    • Bandcamp ─┼─► First match wins│
│    • MusicBrainz┘                  │
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
| Metadata API | AcoustID + MusicBrainz + Beatport + Bandcamp |
| FLAC Tags | music-metadata + flac-tagger |
| CLI | Commander.js |
| Parallelism | p-limit + Node.js worker_threads |

## Genre Classification

The genre classifier uses the MusiCNN model trained on the Discogs dataset with 400 genre/style categories. It analyzes mel-spectrogram features extracted from the audio.

### Genre Priority

Genres are determined in priority order:

1. **Metadata lookup** (Beatport, Bandcamp) - Most reliable for electronic music
2. **ML + heuristics** - TensorFlow model refined with BPM/key heuristics
3. **Existing FLAC tags** - Fallback to tags already in the file

### BPM/Key Heuristics

The analyzer applies genre-specific heuristics to improve classification accuracy for electronic music:

| Genre | BPM Range | Notes |
|-------|-----------|-------|
| Trance | 138-150 | Boosted for minor keys |
| Psy-Trance | 140-150 | Boosted for minor keys |
| House | 118-132 | |
| Deep House | 118-128 | |
| Tech House | 124-132 | |
| Techno | 125-145 | |
| Hard Techno | 140-160 | |
| Drum & Bass | 160-180 | |
| Dubstep | 138-145 | |
| Ambient | 60-100 | |

Overly generic genres (like "Rock Country Rock") are demoted when a more specific electronic genre matches the BPM/key profile.

### Specific Genre Extraction

The analyzer extracts specific subgenres from broad categories:

| Raw Classification | Output Genre |
|-------------------|--------------|
| Electronic - House | House |
| Electronic - Hard Trance | Hard Trance |
| Electronic - Drum n Bass | Drum n Bass |
| Rock - Alternative Rock | Alternative Rock |

Generic parent genres ("Electronic", "Rock", "Pop") are filtered out when specific subgenres are available.

### Supported Categories

- Electronic (House, Techno, Ambient, Experimental, etc.)
- Rock, Pop, Hip Hop, Jazz, Classical
- And many more from the Discogs taxonomy

The model is automatically downloaded on first run (~50MB).

## Label Extraction

Labels are extracted using multiple methods in priority order:

1. **Metadata lookup** - From Beatport, Bandcamp, or MusicBrainz
2. **Filename parsing** - Supports common naming patterns
3. **Existing FLAC tags** - From the `LABEL` or `ORGANIZATION` tag

### Supported Filename Patterns

| Pattern | Example | Extracted Label |
|---------|---------|-----------------|
| `Artist - Title [Label]` | `Artist - Track Name [Anjunadeep]` | Anjunadeep |
| `Artist - Title (Label)` | `Artist - Track Name (Drumcode)` | Drumcode |
| `Label - Artist - Title` | `Anatta Records - Asca - By Proxy` | Anatta Records |

The label detector also recognizes common keywords like "Records", "Recordings", "Music", "Digital", etc.

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
│   ├── utils.ts              # Helpers (incl. filename parsing)
│   ├── analyzers/
│   │   ├── audio.ts          # Essentia.js wrapper
│   │   ├── beatgrid.ts       # Beat detection
│   │   ├── fingerprint.ts    # AcoustID wrapper
│   │   ├── genre.ts          # TensorFlow genre classifier
│   │   └── genre-heuristics.ts # BPM/key-based genre refinement
│   ├── metadata/
│   │   ├── reader.ts         # Read FLAC tags
│   │   ├── writer.ts         # Write FLAC tags
│   │   ├── lookup.ts         # Unified metadata lookup
│   │   ├── bandcamp.ts       # Bandcamp scraper
│   │   ├── beatport.ts       # Beatport API/scraper
│   │   └── musicbrainz.ts    # MusicBrainz API client
│   ├── workers/
│   │   ├── audio-worker.ts   # Worker thread for analysis
│   │   └── pool.ts           # Worker pool manager
│   └── organizer/
│       └── copy.ts           # File organization
├── models/                   # ML models (auto-downloaded)
├── package.json
├── tsconfig.json
├── .env                      # API keys (not committed)
└── .env.example
```

## Performance

The pipeline supports parallel processing to speed up analysis of large music libraries.

### Concurrency (`-c`)

Controls how many files are processed simultaneously. Default is 4.

```bash
node dist/index.js analyze ./music -c 8   # Process 8 files at once
```

### Worker Threads (`-w`)

Offloads CPU-intensive audio analysis (Essentia.js, TensorFlow.js) to separate threads, preventing blocking and enabling true parallel CPU utilization.

```bash
node dist/index.js analyze ./music -w     # Enable worker threads
node dist/index.js analyze ./music -c 8 -w  # Combined for maximum speed
```

### Expected Speedup

| Mode | Speedup | Best For |
|------|---------|----------|
| Default (`-c 4`) | ~3-4x | Most systems |
| With workers (`-c 4 -w`) | ~4-6x | Multi-core CPUs |
| Maximum (`-c 8 -w`) | ~6-8x | 8+ core CPUs, fast storage |

**Note**: Higher concurrency uses more RAM. Reduce `-c` if you encounter memory issues.

## License

MIT

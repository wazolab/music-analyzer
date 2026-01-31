# Music Analyzer - Technical Specification

## System Overview

Music Analyzer is a modular audio analysis and music library management system built on Node.js/TypeScript. It provides automated audio feature extraction, metadata enrichment, and file organization through both CLI and web interfaces.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose                                  │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   UI Service    │  Analyzer Svc   │   slskd Svc     │   Shared Volumes      │
│   (Nuxt 3)      │  (Node.js CLI)  │   (Soulseek)    │                       │
│   Port 3000     │   On-demand     │   Port 5030     │   - downloads/        │
│                 │                 │                 │   - music/            │
│   ┌──────────┐  │   ┌──────────┐  │   ┌──────────┐  │   - ui-data (SQLite)  │
│   │ Nitro    │  │   │ Pipeline │  │   │ P2P Net  │  │                       │
│   │ Server   │  │   │ Worker   │  │   │ Client   │  │                       │
│   └────┬─────┘  │   └────┬─────┘  │   └──────────┘  │                       │
│        │        │        │        │                 │                       │
│   ┌────┴─────┐  │   ┌────┴─────┐  │                 │                       │
│   │ SQLite   │  │   │ Essentia │  │                 │                       │
│   │ Database │  │   │ + TFJS   │  │                 │                       │
│   └──────────┘  │   └──────────┘  │                 │                       │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
```

## Component Specifications

### 1. Analyzer Package (`packages/analyzer/`)

Core audio analysis engine built with:

| Component | Technology | Purpose |
|-----------|------------|---------|
| Audio Decoder | FFmpeg (subprocess) | FLAC → PCM conversion |
| Feature Extraction | Essentia.js (WASM) | BPM, key, energy analysis |
| Genre Classification | TensorFlow.js + MusiCNN | 400-category Discogs taxonomy |
| Fingerprinting | Chromaprint (fpcalc) | AcoustID generation |
| Tag I/O | music-metadata + flac-tagger | Vorbis comment read/write |

#### Module Structure

```
packages/analyzer/src/
├── index.ts                 # CLI entry (Commander.js)
├── pipeline.ts              # Orchestration layer
├── types.ts                 # Shared type definitions
├── utils.ts                 # Helpers, logging, formatting
├── analyzers/
│   ├── audio.ts             # Essentia.js wrapper
│   ├── beatgrid.ts          # Beat/downbeat detection
│   ├── fingerprint.ts       # AcoustID via fpcalc
│   ├── genre.ts             # TensorFlow MusiCNN inference
│   ├── genre-heuristics.ts  # BPM/key-based refinement
│   └── tagger.py            # Python-based genre tagging
├── metadata/
│   ├── reader.ts            # FLAC tag extraction
│   ├── writer.ts            # FLAC tag writing
│   ├── lookup.ts            # Multi-source lookup orchestrator
│   ├── bandcamp.ts          # Bandcamp web scraper
│   ├── beatport.ts          # Beatport API client
│   └── musicbrainz.ts       # MusicBrainz/AcoustID client
├── workers/
│   ├── audio-worker.ts      # Worker thread for CPU tasks
│   └── pool.ts              # Worker pool management
└── organizer/
    └── copy.ts              # File organization logic
```

#### Audio Analysis Pipeline

```
Input: FLAC file
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Audio Decoding                                            │
│    ffmpeg -i input.flac -f f32le -acodec pcm_f32le -         │
│    Output: Float32 PCM @ original sample rate                │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Feature Extraction (Essentia.js)                          │
│    - KeyExtractor: Krumhansl/Temperley profiles              │
│    - RhythmExtractor2013: Multi-feature tempo estimation     │
│    - EBU R128 Loudness: Integrated loudness (LUFS)           │
│    - Energy: RMS-based energy calculation                    │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Genre Classification (TensorFlow.js)                      │
│    - Mel-spectrogram: 96 bands, 256 hop length               │
│    - Model: MusiCNN (auto-downloaded, ~50MB)                 │
│    - Output: 400 Discogs categories with confidence scores   │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Heuristic Refinement                                      │
│    - BPM range matching for electronic subgenres             │
│    - Key-based boosting (minor keys → Trance/Psy-Trance)     │
│    - Generic genre demotion when specific match exists       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
Output: AnalysisResult {
  bpm: number,
  key: string,           // "A minor"
  camelot: string,       // "8A"
  energy: number,        // 0-100
  genres: string[],      // ["House", "Tech House"]
  confidence: number
}
```

#### Metadata Lookup Chain

```
┌─────────────────────────────────────────────────────────────┐
│                    Parallel Lookup                           │
├──────────────────┬──────────────────┬───────────────────────┤
│   MusicBrainz    │     Discogs      │      Bandcamp         │
│   (AcoustID)     │     (API)        │    (Web Scrape)       │
│                  │                  │                       │
│   Fingerprint    │   Artist/Title   │   URL from tags       │
│   → Recording    │   search         │   or search           │
│   → Release      │   → Release      │   → Page parse        │
└────────┬─────────┴────────┬─────────┴───────────┬───────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Result Merger                            │
│   Priority: MusicBrainz > Discogs > Bandcamp > Existing     │
│   Fields: artist, title, album, year, label, genre          │
└─────────────────────────────────────────────────────────────┘
```

### 2. UI Package (`packages/ui/`)

Web interface built with Nuxt 3:

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Nuxt 3 | SSR/SPA hybrid |
| UI Components | Nuxt UI | Component library |
| State | Pinia | Reactive stores |
| Database | SQLite (better-sqlite3) | Persistent storage |
| API | Nitro server routes | REST endpoints |

#### Database Schema

```sql
-- Core entities
CREATE TABLE library_tracks (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  artist TEXT,
  title TEXT,
  album TEXT,
  year INTEGER,
  label TEXT,
  genre TEXT,
  bpm REAL,
  key TEXT,
  camelot TEXT,
  energy INTEGER,
  duration REAL,
  fingerprint TEXT,
  analyzed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

CREATE TABLE playlist_tracks (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER REFERENCES library_tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  UNIQUE(playlist_id, track_id)
);

CREATE TABLE download_files (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analysis_jobs (
  id INTEGER PRIMARY KEY,
  track_id INTEGER REFERENCES library_tracks(id),
  status TEXT DEFAULT 'pending',
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME
);

CREATE TABLE preparation_list (
  id INTEGER PRIMARY KEY,
  track_id INTEGER UNIQUE REFERENCES library_tracks(id) ON DELETE CASCADE,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tracks` | List library tracks with filtering |
| GET | `/api/tracks/:id` | Get single track details |
| PATCH | `/api/tracks/:id` | Update track metadata |
| DELETE | `/api/tracks/:id` | Remove track from library |
| POST | `/api/tracks/:id/analyze` | Trigger re-analysis |
| PATCH | `/api/tracks/:id/in-library` | Toggle library status |
| GET | `/api/playlists` | List all playlists |
| POST | `/api/playlists` | Create playlist |
| GET | `/api/playlists/:id` | Get playlist with tracks |
| PATCH | `/api/playlists/:id` | Update playlist |
| DELETE | `/api/playlists/:id` | Delete playlist |
| POST | `/api/playlists/:id/tracks` | Add track to playlist |
| DELETE | `/api/playlists/:id/tracks/:trackId` | Remove track |
| POST | `/api/publish` | Publish to external drive |
| GET | `/api/drives` | List mounted external drives |
| GET | `/api/downloads` | List downloaded files |
| POST | `/api/analysis/batch` | Start batch analysis job |
| GET | `/api/analysis/status` | Get analysis job status |

### 3. slskd Integration

Soulseek daemon for P2P music acquisition:

| Port | Protocol | Purpose |
|------|----------|---------|
| 5030 | HTTP | Web UI |
| 5031 | HTTP | API |
| 2234 | TCP | Soulseek P2P |

Files downloaded to `./downloads/` are auto-detected by the UI for import.

## Data Flow

### Track Import Flow

```
External Drive / Downloads Folder
              │
              ▼
┌──────────────────────────────────┐
│      File Watcher / Scan         │
│   Detect new FLAC files          │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      Metadata Reader             │
│   Extract existing tags          │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      Database Insert             │
│   library_tracks entry           │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      Analysis Queue              │
│   analysis_jobs entry            │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      Analyzer Container          │
│   Audio analysis + lookup        │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      Tag Writer                  │
│   Write results to FLAC          │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      Database Update             │
│   Update library_tracks          │
└──────────────────────────────────┘
```

### Publish Flow

```
Playlist Selection + External Drive
              │
              ▼
┌──────────────────────────────────┐
│      Permission Check            │
│   Verify drive is writable       │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      File Copy                   │
│   FLAC files to drive root       │
│   Flat structure for exFAT       │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      M3U Generation              │
│   by-genre/*.m3u                 │
│   by-year/*.m3u                  │
│   by-label/*.m3u                 │
└──────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACOUSTID_API_KEY` | No | - | AcoustID fingerprint lookup |
| `DISCOGS_TOKEN` | No | - | Discogs API fallback |
| `SLSKD_USERNAME` | No | - | Soulseek auto-login |
| `SLSKD_PASSWORD` | No | - | Soulseek auto-login |
| `DOWNLOADS_DIR` | No | `./downloads` | Download directory path |
| `UID` | No | `1000` | Container user ID |
| `GID` | No | `1000` | Container group ID |
| `DOCKER_GID` | No | `999` | Docker socket group ID |

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <dir>` | `./output` | Output directory |
| `-c, --concurrency <n>` | `4` | Parallel file processing |
| `-w, --workers` | `false` | Enable worker threads |
| `--dry-run` | `false` | Preview without writing |
| `--skip-lookup` | `false` | Skip metadata lookup |
| `--skip-analysis` | `false` | Skip audio analysis |

## Technical Requirements

### Runtime Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| FFmpeg | 4.4+ | Audio decoding |
| fpcalc | 1.5+ | Chromaprint fingerprinting |
| Docker | 24+ | Container runtime |
| Docker Compose | 2.0+ | Multi-container orchestration |

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4GB | 8GB+ |
| CPU | 4 cores | 8+ cores |
| Storage | 10GB | 50GB+ (for music library) |
| OS | Linux (Ubuntu 22.04+) | Linux |

### FLAC Tag Mapping

| Internal Field | Vorbis Comment | Notes |
|----------------|----------------|-------|
| bpm | `BPM` | Integer, rounded |
| key | `INITIALKEY` | Full name ("A minor") |
| camelot | `KEY` | Camelot notation ("8A") |
| energy | `ENERGY` | 0-100 scale |
| genre | `GENRE` | Primary genre only |
| mbid | `MUSICBRAINZ_TRACKID` | MusicBrainz Recording ID |

## Performance Characteristics

### Analysis Throughput

| Mode | Throughput | Memory | CPU |
|------|------------|--------|-----|
| Sequential | ~1 file/10s | 1GB | 1 core |
| `-c 4` | ~4 files/10s | 2GB | 4 cores |
| `-c 4 -w` | ~6 files/10s | 3GB | 4 cores |
| `-c 8 -w` | ~10 files/10s | 4GB | 8 cores |

### Model Loading

| Model | Size | Load Time | Memory |
|-------|------|-----------|--------|
| MusiCNN | 50MB | 2-3s | 200MB |
| Essentia WASM | 8MB | 0.5s | 50MB |

## Development

### Build Commands

```bash
# Install dependencies
npm install

# Build analyzer
npm run build -w packages/analyzer

# Build UI
npm run build -w packages/ui

# Development mode (with HMR)
docker compose -f docker-compose.dev.yml up
```

### Testing

```bash
# Run analyzer tests
npm test -w packages/analyzer

# Run UI tests
npm test -w packages/ui
```

## License

MIT

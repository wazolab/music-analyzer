# Music Analyzer

## Your AI-Powered DJ Library Manager

Automatically analyze, tag, and organize your music collection. Built for DJs who want perfect metadata without the manual work.

---

## The Problem

Every DJ knows the pain:

- **Hours spent tagging tracks** - BPM, key, genre... manually for every file
- **Inconsistent metadata** - Different sources, different formats, missing information
- **Messy library organization** - Files scattered across folders with no structure
- **Mixing key conflicts** - Finding harmonically compatible tracks takes forever
- **Unknown tracks** - Downloaded files with cryptic filenames and no metadata

## The Solution

Music Analyzer uses machine learning to automatically:

1. **Detect BPM** - Accurate tempo detection, even for complex rhythms
2. **Identify musical key** - With Camelot notation for harmonic mixing
3. **Classify genre** - 400+ genres recognized using neural networks
4. **Find track info** - Automatic lookup from MusicBrainz, Discogs, and Bandcamp
5. **Write perfect tags** - All metadata saved directly to your FLAC files
6. **Organize your library** - Sorted by year, genre, and label automatically

---

## Features

### Intelligent Audio Analysis

- **BPM Detection** - Industry-standard tempo analysis
- **Key Detection** - Musical key with both classical and Camelot notation
- **Energy Rating** - Track energy level on a 0-100 scale
- **Genre Classification** - AI-powered recognition of 400+ genres

### Automatic Metadata Lookup

- **MusicBrainz** - The world's largest open music database
- **Discogs** - Comprehensive electronic music catalog
- **Bandcamp** - Direct artist and label information
- **AcoustID** - Audio fingerprint matching for unknown tracks

### Library Organization

- **Automatic sorting** - By year, genre, and record label
- **DJ-ready playlists** - M3U export for Rekordbox, Traktor, Serato
- **External drive support** - Publish to USB for club gigs
- **Non-destructive** - Original files stay untouched

### Web Interface

- **Browse your library** - Filter by any metadata field
- **Create playlists** - Drag and drop track management
- **Bulk operations** - Analyze hundreds of tracks at once
- **Real-time updates** - Watch analysis progress live

---

## How It Works

```
1. DROP        2. ANALYZE       3. TAG         4. ORGANIZE
   ▼              ▼               ▼               ▼
┌─────┐       ┌─────┐         ┌─────┐         ┌─────┐
│FLAC │  →    │ AI  │    →    │FLAC │    →    │Year │
│files│       │     │         │+tags│         │Genre│
└─────┘       └─────┘         └─────┘         │Label│
                                              └─────┘
```

1. **Drop your files** into the downloads folder or import existing music
2. **AI analyzes** every track for BPM, key, energy, and genre
3. **Metadata is written** directly to FLAC tags
4. **Files are organized** into a clean folder structure

---

## Perfect For

### Club DJs
- Know every track's BPM and key before you play
- Build harmonically-compatible playlists
- Export to USB for CDJ playback

### Collectors
- Finally organize that massive music library
- Find that track you know you have somewhere
- Consistent metadata across your entire collection

### Label Curators
- Quickly categorize incoming promos
- Sort by genre and energy for playlist curation
- Track which labels are sending what

### Bedroom Producers
- Analyze your own tracks alongside references
- Match BPM and key to samples
- Organize by style and mood

---

## Technical Highlights

| Feature | Technology |
|---------|------------|
| Audio Analysis | Essentia.js (industry-standard algorithms) |
| Genre AI | TensorFlow.js with MusiCNN model |
| Fingerprinting | Chromaprint / AcoustID |
| Tag Format | FLAC Vorbis Comments |
| UI | Modern web interface (Nuxt 3) |
| Deployment | Docker (runs anywhere) |

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/your-username/music-analyzer.git
cd music-analyzer

# Run setup script
./setup.sh

# Start the application
docker compose up -d

# Open http://localhost:3000
```

That's it. Drop some FLAC files and watch the magic happen.

---

## Supported Formats

| Format | Read | Write | Analysis |
|--------|------|-------|----------|
| FLAC | Yes | Yes | Yes |
| WAV | Yes | No | Yes |
| MP3 | Yes | No | Yes |
| AIFF | Yes | No | Yes |

*Full tag writing support is available for FLAC. Other formats can be analyzed but require manual tag editing.*

---

## Screenshots

### Library View
Browse your entire collection with powerful filtering.

### Playlist Editor
Build sets with drag-and-drop simplicity.

### Analysis Dashboard
Watch real-time progress as tracks are processed.

### Publish to USB
One-click export to external drives with M3U playlists.

---

## Why Open Source?

Music Analyzer is free and open source because:

- **No vendor lock-in** - Your music, your metadata, your control
- **Privacy first** - Everything runs locally, no cloud required
- **Community driven** - Suggest features, report bugs, contribute code
- **Transparent** - See exactly how your music is being analyzed

---

## Requirements

- **Docker** - For easy deployment
- **4GB RAM** - For audio analysis
- **Linux** - Primary platform (macOS partial support)

---

## Get Started

Ready to organize your music library?

1. Visit the [GitHub repository](https://github.com/your-username/music-analyzer)
2. Follow the Quick Start guide
3. Drop your first tracks

---

## Support

- **Documentation**: See [README.md](README.md) for technical details
- **Issues**: Report bugs on GitHub
- **Discussions**: Ask questions and share ideas

---

## License

MIT - Use it however you want.

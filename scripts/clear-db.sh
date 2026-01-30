#!/bin/bash
# Clear database tables for music-analyzer
# Usage: ./scripts/clear-db.sh [--all|--library|--downloads|--analysis|--playlists]

set -e

# Database path inside the container
DB_PATH="/app/data/playlists.db"
CONTAINER="music-pipeline-ui"

# Check if container is running
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$CONTAINER"; then
    echo "Error: Container '$CONTAINER' is not running."
    echo "Start it with: docker compose up -d"
    exit 1
fi

run_sql() {
    docker exec "$CONTAINER" sqlite3 "$DB_PATH" "$1"
}

clear_library() {
    echo "Clearing library_tracks..."
    run_sql "DELETE FROM library_tracks;"
    echo "  Done"
}

clear_downloads() {
    echo "Clearing download_files..."
    run_sql "DELETE FROM download_files;"
    echo "  Done"
}

clear_analysis() {
    echo "Clearing analysis_jobs..."
    run_sql "DELETE FROM analysis_jobs;"
    echo "  Done"
}

clear_playlists() {
    echo "Clearing playlists and tracks..."
    run_sql "DELETE FROM preparation_list;"
    run_sql "DELETE FROM tracks;"
    run_sql "DELETE FROM playlists;"
    echo "  Done"
}

clear_all() {
    clear_library
    clear_downloads
    clear_analysis
    clear_playlists
}

show_stats() {
    echo ""
    echo "Current database stats:"
    echo "  Playlists:      $(run_sql "SELECT COUNT(*) FROM playlists;")"
    echo "  Tracks:         $(run_sql "SELECT COUNT(*) FROM tracks;")"
    echo "  Download files: $(run_sql "SELECT COUNT(*) FROM download_files;")"
    echo "  Analysis jobs:  $(run_sql "SELECT COUNT(*) FROM analysis_jobs;")"
    echo "  Library tracks: $(run_sql "SELECT COUNT(*) FROM library_tracks;")"
}

case "${1:-}" in
    --all|-a)
        echo "Clearing ALL tables..."
        clear_all
        ;;
    --library|-l)
        clear_library
        ;;
    --downloads|-d)
        clear_downloads
        ;;
    --analysis|-j)
        clear_analysis
        ;;
    --playlists|-p)
        clear_playlists
        ;;
    --stats|-s)
        show_stats
        exit 0
        ;;
    "")
        echo "Usage: $0 [option]"
        echo ""
        echo "Options:"
        echo "  --all, -a        Clear all tables"
        echo "  --library, -l    Clear library_tracks only"
        echo "  --downloads, -d  Clear download_files only"
        echo "  --analysis, -j   Clear analysis_jobs only"
        echo "  --playlists, -p  Clear playlists, tracks, and preparation list"
        echo "  --stats, -s      Show current table counts"
        echo ""
        show_stats
        exit 0
        ;;
    *)
        echo "Unknown option: $1"
        exit 1
        ;;
esac

echo ""
echo "Done!"
show_stats

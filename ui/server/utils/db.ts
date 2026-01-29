import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { Playlist, Track, TrackStatus, TrackInput } from './types'

// Use /app/data in Docker, otherwise cwd
const dataDir = process.env.NODE_ENV === 'production' ? '/app/data' : process.cwd()
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}
const dbPath = join(dataDir, 'playlists.db')
const db = new Database(dbPath)

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    track_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    duration INTEGER,
    status TEXT DEFAULT 'not_downloaded',
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, artist, title)
  );

  CREATE INDEX IF NOT EXISTS idx_tracks_playlist ON tracks(playlist_id);
`)

// Playlist operations
export function getAllPlaylists(): Playlist[] {
  return db.prepare('SELECT * FROM playlists ORDER BY updated_at DESC').all() as Playlist[]
}

export function getPlaylistById(id: number): Playlist | undefined {
  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as Playlist | undefined
}

export function getPlaylistByUrl(url: string): Playlist | undefined {
  return db.prepare('SELECT * FROM playlists WHERE url = ?').get(url) as Playlist | undefined
}

export function createPlaylist(name: string, url: string, tracks: TrackInput[]): Playlist {
  const insert = db.prepare(`
    INSERT INTO playlists (name, url, track_count)
    VALUES (?, ?, ?)
  `)

  const insertTrack = db.prepare(`
    INSERT INTO tracks (playlist_id, artist, title, duration)
    VALUES (?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    const result = insert.run(name, url, tracks.length)
    const playlistId = result.lastInsertRowid as number

    for (const track of tracks) {
      insertTrack.run(playlistId, track.artist, track.title, track.duration ?? null)
    }

    return getPlaylistById(playlistId)!
  })

  return transaction()
}

export function deletePlaylist(id: number): boolean {
  const result = db.prepare('DELETE FROM playlists WHERE id = ?').run(id)
  return result.changes > 0
}

export function updatePlaylistTimestamp(id: number): void {
  db.prepare("UPDATE playlists SET updated_at = datetime('now') WHERE id = ?").run(id)
}

// Track operations
export function getTracksByPlaylistId(playlistId: number): Track[] {
  return db.prepare('SELECT * FROM tracks WHERE playlist_id = ? ORDER BY id').all(playlistId) as Track[]
}

export function getTrackById(id: number): Track | undefined {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Track | undefined
}

export function updateTrackStatus(id: number, status: TrackStatus): boolean {
  const result = db.prepare('UPDATE tracks SET status = ? WHERE id = ?').run(status, id)
  if (result.changes > 0) {
    // Update playlist timestamp
    const track = getTrackById(id)
    if (track) {
      updatePlaylistTimestamp(track.playlist_id)
    }
    return true
  }
  return false
}

// Sync operation - preserves statuses for existing tracks
export function syncPlaylistTracks(playlistId: number, newTracks: TrackInput[]): void {
  const existingTracks = getTracksByPlaylistId(playlistId)

  // Build status map: "artist|title" (lowercase) -> status
  const statusMap = new Map<string, TrackStatus>()
  for (const track of existingTracks) {
    const key = `${track.artist.toLowerCase()}|${track.title.toLowerCase()}`
    statusMap.set(key, track.status)
  }

  const deleteTracks = db.prepare('DELETE FROM tracks WHERE playlist_id = ?')
  const insertTrack = db.prepare(`
    INSERT INTO tracks (playlist_id, artist, title, duration, status)
    VALUES (?, ?, ?, ?, ?)
  `)
  const updatePlaylist = db.prepare(`
    UPDATE playlists SET track_count = ?, updated_at = datetime('now')
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    deleteTracks.run(playlistId)

    for (const track of newTracks) {
      const key = `${track.artist.toLowerCase()}|${track.title.toLowerCase()}`
      const status = statusMap.get(key) || 'not_downloaded'
      insertTrack.run(playlistId, track.artist, track.title, track.duration ?? null, status)
    }

    updatePlaylist.run(newTracks.length, playlistId)
  })

  transaction()
}

export default db

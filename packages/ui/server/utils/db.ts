import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { Playlist, Track, TrackStatus, TrackInput, PrepTrack } from './types'

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
    source_url TEXT,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, artist, title)
  );

  CREATE TABLE IF NOT EXISTS preparation_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    UNIQUE(track_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tracks_playlist ON tracks(playlist_id);
  CREATE INDEX IF NOT EXISTS idx_prep_track ON preparation_list(track_id);
`)

// Migration: add source_url column if missing
try {
  db.exec('ALTER TABLE tracks ADD COLUMN source_url TEXT')
} catch (e) {
  // Column already exists
}

// Migration: add tags column if missing
try {
  db.exec('ALTER TABLE tracks ADD COLUMN tags TEXT')
} catch (e) {
  // Column already exists
}

// Migration: add analysis columns to tracks
try {
  db.exec('ALTER TABLE tracks ADD COLUMN bpm REAL')
} catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE tracks ADD COLUMN key_notation TEXT')
} catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE tracks ADD COLUMN energy REAL')
} catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE tracks ADD COLUMN analyzed_at TEXT')
} catch (e) {
  // Column already exists
}

// Migration: Add logs column to analysis_jobs
try {
  db.exec('ALTER TABLE analysis_jobs ADD COLUMN logs TEXT')
} catch (e) {
  // Column already exists
}

// Analysis job tables
db.exec(`
  CREATE TABLE IF NOT EXISTS analysis_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    output_dir TEXT NOT NULL,
    total_files INTEGER DEFAULT 0,
    completed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    current_file TEXT,
    logs TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS download_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    folder TEXT,
    size_bytes INTEGER,
    status TEXT DEFAULT 'pending',
    job_id INTEGER,
    error_message TEXT,
    bpm REAL,
    key_notation TEXT,
    energy REAL,
    genres TEXT,
    artist TEXT,
    title TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    analyzed_at TEXT,
    FOREIGN KEY (job_id) REFERENCES analysis_jobs(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_download_files_status ON download_files(status);
  CREATE INDEX IF NOT EXISTS idx_download_files_job ON download_files(job_id);
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
    INSERT INTO tracks (playlist_id, artist, title, duration, source_url)
    VALUES (?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    const result = insert.run(name, url, tracks.length)
    const playlistId = result.lastInsertRowid as number

    for (const track of tracks) {
      insertTrack.run(playlistId, track.artist, track.title, track.duration ?? null, track.source_url ?? null)
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
    INSERT INTO tracks (playlist_id, artist, title, duration, status, source_url)
    VALUES (?, ?, ?, ?, ?, ?)
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
      insertTrack.run(playlistId, track.artist, track.title, track.duration ?? null, status, track.source_url ?? null)
    }

    updatePlaylist.run(newTracks.length, playlistId)
  })

  transaction()
}

// Preparation list operations
export function getPreparationList(): PrepTrack[] {
  return db.prepare(`
    SELECT
      pl.id,
      pl.track_id,
      t.artist,
      t.title,
      t.duration,
      t.source_url,
      p.name as playlist_name,
      pl.added_at,
      t.bpm,
      t.key_notation,
      t.energy
    FROM preparation_list pl
    JOIN tracks t ON pl.track_id = t.id
    JOIN playlists p ON t.playlist_id = p.id
    ORDER BY pl.added_at DESC
  `).all() as PrepTrack[]
}

export function addToPreparationList(trackId: number): boolean {
  try {
    db.prepare('INSERT INTO preparation_list (track_id) VALUES (?)').run(trackId)
    return true
  } catch {
    // Already in list (UNIQUE constraint)
    return false
  }
}

export function removeFromPreparationList(trackId: number): boolean {
  const result = db.prepare('DELETE FROM preparation_list WHERE track_id = ?').run(trackId)
  return result.changes > 0
}

export function clearPreparationList(): void {
  db.prepare('DELETE FROM preparation_list').run()
}

export function isInPreparationList(trackId: number): boolean {
  const result = db.prepare('SELECT 1 FROM preparation_list WHERE track_id = ?').get(trackId)
  return !!result
}

export function updateTrackTags(id: number, tags: string[]): boolean {
  const tagsJson = JSON.stringify(tags)
  const result = db.prepare('UPDATE tracks SET tags = ? WHERE id = ?').run(tagsJson, id)
  return result.changes > 0
}

// Update track analysis data
export function updateTrackAnalysis(id: number, data: {
  bpm?: number
  key_notation?: string
  energy?: number
  tags?: string[]
}): boolean {
  const updates: string[] = []
  const values: any[] = []

  if (data.bpm !== undefined) {
    updates.push('bpm = ?')
    values.push(data.bpm)
  }
  if (data.key_notation !== undefined) {
    updates.push('key_notation = ?')
    values.push(data.key_notation)
  }
  if (data.energy !== undefined) {
    updates.push('energy = ?')
    values.push(data.energy)
  }
  if (data.tags !== undefined) {
    updates.push('tags = ?')
    values.push(JSON.stringify(data.tags))
  }

  if (updates.length === 0) return false

  updates.push("analyzed_at = datetime('now')")
  values.push(id)

  const result = db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return result.changes > 0
}

// Match analysis results to tracks by artist/title
export function matchAndUpdateTrackAnalysis(artist: string, title: string, data: {
  bpm?: number
  key_notation?: string
  energy?: number
  tags?: string[]
}): number {
  // Normalize for matching
  const artistLower = artist.toLowerCase().trim()
  const titleLower = title.toLowerCase().trim()

  // Find matching tracks (may be in multiple playlists)
  const tracks = db.prepare(`
    SELECT id FROM tracks
    WHERE LOWER(artist) = ? AND (
      LOWER(title) = ? OR
      LOWER(title) LIKE ? OR
      ? LIKE '%' || LOWER(title) || '%'
    )
  `).all(artistLower, titleLower, `${titleLower}%`, titleLower) as { id: number }[]

  let updated = 0
  for (const track of tracks) {
    if (updateTrackAnalysis(track.id, data)) {
      updated++
    }
  }
  return updated
}

// Analysis job operations
import type { AnalysisJob, DownloadFile, DownloadFileStatus, AnalysisJobStatus } from './types'

export function createAnalysisJob(outputDir: string): AnalysisJob {
  const result = db.prepare(`
    INSERT INTO analysis_jobs (output_dir, status)
    VALUES (?, 'pending')
  `).run(outputDir)

  return getAnalysisJobById(result.lastInsertRowid as number)!
}

export function getAnalysisJobById(id: number): AnalysisJob | undefined {
  return db.prepare('SELECT * FROM analysis_jobs WHERE id = ?').get(id) as AnalysisJob | undefined
}

export function updateAnalysisJobStatus(id: number, status: AnalysisJobStatus, currentFile?: string): void {
  if (status === 'running' && currentFile) {
    db.prepare(`
      UPDATE analysis_jobs
      SET status = ?, current_file = ?, started_at = COALESCE(started_at, datetime('now'))
      WHERE id = ?
    `).run(status, currentFile, id)
  } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    db.prepare(`
      UPDATE analysis_jobs
      SET status = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(status, id)
  } else {
    db.prepare('UPDATE analysis_jobs SET status = ? WHERE id = ?').run(status, id)
  }
}

export function updateAnalysisJobProgress(
  id: number,
  completed: number,
  failed: number,
  total?: number
): void {
  if (total !== undefined) {
    db.prepare(`
      UPDATE analysis_jobs
      SET completed_files = ?, failed_files = ?, total_files = ?
      WHERE id = ?
    `).run(completed, failed, total, id)
  } else {
    db.prepare(`
      UPDATE analysis_jobs
      SET completed_files = ?, failed_files = ?
      WHERE id = ?
    `).run(completed, failed, id)
  }
}

export function updateAnalysisJobLogs(id: number, logs: string): void {
  db.prepare('UPDATE analysis_jobs SET logs = ? WHERE id = ?').run(logs, id)
}

export function setAnalysisJobFiles(jobId: number, fileIds: number[]): void {
  const update = db.prepare('UPDATE download_files SET job_id = ?, status = ? WHERE id = ?')
  const updateJob = db.prepare('UPDATE analysis_jobs SET total_files = ? WHERE id = ?')

  const transaction = db.transaction(() => {
    for (const fileId of fileIds) {
      update.run(jobId, 'queued', fileId)
    }
    updateJob.run(fileIds.length, jobId)
  })

  transaction()
}

// Download file operations
export function getAllDownloadFiles(): DownloadFile[] {
  return db.prepare('SELECT * FROM download_files ORDER BY folder, filename').all() as DownloadFile[]
}

export function getDownloadFileById(id: number): DownloadFile | undefined {
  return db.prepare('SELECT * FROM download_files WHERE id = ?').get(id) as DownloadFile | undefined
}

export function getDownloadFileByPath(path: string): DownloadFile | undefined {
  return db.prepare('SELECT * FROM download_files WHERE path = ?').get(path) as DownloadFile | undefined
}

export function upsertDownloadFile(file: {
  path: string
  filename: string
  folder: string | null
  size_bytes: number | null
}): DownloadFile {
  const existing = getDownloadFileByPath(file.path)
  if (existing) {
    return existing
  }

  const result = db.prepare(`
    INSERT INTO download_files (path, filename, folder, size_bytes)
    VALUES (?, ?, ?, ?)
  `).run(file.path, file.filename, file.folder, file.size_bytes)

  return getDownloadFileById(result.lastInsertRowid as number)!
}

export function updateDownloadFileStatus(id: number, status: DownloadFileStatus, errorMessage?: string): void {
  if (errorMessage) {
    db.prepare('UPDATE download_files SET status = ?, error_message = ? WHERE id = ?').run(status, errorMessage, id)
  } else {
    db.prepare('UPDATE download_files SET status = ? WHERE id = ?').run(status, id)
  }
}


export function updateDownloadFileAnalysis(id: number, data: {
  bpm?: number
  key_notation?: string
  energy?: number
  genres?: string[]
  artist?: string
  title?: string
}): void {
  const updates: string[] = []
  const values: any[] = []

  if (data.bpm !== undefined) { updates.push('bpm = ?'); values.push(data.bpm) }
  if (data.key_notation !== undefined) { updates.push('key_notation = ?'); values.push(data.key_notation) }
  if (data.energy !== undefined) { updates.push('energy = ?'); values.push(data.energy) }
  if (data.genres !== undefined) { updates.push('genres = ?'); values.push(JSON.stringify(data.genres)) }
  if (data.artist !== undefined) { updates.push('artist = ?'); values.push(data.artist) }
  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title) }

  if (updates.length === 0) return

  updates.push("analyzed_at = datetime('now')")
  updates.push("status = 'completed'")
  values.push(id)

  db.prepare(`UPDATE download_files SET ${updates.join(', ')} WHERE id = ?`).run(...values)
}

export function getDownloadFilesByJobId(jobId: number): DownloadFile[] {
  return db.prepare('SELECT * FROM download_files WHERE job_id = ?').all(jobId) as DownloadFile[]
}

export function deleteDownloadFile(id: number): boolean {
  const result = db.prepare('DELETE FROM download_files WHERE id = ?').run(id)
  return result.changes > 0
}

export function clearDownloadFiles(): void {
  db.prepare('DELETE FROM download_files').run()
}

export default db

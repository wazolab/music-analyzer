import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { Playlist, Track, TrackStatus, TrackInput, PrepTrack } from './types'

// Analysis job operations
import type { AnalysisJob, DownloadFile, DownloadFileStatus, AnalysisJobStatus } from './types'

// Library operations
import type { LibraryTrack, LibraryTrackInput, LibraryFilters, StorageStatus } from './types'

// Use DATA_DIR env var, or /app/data in Docker, otherwise cwd
const dataDir = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : process.cwd())
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
}
catch (e) {
  // Column already exists
}

// Migration: add tags column if missing
try {
  db.exec('ALTER TABLE tracks ADD COLUMN tags TEXT')
}
catch (e) {
  // Column already exists
}

// Migration: add analysis columns to tracks
try {
  db.exec('ALTER TABLE tracks ADD COLUMN bpm REAL')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE tracks ADD COLUMN key_notation TEXT')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE tracks ADD COLUMN energy REAL')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE tracks ADD COLUMN analyzed_at TEXT')
}
catch (e) {
  // Column already exists
}

// Migration: Add logs column to analysis_jobs
try {
  db.exec('ALTER TABLE analysis_jobs ADD COLUMN logs TEXT')
}
catch (e) {
  // Column already exists
}

// Migration: Add tracks_needing_link column to analysis_jobs
try {
  db.exec('ALTER TABLE analysis_jobs ADD COLUMN tracks_needing_link TEXT')
}
catch (e) {
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

// Library tracks table for permanent collection
db.exec(`
  CREATE TABLE IF NOT EXISTS library_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT UNIQUE NOT NULL,
    fingerprint_duration INTEGER NOT NULL,
    artist TEXT,
    title TEXT,
    album TEXT,
    label TEXT,
    year INTEGER,
    bpm REAL,
    key_notation TEXT,
    energy INTEGER,
    genres TEXT,
    file_path TEXT,
    file_size_bytes INTEGER,
    storage_status TEXT DEFAULT 'available',
    storage_device TEXT,
    musicbrainz_id TEXT,
    first_seen_at TEXT DEFAULT (datetime('now')),
    last_analyzed_at TEXT,
    last_seen_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_library_fingerprint ON library_tracks(fingerprint);
  CREATE INDEX IF NOT EXISTS idx_library_genres ON library_tracks(genres);
  CREATE INDEX IF NOT EXISTS idx_library_label ON library_tracks(label);
  CREATE INDEX IF NOT EXISTS idx_library_year ON library_tracks(year);
  CREATE INDEX IF NOT EXISTS idx_library_storage ON library_tracks(storage_status);
`)

// Library settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS library_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`)

// Migration: add analysis_status column to library_tracks
try {
  db.exec('ALTER TABLE library_tracks ADD COLUMN analysis_status TEXT DEFAULT \'analyzed\'')
}
catch (e) {
  // Column already exists
}

// Migration: add source column to library_tracks
try {
  db.exec('ALTER TABLE library_tracks ADD COLUMN source TEXT DEFAULT \'downloads\'')
}
catch (e) {
  // Column already exists
}

// Create index on analysis_status for efficient filtering
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_library_analysis_status ON library_tracks(analysis_status)')
}
catch (e) {
  // Index already exists
}

// Migration: add fingerprint columns to download_files
try {
  db.exec('ALTER TABLE download_files ADD COLUMN fingerprint TEXT')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE download_files ADD COLUMN fingerprint_duration INTEGER')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE download_files ADD COLUMN label TEXT')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE download_files ADD COLUMN year INTEGER')
}
catch (e) {
  // Column already exists
}
try {
  db.exec('ALTER TABLE download_files ADD COLUMN album TEXT')
}
catch (e) {
  // Column already exists
}

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
  db.prepare('UPDATE playlists SET updated_at = datetime(\'now\') WHERE id = ?').run(id)
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
  }
  catch {
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

  updates.push('analyzed_at = datetime(\'now\')')
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
  }
  else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    db.prepare(`
      UPDATE analysis_jobs
      SET status = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(status, id)
  }
  else {
    db.prepare('UPDATE analysis_jobs SET status = ? WHERE id = ?').run(status, id)
  }
}

export function updateAnalysisJobProgress(
  id: number,
  completed: number,
  failed: number,
  total?: number,
): void {
  if (total !== undefined) {
    db.prepare(`
      UPDATE analysis_jobs
      SET completed_files = ?, failed_files = ?, total_files = ?
      WHERE id = ?
    `).run(completed, failed, total, id)
  }
  else {
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

export function addTrackNeedingLink(id: number, trackInfo: { filename: string, trackId: number }): void {
  const job = db.prepare('SELECT tracks_needing_link FROM analysis_jobs WHERE id = ?').get(id) as { tracks_needing_link: string | null } | undefined
  const existing = job?.tracks_needing_link ? JSON.parse(job.tracks_needing_link) : []
  existing.push(trackInfo)
  db.prepare('UPDATE analysis_jobs SET tracks_needing_link = ? WHERE id = ?').run(JSON.stringify(existing), id)
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
  }
  else {
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
  album?: string
  label?: string
  year?: number
  fingerprint?: string
  fingerprint_duration?: number
}): void {
  const updates: string[] = []
  const values: any[] = []

  if (data.bpm !== undefined) { updates.push('bpm = ?'); values.push(data.bpm) }
  if (data.key_notation !== undefined) { updates.push('key_notation = ?'); values.push(data.key_notation) }
  if (data.energy !== undefined) { updates.push('energy = ?'); values.push(data.energy) }
  if (data.genres !== undefined) { updates.push('genres = ?'); values.push(JSON.stringify(data.genres)) }
  if (data.artist !== undefined) { updates.push('artist = ?'); values.push(data.artist) }
  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title) }
  if (data.album !== undefined) { updates.push('album = ?'); values.push(data.album) }
  if (data.label !== undefined) { updates.push('label = ?'); values.push(data.label) }
  if (data.year !== undefined) { updates.push('year = ?'); values.push(data.year) }
  if (data.fingerprint !== undefined) { updates.push('fingerprint = ?'); values.push(data.fingerprint) }
  if (data.fingerprint_duration !== undefined) { updates.push('fingerprint_duration = ?'); values.push(data.fingerprint_duration) }

  if (updates.length === 0) return

  updates.push('analyzed_at = datetime(\'now\')')
  updates.push('status = \'completed\'')
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

export function deleteDownloadFileByPath(path: string): boolean {
  const result = db.prepare('DELETE FROM download_files WHERE path = ?').run(path)
  return result.changes > 0
}

export function cleanupStaleDownloadFiles(existingPaths: Set<string>): number {
  const allFiles = getAllDownloadFiles()
  let deleted = 0

  for (const file of allFiles) {
    if (!existingPaths.has(file.path)) {
      if (deleteDownloadFile(file.id)) {
        deleted++
      }
    }
  }

  return deleted
}

// Library operations
export function upsertLibraryTrack(data: LibraryTrackInput): LibraryTrack {
  const existing = getLibraryTrackByFingerprint(data.fingerprint)

  if (existing) {
    // Update existing record
    const updates: string[] = []
    const values: any[] = []

    if (data.artist !== undefined) { updates.push('artist = ?'); values.push(data.artist) }
    if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title) }
    if (data.album !== undefined) { updates.push('album = ?'); values.push(data.album) }
    if (data.label !== undefined) { updates.push('label = ?'); values.push(data.label) }
    if (data.year !== undefined) { updates.push('year = ?'); values.push(data.year) }
    if (data.bpm !== undefined) { updates.push('bpm = ?'); values.push(data.bpm) }
    if (data.key_notation !== undefined) { updates.push('key_notation = ?'); values.push(data.key_notation) }
    if (data.energy !== undefined) { updates.push('energy = ?'); values.push(data.energy) }
    if (data.genres !== undefined) { updates.push('genres = ?'); values.push(JSON.stringify(data.genres)) }
    if (data.file_path !== undefined) { updates.push('file_path = ?'); values.push(data.file_path) }
    if (data.file_size_bytes !== undefined) { updates.push('file_size_bytes = ?'); values.push(data.file_size_bytes) }
    if (data.storage_device !== undefined) { updates.push('storage_device = ?'); values.push(data.storage_device) }
    if (data.musicbrainz_id !== undefined) { updates.push('musicbrainz_id = ?'); values.push(data.musicbrainz_id) }

    updates.push('last_analyzed_at = datetime(\'now\')')
    updates.push('last_seen_at = datetime(\'now\')')
    updates.push('storage_status = \'available\'')
    values.push(existing.id)

    if (updates.length > 3) {
      db.prepare(`UPDATE library_tracks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    return getLibraryTrackById(existing.id)!
  }

  // Insert new record
  const result = db.prepare(`
    INSERT INTO library_tracks (
      fingerprint, fingerprint_duration, artist, title, album, label, year,
      bpm, key_notation, energy, genres, file_path, file_size_bytes,
      storage_device, musicbrainz_id, last_analyzed_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    data.fingerprint,
    data.fingerprint_duration,
    data.artist ?? null,
    data.title ?? null,
    data.album ?? null,
    data.label ?? null,
    data.year ?? null,
    data.bpm ?? null,
    data.key_notation ?? null,
    data.energy ?? null,
    data.genres ? JSON.stringify(data.genres) : null,
    data.file_path ?? null,
    data.file_size_bytes ?? null,
    data.storage_device ?? null,
    data.musicbrainz_id ?? null,
  )

  return getLibraryTrackById(result.lastInsertRowid as number)!
}

export function getLibraryTrackById(id: number): LibraryTrack | undefined {
  return db.prepare('SELECT * FROM library_tracks WHERE id = ?').get(id) as LibraryTrack | undefined
}

export function getLibraryTrackByFingerprint(fingerprint: string): LibraryTrack | undefined {
  return db.prepare('SELECT * FROM library_tracks WHERE fingerprint = ?').get(fingerprint) as LibraryTrack | undefined
}

export function getAllLibraryTracks(filters?: LibraryFilters): LibraryTrack[] {
  let query = 'SELECT * FROM library_tracks WHERE 1=1'
  const params: any[] = []

  if (filters) {
    if (filters.genre) {
      query += ' AND genres LIKE ?'
      params.push(`%${filters.genre}%`)
    }
    if (filters.label) {
      query += ' AND label = ?'
      params.push(filters.label)
    }
    if (filters.year) {
      query += ' AND year = ?'
      params.push(filters.year)
    }
    if (filters.key) {
      query += ' AND key_notation = ?'
      params.push(filters.key)
    }
    if (filters.storage_status) {
      query += ' AND storage_status = ?'
      params.push(filters.storage_status)
    }
    if (filters.search) {
      query += ' AND (artist LIKE ? OR title LIKE ? OR album LIKE ?)'
      const searchTerm = `%${filters.search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }
  }

  query += ' ORDER BY last_analyzed_at DESC'
  return db.prepare(query).all(...params) as LibraryTrack[]
}

export function updateLibraryTrackPath(fingerprint: string, newPath: string): boolean {
  const result = db.prepare(`
    UPDATE library_tracks
    SET file_path = ?, last_seen_at = datetime('now'), storage_status = 'available'
    WHERE fingerprint = ?
  `).run(newPath, fingerprint)
  return result.changes > 0
}

export function markLibraryTracksOffline(storageDevice: string): number {
  const result = db.prepare(`
    UPDATE library_tracks
    SET storage_status = 'offline'
    WHERE storage_device = ? AND storage_status = 'available'
  `).run(storageDevice)
  return result.changes
}

export function markLibraryTracksOnline(storageDevice: string): number {
  const result = db.prepare(`
    UPDATE library_tracks
    SET storage_status = 'available'
    WHERE storage_device = ? AND storage_status = 'offline'
  `).run(storageDevice)
  return result.changes
}

// Get all unique storage devices in the library
export function getStorageDevices(): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT storage_device
    FROM library_tracks
    WHERE storage_device IS NOT NULL
  `).all() as { storage_device: string }[]
  return rows.map(r => r.storage_device)
}

// Sync storage status based on file accessibility
export function syncStorageStatus(mountedPaths: string[]): { online: number, offline: number } {
  let online = 0
  let offline = 0

  // Get all tracks with external storage
  const tracks = db.prepare(`
    SELECT id, file_path, storage_status
    FROM library_tracks
    WHERE storage_device IS NOT NULL AND file_path IS NOT NULL
  `).all() as { id: number, file_path: string, storage_status: string }[]

  for (const track of tracks) {
    // Check if file path starts with any mounted path
    const isMounted = mountedPaths.some(mp => track.file_path.startsWith(mp))

    if (isMounted && track.storage_status === 'offline') {
      db.prepare('UPDATE library_tracks SET storage_status = ? WHERE id = ?').run('available', track.id)
      online++
    }
    else if (!isMounted && track.storage_status === 'available') {
      db.prepare('UPDATE library_tracks SET storage_status = ? WHERE id = ?').run('offline', track.id)
      offline++
    }
  }

  return { online, offline }
}

export function getLibraryStats(): {
  total: number
  pending: number
  byGenre: { genre: string, count: number }[]
  byLabel: { label: string, count: number }[]
  byYear: { year: number, count: number }[]
  byStatus: { status: StorageStatus, count: number }[]
} {
  // Count only analyzed tracks for stats
  const total = (db.prepare('SELECT COUNT(*) as count FROM library_tracks WHERE analysis_status = \'analyzed\'').get() as { count: number }).count
  const pending = (db.prepare('SELECT COUNT(*) as count FROM library_tracks WHERE analysis_status != \'analyzed\' OR analysis_status IS NULL').get() as { count: number }).count

  const byGenre = db.prepare(`
    SELECT genres as genre, COUNT(*) as count
    FROM library_tracks
    WHERE genres IS NOT NULL AND analysis_status = 'analyzed'
    GROUP BY genres
    ORDER BY count DESC
    LIMIT 20
  `).all() as { genre: string, count: number }[]

  const byLabel = db.prepare(`
    SELECT label, COUNT(*) as count
    FROM library_tracks
    WHERE label IS NOT NULL AND analysis_status = 'analyzed'
    GROUP BY label
    ORDER BY count DESC
    LIMIT 20
  `).all() as { label: string, count: number }[]

  const byYear = db.prepare(`
    SELECT year, COUNT(*) as count
    FROM library_tracks
    WHERE year IS NOT NULL AND analysis_status = 'analyzed'
    GROUP BY year
    ORDER BY year DESC
  `).all() as { year: number, count: number }[]

  const byStatus = db.prepare(`
    SELECT storage_status as status, COUNT(*) as count
    FROM library_tracks
    WHERE analysis_status = 'analyzed'
    GROUP BY storage_status
  `).all() as { status: StorageStatus, count: number }[]

  return { total, pending, byGenre, byLabel, byYear, byStatus }
}

export function deleteLibraryTrack(id: number): boolean {
  const result = db.prepare('DELETE FROM library_tracks WHERE id = ?').run(id)
  return result.changes > 0
}

// Library settings operations
export function getLibrarySettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM library_settings').all() as { key: string, value: string }[]
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return settings
}

export function setLibrarySetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO library_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

// Pending tracks operations (for unified library view)
export function getPendingTracks(): LibraryTrack[] {
  return db.prepare(`
    SELECT * FROM library_tracks
    WHERE analysis_status != 'analyzed' OR analysis_status IS NULL
    ORDER BY first_seen_at DESC
  `).all() as LibraryTrack[]
}

export function getAnalyzedTracks(filters?: LibraryFilters): LibraryTrack[] {
  let query = 'SELECT * FROM library_tracks WHERE analysis_status = \'analyzed\''
  const params: any[] = []

  if (filters) {
    if (filters.genre) {
      query += ' AND genres LIKE ?'
      params.push(`%${filters.genre}%`)
    }
    if (filters.label) {
      query += ' AND label = ?'
      params.push(filters.label)
    }
    if (filters.year) {
      query += ' AND year = ?'
      params.push(filters.year)
    }
    if (filters.key) {
      query += ' AND key_notation = ?'
      params.push(filters.key)
    }
    if (filters.storage_status) {
      query += ' AND storage_status = ?'
      params.push(filters.storage_status)
    }
    if (filters.search) {
      query += ' AND (artist LIKE ? OR title LIKE ? OR album LIKE ?)'
      const searchTerm = `%${filters.search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }
  }

  query += ' ORDER BY last_analyzed_at DESC'
  return db.prepare(query).all(...params) as LibraryTrack[]
}

// Create a pending track from scan (fingerprint-based)
export function upsertLibraryTrackFromScan(data: {
  fingerprint: string
  fingerprint_duration: number
  file_path: string
  file_size_bytes?: number
  source: 'downloads' | 'external'
  storage_device?: string
}): LibraryTrack {
  const existing = getLibraryTrackByFingerprint(data.fingerprint)

  if (existing) {
    // Update file path if it changed (file was moved)
    if (existing.file_path !== data.file_path) {
      db.prepare(`
        UPDATE library_tracks
        SET file_path = ?, last_seen_at = datetime('now'),
            storage_status = 'available', storage_device = COALESCE(?, storage_device)
        WHERE fingerprint = ?
      `).run(data.file_path, data.storage_device ?? null, data.fingerprint)
    }
    return getLibraryTrackById(existing.id)!
  }

  // Insert new pending track
  const result = db.prepare(`
    INSERT INTO library_tracks (
      fingerprint, fingerprint_duration, file_path, file_size_bytes,
      source, storage_device, analysis_status, storage_status, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'available', datetime('now'))
  `).run(
    data.fingerprint,
    data.fingerprint_duration,
    data.file_path,
    data.file_size_bytes ?? null,
    data.source,
    data.storage_device ?? null,
  )

  return getLibraryTrackById(result.lastInsertRowid as number)!
}

// Update track after analysis completes
export function updateLibraryTrackAnalysisStatus(
  id: number,
  status: 'pending' | 'analyzing' | 'analyzed' | 'failed',
): void {
  db.prepare(`
    UPDATE library_tracks
    SET analysis_status = ?
    WHERE id = ?
  `).run(status, id)
}

// Update track with analysis results
export function updateLibraryTrackAnalysisResults(
  fingerprint: string,
  data: {
    artist?: string
    title?: string
    album?: string
    label?: string
    year?: number
    bpm?: number
    key_notation?: string
    energy?: number
    genres?: string[]
    musicbrainz_id?: string
    file_path?: string
  },
): boolean {
  const updates: string[] = []
  const values: any[] = []

  if (data.artist !== undefined) { updates.push('artist = ?'); values.push(data.artist) }
  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title) }
  if (data.album !== undefined) { updates.push('album = ?'); values.push(data.album) }
  if (data.label !== undefined) { updates.push('label = ?'); values.push(data.label) }
  if (data.year !== undefined) { updates.push('year = ?'); values.push(data.year) }
  if (data.bpm !== undefined) { updates.push('bpm = ?'); values.push(data.bpm) }
  if (data.key_notation !== undefined) { updates.push('key_notation = ?'); values.push(data.key_notation) }
  if (data.energy !== undefined) { updates.push('energy = ?'); values.push(data.energy) }
  if (data.genres !== undefined) { updates.push('genres = ?'); values.push(JSON.stringify(data.genres)) }
  if (data.musicbrainz_id !== undefined) { updates.push('musicbrainz_id = ?'); values.push(data.musicbrainz_id) }
  if (data.file_path !== undefined) { updates.push('file_path = ?'); values.push(data.file_path) }

  if (updates.length === 0) return false

  updates.push('analysis_status = \'analyzed\'')
  updates.push('last_analyzed_at = datetime(\'now\')')
  values.push(fingerprint)

  const result = db.prepare(`UPDATE library_tracks SET ${updates.join(', ')} WHERE fingerprint = ?`).run(...values)
  return result.changes > 0
}

// Update library track metadata by ID (for manual editing)
export function updateLibraryTrackMetadata(
  id: number,
  data: {
    artist?: string | null
    title?: string | null
    album?: string | null
    label?: string | null
    year?: number | null
    bpm?: number | null
    key_notation?: string | null
    energy?: number | null
    genres?: string[]
  },
): LibraryTrack | undefined {
  const updates: string[] = []
  const values: any[] = []

  if (data.artist !== undefined) { updates.push('artist = ?'); values.push(data.artist) }
  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title) }
  if (data.album !== undefined) { updates.push('album = ?'); values.push(data.album) }
  if (data.label !== undefined) { updates.push('label = ?'); values.push(data.label) }
  if (data.year !== undefined) { updates.push('year = ?'); values.push(data.year) }
  if (data.bpm !== undefined) { updates.push('bpm = ?'); values.push(data.bpm) }
  if (data.key_notation !== undefined) { updates.push('key_notation = ?'); values.push(data.key_notation) }
  if (data.energy !== undefined) { updates.push('energy = ?'); values.push(data.energy) }
  if (data.genres !== undefined) { updates.push('genres = ?'); values.push(JSON.stringify(data.genres)) }

  if (updates.length === 0) return getLibraryTrackById(id)

  values.push(id)

  const result = db.prepare(`UPDATE library_tracks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  if (result.changes === 0) return undefined

  return getLibraryTrackById(id)
}

// Get library tracks by IDs (for analysis and publish operations)
export function getLibraryTracksByIds(ids: number[]): LibraryTrack[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(`SELECT * FROM library_tracks WHERE id IN (${placeholders})`).all(...ids) as LibraryTrack[]
}

// Update track after publishing to external drive
export function updateLibraryTrackPublished(
  id: number,
  newPath: string,
  storageDevice: string,
): void {
  db.prepare(`
    UPDATE library_tracks
    SET file_path = ?, storage_device = ?, storage_status = 'available', last_seen_at = datetime('now')
    WHERE id = ?
  `).run(newPath, storageDevice, id)
}

export default db

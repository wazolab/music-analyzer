import { copyFile, mkdir, unlink, writeFile, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { standardizeFilename, simplifyGenre, sanitizePath } from './filename'
import { updateLibraryTrackPublished } from './db'
import type { LibraryTrack } from './types'

export interface PublishOptions {
  tracks: LibraryTrack[]
  destinationRoot: string
  storageDevice: string
  deleteSource: boolean
}

export interface PublishResult {
  success: number
  errors: string[]
  published: Array<{
    id: number
    newPath: string
  }>
}

interface PlaylistEntries {
  byGenre: Map<string, string[]>
  byLabel: Map<string, string[]>
  byYear: Map<string, string[]>
}

/**
 * Read existing M3U playlist and return its entries
 */
async function readM3UPlaylist(path: string): Promise<Set<string>> {
  const entries = new Set<string>()
  try {
    const content = await readFile(path, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        entries.add(trimmed)
      }
    }
  }
  catch {
    // File doesn't exist yet
  }
  return entries
}

/**
 * Write M3U playlist file, merging with existing entries
 */
async function writeM3UPlaylist(path: string, entries: string[]): Promise<void> {
  const existing = await readM3UPlaylist(path)
  for (const entry of entries) {
    existing.add(entry)
  }

  const sorted = Array.from(existing).sort()
  const content = '#EXTM3U\n' + sorted.join('\n') + '\n'
  await writeFile(path, content, 'utf-8')
}

/**
 * Collect playlist entries for a track
 */
function collectPlaylistEntries(
  playlists: PlaylistEntries,
  filename: string,
  track: LibraryTrack,
): void {
  const relativePath = `../${filename}`

  // by-genre (max 3 genres)
  if (track.genres) {
    try {
      const genres = JSON.parse(track.genres) as string[]
      for (const genre of genres.slice(0, 3)) {
        const simplifiedGenre = simplifyGenre(genre)
        const key = sanitizePath(simplifiedGenre)
        if (!playlists.byGenre.has(key)) {
          playlists.byGenre.set(key, [])
        }
        playlists.byGenre.get(key)!.push(relativePath)
      }
    }
    catch {
      // Invalid genres JSON, skip
    }
  }

  // by-label
  if (track.label) {
    const key = sanitizePath(track.label)
    if (!playlists.byLabel.has(key)) {
      playlists.byLabel.set(key, [])
    }
    playlists.byLabel.get(key)!.push(relativePath)
  }

  // by-year
  if (track.year) {
    const key = String(track.year)
    if (!playlists.byYear.has(key)) {
      playlists.byYear.set(key, [])
    }
    playlists.byYear.get(key)!.push(relativePath)
  }
}

/**
 * Write all collected playlists to disk
 */
async function writeAllPlaylists(
  root: string,
  playlists: PlaylistEntries,
): Promise<void> {
  // Write genre playlists
  for (const [genre, entries] of playlists.byGenre) {
    const playlistPath = join(root, 'by-genre', `${genre}.m3u`)
    await writeM3UPlaylist(playlistPath, entries)
  }

  // Write label playlists
  for (const [label, entries] of playlists.byLabel) {
    const playlistPath = join(root, 'by-label', `${label}.m3u`)
    await writeM3UPlaylist(playlistPath, entries)
  }

  // Write year playlists
  for (const [year, entries] of playlists.byYear) {
    const playlistPath = join(root, 'by-year', `${year}.m3u`)
    await writeM3UPlaylist(playlistPath, entries)
  }
}

/**
 * Publish tracks to an external drive with organized folder structure
 *
 * Files are stored flat at the root: /destinationRoot/Artist - Title.flac
 * M3U playlists are created for organization:
 *   /destinationRoot/by-genre/Techno.m3u
 *   /destinationRoot/by-label/Drumcode.m3u
 *   /destinationRoot/by-year/2024.m3u
 *
 * This approach works on all filesystems including exFAT which doesn't support symlinks.
 */
export async function publishTracks(options: PublishOptions): Promise<PublishResult> {
  const { tracks, destinationRoot, storageDevice, deleteSource } = options

  const result: PublishResult = {
    success: 0,
    errors: [],
    published: [],
  }

  const playlists: PlaylistEntries = {
    byGenre: new Map(),
    byLabel: new Map(),
    byYear: new Map(),
  }

  // Ensure root directory exists
  await mkdir(destinationRoot, { recursive: true })

  // Create organization directories
  await mkdir(join(destinationRoot, 'by-genre'), { recursive: true })
  await mkdir(join(destinationRoot, 'by-label'), { recursive: true })
  await mkdir(join(destinationRoot, 'by-year'), { recursive: true })

  for (const track of tracks) {
    try {
      // Skip tracks without file path
      if (!track.file_path) {
        result.errors.push(`Track ${track.id}: No file path`)
        continue
      }

      // Check source file exists
      if (!existsSync(track.file_path)) {
        result.errors.push(`Track ${track.id}: Source file not found: ${track.file_path}`)
        continue
      }

      // Generate standardized filename
      const artist = track.artist || 'Unknown Artist'
      const title = track.title || basename(track.file_path, '.flac')
      const filename = standardizeFilename(artist, title)
      const destPath = join(destinationRoot, filename)

      // Check if destination already exists
      if (existsSync(destPath) && destPath !== track.file_path) {
        // File already exists at destination - handle collision
        let counter = 1
        let finalPath = destPath
        while (existsSync(finalPath) && finalPath !== track.file_path) {
          const nameWithoutExt = `${artist} - ${title} (${counter})`
          finalPath = join(destinationRoot, `${sanitizePath(nameWithoutExt)}.flac`)
          counter++
        }

        // Copy file
        await copyFile(track.file_path, finalPath)

        // Collect playlist entries
        collectPlaylistEntries(playlists, basename(finalPath), track)

        // Update database
        updateLibraryTrackPublished(track.id, finalPath, storageDevice)

        // Delete source if requested
        if (deleteSource && track.file_path !== finalPath) {
          await unlink(track.file_path)
        }

        result.success++
        result.published.push({ id: track.id, newPath: finalPath })
      }
      else if (destPath === track.file_path) {
        // Already at destination - just update playlists and DB
        collectPlaylistEntries(playlists, filename, track)
        updateLibraryTrackPublished(track.id, destPath, storageDevice)

        result.success++
        result.published.push({ id: track.id, newPath: destPath })
      }
      else {
        // Copy file to destination
        await copyFile(track.file_path, destPath)

        // Collect playlist entries
        collectPlaylistEntries(playlists, filename, track)

        // Update database
        updateLibraryTrackPublished(track.id, destPath, storageDevice)

        // Delete source if requested
        if (deleteSource) {
          await unlink(track.file_path)
        }

        result.success++
        result.published.push({ id: track.id, newPath: destPath })
      }

      console.log(`[Publish] Published: ${artist} - ${title} -> ${destPath}`)
    }
    catch (err: any) {
      const errorMsg = `Track ${track.id} (${track.artist} - ${track.title}): ${err.message}`
      result.errors.push(errorMsg)
      console.error(`[Publish] Error: ${errorMsg}`)
    }
  }

  // Write all M3U playlists
  if (result.success > 0) {
    try {
      await writeAllPlaylists(destinationRoot, playlists)
      console.log(`[Publish] Updated M3U playlists in by-genre/, by-label/, by-year/`)
    }
    catch (err: any) {
      console.error(`[Publish] Error writing playlists: ${err.message}`)
    }
  }

  return result
}

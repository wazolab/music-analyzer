import { copyFile, mkdir, rename, unlink, writeFile, rm } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { standardizeFilename, sanitizePath } from './filename'
import { updateLibraryTrackPublished, getLibraryTracksByStorageDevice } from './db'
import type { LibraryTrack } from './types'

export interface PublishOptions {
  tracks: LibraryTrack[]
  destinationRoot: string
  storageDevice: string
  deleteSource: boolean // Only deletes LOCAL source after copy, NEVER drive files
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
 * Extract genre name from "Parent---Child" format
 * Returns the child part (same as library view behavior)
 */
function extractGenreName(genre: string): string {
  if (genre.includes('---')) {
    return genre.split('---')[1] || genre
  }
  return genre
}

/**
 * Get the primary genre from a track's genres JSON string
 * Matches library view behavior
 */
function getTopGenre(genresJson: string | null): string | null {
  if (!genresJson) return null
  try {
    const genres = JSON.parse(genresJson) as string[]
    if (genres.length === 0) return null
    return extractGenreName(genres[0])
  }
  catch {
    return null
  }
}

/**
 * Write tags to a file via the analyzer API
 */
async function writeTagsToFile(filePath: string, track: LibraryTrack): Promise<boolean> {
  const analyzerUrl = process.env.ANALYZER_URL
  if (!analyzerUrl) return false

  try {
    const response = await fetch(`${analyzerUrl}/tags/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: filePath,
        artist: track.artist,
        title: track.title,
        album: track.album,
        label: track.label,
        year: track.year,
        bpm: track.bpm,
        key: track.key_notation,
        energy: track.energy,
        genres: track.genres ? JSON.parse(track.genres) : undefined,
      }),
    })

    return response.ok
  }
  catch {
    return false
  }
}

/**
 * Write M3U playlist file (complete replacement, not merge)
 */
async function writeM3UPlaylist(path: string, entries: string[]): Promise<void> {
  const sorted = Array.from(new Set(entries)).sort()
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

  // by-genre (primary genre only, matching library view behavior)
  const topGenre = getTopGenre(track.genres)
  if (topGenre) {
    const key = sanitizePath(topGenre)
    if (!playlists.byGenre.has(key)) {
      playlists.byGenre.set(key, [])
    }
    playlists.byGenre.get(key)!.push(relativePath)
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
 * Clear and rebuild all playlists from scratch
 */
async function rebuildAllPlaylists(
  root: string,
  playlists: PlaylistEntries,
): Promise<void> {
  // Clear existing playlist directories
  const genreDir = join(root, 'by-genre')
  const labelDir = join(root, 'by-label')
  const yearDir = join(root, 'by-year')

  // Remove and recreate directories to clear old playlists
  try {
    if (existsSync(genreDir)) await rm(genreDir, { recursive: true })
    if (existsSync(labelDir)) await rm(labelDir, { recursive: true })
    if (existsSync(yearDir)) await rm(yearDir, { recursive: true })
  }
  catch (err) {
    console.error('[Publish] Error clearing playlist directories:', err)
  }

  await mkdir(genreDir, { recursive: true })
  await mkdir(labelDir, { recursive: true })
  await mkdir(yearDir, { recursive: true })

  // Write genre playlists
  for (const [genre, entries] of playlists.byGenre) {
    const playlistPath = join(genreDir, `${genre}.m3u`)
    await writeM3UPlaylist(playlistPath, entries)
  }

  // Write label playlists
  for (const [label, entries] of playlists.byLabel) {
    const playlistPath = join(labelDir, `${label}.m3u`)
    await writeM3UPlaylist(playlistPath, entries)
  }

  // Write year playlists
  for (const [year, entries] of playlists.byYear) {
    const playlistPath = join(yearDir, `${year}.m3u`)
    await writeM3UPlaylist(playlistPath, entries)
  }
}

/**
 * Check if a path is on the drive (starts with destination root)
 */
function isOnDrive(filePath: string, destinationRoot: string): boolean {
  return filePath.startsWith(destinationRoot)
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
 * IMPORTANT: Files are NEVER deleted from the drive. Only local source files
 * can be deleted after successful copy (when deleteSource is true).
 *
 * Playlists are rebuilt from ALL tracks on the drive to match DB exactly.
 */
export async function publishTracks(options: PublishOptions): Promise<PublishResult> {
  const { tracks, destinationRoot, storageDevice, deleteSource } = options

  const result: PublishResult = {
    success: 0,
    errors: [],
    published: [],
  }

  // Ensure root directory exists
  await mkdir(destinationRoot, { recursive: true })

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

      // Generate standardized filename from current DB metadata
      const artist = track.artist || 'Unknown Artist'
      const title = track.title || basename(track.file_path, '.flac')
      const filename = standardizeFilename(artist, title)
      const destPath = join(destinationRoot, filename)

      // Check if track is already on the drive
      const alreadyOnDrive = isOnDrive(track.file_path, destinationRoot)

      if (alreadyOnDrive) {
        // Track is already on drive - handle rename/update
        if (track.file_path === destPath) {
          // Same path - just update tags
          await writeTagsToFile(destPath, track)
          updateLibraryTrackPublished(track.id, destPath, storageDevice)

          console.log(`[Publish] Updated tags: ${artist} - ${title}`)
        }
        else {
          // Metadata changed - need to rename file on drive
          let finalPath = destPath

          // Handle collision if new name already exists
          if (existsSync(destPath)) {
            let counter = 1
            while (existsSync(finalPath)) {
              const nameWithoutExt = `${artist} - ${title} (${counter})`
              finalPath = join(destinationRoot, `${sanitizePath(nameWithoutExt)}.flac`)
              counter++
            }
          }

          // Rename file on drive (NOT delete!)
          await rename(track.file_path, finalPath)

          // Update tags on renamed file
          await writeTagsToFile(finalPath, track)

          // Update database
          updateLibraryTrackPublished(track.id, finalPath, storageDevice)

          console.log(`[Publish] Renamed: ${basename(track.file_path)} -> ${basename(finalPath)}`)
        }

        result.success++
        result.published.push({ id: track.id, newPath: destPath })
      }
      else {
        // Track is NOT on drive yet - copy from local source
        let finalPath = destPath

        // Handle collision if destination already exists
        if (existsSync(destPath)) {
          let counter = 1
          while (existsSync(finalPath)) {
            const nameWithoutExt = `${artist} - ${title} (${counter})`
            finalPath = join(destinationRoot, `${sanitizePath(nameWithoutExt)}.flac`)
            counter++
          }
        }

        // Copy file to drive
        await copyFile(track.file_path, finalPath)

        // Update tags on the copied file to ensure they match DB
        await writeTagsToFile(finalPath, track)

        // Update database
        updateLibraryTrackPublished(track.id, finalPath, storageDevice)

        // Delete LOCAL source if requested (never delete from drive)
        if (deleteSource) {
          await unlink(track.file_path)
        }

        console.log(`[Publish] Copied: ${artist} - ${title} -> ${finalPath}`)

        result.success++
        result.published.push({ id: track.id, newPath: finalPath })
      }
    }
    catch (err: any) {
      const errorMsg = `Track ${track.id} (${track.artist} - ${track.title}): ${err.message}`
      result.errors.push(errorMsg)
      console.error(`[Publish] Error: ${errorMsg}`)
    }
  }

  // Rebuild ALL playlists from ALL tracks on the drive (not just published ones)
  // This ensures playlists match DB exactly
  try {
    const allTracksOnDrive = getLibraryTracksByStorageDevice(storageDevice)

    const playlists: PlaylistEntries = {
      byGenre: new Map(),
      byLabel: new Map(),
      byYear: new Map(),
    }

    // Collect playlist entries from ALL tracks on the drive
    for (const track of allTracksOnDrive) {
      if (track.file_path) {
        collectPlaylistEntries(playlists, basename(track.file_path), track)
      }
    }

    // Rebuild playlists completely
    await rebuildAllPlaylists(destinationRoot, playlists)
    console.log(`[Publish] Rebuilt playlists from ${allTracksOnDrive.length} tracks: ${playlists.byGenre.size} genres, ${playlists.byLabel.size} labels, ${playlists.byYear.size} years`)
  }
  catch (err: any) {
    console.error(`[Publish] Error rebuilding playlists: ${err.message}`)
  }

  return result
}

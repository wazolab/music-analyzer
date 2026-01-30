import { copyFile, mkdir, symlink, unlink, stat, lstat } from 'fs/promises'
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

/**
 * Create a symlink, handling the case where it already exists
 */
async function safeSymlink(target: string, path: string): Promise<void> {
  try {
    // Check if symlink already exists
    const stats = await lstat(path).catch(() => null)
    if (stats) {
      // Already exists - skip
      return
    }
    await symlink(target, path)
  }
  catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err
    }
  }
}

/**
 * Create organization symlinks for a track
 */
async function createOrganizationSymlinks(
  root: string,
  filename: string,
  track: LibraryTrack,
): Promise<void> {
  const relativeTarget = `../../${filename}`

  // by-genre (max 3 genres)
  if (track.genres) {
    try {
      const genres = JSON.parse(track.genres) as string[]
      for (const genre of genres.slice(0, 3)) {
        const simplifiedGenre = simplifyGenre(genre)
        const genreDir = join(root, 'by-genre', sanitizePath(simplifiedGenre))
        await mkdir(genreDir, { recursive: true })
        await safeSymlink(relativeTarget, join(genreDir, filename))
      }
    }
    catch {
      // Invalid genres JSON, skip
    }
  }

  // by-label
  if (track.label) {
    const labelDir = join(root, 'by-label', sanitizePath(track.label))
    await mkdir(labelDir, { recursive: true })
    await safeSymlink(relativeTarget, join(labelDir, filename))
  }

  // by-year
  if (track.year) {
    const yearDir = join(root, 'by-year', String(track.year))
    await mkdir(yearDir, { recursive: true })
    await safeSymlink(relativeTarget, join(yearDir, filename))
  }
}

/**
 * Publish tracks to an external drive with organized folder structure
 *
 * Files are stored flat at the root: /destinationRoot/Artist - Title.flac
 * Symlinks are created for organization:
 *   /destinationRoot/by-genre/Techno/Artist - Title.flac -> ../../Artist - Title.flac
 *   /destinationRoot/by-label/Drumcode/Artist - Title.flac -> ../../Artist - Title.flac
 *   /destinationRoot/by-year/2024/Artist - Title.flac -> ../../Artist - Title.flac
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

        // Create symlinks
        await createOrganizationSymlinks(destinationRoot, basename(finalPath), track)

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
        // Already at destination - just update symlinks and DB
        await createOrganizationSymlinks(destinationRoot, filename, track)
        updateLibraryTrackPublished(track.id, destPath, storageDevice)

        result.success++
        result.published.push({ id: track.id, newPath: destPath })
      }
      else {
        // Copy file to destination
        await copyFile(track.file_path, destPath)

        // Create symlinks
        await createOrganizationSymlinks(destinationRoot, filename, track)

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

  return result
}

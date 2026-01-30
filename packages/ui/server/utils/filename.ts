import { dirname, join, basename } from 'path'
import { renameSync, existsSync } from 'fs'

/**
 * Sanitize a string for use in filenames
 * Removes invalid characters and normalizes whitespace
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

/**
 * Generate a standardized filename from artist and title
 * Format: "Artist - Title.flac"
 */
export function standardizeFilename(artist: string, title: string): string {
  const sanitizedArtist = sanitizeFilename(artist)
  const sanitizedTitle = sanitizeFilename(title)
  return `${sanitizedArtist} - ${sanitizedTitle}.flac`
}

/**
 * Rename a track file to the standardized format
 * Returns the new path, or the current path if no rename was needed
 */
export function renameTrackFile(
  currentPath: string,
  artist: string,
  title: string,
): string {
  // Skip if artist or title is missing
  if (!artist || !title) {
    return currentPath
  }

  const dir = dirname(currentPath)
  const newFilename = standardizeFilename(artist, title)
  const newPath = join(dir, newFilename)

  // Skip if already named correctly
  if (currentPath === newPath) {
    return currentPath
  }

  // Handle filename conflicts by adding a number suffix
  let finalPath = newPath
  let counter = 1
  while (existsSync(finalPath) && finalPath !== currentPath) {
    const nameWithoutExt = `${sanitizeFilename(artist)} - ${sanitizeFilename(title)} (${counter})`
    finalPath = join(dir, `${nameWithoutExt}.flac`)
    counter++
  }

  // Perform the rename
  try {
    renameSync(currentPath, finalPath)
    return finalPath
  }
  catch (err) {
    // If rename fails, return original path
    console.error(`Failed to rename ${currentPath} to ${finalPath}:`, err)
    return currentPath
  }
}

/**
 * Extract artist and title from a filename
 * Handles common formats like "Artist - Title.flac" or "01 - Artist - Title.flac"
 */
export function parseFilename(filename: string): { artist: string | null, title: string | null } {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(flac|mp3|wav|m4a|aiff|ogg)$/i, '')

  // Try "Artist - Title" format
  const dashMatch = nameWithoutExt.match(/^(.+?)\s*-\s*(.+)$/)
  if (dashMatch) {
    // Check if first part is a track number
    if (/^\d{1,3}$/.test(dashMatch[1].trim())) {
      // Format: "01 - Title" or "01 - Artist - Title"
      const secondPart = dashMatch[2]
      const secondDash = secondPart.match(/^(.+?)\s*-\s*(.+)$/)
      if (secondDash) {
        return { artist: secondDash[1].trim(), title: secondDash[2].trim() }
      }
      // Just "01 - Title"
      return { artist: null, title: secondPart.trim() }
    }
    // Standard "Artist - Title" format
    return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() }
  }

  // No dash found, use whole name as title
  return { artist: null, title: nameWithoutExt.trim() }
}

/**
 * Simplify a genre string for folder names
 * "Hip Hop---Boom Bap" → "Boom Bap"
 * "Electronic - House" → "House"
 */
export function simplifyGenre(genre: string): string {
  // Handle "Parent---Child" format (Discogs style)
  if (genre.includes('---')) {
    return genre.split('---').pop()!.trim()
  }
  // Handle "Parent - Child" format
  if (genre.includes(' - ')) {
    return genre.split(' - ').pop()!.trim()
  }
  return genre.trim()
}

/**
 * Sanitize a path segment (folder name)
 */
export function sanitizePath(segment: string): string {
  return segment
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/---/g, ' - ') // Convert genre separators
    .replace(/\s+/g, ' ')
    .trim()
}

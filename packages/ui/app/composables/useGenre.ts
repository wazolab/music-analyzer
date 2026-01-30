/**
 * Utility functions for genre parsing and extraction
 */

/**
 * Parse genres from a track's genres field (string or array)
 * Returns an array of genre strings
 */
export function parseGenres(genres: string | string[] | null | undefined): string[] {
  if (!genres) return []
  if (Array.isArray(genres)) return genres
  try {
    const parsed = JSON.parse(genres)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Extract the display name from a genre string
 * Handles "Parent---Child" format, returning the child (e.g., "Techno" from "Electronic---Techno")
 */
export function extractGenreName(genre: string): string {
  if (genre.includes('---')) {
    return genre.split('---')[1] || genre
  }
  return genre
}

/**
 * Get the primary genre name from a track's genres field
 * Returns null if no genres available
 */
export function getTopGenre(genres: string | string[] | null | undefined): string | null {
  const parsed = parseGenres(genres)
  if (parsed.length === 0) return null
  return extractGenreName(parsed[0])
}

/**
 * Check if a track's genres match a filter value
 */
export function matchesGenreFilter(genres: string | string[] | null | undefined, filterValue: string): boolean {
  if (!filterValue) return true
  const parsed = parseGenres(genres)
  return parsed.some(g => g.includes(filterValue) || extractGenreName(g) === filterValue)
}

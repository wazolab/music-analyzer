/**
 * Utility functions for search text processing
 */

/**
 * Clean text for Soulseek or other search engines
 * Removes special characters and normalizes whitespace
 */
export function cleanForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

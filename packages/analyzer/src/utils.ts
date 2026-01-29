import chalk from 'chalk';
import path from 'path';

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function log(message: string): void {
  console.log(message);
}

export function logSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function logWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

export function logError(message: string): void {
  console.log(chalk.red('✗'), message);
}

export function logInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function getOutputFilename(artist: string, title: string): string {
  const sanitizedArtist = sanitizeFilename(artist || 'Unknown Artist');
  const sanitizedTitle = sanitizeFilename(title || 'Unknown Title');
  return `${sanitizedArtist} - ${sanitizedTitle}.flac`;
}

export async function ensureUniqueFilename(
  targetPath: string,
  checkExists: (path: string) => Promise<boolean>
): Promise<string> {
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  const dir = path.dirname(targetPath);

  let finalPath = targetPath;
  let counter = 1;

  while (await checkExists(finalPath)) {
    finalPath = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  }

  return finalPath;
}

export function formatGenre(genre: string): string {
  return genre
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => {
      // Keep common acronyms/abbreviations uppercase
      const lower = word.toLowerCase();
      if (['dj', 'edm', 'uk', 'dnb', 'idm'].includes(lower)) {
        return word.toUpperCase();
      }
      // Handle connectors
      if (lower === 'n' || lower === '&') {
        return lower;
      }
      // Title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parsed filename components
 */
export interface ParsedFilename {
  label?: string;
  artist?: string;
  title?: string;
}

/**
 * Keywords that suggest a string is a record label name
 */
const LABEL_KEYWORDS = [
  'records',
  'recordings',
  'music',
  'audio',
  'label',
  'digital',
  'productions',
  'sound',
  'studio',
  'entertainment',
  'media',
];

/**
 * Check if a string looks like a record label name.
 * Uses keyword matching and common label naming patterns.
 */
export function isLikelyLabel(text: string): boolean {
  if (!text || text.length < 2) {
    return false;
  }

  const lower = text.toLowerCase();

  // Check for label keywords
  if (LABEL_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }

  // Check for common label suffix patterns (e.g., "XYZ Recs", "ABC Rec")
  if (/\brecs?\b/i.test(text)) {
    return true;
  }

  // Labels often end with specific suffixes
  const labelSuffixes = [
    'records',
    'recordings',
    'rec',
    'recs',
    'music',
    'audio',
    'digital',
  ];
  for (const suffix of labelSuffixes) {
    if (lower.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a filename to extract label, artist, and title.
 *
 * Supported patterns:
 * 1. "Artist - Title [Label]" or "Artist - Title (Label)" (only if bracket content looks like a label)
 * 2. "Label - Artist - Title" (when first part looks like a label)
 * 3. "Artist - Title" (no label)
 * 4. "Title" (no separator, just the filename)
 */
export function parseFilename(filename: string): ParsedFilename {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

  const result: ParsedFilename = {};

  // Pattern 1: Check for label in brackets at the end "[Label]" or "(Label)"
  // Only treat as label if the bracketed content looks like a label name
  const bracketMatch = nameWithoutExt.match(
    /^(.+?)\s*[\[(]([^\])]+)[\])]\s*$/
  );
  if (bracketMatch) {
    const beforeBracket = bracketMatch[1].trim();
    const inBracket = bracketMatch[2].trim();

    // Only use bracketed content as label if it looks like a label
    if (isLikelyLabel(inBracket)) {
      result.label = inBracket;

      // Parse the rest for artist - title
      const dashParts = beforeBracket.split(/\s+-\s+/);
      if (dashParts.length >= 2) {
        result.artist = dashParts[0].trim();
        result.title = dashParts.slice(1).join(' - ').trim();
      } else {
        result.title = beforeBracket;
      }

      return result;
    }
    // Otherwise, fall through to check other patterns (bracket is probably remix info, etc.)
  }

  // Split by " - " delimiter
  const parts = nameWithoutExt.split(/\s+-\s+/);

  if (parts.length >= 3) {
    // Pattern 2: "Label - Artist - Title" - check if first part looks like a label
    if (isLikelyLabel(parts[0])) {
      result.label = parts[0].trim();
      result.artist = parts[1].trim();
      result.title = parts.slice(2).join(' - ').trim();
      return result;
    }

    // Otherwise assume "Artist - Title - Remix" or similar
    result.artist = parts[0].trim();
    result.title = parts.slice(1).join(' - ').trim();
    return result;
  }

  if (parts.length === 2) {
    // Pattern 3: "Artist - Title"
    result.artist = parts[0].trim();
    result.title = parts[1].trim();
    return result;
  }

  // Pattern 4: Just the filename as title
  result.title = nameWithoutExt.trim();
  return result;
}

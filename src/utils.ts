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
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

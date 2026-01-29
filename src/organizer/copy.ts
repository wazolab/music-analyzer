import fs from 'fs/promises';
import path from 'path';
import { OutputPaths, TrackAnalysis } from '../types.js';
import { sanitizeFilename, ensureUniqueFilename, formatGenre } from '../utils.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function generateOutputPaths(
  outputDir: string,
  analysis: TrackAnalysis
): OutputPaths {
  const { metadata, analysis: audioAnalysis } = analysis;

  const filename = getOutputFilename(metadata.artist, metadata.title);

  // By year
  const year = metadata.year ? String(metadata.year) : 'unknown';
  const byYear = path.join(outputDir, 'by-year', year, filename);

  // By genre
  const genre =
    audioAnalysis.genres.length > 0
      ? sanitizeFilename(formatGenre(audioAnalysis.genres[0]))
      : 'unknown';
  const byGenre = path.join(outputDir, 'by-genre', genre, filename);

  // By label
  const label = metadata.label
    ? sanitizeFilename(metadata.label)
    : 'unknown';
  const byLabel = path.join(outputDir, 'by-label', label, filename);

  return { byYear, byGenre, byLabel };
}

function getOutputFilename(artist: string, title: string): string {
  const sanitizedArtist = sanitizeFilename(artist || 'Unknown Artist');
  const sanitizedTitle = sanitizeFilename(title || 'Unknown Title');
  return `${sanitizedArtist} - ${sanitizedTitle}.flac`;
}

export async function copyToOrganizedFolders(
  sourcePath: string,
  outputPaths: OutputPaths,
  dryRun: boolean = false
): Promise<{ success: boolean; paths: string[] }> {
  const copiedPaths: string[] = [];

  // Primary copy goes to by-label folder
  const primaryPath = outputPaths.byLabel;
  const uniquePrimaryPath = await ensureUniqueFilename(primaryPath, fileExists);

  if (!dryRun) {
    const primaryDir = path.dirname(uniquePrimaryPath);
    await fs.mkdir(primaryDir, { recursive: true });
    await fs.copyFile(sourcePath, uniquePrimaryPath);
  }
  copiedPaths.push(uniquePrimaryPath);

  // Create symlinks for by-year and by-genre pointing to by-label
  // Falls back to copy if symlinks aren't supported (e.g., FAT32/exFAT)
  const symlinkTargets = [
    { category: 'byYear', targetPath: outputPaths.byYear },
    { category: 'byGenre', targetPath: outputPaths.byGenre },
  ];

  for (const { category, targetPath } of symlinkTargets) {
    try {
      const uniquePath = await ensureUniqueFilename(targetPath, fileExists);

      if (dryRun) {
        copiedPaths.push(uniquePath);
        continue;
      }

      const targetDir = path.dirname(uniquePath);
      await fs.mkdir(targetDir, { recursive: true });

      // Try symlink first, fall back to copy if not supported
      try {
        const relativePath = path.relative(targetDir, uniquePrimaryPath);
        await fs.symlink(relativePath, uniquePath);
      } catch (symlinkError: any) {
        // EPERM = symlinks not supported (FAT32/exFAT), fall back to copy
        if (symlinkError.code === 'EPERM' || symlinkError.code === 'ENOTSUP') {
          await fs.copyFile(uniquePrimaryPath, uniquePath);
        } else {
          throw symlinkError;
        }
      }
      copiedPaths.push(uniquePath);
    } catch (error) {
      console.error(`Failed to create link for ${category}:`, error);
      return { success: false, paths: copiedPaths };
    }
  }

  return { success: true, paths: copiedPaths };
}

export async function createOutputStructure(outputDir: string): Promise<void> {
  const directories = [
    path.join(outputDir, 'by-year'),
    path.join(outputDir, 'by-genre'),
    path.join(outputDir, 'by-label'),
  ];

  for (const dir of directories) {
    await fs.mkdir(dir, { recursive: true });
  }
}

export interface OrganizationSummary {
  totalFiles: number;
  byYear: Map<string, number>;
  byGenre: Map<string, number>;
  byLabel: Map<string, number>;
}

export function createOrganizationSummary(): OrganizationSummary {
  return {
    totalFiles: 0,
    byYear: new Map(),
    byGenre: new Map(),
    byLabel: new Map(),
  };
}

export function updateSummary(
  summary: OrganizationSummary,
  analysis: TrackAnalysis
): void {
  summary.totalFiles++;

  const { metadata, analysis: audioAnalysis } = analysis;

  // Year
  const year = metadata.year ? String(metadata.year) : 'unknown';
  summary.byYear.set(year, (summary.byYear.get(year) || 0) + 1);

  // Genre
  const genre =
    audioAnalysis.genres.length > 0
      ? formatGenre(audioAnalysis.genres[0])
      : 'unknown';
  summary.byGenre.set(genre, (summary.byGenre.get(genre) || 0) + 1);

  // Label
  const label = metadata.label || 'unknown';
  summary.byLabel.set(label, (summary.byLabel.get(label) || 0) + 1);
}

export function formatSummary(summary: OrganizationSummary): string {
  const lines: string[] = [
    `\nOrganization Summary`,
    `${'='.repeat(50)}`,
    `Total files processed: ${summary.totalFiles}`,
    '',
    'By Year:',
    ...Array.from(summary.byYear.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, count]) => `  ${year}: ${count} files`),
    '',
    'By Genre:',
    ...Array.from(summary.byGenre.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([genre, count]) => `  ${genre}: ${count} files`),
    '',
    'By Label:',
    ...Array.from(summary.byLabel.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => `  ${label}: ${count} files`),
  ];

  return lines.join('\n');
}

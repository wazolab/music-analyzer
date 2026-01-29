import path from 'path';
import { glob } from 'glob';
import ora from 'ora';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

import { AnalyzeOptions, TrackAnalysis, MetadataLookup } from './types.js';
import { analyzeAudio, ensureModelsDownloaded } from './analyzers/audio.js';
import { analyzeBeatGrid } from './analyzers/beatgrid.js';
import { checkFpcalcInstalled } from './analyzers/fingerprint.js';
import { readFlacTags } from './metadata/reader.js';
import { writeFlacTags, writeAnalysisTags } from './metadata/writer.js';
import { lookupByFingerprint, searchByMetadata } from './metadata/musicbrainz.js';
import {
  generateOutputPaths,
  copyToOrganizedFolders,
  createOutputStructure,
  createOrganizationSummary,
  updateSummary,
  formatSummary,
} from './organizer/copy.js';
import { logSuccess, logWarning, logError, logInfo } from './utils.js';

export async function runPipeline(
  inputDir: string,
  options: AnalyzeOptions
): Promise<void> {
  const spinner = ora();

  // Check prerequisites
  spinner.start('Checking prerequisites...');

  const hasFpcalc = await checkFpcalcInstalled();
  if (!hasFpcalc && !options.skipLookup) {
    spinner.warn(
      'fpcalc not found. Install with: sudo apt install libchromaprint-tools'
    );
    logWarning('Fingerprint lookup will be skipped');
  }

  if (!options.skipAnalysis) {
    spinner.text = 'Downloading Essentia models if needed...';
    await ensureModelsDownloaded();
  }

  spinner.succeed('Prerequisites checked');

  // Find FLAC files
  spinner.start('Scanning for FLAC files...');
  const flacPattern = path.join(inputDir, '**/*.flac');
  const files = await glob(flacPattern, { nocase: true });

  if (files.length === 0) {
    spinner.fail('No FLAC files found');
    return;
  }

  spinner.succeed(`Found ${files.length} FLAC files`);

  // Create output structure
  if (!options.dryRun) {
    await createOutputStructure(options.output);
  }

  // Process files
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        'Processing |' +
        chalk.cyan('{bar}') +
        '| {percentage}% | {value}/{total} files | {filename}',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  progressBar.start(files.length, 0, { filename: '' });

  const summary = createOrganizationSummary();
  const errors: Array<{ file: string; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const filename = path.basename(filePath);

    progressBar.update(i, { filename });

    try {
      const result = await processFile(filePath, options, hasFpcalc);

      if (result) {
        updateSummary(summary, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ file: filename, error: message });
    }

    progressBar.update(i + 1, { filename });
  }

  progressBar.stop();

  // Print summary
  console.log(formatSummary(summary));

  if (errors.length > 0) {
    console.log(chalk.red(`\n${errors.length} files failed:`));
    for (const { file, error } of errors) {
      console.log(`  ${file}: ${error}`);
    }
  }

  if (options.dryRun) {
    logInfo('Dry run completed. No files were copied.');
  } else {
    logSuccess(`Files organized to: ${options.output}`);
  }
}

async function processFile(
  filePath: string,
  options: AnalyzeOptions,
  hasFpcalc: boolean
): Promise<TrackAnalysis | null> {
  const filename = path.basename(filePath);

  // Read existing tags
  const existingTags = await readFlacTags(filePath);

  // Audio analysis
  let analysis;
  if (!options.skipAnalysis) {
    analysis = await analyzeAudio(filePath);
    const beatGridAnalysis = analyzeBeatGrid(
      analysis.beatGrid.beatPositions,
      analysis.bpm
    );
    analysis.beatGrid = beatGridAnalysis;
  } else {
    // Use placeholder analysis from existing tags
    analysis = {
      bpm: existingTags.bpm || 0,
      key: existingTags.key || 'Unknown',
      camelotKey: '',
      energy: 0,
      genres: existingTags.genre || [],
      beatGrid: {
        firstBeatMs: 0,
        beatPositions: [],
      },
    };
  }

  // Metadata lookup
  let metadata: MetadataLookup = {
    title: existingTags.title || path.basename(filePath, '.flac'),
    artist: existingTags.artist || 'Unknown Artist',
    album: existingTags.album,
    year: existingTags.year,
    label: existingTags.label,
    mbRecordingId: existingTags.musicbrainzTrackId,
  };

  if (!options.skipLookup && hasFpcalc) {
    // Try fingerprint lookup
    const lookupResult = await lookupByFingerprint(filePath);

    if (lookupResult) {
      metadata = {
        ...metadata,
        ...lookupResult,
      };
    } else if (existingTags.title && existingTags.artist) {
      // Fall back to metadata search
      const searchResult = await searchByMetadata(
        existingTags.title,
        existingTags.artist
      );
      if (searchResult) {
        metadata = {
          ...metadata,
          ...searchResult,
        };
      }
    }
  }

  // Use existing genre if no genre from analysis
  if (analysis.genres.length === 0 && existingTags.genre) {
    analysis.genres = existingTags.genre;
  }

  const trackAnalysis: TrackAnalysis = {
    path: filePath,
    filename,
    analysis,
    metadata,
    outputPaths: { byYear: '', byGenre: '', byLabel: '' },
  };

  // Generate output paths
  trackAnalysis.outputPaths = generateOutputPaths(options.output, trackAnalysis);

  // Write tags to source file (before copying)
  if (!options.dryRun) {
    if (!options.skipAnalysis) {
      await writeFlacTags(filePath, analysis, metadata);
    } else if (!options.skipLookup) {
      // Only write metadata tags if analysis was skipped but lookup was done
      await writeAnalysisTags(filePath, analysis);
    }
  }

  // Copy to organized folders
  if (!options.dryRun) {
    const { success } = await copyToOrganizedFolders(
      filePath,
      trackAnalysis.outputPaths,
      options.dryRun
    );

    if (!success) {
      throw new Error('Failed to copy file to organized folders');
    }
  }

  return trackAnalysis;
}

export async function showStatus(): Promise<void> {
  const spinner = ora();

  spinner.start('Checking system status...');

  // Check fpcalc
  const hasFpcalc = await checkFpcalcInstalled();

  spinner.stop();

  console.log('\nSystem Status:');
  console.log('==============');

  if (hasFpcalc) {
    logSuccess('fpcalc: installed');
  } else {
    logError(
      'fpcalc: not found (install with: sudo apt install libchromaprint-tools)'
    );
  }

  // Check for ffmpeg
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('ffmpeg', ['-version']);
    logSuccess('ffmpeg: installed');
  } catch {
    logError('ffmpeg: not found (required for audio decoding)');
  }

  // Check AcoustID API key
  if (
    process.env.ACOUSTID_API_KEY &&
    process.env.ACOUSTID_API_KEY !== 'xxxxxxxx'
  ) {
    logSuccess('AcoustID API key: configured');
  } else {
    logWarning(
      'AcoustID API key: not configured (set ACOUSTID_API_KEY environment variable)'
    );
  }

  console.log('\nUsage:');
  console.log('  music-analyzer analyze <input-folder> -o <output-folder>');
  console.log('  music-analyzer analyze ./music --dry-run');
}

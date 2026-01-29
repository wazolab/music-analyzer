import path from 'path';
import { glob } from 'glob';
import ora from 'ora';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import pLimit from 'p-limit';

import { AnalyzeOptions, TrackAnalysis, MetadataLookup } from './types.js';
import {
  analyzeAudio,
  analyzeAudioWithWorker,
  ensureModelsDownloaded,
  initializeWorkerPool,
  terminateWorkerPool,
} from './analyzers/audio.js';
import { analyzeBeatGrid } from './analyzers/beatgrid.js';
import { readFlacTags } from './metadata/reader.js';
import { writeFlacTags, writeAnalysisTags } from './metadata/writer.js';
import { lookupMetadata, getMetadataSourcesStatus } from './metadata/lookup.js';
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

  const sourcesStatus = await getMetadataSourcesStatus();
  if (!options.skipLookup) {
    const availableSources = Object.entries(sourcesStatus)
      .filter(([, status]) => status.available)
      .map(([name]) => name);
    if (availableSources.length > 0) {
      logInfo(`Metadata sources: ${availableSources.join(', ')}`);
    }
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

  const CONCURRENCY = options.concurrency || 4;
  logInfo(`Processing with ${CONCURRENCY} concurrent workers`);

  // Initialize worker pool if workers enabled
  if (options.useWorkers && !options.skipAnalysis) {
    spinner.start('Initializing worker threads...');
    await initializeWorkerPool(CONCURRENCY);
    spinner.succeed(`Worker pool initialized (${CONCURRENCY} threads)`);
  }

  // Create output structure
  if (!options.dryRun) {
    await createOutputStructure(options.output);
  }

  // Process files in parallel
  const limit = pLimit(CONCURRENCY);

  const progressBar = new cliProgress.SingleBar(
    {
      format:
        'Processing |' +
        chalk.cyan('{bar}') +
        `| {percentage}% | {value}/{total} files | ${CONCURRENCY} concurrent`,
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  progressBar.start(files.length, 0);

  const summary = createOrganizationSummary();
  const errors: Array<{ file: string; error: string }> = [];
  let completed = 0;

  const processWithLimit = async (filePath: string) => {
    const filename = path.basename(filePath);

    try {
      const result = await processFile(filePath, options);

      if (result) {
        updateSummary(summary, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ file: filename, error: message });
    }

    completed++;
    progressBar.update(completed);
  };

  // Process all files with concurrency limit
  await Promise.all(files.map((filePath) => limit(() => processWithLimit(filePath))));

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

  // Cleanup worker pool if used
  if (options.useWorkers && !options.skipAnalysis) {
    await terminateWorkerPool();
  }
}

async function processFile(
  filePath: string,
  options: AnalyzeOptions
): Promise<TrackAnalysis | null> {
  const filename = path.basename(filePath);

  // Read existing tags
  const existingTags = await readFlacTags(filePath);

  // Audio analysis
  let analysis;
  if (!options.skipAnalysis) {
    // Use worker threads if enabled, otherwise main thread
    analysis = options.useWorkers
      ? await analyzeAudioWithWorker(filePath)
      : await analyzeAudio(filePath);
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

  if (!options.skipLookup) {
    // Try unified metadata lookup (Beatport -> Bandcamp -> MusicBrainz)
    const lookupResult = await lookupMetadata(
      metadata.title,
      metadata.artist,
      { audioPath: filePath }
    );

    if (lookupResult) {
      metadata = {
        ...metadata,
        ...lookupResult,
      };

      // Use BPM/key from Beatport if available and analysis was skipped
      if (options.skipAnalysis) {
        if (lookupResult.bpm) {
          analysis.bpm = lookupResult.bpm;
        }
        if (lookupResult.key) {
          analysis.key = lookupResult.key;
        }
      }

      // Use genres from lookup if analysis didn't find any
      if (analysis.genres.length === 0 && lookupResult.genres) {
        analysis.genres = lookupResult.genres;
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

  // Check metadata sources
  const sourcesStatus = await getMetadataSourcesStatus();

  // Check for ffmpeg
  let hasFFmpeg = false;
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('ffmpeg', ['-version']);
    hasFFmpeg = true;
  } catch {
    hasFFmpeg = false;
  }

  spinner.stop();

  console.log('\nSystem Status:');
  console.log('==============');

  // Audio processing
  console.log('\nAudio Processing:');
  if (hasFFmpeg) {
    logSuccess('ffmpeg: installed');
  } else {
    logError('ffmpeg: not found (required for audio decoding)');
  }

  // Metadata sources
  console.log('\nMetadata Sources:');
  for (const [source, status] of Object.entries(sourcesStatus)) {
    if (status.available) {
      logSuccess(`${source}: ${status.reason}`);
    } else {
      logWarning(`${source}: ${status.reason}`);
    }
  }

  // Beatport API (optional)
  if (process.env.BEATPORT_CLIENT_ID) {
    logSuccess('Beatport API: credentials configured');
  } else {
    logInfo('Beatport API: using web scraping (API credentials optional)');
  }

  console.log('\nUsage:');
  console.log('  music-analyzer analyze <input-folder> -o <output-folder>');
  console.log('  music-analyzer analyze ./music --dry-run');
  console.log('  music-analyzer analyze ./music --skip-lookup');
}

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
import { readFlacTags, getMetadataFromFilename } from './metadata/reader.js';
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
import { logSuccess, logWarning, logError, logInfo, isLikelyLabel } from './utils.js';

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

  // Parse filename for additional metadata
  const filenameMetadata = getMetadataFromFilename(filePath);

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

  // Build initial metadata from tags and filename parsing
  // Handle mislabeled files where artist tag contains the label name
  // and title tag contains "Artist - Title"
  let resolvedArtist = existingTags.artist;
  let resolvedTitle = existingTags.title;
  let resolvedLabel = existingTags.label || filenameMetadata.label;

  // Detect mislabeled metadata: artist looks like a label, title contains " - "
  if (
    existingTags.artist &&
    existingTags.title &&
    isLikelyLabel(existingTags.artist) &&
    existingTags.title.includes(' - ')
  ) {
    // Title probably contains "Artist - Title"
    const titleParts = existingTags.title.split(/\s+-\s+/);
    if (titleParts.length >= 2) {
      resolvedArtist = titleParts[0].trim();
      resolvedTitle = titleParts.slice(1).join(' - ').trim();
      // Use the artist tag as label if no label is set
      if (!resolvedLabel) {
        resolvedLabel = existingTags.artist;
      }
    }
  }

  // Fall back to filename-parsed values if tags are missing
  let metadata: MetadataLookup = {
    title: resolvedTitle || filenameMetadata.title || path.basename(filePath, '.flac'),
    artist: resolvedArtist || filenameMetadata.artist || 'Unknown Artist',
    album: existingTags.album,
    year: existingTags.year,
    label: resolvedLabel,
    mbRecordingId: existingTags.musicbrainzTrackId,
  };

  // Store ML genres before lookup (for fallback)
  const mlGenres = [...analysis.genres];
  const mlGenreConfidences = analysis.genreConfidences ? [...analysis.genreConfidences] : [];

  // Lookup metadata from external services
  let lookupGenres: string[] = [];
  let lookupLabel: string | undefined;

  if (!options.skipLookup) {
    // Try unified metadata lookup (Beatport -> Bandcamp -> MusicBrainz)
    const lookupResult = await lookupMetadata(metadata.title, metadata.artist, {
      audioPath: filePath,
    });

    if (lookupResult) {
      // Store lookup results for genre/label priority logic
      lookupGenres = lookupResult.genres || [];
      lookupLabel = lookupResult.label;

      // Update metadata with lookup results
      metadata = {
        ...metadata,
        title: lookupResult.title || metadata.title,
        artist: lookupResult.artist || metadata.artist,
        album: lookupResult.album || metadata.album,
        year: lookupResult.year || metadata.year,
        mbRecordingId: lookupResult.mbRecordingId || metadata.mbRecordingId,
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
    }
  }

  // Genre priority: metadata from lookup (Beatport/Bandcamp) > ML + heuristics > existing tags
  if (lookupGenres.length > 0) {
    // Use genres from external lookup (most reliable for electronic music)
    analysis.genres = lookupGenres;
  } else if (mlGenres.length > 0) {
    // Fall back to ML + heuristic genres
    analysis.genres = mlGenres;
    analysis.genreConfidences = mlGenreConfidences;
  } else if (existingTags.genre && existingTags.genre.length > 0) {
    // Fall back to existing tags
    analysis.genres = existingTags.genre;
  }

  // Label priority: lookup > filename parsed > existing tags
  // Final label resolution
  metadata.label = lookupLabel || filenameMetadata.label || existingTags.label;

  const trackAnalysis: TrackAnalysis = {
    path: filePath,
    filename,
    analysis,
    metadata,
    outputPaths: { byYear: '', byGenre: '', byLabel: '' },
  };

  // Generate output paths (uses standardized filename: "Artist - Title.flac")
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

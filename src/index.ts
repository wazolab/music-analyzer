#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { runPipeline, showStatus } from './pipeline.js';
import { AnalyzeOptions } from './types.js';
import { extractPlaylist, formatTrackList, formatTrackListJson } from './importers/playlist.js';
import { SlskdClient, downloadPlaylist } from './importers/slskd.js';

const program = new Command();

program
  .name('music-analyzer')
  .description('FLAC music analysis and organization pipeline')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze and organize FLAC files')
  .argument('<input>', 'Input folder containing FLAC files')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--dry-run', 'Show what would be done without copying', false)
  .option('--skip-lookup', 'Skip MusicBrainz lookup, use existing tags', false)
  .option('--skip-analysis', 'Skip audio analysis, only organize', false)
  .option('-c, --concurrency <n>', 'Number of files to process in parallel', '4')
  .option('-w, --workers', 'Use worker threads for CPU-intensive analysis', false)
  .action(async (input: string, opts) => {
    const inputDir = path.resolve(input);
    const options: AnalyzeOptions = {
      output: path.resolve(opts.output),
      dryRun: opts.dryRun,
      skipLookup: opts.skipLookup,
      skipAnalysis: opts.skipAnalysis,
      concurrency: parseInt(opts.concurrency, 10),
      useWorkers: opts.workers,
    };

    try {
      await runPipeline(inputDir, options);
    } catch (error) {
      console.error('Pipeline failed:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check system status and dependencies')
  .action(async () => {
    await showStatus();
  });

program
  .command('import-playlist')
  .description('Import track list from SoundCloud playlist')
  .argument('<url>', 'SoundCloud playlist URL')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('--json', 'Output as JSON', false)
  .action(async (url: string, opts) => {
    try {
      console.error('Extracting playlist...');
      const tracks = await extractPlaylist(url);

      if (tracks.length === 0) {
        console.error('No tracks found in playlist');
        process.exit(1);
      }

      console.error(`Found ${tracks.length} tracks\n`);

      const output = opts.json ? formatTrackListJson(tracks) : formatTrackList(tracks);

      if (opts.output) {
        await fs.writeFile(opts.output, output);
        console.error(`Saved to ${opts.output}`);
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error('Import failed:', error);
      process.exit(1);
    }
  });

program
  .command('slskd-search')
  .description('Search and download FLAC tracks from slskd')
  .argument('<input>', 'Tracklist file (from import-playlist --json) or SoundCloud URL')
  .option('--url <url>', 'slskd API URL', 'http://localhost:5030')
  .option('--api-key <key>', 'slskd API key (or set SLSKD_API_KEY env)')
  .option('--username <user>', 'slskd username (or set SLSKD_USERNAME env)')
  .option('--password <pass>', 'slskd password (or set SLSKD_PASSWORD env)')
  .option('--auto-download', 'Automatically queue best FLAC result', false)
  .option('--timeout <ms>', 'Search timeout per track in ms', '30000')
  .action(async (input: string, opts) => {
    try {
      // Load tracks
      let tracks;
      if (input.startsWith('http')) {
        console.log('Extracting playlist from URL...');
        tracks = await extractPlaylist(input);
      } else {
        const content = await fs.readFile(input, 'utf-8');
        tracks = JSON.parse(content);
      }

      if (!tracks || tracks.length === 0) {
        console.error('No tracks found');
        process.exit(1);
      }

      console.log(`Loaded ${tracks.length} tracks\n`);

      // Connect to slskd
      const apiKey = opts.apiKey || process.env.SLSKD_API_KEY;
      const username = opts.username || process.env.SLSKD_USERNAME;
      const password = opts.password || process.env.SLSKD_PASSWORD;

      const client = new SlskdClient({
        baseUrl: opts.url,
        apiKey,
        username,
        password,
      });

      // Check connection
      const isConnected = await client.ping();
      if (!isConnected) {
        console.error(`Cannot connect to slskd at ${opts.url}`);
        console.error('Make sure slskd is running and API is enabled');
        process.exit(1);
      }

      console.log(`Connected to slskd at ${opts.url}\n`);

      // Search for tracks
      const results = await downloadPlaylist(client, tracks, {
        autoDownload: opts.autoDownload,
        searchTimeout: parseInt(opts.timeout, 10),
        onProgress: (current, total, track, status) => {
          const pct = Math.round((current / total) * 100);
          console.log(`[${pct}%] ${track.artist} - ${track.title}: ${status}`);
        },
      });

      // Summary
      console.log('\n--- Summary ---');
      let found = 0;
      let notFound = 0;

      for (const [track, flacResults] of results) {
        if (flacResults.length > 0) {
          found++;
          if (!opts.autoDownload) {
            console.log(`✓ ${track.artist} - ${track.title} (${flacResults.length} results)`);
          }
        } else {
          notFound++;
          console.log(`✗ ${track.artist} - ${track.title} (not found)`);
        }
      }

      console.log(`\nFound: ${found}/${tracks.length} tracks`);
      if (opts.autoDownload) {
        console.log(`Queued ${found} downloads in slskd`);
      }
    } catch (error) {
      console.error('Search failed:', error);
      process.exit(1);
    }
  });

program.parse();

#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import { runPipeline, showStatus } from './pipeline.js';
import { AnalyzeOptions } from './types.js';

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

program.parse();

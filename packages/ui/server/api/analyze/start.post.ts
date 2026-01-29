import { spawn } from 'child_process'
import {
  createAnalysisJob,
  setAnalysisJobFiles,
  updateAnalysisJobStatus,
  updateAnalysisJobProgress,
  getDownloadFileById,
  updateDownloadFileStatus,
  updateDownloadFileAnalysis,
  matchAndUpdateTrackAnalysis
} from '../../utils/db'

// Store running processes for cancellation
const runningJobs = new Map<number, ReturnType<typeof spawn>>()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fileIds, outputDir } = body as { fileIds: number[]; outputDir: string }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'fileIds array is required'
    })
  }

  if (!outputDir || typeof outputDir !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'outputDir is required'
    })
  }

  // Create job in database
  const job = createAnalysisJob(outputDir)
  setAnalysisJobFiles(job.id, fileIds)

  // Get file paths
  const files = fileIds.map(id => getDownloadFileById(id)).filter(Boolean)
  if (files.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No valid files found'
    })
  }

  // Build the input directory (common parent or downloads dir)
  const inputDir = process.env.DOWNLOADS_DIR ||
    (process.env.NODE_ENV === 'production' ? '/app/downloads' : './downloads')

  // Start the analyzer via docker run
  // The analyzer container will have access to downloads and output volumes
  const args = [
    'run', '--rm',
    '--name', `analyzer-job-${job.id}`,
    '-v', `${inputDir}:/input:ro`,
    '-v', `${outputDir}:/output`,
    'music-analyzer',
    'analyze', '/input',
    '-o', '/output',
    '-c', '4',
    '-w'
  ]

  console.log(`Starting analysis job ${job.id}: docker ${args.join(' ')}`)

  const proc = spawn('docker', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  runningJobs.set(job.id, proc)

  // Update job status to running
  updateAnalysisJobStatus(job.id, 'running')

  let completed = 0
  let failed = 0
  let currentFile = ''

  // Parse stdout for progress
  proc.stdout?.on('data', (data: Buffer) => {
    const output = data.toString()
    console.log(`[Job ${job.id}] ${output}`)

    // Match progress patterns from CLI output
    // Example: "Processing file.flac..."
    const fileMatch = output.match(/Processing (.+?)\.{3}|Analyzing (.+?)\.{3}/)
    if (fileMatch) {
      currentFile = fileMatch[1] || fileMatch[2]
      updateAnalysisJobStatus(job.id, 'running', currentFile)
    }

    // Match completion
    // Example: "45/100 files" or similar
    const progressMatch = output.match(/(\d+)\/(\d+)\s*files?/i)
    if (progressMatch) {
      completed = parseInt(progressMatch[1])
      updateAnalysisJobProgress(job.id, completed, failed)
    }

    // Try to parse JSON output for analysis results
    try {
      if (output.includes('"bpm"') || output.includes('"key"')) {
        const jsonMatch = output.match(/\{[^{}]*"bpm"[^{}]*\}/g)
        if (jsonMatch) {
          for (const jsonStr of jsonMatch) {
            try {
              const result = JSON.parse(jsonStr)
              if (result.artist && result.title) {
                // Update tracks that match this artist/title
                matchAndUpdateTrackAnalysis(result.artist, result.title, {
                  bpm: result.bpm,
                  key_notation: result.camelotKey || result.key,
                  energy: result.energy,
                  tags: result.genres
                })
              }
            } catch {
              // Not valid JSON, ignore
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  })

  proc.stderr?.on('data', (data: Buffer) => {
    const output = data.toString()
    console.error(`[Job ${job.id}] Error: ${output}`)

    // Count failures
    if (output.includes('Error') || output.includes('Failed')) {
      failed++
      updateAnalysisJobProgress(job.id, completed, failed)
    }
  })

  proc.on('exit', (code) => {
    runningJobs.delete(job.id)

    if (code === 0) {
      updateAnalysisJobStatus(job.id, 'completed')
      // Mark all files as completed
      for (const file of files) {
        if (file) {
          updateDownloadFileStatus(file.id, 'completed')
        }
      }
    } else if (code === null) {
      // Process was killed (cancelled)
      updateAnalysisJobStatus(job.id, 'cancelled')
    } else {
      updateAnalysisJobStatus(job.id, 'failed')
    }

    console.log(`[Job ${job.id}] Finished with code ${code}`)
  })

  return {
    job,
    message: 'Analysis started'
  }
})

// Export for cancellation
export { runningJobs }

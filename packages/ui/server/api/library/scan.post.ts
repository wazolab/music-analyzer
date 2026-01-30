import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import {
  getLibraryTrackByFingerprint,
  upsertLibraryTrack,
  updateLibraryTrackPath,
} from '../../utils/db'
import type { LibraryTrack } from '../../utils/types'

const AUDIO_EXTENSIONS = ['.flac']

interface ScanResult {
  found: number
  matched: number
  new: number
  errors: string[]
  tracks: LibraryTrack[]
}

async function readFingerprintFromFlac(filePath: string): Promise<{ fingerprint: string | null, duration: number | null }> {
  return new Promise((resolve) => {
    // Try to read ACOUSTID_FINGERPRINT tag using metaflac
    const proc = spawn('metaflac', ['--show-tag=ACOUSTID_FINGERPRINT', '--show-tag=ACOUSTID_FINGERPRINT_DURATION', filePath])

    let output = ''
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve({ fingerprint: null, duration: null })
        return
      }

      let fingerprint: string | null = null
      let duration: number | null = null

      for (const line of output.split('\n')) {
        if (line.startsWith('ACOUSTID_FINGERPRINT=')) {
          fingerprint = line.replace('ACOUSTID_FINGERPRINT=', '').trim()
        }
        if (line.startsWith('ACOUSTID_FINGERPRINT_DURATION=')) {
          const durStr = line.replace('ACOUSTID_FINGERPRINT_DURATION=', '').trim()
          duration = parseInt(durStr, 10) || null
        }
      }

      resolve({ fingerprint, duration })
    })

    proc.on('error', () => {
      resolve({ fingerprint: null, duration: null })
    })
  })
}

async function generateFingerprint(filePath: string): Promise<{ fingerprint: string | null, duration: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('fpcalc', ['-json', filePath])

    let output = ''
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve({ fingerprint: null, duration: null })
        return
      }

      try {
        const data = JSON.parse(output)
        resolve({
          fingerprint: data.fingerprint || null,
          duration: data.duration ? Math.round(data.duration) : null,
        })
      }
      catch {
        resolve({ fingerprint: null, duration: null })
      }
    })

    proc.on('error', () => {
      resolve({ fingerprint: null, duration: null })
    })
  })
}

async function scanDirectory(
  dir: string,
  storageDevice: string,
  recursive: boolean = true,
): Promise<ScanResult> {
  const result: ScanResult = {
    found: 0,
    matched: 0,
    new: 0,
    errors: [],
    tracks: [],
  }

  if (!existsSync(dir)) {
    result.errors.push(`Directory does not exist: ${dir}`)
    return result
  }

  const filesToProcess: string[] = []

  async function collectFiles(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name)

        if (entry.isDirectory() && recursive) {
          await collectFiles(fullPath)
        }
        else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (AUDIO_EXTENSIONS.includes(ext)) {
            filesToProcess.push(fullPath)
          }
        }
      }
    }
    catch (e) {
      result.errors.push(`Error scanning ${currentDir}: ${e}`)
    }
  }

  await collectFiles(dir)
  result.found = filesToProcess.length

  // Process each file
  for (const filePath of filesToProcess) {
    try {
      // First try to read fingerprint from FLAC tags (instant)
      let { fingerprint, duration } = await readFingerprintFromFlac(filePath)

      // If not in tags, generate it (1-2 seconds)
      if (!fingerprint) {
        console.log(`[Library Scan] Generating fingerprint for: ${basename(filePath)}`)
        const generated = await generateFingerprint(filePath)
        fingerprint = generated.fingerprint
        duration = generated.duration
      }

      if (!fingerprint || !duration) {
        result.errors.push(`Could not get fingerprint for: ${filePath}`)
        continue
      }

      // Check if track exists in library
      const existing = getLibraryTrackByFingerprint(fingerprint)

      if (existing) {
        // Update path if it changed
        if (existing.file_path !== filePath) {
          updateLibraryTrackPath(fingerprint, filePath)
          console.log(`[Library Scan] Updated path for: ${existing.artist} - ${existing.title}`)
        }
        result.matched++
        result.tracks.push({ ...existing, file_path: filePath })
      }
      else {
        // New track - add to library with minimal info
        const stats = await stat(filePath)

        const track = upsertLibraryTrack({
          fingerprint,
          fingerprint_duration: duration,
          file_path: filePath,
          file_size_bytes: stats.size,
          storage_device: storageDevice,
        })

        result.new++
        result.tracks.push(track)
        console.log(`[Library Scan] Added new track: ${filePath}`)
      }
    }
    catch (e) {
      result.errors.push(`Error processing ${filePath}: ${e}`)
    }
  }

  return result
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { path, storageDevice, recursive = true } = body as {
    path: string
    storageDevice: string
    recursive?: boolean
  }

  if (!path) {
    throw createError({
      statusCode: 400,
      message: 'path is required',
    })
  }

  if (!storageDevice) {
    throw createError({
      statusCode: 400,
      message: 'storageDevice is required (e.g., "SSD-Music")',
    })
  }

  console.log(`[Library Scan] Starting scan of: ${path} (device: ${storageDevice})`)

  const result = await scanDirectory(path, storageDevice, recursive)

  console.log(`[Library Scan] Complete: ${result.found} found, ${result.matched} matched, ${result.new} new`)

  return result
})

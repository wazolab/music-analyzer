import { spawn } from 'child_process'
import { existsSync, statSync, unlinkSync } from 'fs'
import { basename, dirname, extname, join } from 'path'

// Formats that should be converted to FLAC
const CONVERTIBLE_FORMATS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.aiff', '.ogg', '.opus', '.wma'])
const LOSSY_FORMATS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wma'])
const LOSSLESS_FORMATS = new Set(['.wav', '.aiff'])

export function needsConversion(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return CONVERTIBLE_FORMATS.has(ext)
}

export interface ConversionResult {
  path: string
  success: boolean
  converted: boolean
  message?: string
}

export async function convertToFlac(
  filePath: string,
  deleteOriginal: boolean = true,
  verbose: boolean = true
): Promise<ConversionResult> {
  const ext = extname(filePath).toLowerCase()

  // Already FLAC
  if (ext === '.flac') {
    return { path: filePath, success: true, converted: false }
  }

  // Not convertible
  if (!CONVERTIBLE_FORMATS.has(ext)) {
    return { path: filePath, success: false, converted: false, message: `Unsupported format: ${ext}` }
  }

  // Build output path
  const dir = dirname(filePath)
  const nameWithoutExt = basename(filePath, ext)
  let flacPath = join(dir, `${nameWithoutExt}.flac`)

  // Handle existing file with same name
  if (existsSync(flacPath) && flacPath !== filePath) {
    let counter = 1
    while (existsSync(flacPath)) {
      flacPath = join(dir, `${nameWithoutExt}_${counter}.flac`)
      counter++
    }
  }

  if (verbose) {
    console.log(`[Converter] Converting: ${basename(filePath)} -> ${basename(flacPath)}`)
  }

  const isLossy = LOSSY_FORMATS.has(ext)
  if (isLossy && verbose) {
    console.log(`[Converter] Source is lossy (${ext}) - quality preserved but not improved`)
  }

  // Build ffmpeg command
  const args = [
    '-y', // Overwrite output
    '-i', filePath,
    '-vn', // No video (keeps cover art via metadata)
    '-c:a', 'flac',
    '-compression_level', '5',
    '-map_metadata', '0',
  ]

  // For lossless sources, use 32-bit sample format
  if (LOSSLESS_FORMATS.has(ext)) {
    args.push('-sample_fmt', 's32')
  }

  args.push(flacPath)

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args)
      let stderr = ''

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        }
        else {
          reject(new Error(stderr.slice(0, 200)))
        }
      })

      proc.on('error', reject)

      // 5 minute timeout
      setTimeout(() => {
        proc.kill()
        reject(new Error('Conversion timed out'))
      }, 300000)
    })

    // Verify output
    if (!existsSync(flacPath) || statSync(flacPath).size === 0) {
      return { path: filePath, success: false, converted: false, message: 'Output file is empty or missing' }
    }

    if (verbose) {
      const originalSize = statSync(filePath).size / (1024 * 1024)
      const newSize = statSync(flacPath).size / (1024 * 1024)
      console.log(`[Converter] Converted: ${originalSize.toFixed(1)}MB -> ${newSize.toFixed(1)}MB`)
    }

    // Delete original if requested
    if (deleteOriginal) {
      try {
        unlinkSync(filePath)
        if (verbose) {
          console.log(`[Converter] Deleted original: ${basename(filePath)}`)
        }
      }
      catch (e) {
        if (verbose) {
          console.warn(`[Converter] Could not delete original: ${e}`)
        }
      }
    }

    return { path: flacPath, success: true, converted: true }
  }
  catch (e: any) {
    if (verbose) {
      console.error(`[Converter] Failed: ${e.message}`)
    }
    return { path: filePath, success: false, converted: false, message: e.message }
  }
}

import { readdir, stat, rename, rmdir } from 'fs/promises'
import { join, basename, dirname, extname } from 'path'
import { existsSync } from 'fs'
import { getAllDownloadFiles, upsertDownloadFile } from '../../utils/db'
import type { DownloadFile } from '../../utils/types'

// Audio file extensions to look for
const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.wav', '.aiff', '.m4a', '.ogg']

// Downloads directory - in Docker it's /app/downloads, locally ./downloads
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ||
  (process.env.NODE_ENV === 'production' ? '/app/downloads' : './downloads')

/**
 * Move a file from a subfolder to the root downloads directory.
 * Returns the new path if moved, or original path if already in root.
 */
async function flattenFile(filePath: string): Promise<string> {
  if (dirname(filePath) === DOWNLOADS_DIR) {
    return filePath // Already in root
  }

  const filename = basename(filePath)
  let targetPath = join(DOWNLOADS_DIR, filename)

  // Handle filename conflicts by adding numeric suffix
  if (existsSync(targetPath) && targetPath !== filePath) {
    const ext = extname(filename)
    const nameWithoutExt = basename(filename, ext)
    let counter = 1
    while (existsSync(targetPath)) {
      targetPath = join(DOWNLOADS_DIR, `${nameWithoutExt} (${counter})${ext}`)
      counter++
    }
  }

  try {
    await rename(filePath, targetPath)
    console.log(`[Downloads] Flattened: ${filePath} -> ${targetPath}`)
    return targetPath
  } catch (err) {
    console.error(`[Downloads] Failed to flatten ${filePath}:`, err)
    return filePath
  }
}

/**
 * Remove empty directories recursively up to DOWNLOADS_DIR.
 */
async function cleanEmptyDirs(dir: string): Promise<void> {
  if (dir === DOWNLOADS_DIR || !dir.startsWith(DOWNLOADS_DIR)) return

  try {
    const entries = await readdir(dir)
    if (entries.length === 0) {
      await rmdir(dir)
      console.log(`[Downloads] Removed empty folder: ${dir}`)
      await cleanEmptyDirs(dirname(dir))
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

async function scanAndFlattenDirectory(dir: string): Promise<{
  path: string
  filename: string
  folder: string | null
  size_bytes: number
}[]> {
  const files: {
    path: string
    filename: string
    folder: string | null
    size_bytes: number
  }[] = []

  if (!existsSync(dir)) {
    return files
  }

  const dirsToClean: string[] = []

  async function scanDir(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name)

        if (entry.isDirectory()) {
          await scanDir(fullPath)
          dirsToClean.push(fullPath)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (AUDIO_EXTENSIONS.includes(ext)) {
            try {
              // Flatten file to root if in subfolder
              const finalPath = await flattenFile(fullPath)
              const stats = await stat(finalPath)

              files.push({
                path: finalPath,
                filename: basename(finalPath),
                folder: null, // Always null after flattening
                size_bytes: stats.size
              })
            } catch (e) {
              console.warn(`Could not process file ${fullPath}:`, e)
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error scanning directory ${currentDir}:`, e)
    }
  }

  await scanDir(dir)

  // Clean up empty directories (deepest first)
  for (const d of dirsToClean.reverse()) {
    await cleanEmptyDirs(d)
  }

  return files
}

export default defineEventHandler(async (): Promise<{
  files: DownloadFile[]
  downloadsDir: string
}> => {
  // Scan and flatten the downloads directory
  const scannedFiles = await scanAndFlattenDirectory(DOWNLOADS_DIR)

  // Upsert each file into the database
  for (const file of scannedFiles) {
    upsertDownloadFile(file)
  }

  // Return all files from database (includes previously scanned files)
  const files = getAllDownloadFiles()

  return {
    files,
    downloadsDir: DOWNLOADS_DIR
  }
})

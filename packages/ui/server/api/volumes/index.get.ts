import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { MountedVolume } from '../../utils/types'

const execAsync = promisify(exec)

// Directories to scan for external drives
const MEDIA_PATHS = ['/media', '/mnt']

// Format bytes to human readable
function formatSize(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)}${units[unitIndex]}`
}

// Get disk space info for a path using df
async function getDiskInfo(
  path: string,
): Promise<{ size: string, available: string, fstype: string }> {
  try {
    // Use df with specific path to get disk info
    const { stdout } = await execAsync(`df -B1 "${path}" 2>/dev/null | tail -1`)
    const parts = stdout.trim().split(/\s+/)
    if (parts.length >= 4 && parts[1] && parts[3]) {
      const total = parseInt(parts[1], 10)
      const avail = parseInt(parts[3], 10)
      return {
        size: formatSize(total),
        available: formatSize(avail),
        fstype: 'unknown',
      }
    }
  }
  catch {
    // df failed
  }
  return { size: 'unknown', available: 'unknown', fstype: 'unknown' }
}

// Scan a media directory for mounted volumes
async function scanMediaDir(basePath: string): Promise<MountedVolume[]> {
  const volumes: MountedVolume[] = []

  try {
    const entries = await readdir(basePath, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const userDir = join(basePath, entry.name)

      // Check if this is a user directory (like /media/username)
      // or a direct mount point (like /mnt/mydrive)
      try {
        const subEntries = await readdir(userDir, { withFileTypes: true })

        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue

          const volumePath = join(userDir, subEntry.name)

          // Verify it's accessible
          try {
            await stat(volumePath)
            const diskInfo = await getDiskInfo(volumePath)

            volumes.push({
              path: volumePath,
              label: subEntry.name,
              fstype: diskInfo.fstype,
              size: diskInfo.size,
              available: diskInfo.available,
            })
          }
          catch {
            // Can't access, skip
          }
        }
      }
      catch {
        // Can't read user dir, might be a direct mount
        try {
          await stat(userDir)
          const diskInfo = await getDiskInfo(userDir)

          volumes.push({
            path: userDir,
            label: entry.name,
            fstype: diskInfo.fstype,
            size: diskInfo.size,
            available: diskInfo.available,
          })
        }
        catch {
          // Can't access, skip
        }
      }
    }
  }
  catch {
    // Base path doesn't exist or can't be read
  }

  return volumes
}

export default defineEventHandler(async (): Promise<MountedVolume[]> => {
  const allVolumes: MountedVolume[] = []

  // Scan all media paths in parallel
  const results = await Promise.all(MEDIA_PATHS.map(scanMediaDir))

  for (const volumes of results) {
    allVolumes.push(...volumes)
  }

  return allVolumes
})

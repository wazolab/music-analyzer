import { getAnalyzedTracks, getPendingTracks, getLibraryStats, getLibrarySettings, syncStorageStatus } from '../../utils/db'
import type { LibraryFilters } from '../../utils/types'
import { readdir } from 'fs/promises'
import { join } from 'path'

// Get all mounted volume paths
async function getMountedPaths(): Promise<string[]> {
  const paths: string[] = []
  const mediaDirs = ['/media', '/mnt', '/run/media']

  for (const baseDir of mediaDirs) {
    try {
      const entries = await readdir(baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const userDir = join(baseDir, entry.name)
        try {
          const subEntries = await readdir(userDir, { withFileTypes: true })
          for (const subEntry of subEntries) {
            if (subEntry.isDirectory()) {
              paths.push(join(userDir, subEntry.name))
            }
          }
        }
        catch {
          // Might be a direct mount point
          paths.push(userDir)
        }
      }
    }
    catch {
      // Base dir doesn't exist
    }
  }

  return paths
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // Sync storage status based on currently mounted drives
  const mountedPaths = await getMountedPaths()
  syncStorageStatus(mountedPaths)

  const filters: LibraryFilters = {}

  if (query.genre && typeof query.genre === 'string') {
    filters.genre = query.genre
  }
  if (query.label && typeof query.label === 'string') {
    filters.label = query.label
  }
  if (query.year && typeof query.year === 'string') {
    filters.year = parseInt(query.year, 10)
  }
  if (query.key && typeof query.key === 'string') {
    filters.key = query.key
  }
  if (query.storage_status && typeof query.storage_status === 'string') {
    filters.storage_status = query.storage_status as 'available' | 'offline' | 'moved'
  }
  if (query.search && typeof query.search === 'string') {
    filters.search = query.search
  }

  // Get analyzed tracks (main library view)
  const tracks = getAnalyzedTracks(Object.keys(filters).length > 0 ? filters : undefined)

  // Get pending tracks (need analysis)
  const pendingTracks = getPendingTracks()

  // Get stats and settings
  const stats = getLibraryStats()
  const settings = getLibrarySettings()

  return {
    tracks,
    pendingTracks,
    stats,
    settings,
  }
})

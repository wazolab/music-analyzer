import { getAnalyzedTracks, getPendingTracks, getLibraryStats, getLibrarySettings } from '../../utils/db'
import type { LibraryFilters } from '../../utils/types'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

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

import { readdir, stat } from 'fs/promises'
import { join } from 'path'

interface FolderEntry {
  name: string
  path: string
}

export default defineEventHandler(async (event): Promise<FolderEntry[]> => {
  const query = getQuery(event)
  const basePath = query.path as string

  if (!basePath) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  // Security: Only allow browsing under /media or /mnt
  if (!basePath.startsWith('/media/') && !basePath.startsWith('/mnt/')) {
    throw createError({ statusCode: 403, message: 'Access denied' })
  }

  try {
    const entries = await readdir(basePath, { withFileTypes: true })
    const folders: FolderEntry[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      // Skip hidden folders
      if (entry.name.startsWith('.')) continue

      const fullPath = join(basePath, entry.name)

      // Verify accessible
      try {
        await stat(fullPath)
        folders.push({
          name: entry.name,
          path: fullPath,
        })
      }
      catch {
        // Can't access, skip
      }
    }

    // Sort alphabetically
    return folders.sort((a, b) => a.name.localeCompare(b.name))
  }
  catch (error) {
    console.error('Failed to browse folder:', error)
    throw createError({ statusCode: 500, message: 'Failed to browse folder' })
  }
})

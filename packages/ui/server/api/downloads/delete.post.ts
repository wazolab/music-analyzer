import { unlink } from 'fs/promises'
import { getDownloadFileById, deleteDownloadFile } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fileIds } = body as { fileIds: number[] }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'fileIds array is required'
    })
  }

  const results: { id: number; success: boolean; error?: string }[] = []

  for (const id of fileIds) {
    const file = getDownloadFileById(id)
    if (!file) {
      results.push({ id, success: false, error: 'File not found in database' })
      continue
    }

    try {
      // Delete the actual file from filesystem
      await unlink(file.path)
      // Remove from database
      deleteDownloadFile(id)
      results.push({ id, success: true })
    } catch (error: any) {
      // If file doesn't exist on disk, still remove from database
      if (error.code === 'ENOENT') {
        deleteDownloadFile(id)
        results.push({ id, success: true })
      } else {
        results.push({ id, success: false, error: error.message })
      }
    }
  }

  const deleted = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return {
    deleted,
    failed,
    results
  }
})

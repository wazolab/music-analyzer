import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default defineEventHandler(async () => {
  try {
    await execAsync('docker stop music-pipeline-slskd')
    return { success: true }
  }
  catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to stop slskd',
    })
  }
})

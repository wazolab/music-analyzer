import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default defineEventHandler(async () => {
  try {
    const { stdout } = await execAsync('docker ps --filter "name=music-pipeline-slskd" --format "{{.Status}}"')

    if (stdout.includes('Up')) {
      return { status: 'running' }
    }
    return { status: 'stopped' }
  }
  catch {
    return { status: 'stopped' }
  }
})

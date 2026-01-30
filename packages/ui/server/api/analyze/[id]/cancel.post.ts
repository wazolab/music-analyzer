import { exec } from 'child_process'
import { promisify } from 'util'
import { getAnalysisJobById, updateAnalysisJobStatus } from '../../../utils/db'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid job ID',
    })
  }

  const job = getAnalysisJobById(id)

  if (!job) {
    throw createError({
      statusCode: 404,
      message: 'Job not found',
    })
  }

  if (job.status !== 'running') {
    throw createError({
      statusCode: 400,
      message: 'Job is not running',
    })
  }

  // Stop the docker container for this job
  try {
    await execAsync(`docker stop analyzer-job-${id}`)
  }
  catch (e) {
    // Container may have already stopped
    console.warn(`Could not stop container analyzer-job-${id}:`, e)
  }

  // Update status
  updateAnalysisJobStatus(id, 'cancelled')

  return {
    success: true,
    message: 'Job cancelled',
  }
})

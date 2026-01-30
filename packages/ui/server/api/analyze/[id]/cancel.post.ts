import { getAnalysisJobById, updateAnalysisJobStatus } from '../../../utils/db'
import { cancelJob } from '../start.post'

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

  // Cancel the job (will stop processing new tracks)
  cancelJob(id)

  // Update status immediately
  updateAnalysisJobStatus(id, 'cancelled')

  return {
    success: true,
    message: 'Job cancelled',
  }
})

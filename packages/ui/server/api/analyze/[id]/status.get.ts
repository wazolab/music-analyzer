import { getAnalysisJobById, getDownloadFilesByJobId } from '../../../utils/db'

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

  // Get files for this job
  const files = getDownloadFilesByJobId(id)

  return {
    ...job,
    files,
  }
})

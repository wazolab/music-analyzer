import { getDriveLibraryRoot, getDriveScanPath } from '../../utils/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const driveLabel = query.drive as string

  if (!driveLabel) {
    throw createError({
      statusCode: 400,
      message: 'drive parameter is required',
    })
  }

  const libraryRoot = getDriveLibraryRoot(driveLabel)
  const scanPath = getDriveScanPath(driveLabel)

  return {
    driveLabel,
    libraryRoot,
    scanPath,
  }
})

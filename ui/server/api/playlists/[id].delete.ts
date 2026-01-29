import { deletePlaylist, getPlaylistById } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid playlist ID'
    })
  }

  const playlist = getPlaylistById(id)
  if (!playlist) {
    throw createError({
      statusCode: 404,
      message: 'Playlist not found'
    })
  }

  deletePlaylist(id)

  return { success: true }
})

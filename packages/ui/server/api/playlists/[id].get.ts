import { getPlaylistById, getTracksByPlaylistId } from '../../utils/db'
import type { PlaylistWithTracks } from '../../utils/types'

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

  const tracks = getTracksByPlaylistId(id)

  const result: PlaylistWithTracks = {
    ...playlist,
    tracks
  }

  return result
})

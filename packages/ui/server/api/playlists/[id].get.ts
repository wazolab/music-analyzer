import { getPlaylistById, getTracksByPlaylistId, checkTrackInLibrary } from '../../utils/db'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid playlist ID',
    })
  }

  const playlist = getPlaylistById(id)

  if (!playlist) {
    throw createError({
      statusCode: 404,
      message: 'Playlist not found',
    })
  }

  const tracks = getTracksByPlaylistId(id)

  // Add computed library status to each track
  const tracksWithLibrary = tracks.map((track) => ({
    ...track,
    in_library_computed: track.in_library !== null
      ? !!track.in_library
      : checkTrackInLibrary(track.artist, track.title),
  }))

  return {
    ...playlist,
    tracks: tracksWithLibrary,
  }
})

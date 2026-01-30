import { getPlaylistById, syncPlaylistTracks, getTracksByPlaylistId } from '../../../utils/db'
import type { PlaylistWithTracks, TrackInput } from '../../../utils/types'

export default defineEventHandler(async (event) => {
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

  // Fetch latest tracks from source URL
  const extractedTracks = await fetchTracksFromUrl(playlist.url)

  // Sync tracks (preserves existing statuses)
  syncPlaylistTracks(id, extractedTracks)

  // Return updated playlist with tracks
  const updatedPlaylist = getPlaylistById(id)!
  const tracks = getTracksByPlaylistId(id)

  const result: PlaylistWithTracks = {
    ...updatedPlaylist,
    tracks,
  }

  return result
})

async function fetchTracksFromUrl(url: string): Promise<TrackInput[]> {
  const { spawn } = await import('child_process')

  const args = [
    '--dump-json',
    '--no-warnings',
    '--skip-download',
    '--no-playlist-reverse',
    '--no-cookies-from-browser',
    url,
  ]

  const result = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { maxBuffer: 50 * 1024 * 1024 } as any)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data })
    proc.stderr.on('data', (data: Buffer) => { stderr += data })

    proc.on('close', () => {
      resolve({ stdout, stderr })
    })

    proc.on('error', reject)

    setTimeout(() => {
      proc.kill()
      reject(new Error('Timeout'))
    }, 120000)
  })

  const tracks: TrackInput[] = []

  for (const line of result.stdout.trim().split('\n')) {
    if (!line || line.startsWith('ERROR')) continue

    try {
      const data = JSON.parse(line)
      const track = parseTrackInfo(data)
      if (track) {
        tracks.push(track)
      }
    }
    catch {
      // Skip malformed lines
    }
  }

  if (tracks.length === 0 && result.stderr) {
    throw createError({
      statusCode: 500,
      message: result.stderr.split('\n')[0] || 'No tracks found',
    })
  }

  return tracks
}

function parseTrackInfo(data: any): TrackInput | null {
  let artist = data.artist || data.uploader || data.creator || ''
  let title = data.track || data.title || ''

  // If title contains " - ", it might be "Artist - Title" format
  if (!artist && title.includes(' - ')) {
    const parts = title.split(' - ')
    if (parts.length >= 2) {
      artist = parts[0].trim()
      title = parts.slice(1).join(' - ').trim()
    }
  }

  // Clean up
  artist = artist.trim()
  title = title
    .trim()
    .replace(/\s*\[Free Download\]\s*/gi, '')
    .replace(/\s*\(Free Download\)\s*/gi, '')
    .replace(/\s*\[OUT NOW\]\s*/gi, '')
    .replace(/\s*\(OUT NOW\)\s*/gi, '')
    .trim()

  if (!title) return null

  return {
    artist: artist || 'Unknown Artist',
    title,
    duration: data.duration,
    source_url: data.webpage_url || data.url,
  }
}

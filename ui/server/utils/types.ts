export type TrackStatus = 'downloaded' | 'not_downloaded' | 'need_to_buy'

export interface Track {
  id: number
  playlist_id: number
  artist: string
  title: string
  duration: number | null
  status: TrackStatus
}

export interface Playlist {
  id: number
  name: string
  url: string
  track_count: number
  created_at: string
  updated_at: string
}

export interface PlaylistWithTracks extends Playlist {
  tracks: Track[]
}

export interface TrackInput {
  artist: string
  title: string
  duration?: number
}

export interface CreatePlaylistInput {
  name: string
  url: string
  tracks: TrackInput[]
}

export type TrackStatus = 'downloaded' | 'not_downloaded' | 'need_to_buy'

export interface Track {
  id: number
  playlist_id: number
  artist: string
  title: string
  duration: number | null
  status: TrackStatus
  source_url: string | null
  tags: string[] | null
}

export interface PrepTrack {
  id: number
  track_id: number
  artist: string
  title: string
  duration: number | null
  source_url: string | null
  playlist_name: string
  added_at: string
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
  source_url?: string
}

export interface CreatePlaylistInput {
  name: string
  url: string
  tracks: TrackInput[]
}

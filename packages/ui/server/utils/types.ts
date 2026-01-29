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
  bpm: number | null
  key_notation: string | null
  energy: number | null
  analyzed_at: string | null
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
  bpm: number | null
  key_notation: string | null
  energy: number | null
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

// Analysis types
export type DownloadFileStatus = 'pending' | 'queued' | 'analyzing' | 'completed' | 'failed'
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DownloadFile {
  id: number
  path: string
  filename: string
  folder: string | null
  size_bytes: number | null
  status: DownloadFileStatus
  job_id: number | null
  error_message: string | null
  bpm: number | null
  key_notation: string | null
  energy: number | null
  genres: string | null
  artist: string | null
  title: string | null
  discovered_at: string
  analyzed_at: string | null
}

export interface AnalysisJob {
  id: number
  output_dir: string
  total_files: number
  completed_files: number
  failed_files: number
  status: AnalysisJobStatus
  current_file: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface MountedVolume {
  path: string
  label: string
  fstype: string
  size: string
  available: string
}

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
  in_library: boolean | null // null = auto-detect, true/false = manual override
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
  album: string | null
  label: string | null
  year: number | null
  fingerprint: string | null
  fingerprint_duration: number | null
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

// Library types
export type StorageStatus = 'available' | 'offline' | 'moved'
export type AnalysisStatus = 'pending' | 'analyzing' | 'analyzed' | 'failed'
export type TrackSource = 'downloads' | 'external'

export interface LibraryTrack {
  id: number
  fingerprint: string
  fingerprint_duration: number
  artist: string | null
  title: string | null
  album: string | null
  label: string | null
  year: number | null
  bpm: number | null
  key_notation: string | null
  energy: number | null
  genres: string | null // JSON array
  file_path: string | null
  file_size_bytes: number | null
  storage_status: StorageStatus
  storage_device: string | null
  musicbrainz_id: string | null
  first_seen_at: string
  last_analyzed_at: string | null
  last_seen_at: string | null
  analysis_status: AnalysisStatus
  source: TrackSource
}

export interface LibraryTrackInput {
  fingerprint: string
  fingerprint_duration: number
  artist?: string
  title?: string
  album?: string
  label?: string
  year?: number
  bpm?: number
  key_notation?: string
  energy?: number
  genres?: string[]
  file_path?: string
  file_size_bytes?: number
  storage_device?: string
  musicbrainz_id?: string
}

export interface LibraryFilters {
  genre?: string
  label?: string
  year?: number
  key?: string
  storage_status?: StorageStatus
  search?: string
}

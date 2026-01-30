<template>
  <div class="library-page">
    <header class="page-header">
      <h1>Library</h1>
      <div class="header-actions">
        <button
          class="scan-btn"
          @click="openScanModal"
        >
          Scan Storage
        </button>
        <button
          :disabled="refreshing"
          class="refresh-btn"
          @click="refreshLibrary"
        >
          {{ refreshing ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <!-- Stats Bar -->
    <div
      v-if="stats"
      class="stats-bar"
    >
      <div class="stat">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Tracks</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.byGenre?.length || 0 }}</span>
        <span class="stat-label">Genres</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.byLabel?.length || 0 }}</span>
        <span class="stat-label">Labels</span>
      </div>
      <div class="stat">
        <span
          class="stat-value"
          :class="{ offline: offlineCount > 0 }"
        >{{ offlineCount }}</span>
        <span class="stat-label">Offline</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search artist, title, album..."
        class="search-input"
      >
      <select
        v-model="filterGenre"
        class="filter-select"
      >
        <option value="">
          All Genres
        </option>
        <option
          v-for="g in uniqueGenres"
          :key="g"
          :value="g"
        >
          {{ g }}
        </option>
      </select>
      <select
        v-model="filterLabel"
        class="filter-select"
      >
        <option value="">
          All Labels
        </option>
        <option
          v-for="l in uniqueLabels"
          :key="l"
          :value="l"
        >
          {{ l }}
        </option>
      </select>
      <select
        v-model="filterYear"
        class="filter-select"
      >
        <option value="">
          All Years
        </option>
        <option
          v-for="y in uniqueYears"
          :key="y"
          :value="y"
        >
          {{ y }}
        </option>
      </select>
      <select
        v-model="filterStatus"
        class="filter-select"
      >
        <option value="">
          All Status
        </option>
        <option value="available">
          Available
        </option>
        <option value="offline">
          Offline
        </option>
      </select>
    </div>

    <!-- View Tabs -->
    <div class="view-tabs">
      <button
        class="tab"
        :class="{ active: viewMode === 'genre' }"
        @click="viewMode = 'genre'"
      >
        By Genre
      </button>
      <button
        class="tab"
        :class="{ active: viewMode === 'label' }"
        @click="viewMode = 'label'"
      >
        By Label
      </button>
      <button
        class="tab"
        :class="{ active: viewMode === 'year' }"
        @click="viewMode = 'year'"
      >
        By Year
      </button>
      <button
        class="tab"
        :class="{ active: viewMode === 'list' }"
        @click="viewMode = 'list'"
      >
        List
      </button>
    </div>

    <div
      v-if="pending"
      class="loading"
    >
      Loading library...
    </div>
    <template v-else>
      <div
        v-if="filteredTracks.length === 0"
        class="empty-section"
      >
        <p v-if="tracks.length === 0">
          Your library is empty. Add tracks from the Analysis page or scan your external storage.
        </p>
        <p v-else>
          No tracks match your filters.
        </p>
      </div>

      <!-- Grid View (Genre/Label/Year) -->
      <div
        v-else-if="viewMode !== 'list'"
        class="grid-view"
      >
        <div
          v-for="group in groupedTracks"
          :key="group.name"
          class="group-card"
        >
          <div class="group-header">
            <span class="group-name">{{ group.name || 'Unknown' }}</span>
            <span class="group-count">{{ group.tracks.length }}</span>
          </div>
          <div class="group-tracks">
            <div
              v-for="track in group.tracks"
              :key="track.id"
              class="track-item"
              :class="{ offline: track.storage_status === 'offline' }"
            >
              <div class="track-info">
                <span class="track-title">
                  <span
                    v-if="track.storage_status === 'offline'"
                    class="offline-icon"
                    title="File offline"
                  >&#128274;</span>
                  {{ track.artist || 'Unknown Artist' }} - {{ track.title || 'Unknown Title' }}
                </span>
                <span
                  v-if="track.album"
                  class="track-album"
                >{{ track.album }}</span>
              </div>
              <div class="track-badges">
                <span
                  v-if="track.bpm"
                  class="badge bpm"
                >{{ Math.round(track.bpm) }}</span>
                <span
                  v-if="track.key_notation"
                  class="badge key"
                >{{ track.key_notation }}</span>
                <span
                  v-if="track.energy"
                  class="badge energy"
                >E{{ track.energy }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div
        v-else
        class="list-view"
      >
        <table class="tracks-table">
          <thead>
            <tr>
              <th>Artist</th>
              <th>Title</th>
              <th>Album</th>
              <th>Label</th>
              <th>Year</th>
              <th>BPM</th>
              <th>Key</th>
              <th>Energy</th>
              <th>Storage</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="track in filteredTracks"
              :key="track.id"
              :class="{ offline: track.storage_status === 'offline' }"
            >
              <td>{{ track.artist || '-' }}</td>
              <td>{{ track.title || '-' }}</td>
              <td>{{ track.album || '-' }}</td>
              <td>{{ track.label || '-' }}</td>
              <td>{{ track.year || '-' }}</td>
              <td>
                <span
                  v-if="track.bpm"
                  class="badge bpm"
                >{{ Math.round(track.bpm) }}</span>
              </td>
              <td>
                <span
                  v-if="track.key_notation"
                  class="badge key"
                >{{ track.key_notation }}</span>
              </td>
              <td>
                <span
                  v-if="track.energy"
                  class="badge energy"
                >E{{ track.energy }}</span>
              </td>
              <td>
                <template v-if="track.storage_device">
                  <span
                    class="status-badge"
                    :class="track.storage_status"
                  >{{ track.storage_status }}</span>
                </template>
                <span
                  v-else
                  class="no-device"
                >-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Scan Modal -->
    <div
      v-if="showScanModal"
      class="modal-overlay"
      @click.self="showScanModal = false"
    >
      <div class="modal">
        <h2>Scan External Storage</h2>
        <p class="modal-description">
          Scan a directory to find and match tracks by their audio fingerprint.
          Tracks with existing fingerprints will be matched; new tracks will be added.
        </p>

        <!-- Available Volumes -->
        <div class="form-group">
          <label>Available Storage</label>
          <div
            v-if="loadingVolumes"
            class="volumes-loading"
          >
            Detecting mounted volumes...
          </div>
          <div
            v-else-if="volumes.length === 0"
            class="volumes-empty"
          >
            No external storage detected. Mount a drive or enter path manually below.
          </div>
          <div
            v-else
            class="volumes-grid"
          >
            <div
              v-for="vol in volumes"
              :key="vol.path"
              class="volume-card"
              :class="{ selected: scanPath === vol.path }"
              @click="selectVolume(vol)"
            >
              <div class="volume-icon">
                💾
              </div>
              <div class="volume-info">
                <span class="volume-label">{{ vol.label }}</span>
                <span class="volume-path">{{ vol.path }}</span>
                <span class="volume-size">{{ vol.available }} free of {{ vol.size }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Directory Path</label>
          <input
            v-model="scanPath"
            type="text"
            placeholder="/media/music or /mnt/ssd/music"
          >
        </div>

        <div class="form-group">
          <label>Storage Device Name</label>
          <input
            v-model="scanDevice"
            type="text"
            placeholder="e.g., SSD-Music, External-Drive"
          >
          <span class="input-hint">Used to track which device contains the files</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="scanRecursive"
              type="checkbox"
            >
            Scan subdirectories
          </label>
        </div>

        <div
          v-if="scanResult"
          class="scan-result"
          :class="{ error: scanResult.errors?.length > 0 }"
        >
          <p>
            <strong>Scan complete:</strong>
            {{ scanResult.found }} files found,
            {{ scanResult.matched }} matched,
            {{ scanResult.new }} new tracks added
          </p>
          <p
            v-if="scanResult.errors?.length > 0"
            class="scan-errors"
          >
            {{ scanResult.errors.length }} error(s)
          </p>
        </div>

        <div class="modal-actions">
          <button
            class="btn-cancel"
            @click="showScanModal = false"
          >
            Close
          </button>
          <button
            :disabled="scanning || !scanPath || !scanDevice"
            class="btn-scan"
            @click="startScan"
          >
            {{ scanning ? 'Scanning...' : 'Start Scan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useHead({ title: 'Library' })

const refreshing = ref(false)
const viewMode = ref('genre')
const searchQuery = ref('')
const filterGenre = ref('')
const filterLabel = ref('')
const filterYear = ref('')
const filterStatus = ref('')

// Scan modal
const showScanModal = ref(false)
const scanPath = ref('')
const scanDevice = ref('')
const scanRecursive = ref(true)
const scanning = ref(false)
const scanResult = ref(null)
const volumes = ref([])
const loadingVolumes = ref(false)

// Fetch library
const { data: libraryData, pending, refresh } = await useFetch('/api/library', {
  default: () => ({ tracks: [], stats: { total: 0, byGenre: [], byLabel: [], byYear: [], byStatus: [] } }),
})

const tracks = computed(() => libraryData.value?.tracks || [])
const stats = computed(() => libraryData.value?.stats)

const offlineCount = computed(() => {
  const statusStat = stats.value?.byStatus?.find(s => s.status === 'offline')
  return statusStat?.count || 0
})

// Extract unique values for filters
const uniqueGenres = computed(() => {
  const genres = new Set()
  for (const track of tracks.value) {
    if (track.genres) {
      try {
        const parsed = typeof track.genres === 'string' ? JSON.parse(track.genres) : track.genres
        if (Array.isArray(parsed)) {
          for (const g of parsed) {
            const simplified = g.includes('---') ? g.split('---')[1] : g
            genres.add(simplified)
          }
        }
      }
      catch {
        // Ignore
      }
    }
  }
  return Array.from(genres).sort()
})

const uniqueLabels = computed(() => {
  const labels = new Set()
  for (const track of tracks.value) {
    if (track.label) labels.add(track.label)
  }
  return Array.from(labels).sort()
})

const uniqueYears = computed(() => {
  const years = new Set()
  for (const track of tracks.value) {
    if (track.year) years.add(track.year)
  }
  return Array.from(years).sort((a, b) => b - a)
})

// Filter tracks
const filteredTracks = computed(() => {
  let result = tracks.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(t =>
      (t.artist?.toLowerCase().includes(query))
      || (t.title?.toLowerCase().includes(query))
      || (t.album?.toLowerCase().includes(query)),
    )
  }

  if (filterGenre.value) {
    result = result.filter((t) => {
      if (!t.genres) return false
      try {
        const parsed = typeof t.genres === 'string' ? JSON.parse(t.genres) : t.genres
        return parsed.some(g =>
          g.includes(filterGenre.value) || g.split('---')[1] === filterGenre.value,
        )
      }
      catch {
        return false
      }
    })
  }

  if (filterLabel.value) {
    result = result.filter(t => t.label === filterLabel.value)
  }

  if (filterYear.value) {
    result = result.filter(t => t.year === parseInt(filterYear.value, 10))
  }

  if (filterStatus.value) {
    result = result.filter(t => t.storage_status === filterStatus.value)
  }

  return result
})

// Group tracks by view mode
const groupedTracks = computed(() => {
  const groups = new Map()

  for (const track of filteredTracks.value) {
    let key = 'Unknown'

    if (viewMode.value === 'genre') {
      if (track.genres) {
        try {
          const parsed = typeof track.genres === 'string' ? JSON.parse(track.genres) : track.genres
          if (Array.isArray(parsed) && parsed.length > 0) {
            key = parsed[0].includes('---') ? parsed[0].split('---')[1] : parsed[0]
          }
        }
        catch {
          // Keep default
        }
      }
    }
    else if (viewMode.value === 'label') {
      key = track.label || 'Unknown Label'
    }
    else if (viewMode.value === 'year') {
      key = track.year ? String(track.year) : 'Unknown Year'
    }

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(track)
  }

  return Array.from(groups.entries())
    .map(([name, tracks]) => ({ name, tracks }))
    .sort((a, b) => {
      if (viewMode.value === 'year') {
        return (parseInt(b.name, 10) || 0) - (parseInt(a.name, 10) || 0)
      }
      return b.tracks.length - a.tracks.length
    })
})

async function refreshLibrary() {
  refreshing.value = true
  await refresh()
  refreshing.value = false
}

async function openScanModal() {
  showScanModal.value = true
  scanResult.value = null
  loadingVolumes.value = true

  try {
    volumes.value = await $fetch('/api/volumes')
  }
  catch (e) {
    console.error('Failed to load volumes:', e)
    volumes.value = []
  }

  loadingVolumes.value = false
}

function selectVolume(volume) {
  scanPath.value = volume.path
  scanDevice.value = volume.label
}

async function startScan() {
  if (!scanPath.value || !scanDevice.value) return

  scanning.value = true
  scanResult.value = null

  try {
    const result = await $fetch('/api/library/scan', {
      method: 'POST',
      body: {
        path: scanPath.value,
        storageDevice: scanDevice.value,
        recursive: scanRecursive.value,
      },
    })

    scanResult.value = result
    await refresh()
  }
  catch (e) {
    console.error('Scan failed:', e)
    scanResult.value = {
      found: 0,
      matched: 0,
      new: 0,
      errors: [e.data?.message || 'Scan failed'],
    }
  }

  scanning.value = false
}
</script>

<style scoped>
.library-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  font-size: 1.8rem;
  color: #eee;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.refresh-btn,
.scan-btn {
  padding: 10px 20px;
  background: #333;
  color: #eee;
}

.scan-btn {
  background: #9b59b6;
  color: #fff;
}

.scan-btn:hover {
  opacity: 0.9;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  gap: 24px;
  padding: 16px 24px;
  background: #16213e;
  border-radius: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #00dc82;
}

.stat-value.offline {
  color: #ff4757;
}

.stat-label {
  font-size: 0.85rem;
  color: #666;
}

/* Filters */
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
}

.filter-select {
  padding: 10px 16px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 8px;
  color: #eee;
  cursor: pointer;
}

/* View Tabs */
.view-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #333;
  padding-bottom: 12px;
}

.tab {
  padding: 8px 16px;
  background: transparent;
  color: #aaa;
  border-radius: 6px;
}

.tab:hover {
  background: #16213e;
  color: #eee;
}

.tab.active {
  background: #9b59b6;
  color: #fff;
}

/* Loading & Empty */
.loading {
  color: #666;
  text-align: center;
  padding: 60px 20px;
}

.empty-section {
  color: #555;
  padding: 40px;
  background: #16213e;
  border-radius: 8px;
  text-align: center;
}

/* Grid View */
.grid-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.group-card {
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #2a2a4a;
}

.group-name {
  color: #9b59b6;
  font-weight: 600;
}

.group-count {
  color: #666;
  font-size: 0.85rem;
  background: #2a2a4a;
  padding: 2px 8px;
  border-radius: 10px;
}

.group-tracks {
  max-height: 250px;
  overflow-y: auto;
}

.track-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a4a;
  gap: 12px;
}

.track-item:last-child {
  border-bottom: none;
}

.track-item.offline {
  opacity: 0.6;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  display: block;
  font-size: 0.9rem;
  color: #eee;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-icon {
  margin-right: 4px;
  font-size: 0.8rem;
}

.track-album {
  display: block;
  font-size: 0.75rem;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* Badges */
.badge {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.badge.bpm {
  color: #ffa502;
  background: rgba(255, 165, 2, 0.15);
}

.badge.key {
  color: #00dc82;
  background: rgba(0, 220, 130, 0.15);
}

.badge.energy {
  color: #3498db;
  background: rgba(52, 152, 219, 0.15);
}

/* List View */
.list-view {
  overflow-x: auto;
}

.tracks-table {
  width: 100%;
  border-collapse: collapse;
  background: #16213e;
  border-radius: 8px;
  overflow: hidden;
}

.tracks-table th,
.tracks-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #2a2a4a;
}

.tracks-table th {
  background: #1a1a2e;
  color: #aaa;
  font-weight: 500;
  font-size: 0.85rem;
}

.tracks-table tr.offline {
  opacity: 0.6;
}

.tracks-table td {
  font-size: 0.9rem;
  color: #eee;
}

.status-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: capitalize;
}

.status-badge.available {
  color: #00dc82;
  background: rgba(0, 220, 130, 0.15);
}

.status-badge.offline {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.15);
}

.no-device {
  color: #555;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #16213e;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
}

.modal h2 {
  margin-bottom: 8px;
  color: #eee;
}

.modal-description {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  color: #aaa;
  font-size: 0.9rem;
}

.form-group input[type="text"] {
  width: 100%;
}

.input-hint {
  font-size: 0.75rem;
  color: #666;
  margin-top: 4px;
  display: block;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 18px;
  height: 18px;
}

.scan-result {
  padding: 12px;
  background: rgba(0, 220, 130, 0.1);
  border-radius: 8px;
  margin-bottom: 16px;
  color: #00dc82;
}

.scan-result.error {
  background: rgba(255, 71, 87, 0.1);
  color: #ff4757;
}

.scan-errors {
  font-size: 0.85rem;
  margin-top: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 20px;
  background: #333;
  color: #eee;
}

.btn-scan {
  padding: 10px 20px;
  background: #9b59b6;
  color: #fff;
}

.btn-scan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Volumes Grid */
.volumes-loading,
.volumes-empty {
  padding: 16px;
  background: #1a1a2e;
  border-radius: 8px;
  color: #666;
  text-align: center;
  font-size: 0.9rem;
}

.volumes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.volume-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #1a1a2e;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.volume-card:hover {
  background: #1f2942;
  border-color: #333;
}

.volume-card.selected {
  background: rgba(155, 89, 182, 0.15);
  border-color: #9b59b6;
}

.volume-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.volume-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.volume-label {
  font-weight: 600;
  color: #eee;
  font-size: 0.95rem;
}

.volume-path {
  font-size: 0.75rem;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volume-size {
  font-size: 0.75rem;
  color: #9b59b6;
  margin-top: 2px;
}
</style>

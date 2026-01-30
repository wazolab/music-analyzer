<template>
  <div class="analysis-page">
    <header class="page-header">
      <h1>Analysis</h1>
      <button @click="refreshFiles" :disabled="refreshing" class="refresh-btn">
        {{ refreshing ? 'Scanning...' : 'Refresh' }}
      </button>
    </header>

    <div v-if="pending" class="loading">Scanning downloads folder...</div>
    <template v-else>
      <!-- Section 1: Pending Analysis -->
      <section class="section pending-section">
        <h2 class="section-title">To Analyze ({{ pendingFiles.length }})</h2>

        <div v-if="pendingFiles.length === 0" class="empty-section">
          <p>No files waiting for analysis</p>
        </div>
        <template v-else>
          <div class="selection-bar">
            <label class="select-all">
              <input type="checkbox" v-model="selectAll" @change="toggleSelectAll">
              Select all ({{ selectedFiles.size }}/{{ pendingFiles.length }})
            </label>
            <div class="selection-actions">
              <button
                v-if="selectedFiles.size > 0"
                @click="deleteSelected"
                :disabled="deleting"
                class="delete-btn"
              >
                {{ deleting ? 'Deleting...' : `Delete ${selectedFiles.size}` }}
              </button>
              <button
                v-if="selectedFiles.size > 0"
                @click="startAnalysis"
                :disabled="analyzing"
                class="analyze-btn"
              >
                {{ analyzing ? 'Analyzing...' : `Analyze ${selectedFiles.size}` }}
              </button>
            </div>
          </div>

          <div class="pending-list">
            <DownloadFileRow
              v-for="file in pendingFiles"
              :key="file.id"
              :file="file"
              :selected="selectedFiles.has(file.id)"
              @toggle-select="toggleSelect(file.id)"
            />
          </div>
        </template>
      </section>

      <!-- Section 2: Analyzed by Genre -->
      <section class="section analyzed-section">
        <div class="section-header">
          <h2 class="section-title">Analyzed ({{ analyzedFiles.length }})</h2>
          <button
            v-if="analyzedFiles.length > 0"
            @click="clearAnalyzed"
            :disabled="deleting"
            class="clear-btn"
          >
            {{ deleting ? 'Clearing...' : 'Clear all' }}
          </button>
        </div>

        <div v-if="analyzedFiles.length === 0" class="empty-section">
          <p>No analyzed files yet</p>
        </div>
        <div v-else class="genre-grid">
          <div v-for="group in filesByGenre" :key="group.genre" class="genre-card">
            <div class="genre-header">
              <span class="genre-name">{{ group.genre }}</span>
              <span class="genre-count">{{ group.files.length }}</span>
            </div>
            <div class="genre-files">
              <div v-for="file in group.files" :key="file.id" class="genre-file">
                <div class="file-info">
                  <span class="file-track" v-if="file.artist && file.title">
                    <span class="track-artist">{{ file.artist }}</span>
                    <span class="track-separator"> - </span>
                    <span class="track-title">{{ file.title }}</span>
                  </span>
                  <span class="file-name" v-else>{{ file.filename }}</span>
                </div>
                <div class="file-analysis">
                  <span v-if="file.bpm" class="analysis-badge bpm">{{ Math.round(file.bpm) }} BPM</span>
                  <span v-if="file.key_notation" class="analysis-badge key">{{ file.key_notation }}</span>
                  <span v-if="file.energy" class="analysis-badge energy">E{{ file.energy }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- Progress Modal -->
    <AnalysisProgress
      v-if="currentJob"
      :job-id="currentJob.id"
      @close="handleJobClose"
    />
  </div>
</template>

<script setup>
useHead({ title: 'Analysis' })

const selectedFiles = ref(new Set())
const selectAll = ref(false)
const analyzing = ref(false)
const deleting = ref(false)
const currentJob = ref(null)
const refreshing = ref(false)

// Fetch downloads
const { data: downloadsData, pending, refresh } = await useFetch('/api/downloads', {
  default: () => ({ files: [], downloadsDir: '' })
})

const files = computed(() => downloadsData.value?.files || [])

// Split files into pending and analyzed
const pendingFiles = computed(() =>
  files.value.filter(f => f.status !== 'completed')
)

const analyzedFiles = computed(() =>
  files.value.filter(f => f.status === 'completed')
)

// Group analyzed files by genre
const filesByGenre = computed(() => {
  const groups = new Map()

  for (const file of analyzedFiles.value) {
    let genre = 'Unknown'
    if (file.genres) {
      try {
        let genres = file.genres
        if (typeof genres === 'string') {
          genres = JSON.parse(genres)
        }
        if (Array.isArray(genres) && genres.length > 0) {
          // Simplify genre (e.g., "Hip Hop---Boom Bap" -> "Boom Bap")
          genre = genres[0]
          if (genre.includes('---')) {
            genre = genre.split('---')[1]
          }
        }
      } catch {
        // Keep default
      }
    }

    if (!groups.has(genre)) {
      groups.set(genre, [])
    }
    groups.get(genre).push(file)
  }

  return Array.from(groups.entries())
    .map(([genre, files]) => ({ genre, files }))
    .sort((a, b) => b.files.length - a.files.length) // Sort by count desc
})

function toggleSelect(fileId) {
  if (selectedFiles.value.has(fileId)) {
    selectedFiles.value.delete(fileId)
  } else {
    selectedFiles.value.add(fileId)
  }
  selectedFiles.value = new Set(selectedFiles.value) // Trigger reactivity
  selectAll.value = selectedFiles.value.size === pendingFiles.value.length
}

function toggleSelectAll() {
  if (selectAll.value) {
    selectedFiles.value = new Set(pendingFiles.value.map(f => f.id))
  } else {
    selectedFiles.value = new Set()
  }
}

async function handleJobClose() {
  currentJob.value = null
  await refresh()
}

async function refreshFiles() {
  refreshing.value = true
  await refresh()
  refreshing.value = false
}

async function startAnalysis() {
  if (selectedFiles.value.size === 0) return

  analyzing.value = true

  try {
    const response = await $fetch('/api/analyze/start', {
      method: 'POST',
      body: {
        fileIds: Array.from(selectedFiles.value)
      }
    })

    currentJob.value = response.job
    selectedFiles.value = new Set()
    selectAll.value = false
  } catch (e) {
    console.error('Failed to start analysis:', e)
    alert(e.data?.message || 'Failed to start analysis')
  }

  analyzing.value = false
}

async function deleteSelected() {
  if (selectedFiles.value.size === 0) return

  if (!confirm(`Delete ${selectedFiles.value.size} files from downloads? This cannot be undone.`)) {
    return
  }

  deleting.value = true

  try {
    const result = await $fetch('/api/downloads/delete', {
      method: 'POST',
      body: { fileIds: Array.from(selectedFiles.value) }
    })

    selectedFiles.value = new Set()
    selectAll.value = false
    await refresh()

    if (result.failed > 0) {
      alert(`Deleted ${result.deleted} files. ${result.failed} failed.`)
    }
  } catch (e) {
    console.error('Failed to delete files:', e)
    alert(e.data?.message || 'Failed to delete files')
  }

  deleting.value = false
}

async function clearAnalyzed() {
  const analyzedFiles = files.value.filter(f => f.status === 'completed')
  if (analyzedFiles.length === 0) return

  if (!confirm(`Delete ${analyzedFiles.length} analyzed files from downloads? They have already been copied to the output folder.`)) {
    return
  }

  deleting.value = true

  try {
    const result = await $fetch('/api/downloads/delete', {
      method: 'POST',
      body: { fileIds: analyzedFiles.map(f => f.id) }
    })

    await refresh()

    if (result.failed > 0) {
      alert(`Deleted ${result.deleted} files. ${result.failed} failed.`)
    }
  } catch (e) {
    console.error('Failed to clear analyzed files:', e)
    alert(e.data?.message || 'Failed to clear files')
  }

  deleting.value = false
}
</script>

<style scoped>
.analysis-page {
  display: flex;
  flex-direction: column;
  gap: 32px;
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

.refresh-btn {
  padding: 10px 20px;
  background: #333;
  color: #eee;
}

.refresh-btn:hover {
  background: #444;
}

.loading {
  color: #666;
  text-align: center;
  padding: 60px 20px;
}

/* Sections */
.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 1.2rem;
  color: #aaa;
  font-weight: 500;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-section {
  color: #555;
  padding: 24px;
  background: #16213e;
  border-radius: 8px;
  text-align: center;
}

/* Pending Section */
.selection-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #16213e;
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 12px;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #aaa;
  cursor: pointer;
}

.select-all input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.selection-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.analyze-btn {
  padding: 10px 24px;
  background: #00dc82;
  color: #1a1a2e;
  font-weight: 600;
}

.analyze-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.analyze-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn {
  padding: 8px 16px;
  background: #ff4757;
  color: #fff;
  font-weight: 500;
}

.delete-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-btn {
  padding: 8px 16px;
  background: #333;
  color: #aaa;
  font-weight: 500;
}

.clear-btn:hover:not(:disabled) {
  background: #444;
  color: #eee;
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pending-list {
  background: #16213e;
  border-radius: 8px;
  overflow: hidden;
}

/* Genre Grid */
.genre-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.genre-card {
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
}

.genre-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #2a2a4a;
}

.genre-name {
  color: #9b59b6;
  font-weight: 600;
  font-size: 0.95rem;
}

.genre-count {
  color: #666;
  font-size: 0.85rem;
  background: #2a2a4a;
  padding: 2px 8px;
  border-radius: 10px;
}

.genre-files {
  padding: 8px 0;
  max-height: 200px;
  overflow-y: auto;
}

.genre-file {
  padding: 8px 16px;
  border-bottom: 1px solid #2a2a4a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.genre-file:last-child {
  border-bottom: none;
}

.file-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.file-track {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-track .track-artist {
  color: #00dc82;
  font-size: 0.85rem;
}

.file-track .track-separator {
  color: #666;
  font-size: 0.85rem;
}

.file-track .track-title {
  color: #eee;
  font-size: 0.85rem;
}

.genre-file .file-name {
  color: #ccc;
  font-size: 0.85rem;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-analysis {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.analysis-badge {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.analysis-badge.bpm {
  color: #ffa502;
  background: rgba(255, 165, 2, 0.15);
}

.analysis-badge.key {
  color: #00dc82;
  background: rgba(0, 220, 130, 0.15);
}

.analysis-badge.energy {
  color: #3498db;
  background: rgba(52, 152, 219, 0.15);
}
</style>

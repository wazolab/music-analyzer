<template>
  <div class="analysis-page">
    <header class="page-header">
      <h1>Analysis</h1>
      <button
        :disabled="refreshing"
        class="refresh-btn"
        @click="refreshFiles"
      >
        {{ refreshing ? 'Scanning...' : 'Refresh' }}
      </button>
    </header>

    <div
      v-if="pending"
      class="loading"
    >
      Scanning downloads folder...
    </div>
    <template v-else>
      <!-- Section 1: Pending Analysis -->
      <section class="section pending-section">
        <h2 class="section-title">
          To Analyze ({{ pendingFiles.length }})
        </h2>

        <div
          v-if="pendingFiles.length === 0"
          class="empty-section"
        >
          <p>No files waiting for analysis</p>
        </div>
        <template v-else>
          <div class="selection-bar">
            <label class="select-all">
              <input
                v-model="selectAll"
                type="checkbox"
                @change="toggleSelectAll"
              >
              Select all ({{ selectedFiles.size }}/{{ pendingFiles.length }})
            </label>
            <div class="selection-actions">
              <button
                v-if="selectedFiles.size > 0"
                :disabled="deleting"
                class="delete-btn"
                @click="deleteSelected"
              >
                {{ deleting ? 'Deleting...' : `Delete ${selectedFiles.size}` }}
              </button>
              <button
                v-if="selectedFiles.size > 0"
                :disabled="analyzing"
                class="analyze-btn"
                @click="startAnalysis"
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
          <h2 class="section-title">
            Analyzed ({{ analyzedFiles.length }})
          </h2>
          <div
            v-if="analyzedFiles.length > 0"
            class="section-actions"
          >
            <button
              :disabled="deleting"
              class="clear-btn"
              @click="clearAnalyzed"
            >
              {{ deleting ? 'Clearing...' : 'Clear all' }}
            </button>
          </div>
        </div>

        <div
          v-if="analyzedFiles.length === 0"
          class="empty-section"
        >
          <p>No analyzed files yet</p>
        </div>
        <template v-else>
          <!-- Selection bar for analyzed files -->
          <div class="selection-bar analyzed-selection">
            <label class="select-all">
              <input
                v-model="selectAllAnalyzed"
                type="checkbox"
                @change="toggleSelectAllAnalyzed"
              >
              Select all ({{ selectedAnalyzed.size }}/{{ analyzedFiles.length }})
            </label>
            <div class="selection-actions">
              <button
                v-if="selectedAnalyzed.size > 0"
                :disabled="addingToLibrary"
                class="library-btn"
                @click="addSelectedToLibrary"
              >
                {{ addingToLibrary ? 'Adding...' : `Add to Library (${selectedAnalyzed.size})` }}
              </button>
              <button
                v-if="selectedAnalyzed.size > 0"
                :disabled="analyzing"
                class="reanalyze-btn"
                @click="reanalyzeSelected"
              >
                {{ analyzing ? 'Analyzing...' : `Re-analyze ${selectedAnalyzed.size}` }}
              </button>
            </div>
          </div>

          <div class="genre-grid">
          <div
            v-for="group in filesByGenre"
            :key="group.genre"
            class="genre-card"
          >
            <div class="genre-header">
              <span class="genre-name">{{ group.genre }}</span>
              <span class="genre-count">{{ group.files.length }}</span>
            </div>
            <div class="genre-files">
              <div
                v-for="file in group.files"
                :key="file.id"
                class="genre-file"
                :class="{ selected: selectedAnalyzed.has(file.id) }"
                @click="toggleAnalyzedSelect(file.id)"
              >
                <input
                  type="checkbox"
                  class="file-checkbox"
                  :checked="selectedAnalyzed.has(file.id)"
                  @click.stop="toggleAnalyzedSelect(file.id)"
                >
                <div class="file-info">
                  <span
                    v-if="file.artist && file.title"
                    class="file-track"
                  >
                    <span class="track-artist">{{ file.artist }}</span>
                    <span class="track-separator"> - </span>
                    <span class="track-title">{{ file.title }}</span>
                  </span>
                  <span
                    v-else
                    class="file-name"
                  >{{ file.filename }}</span>
                </div>
                <div class="file-analysis">
                  <span
                    v-if="file.bpm"
                    class="analysis-badge bpm"
                  >{{ Math.round(file.bpm) }} BPM</span>
                  <span
                    v-if="file.key_notation"
                    class="analysis-badge key"
                  >{{ file.key_notation }}</span>
                  <span
                    v-if="file.energy"
                    class="analysis-badge energy"
                  >E{{ file.energy }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>
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
const selectedAnalyzed = ref(new Set())
const selectAll = ref(false)
const selectAllAnalyzed = ref(false)
const analyzing = ref(false)
const deleting = ref(false)
const addingToLibrary = ref(false)
const currentJob = ref(null)
const refreshing = ref(false)

// Fetch downloads
const { data: downloadsData, pending, refresh } = await useFetch('/api/downloads', {
  default: () => ({ files: [], downloadsDir: '' }),
})

const files = computed(() => downloadsData.value?.files || [])

// Split files into pending and analyzed
const pendingFiles = computed(() =>
  files.value.filter(f => f.status !== 'completed'),
)

const analyzedFiles = computed(() =>
  files.value.filter(f => f.status === 'completed'),
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
      }
      catch {
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
  }
  else {
    selectedFiles.value.add(fileId)
  }
  selectedFiles.value = new Set(selectedFiles.value) // Trigger reactivity
  selectAll.value = selectedFiles.value.size === pendingFiles.value.length
}

function toggleSelectAll() {
  if (selectAll.value) {
    selectedFiles.value = new Set(pendingFiles.value.map(f => f.id))
  }
  else {
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
        fileIds: Array.from(selectedFiles.value),
      },
    })

    currentJob.value = response.job
    selectedFiles.value = new Set()
    selectAll.value = false
  }
  catch (e) {
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
      body: { fileIds: Array.from(selectedFiles.value) },
    })

    selectedFiles.value = new Set()
    selectAll.value = false
    await refresh()

    if (result.failed > 0) {
      alert(`Deleted ${result.deleted} files. ${result.failed} failed.`)
    }
  }
  catch (e) {
    console.error('Failed to delete files:', e)
    alert(e.data?.message || 'Failed to delete files')
  }

  deleting.value = false
}

function toggleAnalyzedSelect(fileId) {
  if (selectedAnalyzed.value.has(fileId)) {
    selectedAnalyzed.value.delete(fileId)
  }
  else {
    selectedAnalyzed.value.add(fileId)
  }
  selectedAnalyzed.value = new Set(selectedAnalyzed.value)
  selectAllAnalyzed.value = selectedAnalyzed.value.size === analyzedFiles.value.length
}

function toggleSelectAllAnalyzed() {
  if (selectAllAnalyzed.value) {
    selectedAnalyzed.value = new Set(analyzedFiles.value.map(f => f.id))
  }
  else {
    selectedAnalyzed.value = new Set()
  }
}

async function reanalyzeSelected() {
  if (selectedAnalyzed.value.size === 0) return

  analyzing.value = true

  try {
    const response = await $fetch('/api/analyze/start', {
      method: 'POST',
      body: {
        fileIds: Array.from(selectedAnalyzed.value),
        forceReanalyze: true,
      },
    })

    currentJob.value = response.job
    selectedAnalyzed.value = new Set()
    selectAllAnalyzed.value = false
  }
  catch (e) {
    console.error('Failed to start re-analysis:', e)
    alert(e.data?.message || 'Failed to start re-analysis')
  }

  analyzing.value = false
}

async function addSelectedToLibrary() {
  if (selectedAnalyzed.value.size === 0) return

  addingToLibrary.value = true

  try {
    const result = await $fetch('/api/library/add', {
      method: 'POST',
      body: {
        fileIds: Array.from(selectedAnalyzed.value),
      },
    })

    if (result.added > 0) {
      alert(`Added ${result.added} track(s) to library.${result.errors > 0 ? ` ${result.errors} failed.` : ''}`)
    }
    else if (result.errors > 0) {
      const errorMsgs = result.errorDetails?.map(e => e.error).join(', ') || 'Unknown error'
      alert(`Failed to add tracks: ${errorMsgs}`)
    }

    selectedAnalyzed.value = new Set()
    selectAllAnalyzed.value = false
  }
  catch (e) {
    console.error('Failed to add to library:', e)
    alert(e.data?.message || 'Failed to add to library')
  }

  addingToLibrary.value = false
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
      body: { fileIds: analyzedFiles.map(f => f.id) },
    })

    await refresh()

    if (result.failed > 0) {
      alert(`Deleted ${result.deleted} files. ${result.failed} failed.`)
    }
  }
  catch (e) {
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
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
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

.section-actions {
  display: flex;
  gap: 8px;
}

.reanalyze-btn {
  padding: 8px 16px;
  background: #9b59b6;
  color: #fff;
  font-weight: 500;
}

.reanalyze-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.reanalyze-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.library-btn {
  padding: 8px 16px;
  background: #3498db;
  color: #fff;
  font-weight: 500;
}

.library-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.library-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.analyzed-selection {
  margin-bottom: 8px;
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
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.genre-file:hover {
  background: rgba(155, 89, 182, 0.1);
}

.genre-file.selected {
  background: rgba(155, 89, 182, 0.2);
}

.genre-file:last-child {
  border-bottom: none;
}

.file-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
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

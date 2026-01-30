<template>
  <div class="downloads-page">
    <header class="page-header">
      <h1>Analyze Downloads</h1>
      <button @click="refreshFiles" :disabled="refreshing" class="refresh-btn">
        {{ refreshing ? 'Scanning...' : 'Refresh' }}
      </button>
    </header>

    <div v-if="pending" class="loading">Scanning downloads folder...</div>
    <div v-else-if="files.length === 0" class="empty">
      <p>No audio files found in downloads folder.</p>
      <p class="hint">Download some tracks from Soulseek first.</p>
    </div>
    <template v-else>
      <!-- Selection Controls -->
      <div class="selection-bar">
        <label class="select-all">
          <input type="checkbox" v-model="selectAll" @change="toggleSelectAll">
          Select all ({{ selectedFiles.size }}/{{ files.length }})
        </label>
        <div class="selection-actions">
          <button
            v-if="analyzedCount > 0"
            @click="clearAnalyzed"
            :disabled="deleting"
            class="clear-btn"
          >
            {{ deleting ? 'Deleting...' : `Clear ${analyzedCount} analyzed` }}
          </button>
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
            {{ analyzing ? 'Starting...' : `Analyze ${selectedFiles.size} files` }}
          </button>
        </div>
      </div>

      <!-- File List Grouped by Folder -->
      <div class="files-section">
        <div v-for="group in groupedFiles" :key="group.folder" class="folder-group">
          <h3 class="folder-name">{{ group.folder || 'Root' }}</h3>
          <div class="files-list">
            <DownloadFileRow
              v-for="file in group.files"
              :key="file.id"
              :file="file"
              :selected="selectedFiles.has(file.id)"
              @toggle-select="toggleSelect(file.id)"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- Progress Modal -->
    <AnalysisProgress
      v-if="currentJob"
      :job-id="currentJob.id"
      @close="currentJob = null"
    />
  </div>
</template>

<script setup>
useHead({ title: 'Analyze Downloads' })

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

// Count files that have been analyzed (status = 'completed')
const analyzedCount = computed(() =>
  files.value.filter(f => f.status === 'completed').length
)

// Group files by folder
const groupedFiles = computed(() => {
  const groups = new Map()

  for (const file of files.value) {
    const folder = file.folder || ''
    if (!groups.has(folder)) {
      groups.set(folder, [])
    }
    groups.get(folder).push(file)
  }

  return Array.from(groups.entries())
    .map(([folder, files]) => ({ folder, files }))
    .sort((a, b) => a.folder.localeCompare(b.folder))
})

function toggleSelect(fileId) {
  if (selectedFiles.value.has(fileId)) {
    selectedFiles.value.delete(fileId)
  } else {
    selectedFiles.value.add(fileId)
  }
  selectedFiles.value = new Set(selectedFiles.value) // Trigger reactivity
  selectAll.value = selectedFiles.value.size === files.value.length
}

function toggleSelectAll() {
  if (selectAll.value) {
    selectedFiles.value = new Set(files.value.map(f => f.id))
  } else {
    selectedFiles.value = new Set()
  }
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
.downloads-page {
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

.refresh-btn {
  padding: 10px 20px;
  background: #333;
  color: #eee;
}

.refresh-btn:hover {
  background: #444;
}

.loading, .empty {
  color: #666;
  text-align: center;
  padding: 60px 20px;
}

.empty p {
  margin-bottom: 8px;
}

.hint {
  font-size: 0.9rem;
  color: #555;
}

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
  padding: 10px 20px;
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
  padding: 10px 20px;
  background: #f39c12;
  color: #1a1a2e;
  font-weight: 500;
}

.clear-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.files-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.folder-group {
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
}

.folder-name {
  padding: 12px 16px;
  background: #1a1a2e;
  color: #00dc82;
  font-size: 0.95rem;
  font-weight: 500;
  border-bottom: 1px solid #2a2a4a;
}

.files-list {
  display: flex;
  flex-direction: column;
}
</style>

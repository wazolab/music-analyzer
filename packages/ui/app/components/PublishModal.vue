<template>
  <div
    class="modal-overlay"
    @click.self="$emit('close')"
  >
    <div class="modal">
      <h2>Publish to Drive</h2>
      <p class="modal-description">
        Copy selected tracks to external storage with organized folder structure.
        Files are stored flat at the root, with symlinks for by-genre/, by-label/, by-year/.
      </p>

      <!-- Step 1: Select destination drive -->
      <div class="form-group">
        <label>Destination Drive</label>
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
          No external storage detected. Mount a drive first.
        </div>
        <div
          v-else
          class="volumes-grid"
        >
          <div
            v-for="vol in volumes"
            :key="vol.path"
            class="volume-card"
            :class="{ selected: selectedVolume?.path === vol.path }"
            @click="selectVolume(vol)"
          >
            <div class="volume-icon">
              {{ vol.path.includes('USB') || vol.path.includes('usb') ? '🔌' : '💾' }}
            </div>
            <div class="volume-info">
              <span class="volume-label">{{ vol.label }}</span>
              <span class="volume-size">{{ vol.available }} free of {{ vol.size }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Library root path -->
      <div class="form-group">
        <label>Library Root Path</label>
        <input
          v-model="libraryRoot"
          type="text"
          placeholder="/media/user/Drive/Music"
        >
        <span class="input-hint">
          Files stored flat here. Symlink folders (by-genre/, etc.) created automatically.
        </span>
      </div>

      <!-- Options -->
      <div class="form-group">
        <label class="checkbox-label">
          <input
            v-model="deleteSource"
            type="checkbox"
          >
          Delete source files after publishing
        </label>
        <span class="input-hint checkbox-hint">
          Recommended to free up space in downloads folder
        </span>
      </div>

      <!-- Preview -->
      <div
        v-if="libraryRoot && selectedVolume"
        class="preview"
      >
        <h3>Preview</h3>
        <div class="preview-structure">
          <code>{{ libraryRoot }}/Artist - Title.flac</code>
          <code>{{ libraryRoot }}/by-genre/Techno/Artist - Title.flac</code>
          <code>{{ libraryRoot }}/by-label/Label Name/Artist - Title.flac</code>
          <code>{{ libraryRoot }}/by-year/2024/Artist - Title.flac</code>
        </div>
        <p class="preview-note">
          {{ trackIds.length }} track(s) will be published
        </p>
      </div>

      <!-- Publishing progress -->
      <div
        v-if="publishing"
        class="publishing-progress"
      >
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${progress}%` }"
          />
        </div>
        <span class="progress-text">Publishing... {{ progress }}%</span>
      </div>

      <!-- Error messages -->
      <div
        v-if="error"
        class="error-message"
      >
        {{ error }}
      </div>

      <div class="modal-actions">
        <button
          class="btn-cancel"
          :disabled="publishing"
          @click="$emit('close')"
        >
          Cancel
        </button>
        <button
          :disabled="!canPublish || publishing"
          class="btn-publish"
          @click="publish"
        >
          {{ publishing ? 'Publishing...' : `Publish ${trackIds.length} tracks` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  trackIds: {
    type: Array,
    required: true,
  },
  volumes: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'published'])

const selectedVolume = ref(null)
const libraryRoot = ref('')
const deleteSource = ref(true)
const publishing = ref(false)
const progress = ref(0)
const error = ref('')
const loadingVolumes = ref(false)

const canPublish = computed(() => {
  return selectedVolume.value && libraryRoot.value && props.trackIds.length > 0
})

function selectVolume(volume) {
  selectedVolume.value = volume
  // Auto-fill library root if empty
  if (!libraryRoot.value) {
    libraryRoot.value = `${volume.path}/Music`
  }
}

async function publish() {
  if (!canPublish.value) return

  publishing.value = true
  error.value = ''
  progress.value = 0

  try {
    const result = await $fetch('/api/library/publish', {
      method: 'POST',
      body: {
        trackIds: props.trackIds,
        destinationRoot: libraryRoot.value,
        storageDevice: selectedVolume.value.label,
        deleteSource: deleteSource.value,
      },
    })

    progress.value = 100
    emit('published', result)
  }
  catch (e) {
    console.error('Publish failed:', e)
    error.value = e.data?.message || 'Failed to publish tracks'
  }

  publishing.value = false
}
</script>

<style scoped>
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
  max-width: 550px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h2 {
  margin-bottom: 8px;
  color: #eee;
}

.modal-description {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 20px;
  line-height: 1.4;
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
  padding: 10px 16px;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 8px;
  color: #eee;
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

.checkbox-hint {
  margin-left: 26px;
}

/* Volumes */
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
  background: rgba(52, 152, 219, 0.15);
  border-color: #3498db;
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
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volume-size {
  font-size: 0.75rem;
  color: #3498db;
  margin-top: 2px;
}

/* Preview */
.preview {
  padding: 16px;
  background: #1a1a2e;
  border-radius: 8px;
  margin-bottom: 16px;
}

.preview h3 {
  color: #aaa;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 12px;
}

.preview-structure {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-structure code {
  font-size: 0.75rem;
  color: #666;
  background: #0f0f1a;
  padding: 4px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-note {
  color: #3498db;
  font-size: 0.85rem;
  margin-top: 12px;
}

/* Progress */
.publishing-progress {
  margin-bottom: 16px;
}

.progress-bar {
  height: 6px;
  background: #2a2a4a;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3498db;
  transition: width 0.3s ease;
}

.progress-text {
  display: block;
  text-align: center;
  color: #3498db;
  font-size: 0.85rem;
  margin-top: 8px;
}

/* Error */
.error-message {
  padding: 12px;
  background: rgba(255, 71, 87, 0.1);
  border-radius: 8px;
  color: #ff4757;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

/* Actions */
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
  border-radius: 8px;
  border: none;
  cursor: pointer;
}

.btn-cancel:hover:not(:disabled) {
  background: #444;
}

.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-publish {
  padding: 10px 20px;
  background: #3498db;
  color: #fff;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.btn-publish:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-publish:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

<template>
  <div
    class="progress-overlay"
    @click.self="handleClose"
  >
    <div class="progress-modal">
      <h2>
        {{ statusTitle }}
      </h2>

      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: progressPercent + '%' }"
        />
      </div>

      <div class="progress-stats">
        <span>{{ job?.completed_files || 0 }} / {{ job?.total_files || 0 }} tracks</span>
        <span
          v-if="job?.failed_files > 0"
          class="failed"
        >
          {{ job.failed_files }} failed
        </span>
      </div>

      <div
        v-if="job?.current_file && job?.status === 'running'"
        class="current-file"
      >
        Current: {{ job.current_file }}
      </div>

      <!-- Logs section -->
      <div
        v-if="job?.logs"
        class="logs-section"
      >
        <button
          class="logs-toggle"
          @click="showLogs = !showLogs"
        >
          {{ showLogs ? 'Hide' : 'Show' }} logs
        </button>
        <div
          v-if="showLogs"
          class="logs-content"
        >
          <pre>{{ job.logs }}</pre>
        </div>
      </div>

      <!-- Warning for tracks without AcoustID match -->
      <div
        v-if="tracksNeedingManualLink.length > 0 && (job?.status === 'completed' || job?.status === 'running')"
        class="warning-section"
      >
        <div class="warning-header">
          <span class="warning-icon">⚠</span>
          <span>{{ tracksNeedingManualLink.length }} track(s) not found in AcoustID</span>
        </div>
        <p class="warning-hint">
          Use "Link to MusicBrainz" to add metadata manually
        </p>
      </div>

      <div
        v-if="job?.status === 'completed'"
        class="success-message"
      >
        Analysis complete! Tracks have been tagged and updated.
      </div>

      <div
        v-if="job?.status === 'failed'"
        class="error-message"
      >
        Analysis failed. Check logs above for details.
      </div>

      <div class="actions">
        <button
          v-if="job?.status === 'running'"
          class="cancel-btn"
          :disabled="cancelling"
          @click="cancelJob"
        >
          {{ cancelling ? 'Cancelling...' : 'Cancel' }}
        </button>
        <button
          v-if="job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled'"
          class="done-btn"
          @click="$emit('close')"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  jobId: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['close'])
const toast = useToast()

const cancelling = ref(false)
const showLogs = ref(true)
const toastShown = ref(false)

// Fetch job status
const { data: job, refresh } = await useFetch(
  () => `/api/analyze/${props.jobId}/status`,
  { default: () => null },
)

// Poll for updates every second while running
let pollInterval
onMounted(() => {
  pollInterval = setInterval(() => {
    if (job.value?.status === 'running' || job.value?.status === 'pending') {
      refresh()
    }
  }, 1000)
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})

const statusTitle = computed(() => {
  switch (job.value?.status) {
    case 'pending': return 'Preparing Analysis...'
    case 'running': return 'Analyzing Tracks...'
    case 'completed': return 'Analysis Complete'
    case 'failed': return 'Analysis Failed'
    case 'cancelled': return 'Analysis Cancelled'
    default: return 'Analysis'
  }
})

const progressPercent = computed(() => {
  if (!job.value?.total_files) return 0
  return Math.round((job.value.completed_files / job.value.total_files) * 100)
})

// Tracks that need manual MusicBrainz linking (stored in job data)
const tracksNeedingManualLink = computed(() => {
  if (!job.value?.tracks_needing_link) return []
  try {
    return JSON.parse(job.value.tracks_needing_link)
  }
  catch {
    return []
  }
})

// Show toast when job completes with tracks needing manual linking
watch(() => job.value?.status, (status) => {
  if (status === 'completed' && tracksNeedingManualLink.value.length > 0 && !toastShown.value) {
    toastShown.value = true
    toast.add({
      title: 'Tracks need manual linking',
      description: `${tracksNeedingManualLink.value.length} track(s) not found in AcoustID. Use "Link to MusicBrainz" to add metadata.`,
      color: 'warning',
      timeout: 10000,
    })
  }
})

function handleClose() {
  if (job.value?.status !== 'running') {
    emit('close')
  }
}

async function cancelJob() {
  cancelling.value = true
  try {
    await $fetch(`/api/analyze/${props.jobId}/cancel`, { method: 'POST' })
    await refresh()
  }
  catch (e) {
    console.error('Failed to cancel job:', e)
  }
  cancelling.value = false
}
</script>

<style scoped>
.progress-overlay {
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

.progress-modal {
  background: #16213e;
  border-radius: 12px;
  padding: 32px;
  width: 90%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

h2 {
  color: #eee;
  font-size: 1.3rem;
  text-align: center;
  margin: 0;
}

.progress-bar {
  height: 12px;
  background: #1a1a2e;
  border-radius: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00dc82, #00b368);
  border-radius: 6px;
  transition: width 0.3s ease;
}

.progress-stats {
  display: flex;
  justify-content: center;
  gap: 16px;
  color: #aaa;
  font-size: 0.95rem;
}

.progress-stats .failed {
  color: #ff4757;
}

.current-file {
  text-align: center;
  color: #666;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.success-message {
  text-align: center;
  color: #00dc82;
  font-size: 0.95rem;
}

.error-message {
  text-align: center;
  color: #ff4757;
  font-size: 0.95rem;
}

.logs-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.logs-toggle {
  padding: 6px 12px;
  background: #1a1a2e;
  color: #888;
  font-size: 0.8rem;
  border-radius: 4px;
  align-self: flex-start;
}

.logs-toggle:hover {
  background: #252545;
  color: #aaa;
}

.logs-content {
  background: #0d0d1a;
  border-radius: 6px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.logs-content pre {
  margin: 0;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 0.75rem;
  color: #8a8;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.4;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

.cancel-btn {
  padding: 10px 24px;
  background: #ff4757;
  color: #fff;
}

.cancel-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.done-btn {
  padding: 10px 32px;
  background: #00dc82;
  color: #1a1a2e;
  font-weight: 600;
}

.done-btn:hover {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Warning section */
.warning-section {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 12px 16px;
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f59e0b;
  font-weight: 600;
}

.warning-icon {
  font-size: 1.2rem;
}

.warning-hint {
  margin: 8px 0 0 0;
  color: #aaa;
  font-size: 0.85rem;
}
</style>

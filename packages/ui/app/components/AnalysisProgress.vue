<template>
  <div class="progress-overlay" @click.self="handleClose">
    <div class="progress-modal">
      <h2>
        {{ statusTitle }}
      </h2>

      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <div class="progress-stats">
        <span>{{ job?.completed_files || 0 }} / {{ job?.total_files || 0 }} files</span>
        <span v-if="job?.failed_files > 0" class="failed">
          {{ job.failed_files }} failed
        </span>
      </div>

      <div v-if="job?.current_file && job?.status === 'running'" class="current-file">
        Analyzing: {{ job.current_file }}
      </div>

      <div v-if="job?.status === 'completed'" class="success-message">
        Analysis complete! Files organized to {{ job.output_dir }}
      </div>

      <div v-if="job?.status === 'failed'" class="error-message">
        Analysis failed. Check logs for details.
      </div>

      <div class="actions">
        <button
          v-if="job?.status === 'running'"
          @click="cancelJob"
          class="cancel-btn"
          :disabled="cancelling"
        >
          {{ cancelling ? 'Cancelling...' : 'Cancel' }}
        </button>
        <button
          v-if="job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled'"
          @click="$emit('close')"
          class="done-btn"
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
    required: true
  }
})

const emit = defineEmits(['close'])

const cancelling = ref(false)

// Fetch job status
const { data: job, refresh } = await useFetch(
  () => `/api/analyze/${props.jobId}/status`,
  { default: () => null }
)

// Poll for updates every 2 seconds while running
let pollInterval
onMounted(() => {
  pollInterval = setInterval(() => {
    if (job.value?.status === 'running' || job.value?.status === 'pending') {
      refresh()
    }
  }, 2000)
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})

const statusTitle = computed(() => {
  switch (job.value?.status) {
    case 'pending': return 'Preparing Analysis...'
    case 'running': return 'Analyzing Files...'
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
  } catch (e) {
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
</style>

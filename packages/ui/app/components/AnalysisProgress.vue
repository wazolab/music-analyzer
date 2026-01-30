<template>
  <UModal
    :open="true"
    :dismissible="job?.status !== 'running'"
    title="Analysis Progress"
    description="Analyzing and tagging tracks"
    @update:open="(open) => !open && handleClose()"
  >
    <template #content>
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-center">
            {{ statusTitle }}
          </h2>
        </template>

        <!-- Loading state -->
        <div v-if="!job" class="py-8 text-center text-muted">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin mx-auto mb-2" />
          Loading job status...
        </div>

        <div v-else class="space-y-5">
          <!-- Progress bar -->
          <UProgress
            :model-value="progressPercent"
            color="primary"
            size="lg"
          />

          <!-- Stats -->
          <div class="flex justify-center gap-4 text-sm text-muted">
            <span>{{ job?.completed_files || 0 }} / {{ job?.total_files || 0 }} tracks</span>
            <span v-if="job?.failed_files > 0" class="text-error">
              {{ job.failed_files }} failed
            </span>
          </div>

          <!-- Current file -->
          <p
            v-if="job?.current_file && job?.status === 'running'"
            class="text-center text-muted text-sm truncate"
          >
            Current: {{ job.current_file }}
          </p>

          <!-- Logs section -->
          <div v-if="job?.logs" class="space-y-2">
            <UButton
              :label="showLogs ? 'Hide logs' : 'Show logs'"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="showLogs = !showLogs"
            />
            <div
              v-if="showLogs"
              class="rounded-lg p-3 max-h-48 overflow-y-auto bg-elevated"
            >
              <pre class="text-xs text-primary/80 whitespace-pre-wrap break-all leading-relaxed font-mono">{{ job.logs }}</pre>
            </div>
          </div>

          <!-- Success message -->
          <UAlert
            v-if="job?.status === 'completed'"
            color="success"
            variant="soft"
            icon="i-lucide-check-circle"
            title="Analysis complete!"
            description="Tracks have been tagged and updated."
          />

          <!-- Error message -->
          <UAlert
            v-if="job?.status === 'failed'"
            color="error"
            variant="soft"
            icon="i-lucide-x-circle"
            title="Analysis failed"
            description="Check logs above for details."
          />

          <!-- Pending message -->
          <div
            v-if="job?.status === 'pending'"
            class="flex items-center justify-center gap-2 text-muted"
          >
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            <span>Preparing analysis...</span>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-center gap-3">
            <UButton
              v-if="job?.status === 'running' || job?.status === 'pending'"
              color="error"
              variant="soft"
              :loading="cancelling"
              @click="cancelJob"
            >
              Cancel
            </UButton>
            <UButton
              v-if="!job || job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled'"
              @click="$emit('close')"
            >
              {{ !job ? 'Close' : 'Done' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
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

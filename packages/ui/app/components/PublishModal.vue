<template>
  <UModal
    :open="true"
    title="Publish to Drive"
    description="Copy tracks to external storage"
    @update:open="(open) => !open && $emit('close')"
  >
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Publish to Drive</h2>
              <p class="text-muted text-sm mt-1">
                Copy selected tracks to external storage with organized folder structure.
              </p>
            </div>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="$emit('close')" />
          </div>
        </template>

        <div class="space-y-5">
          <!-- Step 1: Select destination drive -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Destination Drive</label>
            <div v-if="loadingVolumes" class="text-muted text-center py-4">
              Detecting mounted volumes...
            </div>
            <div v-else-if="volumes.length === 0" class="text-muted text-center py-4">
              No external storage detected. Mount a drive first.
            </div>
            <div v-else class="grid grid-cols-2 gap-3">
              <UCard
                v-for="vol in volumes"
                :key="vol.path"
                class="cursor-pointer transition-all"
                :class="{ 'ring-2 ring-primary': selectedVolume?.path === vol.path }"
                :ui="{ body: 'p-3' }"
                @click="selectVolume(vol)"
              >
                <div class="flex gap-3 items-start">
                  <UIcon name="i-lucide-hard-drive" class="size-6 text-muted" />
                  <div class="min-w-0">
                    <p class="font-medium text-sm truncate">{{ vol.label }}</p>
                    <p class="text-xs text-primary mt-0.5">{{ vol.available }} free of {{ vol.size }}</p>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Step 2: Library root path -->
          <UFormField label="Library Root Path" hint="Files stored flat here. Symlink folders (by-genre/, etc.) created automatically.">
            <UInput
              v-model="libraryRoot"
              placeholder="/media/user/Drive/Music"
            />
          </UFormField>

          <!-- Options -->
          <UCheckbox
            v-model="deleteSource"
            label="Delete source files after publishing"
          />

          <!-- Preview -->
          <UCard v-if="libraryRoot && selectedVolume" :ui="{ body: 'p-4' }">
            <h3 class="text-xs uppercase tracking-wide text-muted mb-3">Preview</h3>
            <div class="space-y-1 font-mono">
              <code class="block text-xs text-muted bg-elevated px-2 py-1 rounded truncate">{{ libraryRoot }}/Artist - Title.flac</code>
              <code class="block text-xs text-muted bg-elevated px-2 py-1 rounded truncate">{{ libraryRoot }}/by-genre/Techno/Artist - Title.flac</code>
              <code class="block text-xs text-muted bg-elevated px-2 py-1 rounded truncate">{{ libraryRoot }}/by-label/Label Name/Artist - Title.flac</code>
              <code class="block text-xs text-muted bg-elevated px-2 py-1 rounded truncate">{{ libraryRoot }}/by-year/2024/Artist - Title.flac</code>
            </div>
            <p class="text-primary text-sm mt-3">{{ trackIds.length }} track(s) will be published</p>
          </UCard>

          <!-- Publishing progress -->
          <div v-if="publishing" class="space-y-2">
            <UProgress :model-value="progress" />
            <p class="text-center text-primary text-sm">Publishing... {{ progress }}%</p>
          </div>

          <!-- Error message -->
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="error"
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="publishing"
              @click="$emit('close')"
            >
              Cancel
            </UButton>
            <UButton
              :disabled="!canPublish || publishing"
              :loading="publishing"
              @click="publish"
            >
              Publish {{ trackIds.length }} tracks
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
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

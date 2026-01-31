<template>
  <UModal
    :open="true"
    title="Edit Track"
    description="Edit track metadata"
    @update:open="(open) => !open && $emit('close')"
  >
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Edit Track</h2>
              <p class="text-muted text-sm mt-1">
                Edit metadata for this track. Changes will be saved to the database and written to the file.
              </p>
            </div>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="$emit('close')" />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Artist and Title -->
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Artist">
              <UInput v-model="form.artist" placeholder="Artist name" />
            </UFormField>
            <UFormField label="Title">
              <UInput v-model="form.title" placeholder="Track title" />
            </UFormField>
          </div>

          <!-- Album and Label -->
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Album">
              <UInput v-model="form.album" placeholder="Album name" />
            </UFormField>
            <UFormField label="Label">
              <UInput v-model="form.label" placeholder="Record label" />
            </UFormField>
          </div>

          <!-- Year -->
          <UFormField label="Year">
            <UInput v-model.number="form.year" type="number" placeholder="Release year" min="1900" max="2100" />
          </UFormField>

          <!-- Analysis Data Section -->
          <div class="border-t border-default pt-4 mt-4">
            <h3 class="text-sm font-medium text-muted mb-3">Analysis Data</h3>
            <div class="grid grid-cols-3 gap-4">
              <UFormField label="BPM">
                <UInput v-model.number="form.bpm" type="number" placeholder="120" min="0" max="300" step="0.1" />
              </UFormField>
              <UFormField label="Key (Camelot)">
                <UInput v-model="form.key_notation" placeholder="8A" />
              </UFormField>
              <UFormField label="Energy (1-10)">
                <UInput v-model.number="form.energy" type="number" placeholder="5" min="1" max="10" />
              </UFormField>
            </div>
          </div>

          <!-- Genres -->
          <UFormField label="Genres" hint="Comma-separated list">
            <UInput v-model="genresText" placeholder="Techno, House, Electronic" />
          </UFormField>

          <!-- Error message -->
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="error"
          />

          <!-- Success message -->
          <UAlert
            v-if="success"
            color="success"
            variant="soft"
            icon="i-lucide-check-circle"
            title="Track updated successfully"
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="saving"
              @click="$emit('close')"
            >
              Cancel
            </UButton>
            <UButton
              :loading="saving"
              @click="save"
            >
              Save Changes
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { LibraryTrack } from '~/server/utils/types'

const props = defineProps<{
  track: LibraryTrack
}>()

const emit = defineEmits<{
  close: []
  saved: [track: LibraryTrack]
}>()

// Parse genres from JSON string
function parseGenres(genresJson: string | null): string[] {
  if (!genresJson) return []
  try {
    const parsed = JSON.parse(genresJson)
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

// Form state initialized from track prop
const form = ref({
  artist: props.track.artist || '',
  title: props.track.title || '',
  album: props.track.album || '',
  label: props.track.label || '',
  year: props.track.year || null as number | null,
  bpm: props.track.bpm || null as number | null,
  key_notation: props.track.key_notation || '',
  energy: props.track.energy || null as number | null,
})

// Genres handled separately for comma-separated input
const genresText = ref(parseGenres(props.track.genres).join(', '))

const saving = ref(false)
const error = ref('')
const success = ref(false)

// Validation
function validate(): string | null {
  if (form.value.energy !== null && (form.value.energy < 1 || form.value.energy > 10)) {
    return 'Energy must be between 1 and 10'
  }
  if (form.value.bpm !== null && form.value.bpm < 0) {
    return 'BPM must be positive'
  }
  if (form.value.key_notation && !/^(1[0-2]|[1-9])[AB]$/i.test(form.value.key_notation)) {
    return 'Key must be in Camelot format (e.g., 8A, 11B)'
  }
  if (form.value.year !== null && (form.value.year < 1900 || form.value.year > 2100)) {
    return 'Year must be between 1900 and 2100'
  }
  return null
}

async function save() {
  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  saving.value = true
  error.value = ''
  success.value = false

  try {
    const genres = genresText.value
      .split(',')
      .map(g => g.trim())
      .filter(g => g.length > 0)

    const result = await $fetch(`/api/library/${props.track.id}`, {
      method: 'PATCH',
      body: {
        artist: form.value.artist || null,
        title: form.value.title || null,
        album: form.value.album || null,
        label: form.value.label || null,
        year: form.value.year,
        bpm: form.value.bpm,
        key_notation: form.value.key_notation || null,
        energy: form.value.energy,
        genres,
      },
    })

    if (result.success) {
      success.value = true
      setTimeout(() => {
        emit('saved', result.track)
      }, 500)
    }
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to save changes'
  }

  saving.value = false
}
</script>

<template>
  <UCard :ui="{ body: 'p-0' }">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-default bg-elevated/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium">
              <UCheckbox :model-value="selectAll" @update:model-value="$emit('update:selectAll', $event)" />
            </th>
            <th
              v-for="col in sortableColumns"
              :key="col.key"
              class="px-4 py-3 text-left font-medium cursor-pointer hover:bg-elevated select-none"
              @click="toggleSort(col.key)"
            >
              <div class="flex items-center gap-1">
                <span>{{ col.label }}</span>
                <UIcon
                  v-if="sortColumn === col.key"
                  :name="sortDirection === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-4"
                />
              </div>
            </th>
            <th class="px-4 py-3 text-left font-medium">Storage</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="row in sortedTracks"
            :key="row.id"
            class="cursor-pointer hover:bg-elevated/50"
            :class="{ 'bg-elevated': selectedTracks.has(row.id) }"
            @click="$emit('toggle-select', row.id)"
          >
            <td class="px-4 py-3">
              <UCheckbox :model-value="selectedTracks.has(row.id)" @click.stop @update:model-value="$emit('toggle-select', row.id)" />
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-1">
                <UIcon v-if="!row.musicbrainz_id" name="i-lucide-help-circle" class="size-3.5 text-warning shrink-0" />
                <span>{{ row.artist || '-' }}</span>
              </div>
            </td>
            <td class="px-4 py-3">{{ row.title || '-' }}</td>
            <td class="px-4 py-3">{{ row.album || '-' }}</td>
            <td class="px-4 py-3">{{ row.label || '-' }}</td>
            <td class="px-4 py-3">{{ row.year || '-' }}</td>
            <td class="px-4 py-3">
              <UBadge v-if="row.bpm" color="warning" variant="subtle">{{ Math.round(row.bpm) }}</UBadge>
            </td>
            <td class="px-4 py-3">
              <UBadge v-if="row.key_notation" color="primary" variant="subtle">{{ row.key_notation }}</UBadge>
            </td>
            <td class="px-4 py-3">
              <UBadge v-if="row.energy" color="info" variant="subtle">E{{ row.energy }}</UBadge>
            </td>
            <td class="px-4 py-3">
              <UBadge v-if="row.storage_device" :color="row.storage_status === 'offline' ? 'error' : 'success'" variant="subtle">
                {{ row.storage_status }}
              </UBadge>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-1">
                <UButton
                  v-if="!row.musicbrainz_id"
                  icon="i-lucide-link"
                  color="warning"
                  variant="ghost"
                  size="xs"
                  title="Link to MusicBrainz"
                  @click.stop="$emit('link-musicbrainz', row)"
                />
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  title="Edit metadata"
                  @click.stop="$emit('edit', row)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>

<script setup>
const props = defineProps({
  tracks: {
    type: Array,
    required: true,
  },
  selectedTracks: {
    type: Set,
    required: true,
  },
  selectAll: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggle-select', 'update:selectAll', 'edit', 'link-musicbrainz'])

const sortableColumns = [
  { key: 'artist', label: 'Artist' },
  { key: 'title', label: 'Title' },
  { key: 'album', label: 'Album' },
  { key: 'label', label: 'Label' },
  { key: 'year', label: 'Year' },
  { key: 'bpm', label: 'BPM' },
  { key: 'key_notation', label: 'Key' },
  { key: 'energy', label: 'Energy' },
]

const sortColumn = ref(null)
const sortDirection = ref('asc')

function toggleSort(column) {
  if (sortColumn.value === column) {
    if (sortDirection.value === 'asc') {
      sortDirection.value = 'desc'
    }
    else {
      // Reset sort on third click
      sortColumn.value = null
      sortDirection.value = 'asc'
    }
  }
  else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

const sortedTracks = computed(() => {
  if (!sortColumn.value) return props.tracks

  return [...props.tracks].sort((a, b) => {
    const aVal = a[sortColumn.value]
    const bVal = b[sortColumn.value]

    // Handle null/undefined values
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1

    // Compare values
    let comparison = 0
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal
    }
    else {
      comparison = String(aVal).localeCompare(String(bVal))
    }

    return sortDirection.value === 'asc' ? comparison : -comparison
  })
})
</script>

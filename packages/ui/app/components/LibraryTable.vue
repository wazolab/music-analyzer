<template>
  <UCard :ui="{ body: 'p-0' }">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-default bg-elevated/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium">
              <UCheckbox :model-value="selectAll" @update:model-value="$emit('update:selectAll', $event)" />
            </th>
            <th class="px-4 py-3 text-left font-medium">Artist</th>
            <th class="px-4 py-3 text-left font-medium">Title</th>
            <th class="px-4 py-3 text-left font-medium">Album</th>
            <th class="px-4 py-3 text-left font-medium">Label</th>
            <th class="px-4 py-3 text-left font-medium">Year</th>
            <th class="px-4 py-3 text-left font-medium">BPM</th>
            <th class="px-4 py-3 text-left font-medium">Key</th>
            <th class="px-4 py-3 text-left font-medium">Energy</th>
            <th class="px-4 py-3 text-left font-medium">Storage</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="row in tracks"
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
              <UBadge v-if="row.storage_device" :color="row.storage_status === 'offline' ? 'error' : 'success'" variant="subtle" size="xs">
                {{ row.storage_status }}
              </UBadge>
              <span v-else class="text-muted">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>

<script setup>
defineProps({
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

defineEmits(['toggle-select', 'update:selectAll'])
</script>

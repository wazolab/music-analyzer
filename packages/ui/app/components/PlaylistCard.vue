<template>
  <UCard
    class="relative transition-all hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/50"
    :ui="{ body: 'p-5' }"
  >
    <NuxtLink
      v-if="!editing"
      :to="`/playlists/${playlist.id}`"
      class="block"
    >
      <h3 class="text-lg font-medium mb-3 pr-16">{{ playlist.name }}</h3>
      <div class="flex flex-col gap-1 text-sm">
        <span class="text-primary">{{ playlist.track_count }} tracks</span>
        <ClientOnly>
          <span class="text-muted">Updated {{ formatDate(playlist.updated_at) }}</span>
        </ClientOnly>
      </div>
    </NuxtLink>
    <div v-else class="space-y-3">
      <UInput
        ref="nameInput"
        v-model="editName"
        placeholder="Playlist name"
        autofocus
        @keyup.enter="saveEdit"
        @keyup.escape="cancelEdit"
      />
      <div class="flex gap-2">
        <UButton size="xs" :loading="saving" @click="saveEdit">Save</UButton>
        <UButton size="xs" color="neutral" variant="ghost" :disabled="saving" @click="cancelEdit">Cancel</UButton>
      </div>
    </div>
    <div class="absolute top-3 right-3 flex gap-1">
      <UButton
        v-if="!editing"
        icon="i-lucide-pencil"
        color="neutral"
        variant="ghost"
        size="xs"
        title="Edit name"
        @click.prevent="startEdit"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="xs"
        title="Delete playlist"
        @click.prevent="$emit('delete', playlist.id)"
      />
    </div>
  </UCard>
</template>

<script setup>
const props = defineProps({
  playlist: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['delete', 'updated'])

const editing = ref(false)
const editName = ref('')
const saving = ref(false)
const nameInput = ref(null)

function startEdit() {
  editName.value = props.playlist.name
  editing.value = true
  nextTick(() => {
    nameInput.value?.$el?.querySelector('input')?.focus()
  })
}

function cancelEdit() {
  editing.value = false
  editName.value = ''
}

async function saveEdit() {
  if (!editName.value.trim() || editName.value.trim() === props.playlist.name) {
    cancelEdit()
    return
  }

  saving.value = true
  try {
    await $fetch(`/api/playlists/${props.playlist.id}`, {
      method: 'PATCH',
      body: { name: editName.value.trim() },
    })
    emit('updated')
    editing.value = false
  }
  catch (e) {
    console.error('Failed to update playlist:', e)
  }
  saving.value = false
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'Z')
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
</script>

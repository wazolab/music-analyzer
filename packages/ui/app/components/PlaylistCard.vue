<template>
  <UCard
    class="relative ring-1 ring-default transition-all hover:-translate-y-0.5 hover:ring-primary/50 hover:shadow-lg"
    :ui="{ body: 'p-5' }"
  >
    <NuxtLink
      :to="`/playlists/${playlist.id}`"
      class="block"
    >
      <h3 class="text-lg font-medium mb-3 pr-8">{{ playlist.name }}</h3>
      <div class="flex flex-col gap-1 text-sm">
        <span class="text-primary">{{ playlist.track_count }} tracks</span>
        <ClientOnly>
          <span class="text-muted">Updated {{ formatDate(playlist.updated_at) }}</span>
        </ClientOnly>
      </div>
    </NuxtLink>
    <UButton
      icon="i-lucide-trash-2"
      color="error"
      variant="ghost"
      size="xs"
      class="absolute top-3 right-3"
      title="Delete playlist"
      @click.prevent="$emit('delete', playlist.id)"
    />
  </UCard>
</template>

<script setup>
defineProps({
  playlist: {
    type: Object,
    required: true,
  },
})

defineEmits(['delete'])

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

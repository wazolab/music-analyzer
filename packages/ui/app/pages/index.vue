<template>
  <div class="flex flex-col gap-8">
    <!-- Stats Overview -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <UCard :ui="{ body: 'p-5' }">
        <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <UIcon name="i-lucide-music" class="size-5 text-primary" />
        </div>
        <div class="text-xs text-muted uppercase tracking-wide mb-1">Tracks</div>
        <div class="text-2xl font-semibold">{{ libraryStats?.total || 0 }}</div>
      </UCard>

      <NuxtLink to="/online-playlists" class="block">
        <UCard :ui="{ body: 'p-5' }" class="h-full transition-all hover:ring-2 hover:ring-primary">
          <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <UIcon name="i-lucide-list-music" class="size-5 text-primary" />
          </div>
          <div class="text-xs text-muted uppercase tracking-wide mb-1">Online Playlists</div>
          <div class="text-2xl font-semibold">{{ playlistCount }}</div>
        </UCard>
      </NuxtLink>

      <NuxtLink to="/library" class="block">
        <UCard :ui="{ body: 'p-5' }" class="h-full transition-all hover:ring-2 hover:ring-warning">
          <div class="size-10 rounded-full flex items-center justify-center mb-4" :class="pendingCount > 0 ? 'bg-warning/10' : 'bg-primary/10'">
            <UIcon name="i-lucide-clock" class="size-5" :class="pendingCount > 0 ? 'text-warning' : 'text-primary'" />
          </div>
          <div class="text-xs text-muted uppercase tracking-wide mb-1">Pending Analysis</div>
          <div class="text-2xl font-semibold">{{ pendingCount }}</div>
        </UCard>
      </NuxtLink>

      <UCard :ui="{ body: 'p-5' }" title="Tracks not linked to AcoustID">
        <div class="size-10 rounded-full flex items-center justify-center mb-4" :class="notInAcoustidCount > 0 ? 'bg-warning/10' : 'bg-primary/10'">
          <UIcon name="i-lucide-help-circle" class="size-5" :class="notInAcoustidCount > 0 ? 'text-warning' : 'text-primary'" />
        </div>
        <div class="text-xs text-muted uppercase tracking-wide mb-1">Not in AcoustID</div>
        <div class="text-2xl font-semibold">{{ notInAcoustidCount }}</div>
      </UCard>

      <UCard :ui="{ body: 'p-5' }">
        <div class="size-10 rounded-full flex items-center justify-center mb-4" :class="offlineCount > 0 ? 'bg-error/10' : 'bg-primary/10'">
          <UIcon name="i-lucide-cloud-off" class="size-5" :class="offlineCount > 0 ? 'text-error' : 'text-primary'" />
        </div>
        <div class="text-xs text-muted uppercase tracking-wide mb-1">Offline</div>
        <div class="text-2xl font-semibold">{{ offlineCount }}</div>
      </UCard>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ pageTitle: 'Dashboard' })
useHead({ title: 'Dashboard' })

const { data: libraryData } = await useFetch('/api/library', {
  default: () => ({ tracks: [], pendingTracks: [], stats: { total: 0, byStatus: [] } }),
})

const { data: playlists } = await useFetch('/api/playlists', {
  default: () => [],
})

const libraryStats = computed(() => libraryData.value?.stats)
const tracks = computed(() => libraryData.value?.tracks || [])
const playlistCount = computed(() => playlists.value?.length || 0)
const pendingCount = computed(() => libraryData.value?.pendingTracks?.length || 0)
const notInAcoustidCount = computed(() => tracks.value.filter(t => !t.musicbrainz_id).length)
const offlineCount = computed(() => libraryStats.value?.byStatus?.find(s => s.status === 'offline')?.count || 0)
</script>

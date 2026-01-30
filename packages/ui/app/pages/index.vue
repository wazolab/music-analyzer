<template>
  <div class="flex flex-col gap-8">
    <h1 class="text-3xl font-bold">Dashboard</h1>

    <!-- Stats Overview -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <UCard :ui="{ body: 'p-4 text-center' }">
        <div class="text-3xl font-bold text-primary">{{ libraryStats?.total || 0 }}</div>
        <div class="text-sm text-muted">Tracks</div>
      </UCard>
      <NuxtLink to="/online-playlists" class="block">
        <UCard
          :ui="{ body: 'p-4 text-center' }"
          class="h-full transition-all hover:ring-2 hover:ring-primary cursor-pointer"
        >
          <div class="text-3xl font-bold text-primary">{{ playlistCount }}</div>
          <div class="text-sm text-muted">Online Playlists</div>
        </UCard>
      </NuxtLink>
      <NuxtLink to="/library" class="block">
        <UCard
          :ui="{ body: 'p-4 text-center' }"
          class="h-full transition-all hover:ring-2 hover:ring-warning cursor-pointer"
        >
          <div class="text-3xl font-bold" :class="pendingCount > 0 ? 'text-warning' : 'text-primary'">
            {{ pendingCount }}
          </div>
          <div class="text-sm text-muted">Pending Analysis</div>
        </UCard>
      </NuxtLink>
      <UCard :ui="{ body: 'p-4 text-center' }" title="Tracks not linked to AcoustID">
        <div class="text-3xl font-bold" :class="notInAcoustidCount > 0 ? 'text-warning' : 'text-primary'">
          {{ notInAcoustidCount }}
        </div>
        <div class="text-sm text-muted">Not in AcoustID</div>
      </UCard>
      <UCard :ui="{ body: 'p-4 text-center' }">
        <div class="text-3xl font-bold" :class="offlineCount > 0 ? 'text-error' : 'text-primary'">
          {{ offlineCount }}
        </div>
        <div class="text-sm text-muted">Offline</div>
      </UCard>
    </div>
  </div>
</template>

<script setup>
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

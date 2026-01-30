<template>
  <div class="flex flex-col gap-8">
    <!-- Stats Overview -->
    <UPageGrid class="lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-px">
      <UPageCard
        icon="i-lucide-music"
        title="Tracks"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold text-highlighted">{{ libraryStats?.total || 0 }}</span>
      </UPageCard>

      <UPageCard
        icon="i-lucide-list-music"
        title="Online Playlists"
        to="/online-playlists"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold text-highlighted">{{ playlistCount }}</span>
      </UPageCard>

      <UPageCard
        icon="i-lucide-clock"
        title="Pending Analysis"
        to="/library"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: `p-2.5 rounded-full ring ring-inset flex-col ${pendingCount > 0 ? 'bg-warning/10 ring-warning/25' : 'bg-primary/10 ring-primary/25'}`,
          leadingIcon: pendingCount > 0 ? 'text-warning' : '',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold" :class="pendingCount > 0 ? 'text-warning' : 'text-highlighted'">{{ pendingCount }}</span>
      </UPageCard>

      <UPageCard
        icon="i-lucide-help-circle"
        title="Not in AcoustID"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: 'p-2.5 rounded-full ring ring-inset flex-col bg-warning/10 ring-warning/25',
          leadingIcon: 'text-warning',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold text-warning">{{ notInAcoustidCount }}</span>
      </UPageCard>

      <UPageCard
        icon="i-lucide-cloud-off"
        title="Offline"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: `p-2.5 rounded-full ring ring-inset flex-col ${offlineCount > 0 ? 'bg-error/10 ring-error/25' : 'bg-primary/10 ring-primary/25'}`,
          leadingIcon: offlineCount > 0 ? 'text-error' : '',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold" :class="offlineCount > 0 ? 'text-error' : 'text-highlighted'">{{ offlineCount }}</span>
      </UPageCard>
    </UPageGrid>
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

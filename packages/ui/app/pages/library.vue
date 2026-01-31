<template>
  <div class="flex flex-col gap-6">
    <!-- Action Buttons -->
    <div class="flex justify-end gap-2">
      <UButton icon="i-lucide-folder-search" color="neutral" variant="soft" :loading="scanningDownloads" @click="scanDownloads">
        Scan Downloads
      </UButton>
      <UButton icon="i-lucide-hard-drive" color="neutral" variant="soft" @click="openScanModal">
        Scan External
      </UButton>
    </div>

    <!-- Stats Bar -->
    <UPageGrid v-if="stats" class="lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-px">
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
        <span class="text-2xl font-semibold text-highlighted">{{ stats.total }}</span>
      </UPageCard>

      <UPageCard
        icon="i-lucide-music-2"
        title="Genres"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold text-highlighted">{{ stats.byGenre?.length || 0 }}</span>
      </UPageCard>

      <UPageCard
        icon="i-lucide-disc-3"
        title="Labels"
        variant="subtle"
        :ui="{
          container: 'gap-y-1.5',
          wrapper: 'items-start',
          leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
          title: 'font-normal text-muted text-xs uppercase',
        }"
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
      >
        <span class="text-2xl font-semibold text-highlighted">{{ stats.byLabel?.length || 0 }}</span>
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
        class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1 cursor-pointer transition-all"
        :class="{ 'ring-2 ring-warning': filterNotInAcoustid }"
        @click="filterNotInAcoustid = !filterNotInAcoustid"
      >
        <span class="text-2xl font-semibold text-warning">{{ notInAcoustidCount }}</span>
      </UPageCard>
    </UPageGrid>

    <!-- Pending Section -->
    <UCard v-if="pendingTracks.length > 0" :ui="{ body: showPending ? 'p-0' : 'hidden' }">
      <template #header>
        <button class="flex w-full justify-between items-center" @click="showPending = !showPending">
          <div class="flex items-center gap-2">
            <UIcon :name="showPending ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
            <span class="font-semibold text-warning">Pending Analysis</span>
            <UBadge color="warning" variant="subtle">{{ pendingTracks.length }}</UBadge>
          </div>
          <span v-if="!showPending" class="text-sm text-muted">Click to expand</span>
        </button>
      </template>
      <div v-if="showPending" class="p-4 space-y-3">
        <div class="flex justify-between items-center flex-wrap gap-3">
          <UCheckbox v-model="selectAllPending" :label="`Select all (${selectedPending.size}/${pendingTracks.length})`" @change="toggleSelectAllPending" />
          <div class="flex gap-2">
            <UButton v-if="selectedPending.size > 0" color="error" variant="soft" size="sm" :loading="deleting" @click="deleteSelectedPending">
              Delete {{ selectedPending.size }}
            </UButton>
            <UButton v-if="selectedPending.size > 0" size="sm" :loading="analyzing" @click="analyzeSelected">
              Analyze {{ selectedPending.size }}
            </UButton>
          </div>
        </div>
        <div class="max-h-72 overflow-y-auto rounded-lg border border-default">
          <div
            v-for="track in pendingTracks"
            :key="track.id"
            class="flex items-center gap-3 px-4 py-2.5 border-b border-default last:border-b-0 cursor-pointer hover:bg-elevated/50"
            :class="{ 'bg-elevated': selectedPending.has(track.id) }"
            @click="togglePendingSelect(track.id)"
          >
            <UCheckbox :model-value="selectedPending.has(track.id)" @click.stop @update:model-value="togglePendingSelect(track.id)" />
            <span class="flex-1 text-sm truncate">{{ getFilename(track.file_path) }}</span>
            <UBadge color="neutral" variant="subtle">{{ track.source === 'downloads' || !track.source ? 'SLSK Download' : track.source }}</UBadge>
            <UBadge v-if="track.analysis_status === 'failed'" color="error" variant="subtle">failed</UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Selection Actions -->
    <UCard v-if="selectedTracks.size > 0" color="primary" variant="subtle" :ui="{ body: 'py-3 px-4' }">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <span class="text-sm">{{ selectedTracks.size }} track(s) selected</span>
        <div class="flex gap-2">
          <UButton v-if="singleSelectedTrack" size="sm" color="warning" variant="soft" @click="openMusicBrainzModal(singleSelectedTrack)">
            Link to MusicBrainz
          </UButton>
          <UButton size="sm" color="neutral" variant="soft" :loading="analyzing" @click="reanalyzeSelected">
            Re-analyze
          </UButton>
          <UButton size="sm" @click="openPublishModal">
            Publish to Drive
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Filters -->
    <div class="flex gap-3 flex-wrap">
      <UInput v-model="searchQuery" placeholder="Search artist, title, album..." icon="i-lucide-search" class="flex-1 min-w-48" />
      <select v-model="filterGenre" :disabled="uniqueGenres.length === 0" class="w-40 px-3 py-2 rounded-md bg-elevated border border-default text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
        <option value="">{{ uniqueGenres.length === 0 ? 'No Genres' : 'All Genres' }}</option>
        <option v-for="g in uniqueGenres" :key="g" :value="g">{{ g }}</option>
      </select>
      <select v-model="filterLabel" :disabled="uniqueLabels.length === 0" class="w-40 px-3 py-2 rounded-md bg-elevated border border-default text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
        <option value="">{{ uniqueLabels.length === 0 ? 'No Labels' : 'All Labels' }}</option>
        <option v-for="l in uniqueLabels" :key="l" :value="l">{{ l }}</option>
      </select>
      <select v-model="filterYear" :disabled="uniqueYears.length === 0" class="w-32 px-3 py-2 rounded-md bg-elevated border border-default text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
        <option value="">{{ uniqueYears.length === 0 ? 'No Years' : 'All Years' }}</option>
        <option v-for="y in uniqueYears" :key="y" :value="y">{{ y }}</option>
      </select>
      <select v-model="filterStatus" class="w-32 px-3 py-2 rounded-md bg-elevated border border-default text-sm focus:outline-none focus:ring-2 focus:ring-primary">
        <option value="">All Status</option>
        <option value="available">Available</option>
        <option value="offline">Offline</option>
      </select>
    </div>

    <!-- View Tabs -->
    <UTabs v-model="viewMode" :items="viewTabs" :content="false" />

    <div v-if="pending" class="text-muted text-center py-16">Loading library...</div>

    <template v-else>
      <UCard v-if="filteredTracks.length === 0" class="text-center">
        <p v-if="tracks.length === 0" class="text-muted">Your library is empty. Scan downloads or external storage.</p>
        <p v-else class="text-muted">No tracks match your filters.</p>
      </UCard>

      <!-- Grid View - Group Cards -->
      <template v-else-if="viewMode !== 'list'">
        <!-- Group Detail View (when a group is selected) -->
        <div v-if="selectedGroup" class="space-y-4">
          <div class="flex items-center gap-3">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              @click="selectedGroup = null"
            >
              Back
            </UButton>
            <h2 class="text-xl font-semibold">{{ selectedGroup }}</h2>
            <UBadge color="neutral" variant="subtle">{{ selectedGroupTracks.length }} tracks</UBadge>
          </div>

          <LibraryTable
            :tracks="selectedGroupTracks"
            :selected-tracks="selectedTracks"
            :select-all="selectAllLibrary"
            @toggle-select="toggleTrackSelect"
            @update:select-all="toggleSelectAllLibrary"
            @edit="openEditModal"
          />
        </div>

        <!-- Group Cards Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          <UPageCard
            v-for="group in groupedTracks"
            :key="group.name"
            :icon="viewMode === 'genre' ? 'i-lucide-music-2' : viewMode === 'label' ? 'i-lucide-disc-3' : 'i-lucide-calendar'"
            :title="group.name || 'Unknown'"
            variant="subtle"
            :ui="{
              container: 'gap-y-1.5',
              wrapper: 'items-start',
              leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
              title: 'font-normal text-muted text-xs uppercase truncate',
            }"
            class="cursor-pointer hover:z-1"
            @click="selectedGroup = group.name"
          >
            <span class="text-2xl font-semibold text-highlighted">{{ group.tracks.length }}</span>
          </UPageCard>
        </div>
      </template>

      <!-- List View -->
      <LibraryTable
        v-else
        :tracks="filteredTracks"
        :selected-tracks="selectedTracks"
        :select-all="selectAllLibrary"
        @toggle-select="toggleTrackSelect"
        @update:select-all="toggleSelectAllLibrary"
        @edit="openEditModal"
      />
    </template>

    <!-- Scan Modal -->
    <UModal v-model:open="showScanModal" title="Scan External Storage" description="Scan a directory to find tracks by fingerprint">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Scan External Storage</h2>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="showScanModal = false" />
            </div>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">Scan a directory to find tracks by fingerprint.</p>

            <div class="space-y-2">
              <label class="text-sm font-medium">Available Storage</label>
              <div v-if="loadingVolumes" class="text-center text-muted py-4">Detecting...</div>
              <div v-else-if="volumes.length === 0" class="text-center text-muted py-4">No external storage detected.</div>
              <div v-else class="grid grid-cols-2 gap-3">
                <UCard
                  v-for="vol in volumes"
                  :key="vol.path"
                  class="cursor-pointer transition-all"
                  :class="{ 'ring-2 ring-primary': scanPath === vol.path }"
                  :ui="{ body: 'p-3' }"
                  @click="selectVolume(vol)"
                >
                  <div class="flex gap-3 items-start">
                    <UIcon name="i-lucide-hard-drive" class="size-6 text-muted" />
                    <div class="min-w-0">
                      <p class="font-medium text-sm truncate">{{ vol.label }}</p>
                      <p class="text-xs text-muted truncate">{{ vol.path }}</p>
                      <p class="text-xs text-primary mt-0.5">{{ vol.available }} free</p>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>

            <UFormField label="Directory Path">
              <UInput v-model="scanPath" placeholder="/media/music" />
            </UFormField>

            <UFormField label="Storage Device Name" description="Used to track which device files are stored on">
              <UInput v-model="scanDevice" placeholder="e.g., SSD-Music" />
            </UFormField>

            <UCheckbox v-model="scanRecursive" label="Scan subdirectories" />

            <UAlert v-if="scanResult" :color="scanResult.errors?.length > 0 ? 'warning' : 'success'" variant="soft" :title="scanResult.errors?.length > 0 ? 'Scan completed with warnings' : 'Scan completed successfully'">
              <template #description>
                Found {{ scanResult.found }} files<span v-if="scanResult.converted">, {{ scanResult.converted }} converted to FLAC</span>, {{ scanResult.matched }} matched, {{ scanResult.new }} new
              </template>
            </UAlert>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton v-if="scanResult" color="neutral" variant="ghost" @click="scanResult = null">Scan Again</UButton>
              <UButton v-if="scanResult" @click="showScanModal = false">Done</UButton>
              <template v-else>
                <UButton color="neutral" variant="ghost" @click="showScanModal = false">Close</UButton>
                <UButton :disabled="!scanPath || !scanDevice" :loading="scanning" @click="startScan">Start Scan</UButton>
              </template>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <AnalysisProgress v-if="currentJob" :job-id="currentJob.id" @close="handleJobClose" />
    <PublishModal v-if="showPublishModal" :track-ids="Array.from(selectedTracks)" :volumes="volumes" :loading-volumes="loadingVolumes" @close="showPublishModal = false" @published="handlePublished" />
    <TrackEditModal v-if="showEditModal && editingTrack" :track="editingTrack" @close="closeEditModal" @saved="handleTrackSaved" />

    <!-- MusicBrainz Modal -->
    <UModal v-model:open="showMusicBrainzModal" title="Link to MusicBrainz" description="Link track to MusicBrainz recording">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Link to MusicBrainz</h2>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="closeMusicBrainzModal" />
            </div>
          </template>

          <div class="space-y-4">
            <div v-if="linkingTrack" class="p-3 rounded-lg border border-default">
              <div class="text-sm text-muted mb-1">Track</div>
              <div class="font-medium">{{ linkingTrack.artist || 'Unknown' }} - {{ linkingTrack.title || getFilename(linkingTrack.file_path) }}</div>
            </div>

            <UAlert v-if="linkingResult?.success" color="success" variant="soft">
              <template #title>Linked: {{ linkingResult.track.artist }} - {{ linkingResult.track.title }}</template>
              <template v-if="linkingResult.fingerprintSubmitted" #description>Fingerprint submitted to AcoustID</template>
            </UAlert>

            <UAlert v-if="linkingResult && !linkingResult.success" color="error" variant="soft" :title="linkingResult.error" />

            <template v-if="!linkingResult?.success">
              <div class="space-y-2">
                <label class="block text-sm font-medium">MusicBrainz Recording ID</label>
                <UInput v-model="musicBrainzId" placeholder="e.g. 943e90e3-0665-4b96-8163-b" :disabled="linkingInProgress" />
                <p class="text-xs text-muted">
                  <a
                    :href="musicBrainzSearchUrl"
                    target="_blank"
                    class="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <UIcon name="i-lucide-external-link" class="size-3" />
                    Search on MusicBrainz
                  </a>
                  <span class="mx-1">-</span>
                  Find the recording and copy the ID from the URL
                </p>
              </div>

              <UCheckbox v-model="musicBrainzSubmitFingerprint" label="Submit fingerprint to AcoustID" :disabled="linkingInProgress" />
            </template>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="closeMusicBrainzModal">
                {{ linkingResult?.success ? 'Close' : 'Cancel' }}
              </UButton>
              <UButton v-if="!linkingResult?.success" :disabled="!musicBrainzId" :loading="linkingInProgress" @click="linkToMusicBrainz">
                Link
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { getTopGenre, matchesGenreFilter } from '~/composables/useGenre'

definePageMeta({ pageTitle: 'Library' })
useHead({ title: 'Library' })

const viewMode = ref('genre')
const selectedGroup = ref(null)
const searchQuery = ref('')
const filterGenre = ref('')
const filterLabel = ref('')
const filterYear = ref('')
const filterStatus = ref('')
const filterNotInAcoustid = ref(false)

const viewTabs = [
  { label: 'By Genre', value: 'genre' },
  { label: 'By Label', value: 'label' },
  { label: 'By Year', value: 'year' },
  { label: 'List', value: 'list' },
]

// Clear selected group when view mode changes
watch(viewMode, () => {
  selectedGroup.value = null
})

const selectedGroupTracks = computed(() => {
  if (!selectedGroup.value) return []
  const group = groupedTracks.value.find(g => g.name === selectedGroup.value)
  return group?.tracks || []
})

const showScanModal = ref(false)
const scanPath = ref('')
const scanDevice = ref('')
const scanRecursive = ref(true)
const scanning = ref(false)
const scanResult = ref(null)
const volumes = ref([])
const loadingVolumes = ref(false)
const scanningDownloads = ref(false)

const showPending = ref(false)
const selectedPending = ref(new Set())
const selectAllPending = ref(false)

const selectedTracks = ref(new Set())
const selectAllLibrary = ref(false)

const analyzing = ref(false)
const deleting = ref(false)
const currentJob = ref(null)
const showPublishModal = ref(false)

const showMusicBrainzModal = ref(false)
const musicBrainzId = ref('')
const musicBrainzSubmitFingerprint = ref(true)
const linkingTrack = ref(null)
const linkingInProgress = ref(false)
const linkingResult = ref(null)

const showEditModal = ref(false)
const editingTrack = ref(null)

const musicBrainzSearchUrl = computed(() => {
  if (!linkingTrack.value) return 'https://musicbrainz.org/search?type=recording'
  const query = [linkingTrack.value.artist, linkingTrack.value.title].filter(Boolean).join(' ')
  return `https://musicbrainz.org/search?type=recording&query=${encodeURIComponent(query)}`
})

const { data: libraryData, pending, refresh } = await useFetch('/api/library', {
  key: 'library-data',
  default: () => ({ tracks: [], pendingTracks: [], stats: { total: 0, byGenre: [], byLabel: [], byYear: [], byStatus: [] }, settings: {} }),
})

// Silent auto-refresh every 10 seconds to sync storage status (no loading flicker)
const refreshInterval = ref(null)

async function silentRefresh() {
  try {
    const newData = await $fetch('/api/library')
    if (!newData) return

    // Check if storage status changed for any track
    let hasChanges = false
    if (newData.tracks && libraryData.value?.tracks) {
      for (const newTrack of newData.tracks) {
        const existing = libraryData.value.tracks.find(t => t.id === newTrack.id)
        if (existing && existing.storage_status !== newTrack.storage_status) {
          hasChanges = true
          break
        }
      }
    }

    // Only update if there are actual changes
    if (hasChanges) {
      libraryData.value = newData
    }
  }
  catch {
    // Silent fail - don't disrupt UI
  }
}

onMounted(() => {
  refreshInterval.value = setInterval(silentRefresh, 10000)
})

onUnmounted(() => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
})

const tracks = computed(() => libraryData.value?.tracks || [])
const pendingTracks = computed(() => libraryData.value?.pendingTracks || [])
const stats = computed(() => libraryData.value?.stats)
const offlineCount = computed(() => stats.value?.byStatus?.find(s => s.status === 'offline')?.count || 0)
const notInAcoustidCount = computed(() => tracks.value.filter(t => !t.musicbrainz_id).length)

const uniqueGenres = computed(() => {
  const genres = new Set()
  for (const track of tracks.value) {
    const topGenre = getTopGenre(track.genres)
    if (topGenre) genres.add(topGenre)
  }
  return Array.from(genres).sort()
})

const uniqueLabels = computed(() => {
  const labels = new Set()
  for (const track of tracks.value) {
    if (track.label) labels.add(track.label)
  }
  return Array.from(labels).sort()
})

const uniqueYears = computed(() => {
  const years = new Set()
  for (const track of tracks.value) {
    if (track.year) years.add(track.year)
  }
  return Array.from(years).sort((a, b) => b - a)
})

const filteredTracks = computed(() => {
  let result = tracks.value
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(t => t.artist?.toLowerCase().includes(query) || t.title?.toLowerCase().includes(query) || t.album?.toLowerCase().includes(query))
  }
  if (filterGenre.value) {
    result = result.filter(t => matchesGenreFilter(t.genres, filterGenre.value))
  }
  if (filterLabel.value) result = result.filter(t => t.label === filterLabel.value)
  if (filterYear.value) result = result.filter(t => t.year === Number.parseInt(filterYear.value, 10))
  if (filterStatus.value) result = result.filter(t => t.storage_status === filterStatus.value)
  if (filterNotInAcoustid.value) result = result.filter(t => !t.musicbrainz_id)
  return result
})

const groupedTracks = computed(() => {
  const groups = new Map()
  for (const track of filteredTracks.value) {
    let key = 'Unknown'
    if (viewMode.value === 'genre') {
      key = getTopGenre(track.genres) || 'Unknown'
    }
    else if (viewMode.value === 'label') {
      key = track.label || 'Unknown Label'
    }
    else if (viewMode.value === 'year') {
      key = track.year ? String(track.year) : 'Unknown Year'
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(track)
  }
  return Array.from(groups.entries()).map(([name, tracks]) => ({ name, tracks })).sort((a, b) => viewMode.value === 'year' ? (Number.parseInt(b.name, 10) || 0) - (Number.parseInt(a.name, 10) || 0) : b.tracks.length - a.tracks.length)
})

async function openScanModal() {
  showScanModal.value = true
  scanResult.value = null
  loadingVolumes.value = true
  try {
    volumes.value = await $fetch('/api/volumes')
  }
  catch {
    volumes.value = []
  }
  loadingVolumes.value = false
}

function selectVolume(volume) {
  scanPath.value = volume.path
  scanDevice.value = volume.label
}

async function startScan() {
  if (!scanPath.value || !scanDevice.value) return
  scanning.value = true
  scanResult.value = null
  try {
    scanResult.value = await $fetch('/api/library/scan', { method: 'POST', body: { path: scanPath.value, storageDevice: scanDevice.value, recursive: scanRecursive.value } })
    await refresh()
  }
  catch (e) {
    scanResult.value = { found: 0, matched: 0, new: 0, errors: [e.data?.message || 'Scan failed'] }
  }
  scanning.value = false
}

async function scanDownloads() {
  scanningDownloads.value = true
  try {
    const result = await $fetch('/api/library/scan', { method: 'POST', body: { path: '/app/downloads', source: 'downloads', recursive: true } })
    if (result.needsAnalysis > 0) showPending.value = true
    await refresh()
  }
  catch (e) {
    alert(e.data?.message || 'Failed to scan downloads')
  }
  scanningDownloads.value = false
}

function getFilename(filePath) {
  return filePath?.split('/').pop() || 'Unknown file'
}

function togglePendingSelect(trackId) {
  if (selectedPending.value.has(trackId)) {
    selectedPending.value.delete(trackId)
  }
  else {
    selectedPending.value.add(trackId)
  }
  selectedPending.value = new Set(selectedPending.value)
  selectAllPending.value = selectedPending.value.size === pendingTracks.value.length
}

function toggleSelectAllPending() {
  selectedPending.value = selectAllPending.value ? new Set(pendingTracks.value.map(t => t.id)) : new Set()
}

function toggleTrackSelect(trackId) {
  if (selectedTracks.value.has(trackId)) {
    selectedTracks.value.delete(trackId)
  }
  else {
    selectedTracks.value.add(trackId)
  }
  selectedTracks.value = new Set(selectedTracks.value)
  selectAllLibrary.value = selectedTracks.value.size === filteredTracks.value.length
}

function toggleSelectAllLibrary() {
  selectedTracks.value = selectAllLibrary.value ? new Set() : new Set(filteredTracks.value.map(t => t.id))
  selectAllLibrary.value = !selectAllLibrary.value
}

async function analyzeSelected() {
  if (selectedPending.value.size === 0) return
  analyzing.value = true
  try {
    const response = await $fetch('/api/analyze/start', { method: 'POST', body: { trackIds: Array.from(selectedPending.value) } })
    currentJob.value = response.job
    selectedPending.value = new Set()
    selectAllPending.value = false
  }
  catch (e) {
    alert(e.data?.message || 'Failed to start analysis')
  }
  analyzing.value = false
}

async function reanalyzeSelected() {
  if (selectedTracks.value.size === 0) return
  analyzing.value = true
  try {
    const response = await $fetch('/api/analyze/start', { method: 'POST', body: { trackIds: Array.from(selectedTracks.value), forceReanalyze: true } })
    currentJob.value = response.job
    selectedTracks.value = new Set()
    selectAllLibrary.value = false
  }
  catch (e) {
    alert(e.data?.message || 'Failed to start re-analysis')
  }
  analyzing.value = false
}

async function deleteSelectedPending() {
  if (selectedPending.value.size === 0 || !confirm(`Delete ${selectedPending.value.size} files?`)) return
  deleting.value = true
  try {
    await $fetch('/api/library/delete', { method: 'POST', body: { trackIds: Array.from(selectedPending.value) } })
    selectedPending.value = new Set()
    selectAllPending.value = false
    await refresh()
  }
  catch (e) {
    alert(e.data?.message || 'Failed to delete files')
  }
  deleting.value = false
}

async function handleJobClose() {
  currentJob.value = null
  await refresh()
}

async function handlePublished(result) {
  showPublishModal.value = false
  selectedTracks.value = new Set()
  selectAllLibrary.value = false
  await refresh()
  if (result.success > 0) alert(`Published ${result.success} track(s).`)
}

async function openPublishModal() {
  loadingVolumes.value = true
  showPublishModal.value = true
  try {
    volumes.value = await $fetch('/api/volumes')
  }
  catch {
    volumes.value = []
  }
  loadingVolumes.value = false
}

function openMusicBrainzModal(track) {
  linkingTrack.value = track
  musicBrainzId.value = track.musicbrainz_id || ''
  musicBrainzSubmitFingerprint.value = true
  linkingResult.value = null
  showMusicBrainzModal.value = true
}

function closeMusicBrainzModal() {
  showMusicBrainzModal.value = false
  linkingTrack.value = null
  musicBrainzId.value = ''
  if (linkingResult.value?.success) refreshNuxtData('library-data')
  linkingResult.value = null
}

async function linkToMusicBrainz() {
  if (!musicBrainzId.value || !linkingTrack.value) return
  linkingInProgress.value = true
  linkingResult.value = null
  try {
    linkingResult.value = await $fetch('/api/library/link-musicbrainz', { method: 'POST', body: { trackId: linkingTrack.value.id, recordingId: musicBrainzId.value.trim(), submitFingerprint: musicBrainzSubmitFingerprint.value } })
    if (linkingResult.value.success) await refreshNuxtData('library-data')
  }
  catch (e) {
    linkingResult.value = { success: false, error: e.data?.message || 'Failed to link' }
  }
  linkingInProgress.value = false
}

const singleSelectedTrack = computed(() => {
  if (selectedTracks.value.size !== 1) return null
  return tracks.value.find(t => t.id === Array.from(selectedTracks.value)[0])
})

function openEditModal(track) {
  editingTrack.value = track
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingTrack.value = null
}

async function handleTrackSaved() {
  closeEditModal()
  selectedTracks.value = new Set()
  selectAllLibrary.value = false
  await refreshNuxtData('library-data')
}
</script>

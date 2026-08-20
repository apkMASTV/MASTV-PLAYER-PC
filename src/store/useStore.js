import { create } from 'zustand'

export const XTREAM_SERVERS = [
  'http://mtv.bo:80',
  'http://1234.bo:25461',
  'http://mastv.me:8000',
]

// IDs especiales de categoría para Live TV
export const CAT_FAVS   = '__favs__'
export const CAT_RECENT = '__recent__'

// IDs especiales de categoría para Películas
export const CAT_MOVIE_FAVS   = '__movie_favs__'
export const CAT_MOVIE_RECENT = '__movie_recent__'

// IDs especiales de categoría para Series
export const CAT_SERIES_FAVS   = '__series_favs__'
export const CAT_SERIES_RECENT = '__series_recent__'

const MAX_RECENT = 10

const useStore = create((set, get) => ({
  // ── Auth ─────────────────────────────────────────────────
  isAuthenticated: false,
  authMethod: null,
  credentials: null,
  userInfo: null,

  // ── Cuentas guardadas (multi-cuenta) ──────────────────────
  // [{ id, method, username?, password?, m3uUrl?, userInfo?, lastUsedAt, addedAt }]
  savedAccounts: [],

  // ── Demo ──────────────────────────────────────────────────
  isDemoMode:  false,
  demoExpires: null,   // timestamp ms en que vence el demo
  demoNotice:  null,   // null | 'expired' | 'used'   (persiste tras logout para mostrar en Login)

  // ── Carga inicial ─────────────────────────────────────────
  appReady: false,

  // ── Navegación ────────────────────────────────────────────
  currentSection: 'livetv',

  // ── Datos del servidor ────────────────────────────────────
  liveCategories: [],
  liveChannels: [],
  movieCategories: [],
  movies: [],
  seriesCategories: [],
  series: [],

  // ── Favoritos por sección
  channelFavorites: [],
  movieFavorites: [],
  seriesFavorites: [],

  // ── Historial últimos vistos
  recentChannels: [],
  recentMovies: [],
  recentSeries: [],

  // ── Reproductor Live TV (inline) ─────────────────────────
  liveStream: null,

  // ── Reproductor overlay (películas / series) ──────────────
  currentStream: null,
  isPlayerOpen: false,
  playerMinimized: false,

  // Contexto de episodios para navegación prev/next dentro de una serie
  // { episodes: [{ ...ep, _url, _name }], currentIndex: number }
  episodeContext: null,

  // ── Filtros activos ───────────────────────────────────────
  activeLiveCategory: 'all',
  activeMovieCategory: 'all',
  activeSeriesCategory: 'all',
  searchQuery: '',

  // ══════════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════════

  setAuthenticated: (method, credentials, userInfo = null) =>
    set({ isAuthenticated: true, authMethod: method, credentials, userInfo, appReady: false, demoNotice: null }),

  setDemoMode: (expiresAt) =>
    set({ isDemoMode: true, demoExpires: expiresAt, demoNotice: null }),

  setDemoNotice: (notice) =>
    set({ demoNotice: notice }),

  setAppReady: () => set({ appReady: true }),

  // ── Gestión de cuentas guardadas ─────────────────────────
  setSavedAccounts: (accounts) => set({ savedAccounts: accounts }),

  addOrUpdateSavedAccount: (account) => {
    const { savedAccounts } = get()
    const idx = savedAccounts.findIndex((a) => a.id === account.id)
    if (idx >= 0) {
      const updated = [...savedAccounts]
      updated[idx] = { ...updated[idx], ...account, lastUsedAt: Date.now() }
      set({ savedAccounts: updated })
    } else {
      set({ savedAccounts: [...savedAccounts, { ...account, addedAt: Date.now(), lastUsedAt: Date.now() }] })
    }
  },

  removeSavedAccount: (id) => {
    set({ savedAccounts: get().savedAccounts.filter((a) => a.id !== id) })
  },

  logout: () =>
    set({
      isAuthenticated: false,
      authMethod: null,
      credentials: null,
      userInfo: null,
      appReady: false,
      liveCategories: [],
      liveChannels: [],
      movieCategories: [],
      movies: [],
      seriesCategories: [],
      series: [],
      // Favoritos e historial se preservan en memoria para que estén disponibles
      // si el usuario vuelve a hacer login en la misma sesión sin reiniciar la app.
      // El PersistenceManager ya los guarda en disco continuamente.
      liveStream: null,
      currentStream: null,
      isPlayerOpen: false,
      playerMinimized: false,
      episodeContext: null,
      activeLiveCategory: 'all',
      activeMovieCategory: 'all',
      activeSeriesCategory: 'all',
      searchQuery: '',
      currentSection: 'livetv',
      isDemoMode:  false,
      demoExpires: null,
      // demoNotice, savedAccounts, favoritos y historial NO se limpian en logout.
    }),

  setCurrentSection: (section) =>
    set({ currentSection: section, searchQuery: '' }),

  // Datos
  setLiveData:   (categories, channels) => set({ liveCategories: categories, liveChannels: channels }),
  setMovieData:  (categories, movies)   => set({ movieCategories: categories, movies }),
  setSeriesData: (categories, series)   => set({ seriesCategories: categories, series }),

  setActiveLiveCategory:   (cat) => set({ activeLiveCategory: cat }),
  setActiveMovieCategory:  (cat) => set({ activeMovieCategory: cat }),
  setActiveSeriesCategory: (cat) => set({ activeSeriesCategory: cat }),
  setSearchQuery:          (q)   => set({ searchQuery: q }),

  // Reproductor
  setLiveStream: (stream) => set({ liveStream: stream }),
  playStream:    (stream) => set({ currentStream: stream, isPlayerOpen: true, playerMinimized: false }),
  closePlayer:   ()       => set({ isPlayerOpen: false, currentStream: null, episodeContext: null }),
  setEpisodeContext: (episodes, currentIndex) => set({ episodeContext: { episodes, currentIndex } }),
  minimizePlayer:(val)    => set({ playerMinimized: val }),

  // ── Favoritos de canales ──────────────────────────────────
  toggleChannelFavorite: (channel) => {
    const { channelFavorites } = get()
    const exists = channelFavorites.some((c) => c.stream_id === channel.stream_id)
    if (exists) {
      set({ channelFavorites: channelFavorites.filter((c) => c.stream_id !== channel.stream_id) })
    } else {
      set({ channelFavorites: [...channelFavorites, { ...channel, stream_type: 'live' }] })
    }
  },

  isChannelFav: (channel) =>
    get().channelFavorites.some((c) => c.stream_id === channel.stream_id),

  // ── Favoritos de películas ────────────────────────────────
  toggleMovieFavorite: (movie) => {
    const { movieFavorites } = get()
    const exists = movieFavorites.some((f) => f.stream_id === movie.stream_id)
    if (exists) {
      set({ movieFavorites: movieFavorites.filter((f) => f.stream_id !== movie.stream_id) })
    } else {
      set({ movieFavorites: [...movieFavorites, { ...movie, stream_type: 'movie' }] })
    }
  },

  // ── Favoritos de series ───────────────────────────────────
  toggleSeriesFavorite: (show) => {
    const { seriesFavorites } = get()
    const id = show.series_id ?? show.stream_id
    const exists = seriesFavorites.some((f) => (f.series_id ?? f.stream_id) === id)
    if (exists) {
      set({ seriesFavorites: seriesFavorites.filter((f) => (f.series_id ?? f.stream_id) !== id) })
    } else {
      set({ seriesFavorites: [...seriesFavorites, { ...show, series_id: id, stream_type: 'series' }] })
    }
  },

  // ── Historial de canales ──────────────────────────────────
  addRecentChannel: (channel) => {
    const { recentChannels } = get()
    const filtered = recentChannels.filter((c) => c.stream_id !== channel.stream_id)
    set({ recentChannels: [{ ...channel, stream_type: 'live' }, ...filtered].slice(0, MAX_RECENT) })
  },

  // ── Historial de películas ────────────────────────────────
  addRecentMovie: (movie) => {
    const { recentMovies } = get()
    const filtered = recentMovies.filter((m) => m.stream_id !== movie.stream_id)
    set({ recentMovies: [{ ...movie, stream_type: 'movie' }, ...filtered].slice(0, MAX_RECENT) })
  },

  // ── Historial de series ───────────────────────────────────
  addRecentSeries: (show) => {
    const id = show.series_id ?? show.stream_id
    const { recentSeries } = get()
    const filtered = recentSeries.filter((s) => (s.series_id ?? s.stream_id) !== id)
    set({ recentSeries: [{ ...show, series_id: id, stream_type: 'series' }, ...filtered].slice(0, MAX_RECENT) })
  },
}))

export default useStore

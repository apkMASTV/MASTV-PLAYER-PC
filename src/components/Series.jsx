import { useEffect, useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useStore from '../store/useStore'
import { CAT_SERIES_FAVS, CAT_SERIES_RECENT } from '../store/useStore'
import { xtreamApi } from '../services/xtreamApi'

// Pre-construye la URL de un episodio para navegación prev/next en el Player
function buildEpEntry(ep, activeSeason, seriesName, authMethod, credentials) {
  const { username, password } = credentials || {}
  let url = ep.url
  if (!url && authMethod === 'xtream') {
    url = xtreamApi.getEpisodeStreamUrl(username, password, ep.id, ep.container_extension || 'mp4')
  }
  return {
    ...ep,
    _url: url,
    _name: `${seriesName} — T${ep.season ?? activeSeason}E${ep.episode_num}: ${ep.title || 'Episodio ' + ep.episode_num}`,
  }
}

const PAGE_SIZE = 100

export default function Series() {
  const setSearchQuery       = useStore((s) => s.setSearchQuery)
  const toggleSeriesFavorite = useStore((s) => s.toggleSeriesFavorite)
  const addRecentSeries      = useStore((s) => s.addRecentSeries)
  const setSeriesData        = useStore((s) => s.setSeriesData)
  const playStream           = useStore((s) => s.playStream)
  const setEpisodeContext    = useStore((s) => s.setEpisodeContext)

  const {
    authMethod, credentials,
    series, activeSeriesCategory,
    searchQuery,
    seriesFavorites, recentSeries,
  } = useStore(
    useShallow((s) => ({
      authMethod: s.authMethod,
      credentials: s.credentials,
      series: s.series,
      activeSeriesCategory: s.activeSeriesCategory,
      searchQuery: s.searchQuery,
      seriesFavorites: s.seriesFavorites,
      recentSeries: s.recentSeries,
    }))
  )

  const [localLoading,   setLocalLoading]   = useState(false)
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [seriesDetail,   setSeriesDetail]   = useState(null)
  const [loadingDetail,  setLoadingDetail]  = useState(false)
  const [activeSeason,   setActiveSeason]   = useState(1)
  const [page,           setPage]           = useState(1)

  useEffect(() => {
    if (series.length === 0 && authMethod === 'xtream') loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1) }, [activeSeriesCategory, searchQuery])

  const loadData = async () => {
    setLocalLoading(true)
    try {
      const { username, password } = credentials
      const [cats, list] = await Promise.all([
        xtreamApi.getSeriesCategories(username, password),
        xtreamApi.getSeries(username, password),
      ])
      setSeriesData(cats, list)
    } catch (err) {
      console.error('Error cargando series:', err)
    } finally {
      setLocalLoading(false)
    }
  }

  // Series ordenadas del más reciente al más antiguo (campo `last_modified` o `releaseDate`)
  const sortedSeries = useMemo(
    () => [...series].sort((a, b) => {
      const ta = parseInt(a.last_modified || a.releaseDate || '0', 10)
      const tb = parseInt(b.last_modified || b.releaseDate || '0', 10)
      return tb - ta
    }),
    [series]
  )

  const filteredSeries = useMemo(() => {
    // Carpetas especiales
    if (activeSeriesCategory === CAT_SERIES_FAVS) {
      const favIds = new Set(seriesFavorites.map((f) => f.series_id ?? f.stream_id))
      return sortedSeries.filter((s) => favIds.has(s.series_id))
    }
    if (activeSeriesCategory === CAT_SERIES_RECENT) {
      return recentSeries
    }

    let list = sortedSeries
    if (activeSeriesCategory !== 'all') {
      list = list.filter((s) => String(s.category_id) === String(activeSeriesCategory))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((s) => s.name?.toLowerCase().includes(q))
    }
    return list
  }, [sortedSeries, activeSeriesCategory, searchQuery, seriesFavorites, recentSeries])

  // Set de IDs para lookup O(1)
  const favSet = useMemo(
    () => new Set(seriesFavorites.map((f) => f.series_id ?? f.stream_id)),
    [seriesFavorites]
  )

  const displayedSeries = filteredSeries.slice(0, page * PAGE_SIZE)
  const hasMore = displayedSeries.length < filteredSeries.length

  const openSeriesDetail = async (show) => {
    setSelectedSeries(show)
    setSeriesDetail(null)
    setActiveSeason(1)
    if (authMethod === 'xtream') {
      setLoadingDetail(true)
      try {
        const { username, password } = credentials
        const detail = await xtreamApi.getSeriesInfo(username, password, show.series_id)
        setSeriesDetail(detail)
        const seasons = Object.keys(detail?.episodes || {}).map(Number).sort((a, b) => a - b)
        if (seasons.length > 0) setActiveSeason(seasons[0])
      } catch (_) {}
      finally { setLoadingDetail(false) }
    }
  }

  const playEpisode = (episode, idx) => {
    const seriesName = selectedSeries?.name ?? ''
    const entry = buildEpEntry(episode, activeSeason, seriesName, authMethod, credentials)
    if (!entry._url) return
    if (selectedSeries) addRecentSeries(selectedSeries)

    // Construir contexto completo de la temporada para prev/next en el player
    const builtEpisodes = currentEpisodes.map((ep) =>
      buildEpEntry(ep, activeSeason, seriesName, authMethod, credentials)
    )
    setEpisodeContext(builtEpisodes, idx)

    playStream({
      name: entry._name,
      url: entry._url,
      stream_type: 'series',
      stream_id: episode.id,
    })
  }

  const safeRating = (r) => {
    const n = parseFloat(r)
    return isNaN(n) ? null : n.toFixed(1)
  }

  const seasons = seriesDetail?.episodes
    ? Object.keys(seriesDetail.episodes).map(Number).sort((a, b) => a - b)
    : []
  const currentEpisodes = seriesDetail?.episodes?.[activeSeason] || []

  if (localLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Cargando series...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="content-header">
        <h1>🎭 Series</h1>
        <div className="search-bar">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Buscar serie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filteredSeries.length.toLocaleString()} series
        </span>
      </div>

      <div className="content-grid">
        {filteredSeries.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🎭</span>
            <p>
              {activeSeriesCategory === CAT_SERIES_FAVS
                ? 'Aún no tienes series favoritas. Presiona ☆ en cualquier serie.'
                : activeSeriesCategory === CAT_SERIES_RECENT
                  ? 'No hay series vistas recientemente.'
                  : 'No se encontraron series.'}
            </p>
          </div>
        ) : (
          <>
            <div className="media-grid">
              {displayedSeries.map((show) => {
                const poster = show.cover
                const rating = safeRating(show.rating)
                return (
                  <div
                    key={show.series_id ?? show.name}
                    className="media-card"
                    onClick={() => openSeriesDetail(show)}
                  >
                    {poster ? (
                      <img
                        className="media-card-poster"
                        src={poster}
                        alt={show.name}
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = 'none'
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div
                      className="media-card-poster-placeholder"
                      style={{ display: poster ? 'none' : 'flex' }}
                    >
                      🎭
                    </div>
                    <div className="media-card-info">
                      <div className="media-card-title">{show.name}</div>
                      {rating && <div className="media-card-meta">⭐ {rating}</div>}
                    </div>
                    <button
                      className={`media-card-fav ${favSet.has(show.series_id) ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleSeriesFavorite(show) }}
                    >
                      {favSet.has(show.series_id) ? '★' : '☆'}
                    </button>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: '10px 28px',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    fontSize: 13, fontFamily: 'var(--font)', transition: 'all 0.15s',
                  }}
                  onMouseOver={(e) => { e.target.style.background = 'var(--bg-card-hover)'; e.target.style.color = 'var(--text-primary)' }}
                  onMouseOut={(e) => { e.target.style.background = 'var(--bg-card)'; e.target.style.color = 'var(--text-secondary)' }}
                >
                  Cargar más ({filteredSeries.length - displayedSeries.length} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal detalle de serie */}
      {selectedSeries && (
        <div className="modal-overlay" onClick={() => setSelectedSeries(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hero">
              {(seriesDetail?.info?.backdrop_path || selectedSeries.cover) && (
                <img src={seriesDetail?.info?.backdrop_path || selectedSeries.cover} alt={selectedSeries.name} />
              )}
              <div className="modal-hero-overlay" />
              <button className="modal-hero-close" onClick={() => setSelectedSeries(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-title">{selectedSeries.name}</div>
              <div className="modal-meta">
                {selectedSeries.releaseDate && <span>{selectedSeries.releaseDate.split('-')[0]}</span>}
                {safeRating(selectedSeries.rating) && <span>⭐ {safeRating(selectedSeries.rating)}</span>}
                {seasons.length > 0 && <span>{seasons.length} temporada{seasons.length !== 1 ? 's' : ''}</span>}
              </div>
              {seriesDetail?.info?.plot && <div className="modal-plot">{seriesDetail.info.plot}</div>}

              {loadingDetail ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <div className="loading-spinner" />
                </div>
              ) : seasons.length > 0 ? (
                <>
                  <div className="season-selector">
                    {seasons.map((s) => (
                      <button key={s} className={`season-btn ${activeSeason === s ? 'active' : ''}`} onClick={() => setActiveSeason(s)}>
                        Temporada {s}
                      </button>
                    ))}
                  </div>
                  <div className="episodes-list">
                    {currentEpisodes.map((ep, idx) => (
                      <div key={ep.id ?? ep.episode_num} className="episode-item" onClick={() => playEpisode(ep, idx)}>
                        <span className="episode-num">{ep.episode_num}</span>
                        <div className="episode-info">
                          <div className="episode-name">{ep.title || `Episodio ${ep.episode_num}`}</div>
                          {ep.duration && <div className="episode-duration">{ep.duration}</div>}
                        </div>
                        <button className="play-icon-btn">▶</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ height: 'auto', padding: '20px 0' }}>
                  <p>No hay episodios disponibles</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

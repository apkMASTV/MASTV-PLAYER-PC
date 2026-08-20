import { useEffect, useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useStore from '../store/useStore'
import { CAT_MOVIE_FAVS, CAT_MOVIE_RECENT } from '../store/useStore'
import { xtreamApi } from '../services/xtreamApi'

const PAGE_SIZE = 100

export default function Movies() {
  const setSearchQuery      = useStore((s) => s.setSearchQuery)
  const toggleMovieFavorite = useStore((s) => s.toggleMovieFavorite)
  const addRecentMovie      = useStore((s) => s.addRecentMovie)
  const setMovieData        = useStore((s) => s.setMovieData)
  const playStream          = useStore((s) => s.playStream)

  const {
    authMethod, credentials,
    movies, activeMovieCategory,
    searchQuery,
    movieFavorites, recentMovies,
  } = useStore(
    useShallow((s) => ({
      authMethod: s.authMethod,
      credentials: s.credentials,
      movies: s.movies,
      activeMovieCategory: s.activeMovieCategory,
      searchQuery: s.searchQuery,
      movieFavorites: s.movieFavorites,
      recentMovies: s.recentMovies,
    }))
  )

  const [localLoading,  setLocalLoading]  = useState(false)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [movieDetail,   setMovieDetail]   = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [page,          setPage]          = useState(1)

  useEffect(() => {
    if (movies.length === 0 && authMethod === 'xtream') loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1) }, [activeMovieCategory, searchQuery])

  const loadData = async () => {
    setLocalLoading(true)
    try {
      const { username, password } = credentials
      const [cats, vods] = await Promise.all([
        xtreamApi.getVodCategories(username, password),
        xtreamApi.getVodStreams(username, password),
      ])
      setMovieData(cats, vods)
    } catch (err) {
      console.error('Error cargando películas:', err)
    } finally {
      setLocalLoading(false)
    }
  }

  // Películas ordenadas del más reciente al más antiguo (campo `added` es timestamp Unix)
  const sortedMovies = useMemo(
    () => [...movies].sort((a, b) => parseInt(b.added || '0', 10) - parseInt(a.added || '0', 10)),
    [movies]
  )

  const filteredMovies = useMemo(() => {
    // Carpetas especiales
    if (activeMovieCategory === CAT_MOVIE_FAVS) {
      const favIds = new Set(movieFavorites.map((f) => f.stream_id))
      return sortedMovies.filter((m) => favIds.has(m.stream_id))
    }
    if (activeMovieCategory === CAT_MOVIE_RECENT) {
      return recentMovies
    }

    let list = sortedMovies
    if (activeMovieCategory !== 'all') {
      list = list.filter((m) => String(m.category_id) === String(activeMovieCategory))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((m) => m.name?.toLowerCase().includes(q))
    }
    return list
  }, [sortedMovies, activeMovieCategory, searchQuery, movieFavorites, recentMovies])

  // Set de IDs para lookup O(1) en el render
  const favSet = useMemo(
    () => new Set(movieFavorites.map((f) => f.stream_id)),
    [movieFavorites]
  )

  const displayedMovies = filteredMovies.slice(0, page * PAGE_SIZE)
  const hasMore = displayedMovies.length < filteredMovies.length

  const openMovieDetail = async (movie) => {
    setSelectedMovie(movie)
    setMovieDetail(null)
    if (authMethod === 'xtream') {
      setLoadingDetail(true)
      try {
        const { username, password } = credentials
        const detail = await xtreamApi.getVodInfo(username, password, movie.stream_id)
        setMovieDetail(detail)
      } catch (_) {}
      finally { setLoadingDetail(false) }
    }
  }

  const playMovie = (movie) => {
    let url = movie.url
    if (!url && authMethod === 'xtream') {
      const { username, password } = credentials
      url = xtreamApi.getVodStreamUrl(username, password, movie.stream_id, movie.container_extension || 'mp4')
    }
    if (!url) return
    addRecentMovie(movie)
    playStream({
      name: movie.name,
      url,
      poster: movie.stream_icon || movie.cover,
      stream_type: 'movie',
      stream_id: movie.stream_id,
    })
    setSelectedMovie(null)
  }

  const safeRating = (r) => {
    const n = parseFloat(r)
    return isNaN(n) ? null : n.toFixed(1)
  }

  if (localLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Cargando películas...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="content-header">
        <h1>🎬 Películas</h1>
        <div className="search-bar">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Buscar película..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filteredMovies.length.toLocaleString()} títulos
        </span>
      </div>

      <div className="content-grid">
        {filteredMovies.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🎬</span>
            <p>
              {activeMovieCategory === CAT_MOVIE_FAVS
                ? 'Aún no tienes películas favoritas. Presiona ☆ en cualquier película.'
                : activeMovieCategory === CAT_MOVIE_RECENT
                  ? 'No hay películas vistas recientemente.'
                  : 'No se encontraron películas.'}
            </p>
          </div>
        ) : (
          <>
            <div className="media-grid">
              {displayedMovies.map((movie) => {
                const poster = movie.stream_icon || movie.cover
                const rating = safeRating(movie.rating)
                return (
                  <div
                    key={movie.stream_id ?? movie.name}
                    className="media-card"
                    onClick={() => openMovieDetail(movie)}
                  >
                    {poster ? (
                      <img
                        className="media-card-poster"
                        src={poster}
                        alt={movie.name}
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
                      🎬
                    </div>
                    <div className="media-card-info">
                      <div className="media-card-title">{movie.name}</div>
                      {rating && <div className="media-card-meta">⭐ {rating}</div>}
                    </div>
                    <button
                      className={`media-card-fav ${favSet.has(movie.stream_id) ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleMovieFavorite(movie) }}
                    >
                      {favSet.has(movie.stream_id) ? '★' : '☆'}
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
                  Cargar más ({filteredMovies.length - displayedMovies.length} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal detalle */}
      {selectedMovie && (
        <div className="modal-overlay" onClick={() => setSelectedMovie(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hero">
              {(movieDetail?.info?.backdrop_path?.[0] || selectedMovie.stream_icon) && (
                <img src={movieDetail?.info?.backdrop_path?.[0] || selectedMovie.stream_icon} alt={selectedMovie.name} />
              )}
              <div className="modal-hero-overlay" />
              <button className="modal-hero-close" onClick={() => setSelectedMovie(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-title">{selectedMovie.name}</div>
              <div className="modal-meta">
                {movieDetail?.info?.releasedate && <span>{movieDetail.info.releasedate.split('-')[0]}</span>}
                {movieDetail?.info?.duration && <span>{movieDetail.info.duration}</span>}
                {safeRating(selectedMovie.rating || movieDetail?.info?.rating) && (
                  <span>⭐ {safeRating(selectedMovie.rating || movieDetail?.info?.rating)}</span>
                )}
              </div>
              {loadingDetail ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <div className="loading-spinner" />
                </div>
              ) : movieDetail?.info?.plot ? (
                <div className="modal-plot">{movieDetail.info.plot}</div>
              ) : null}
              <button className="btn-primary" onClick={() => playMovie(selectedMovie)}>
                ▶ Reproducir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

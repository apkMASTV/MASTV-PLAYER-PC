import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useStore from './store/useStore'
import {
  CAT_FAVS, CAT_RECENT,
  CAT_MOVIE_FAVS, CAT_MOVIE_RECENT,
  CAT_SERIES_FAVS, CAT_SERIES_RECENT,
} from './store/useStore'
import Login from './components/Login'
import Titlebar from './components/Titlebar'
import SplashLoader from './components/SplashLoader'
import LiveTV from './components/LiveTV'
import Movies from './components/Movies'
import Series from './components/Series'
import Player from './components/Player'
import DemoTimer from './components/DemoTimer'
import UpdateNotifier from './components/UpdateNotifier'
import { loadAllPersisted, saveFavorites, saveHistory, isAccountExpired } from './services/persistence'
import { resetActiveServer } from './services/xtreamApi'

// ── Panel de categorías (sin cambios) ────────────────────────────────────
function CategoriesPanel() {
  // Sin selector, este panel se re-renderiza con cualquier cambio del store
  // (cada tecla del buscador, cada tick del demo) arrastrando miles de nodos.
  const currentSection = useStore((s) => s.currentSection)
  const setActiveLiveCategory   = useStore((s) => s.setActiveLiveCategory)
  const setActiveMovieCategory  = useStore((s) => s.setActiveMovieCategory)
  const setActiveSeriesCategory = useStore((s) => s.setActiveSeriesCategory)

  const {
    liveCategories, liveChannels, activeLiveCategory,
    channelFavorites, recentChannels,
    movieCategories, movies, activeMovieCategory,
    movieFavorites, recentMovies,
    seriesCategories, series, activeSeriesCategory,
    seriesFavorites, recentSeries,
  } = useStore(
    useShallow((s) => ({
      liveCategories: s.liveCategories,
      liveChannels: s.liveChannels,
      activeLiveCategory: s.activeLiveCategory,
      channelFavorites: s.channelFavorites,
      recentChannels: s.recentChannels,
      movieCategories: s.movieCategories,
      movies: s.movies,
      activeMovieCategory: s.activeMovieCategory,
      movieFavorites: s.movieFavorites,
      recentMovies: s.recentMovies,
      seriesCategories: s.seriesCategories,
      series: s.series,
      activeSeriesCategory: s.activeSeriesCategory,
      seriesFavorites: s.seriesFavorites,
      recentSeries: s.recentSeries,
    }))
  )

  if (currentSection === 'livetv') {
    return (
      <aside className="categories-panel">
        <div className="categories-panel-title">Categorías</div>
        <div className="categories-panel-list">

          <button
            className={`cat-panel-item special ${activeLiveCategory === CAT_FAVS ? 'active' : ''}`}
            onClick={() => setActiveLiveCategory(CAT_FAVS)}
          >
            <span className="cat-panel-icon">⭐</span>
            <span className="cat-panel-name">Canales Favoritos</span>
            {channelFavorites.length > 0 && (
              <span className="cat-panel-count">{channelFavorites.length}</span>
            )}
          </button>

          <button
            className={`cat-panel-item special ${activeLiveCategory === CAT_RECENT ? 'active' : ''}`}
            onClick={() => setActiveLiveCategory(CAT_RECENT)}
          >
            <span className="cat-panel-icon">🕐</span>
            <span className="cat-panel-name">Últimos Vistos</span>
            {recentChannels.length > 0 && (
              <span className="cat-panel-count">{recentChannels.length}</span>
            )}
          </button>

          <div className="cat-panel-separator" />

          <button
            className={`cat-panel-item ${activeLiveCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveLiveCategory('all')}
          >
            <span className="cat-panel-name">Todos los canales</span>
            <span className="cat-panel-count">{liveChannels.length}</span>
          </button>

          {liveCategories.map((cat) => (
            <button
              key={cat.category_id}
              className={`cat-panel-item ${activeLiveCategory === cat.category_id ? 'active' : ''}`}
              onClick={() => setActiveLiveCategory(cat.category_id)}
            >
              <span className="cat-panel-name">{cat.category_name}</span>
            </button>
          ))}
        </div>
      </aside>
    )
  }

  if (currentSection === 'movies') {
    return (
      <aside className="categories-panel">
        <div className="categories-panel-title">Categorías</div>
        <div className="categories-panel-list">

          <button
            className={`cat-panel-item special ${activeMovieCategory === CAT_MOVIE_FAVS ? 'active' : ''}`}
            onClick={() => setActiveMovieCategory(CAT_MOVIE_FAVS)}
          >
            <span className="cat-panel-icon">⭐</span>
            <span className="cat-panel-name">Favoritos</span>
            {movieFavorites.length > 0 && (
              <span className="cat-panel-count">{movieFavorites.length}</span>
            )}
          </button>

          <button
            className={`cat-panel-item special ${activeMovieCategory === CAT_MOVIE_RECENT ? 'active' : ''}`}
            onClick={() => setActiveMovieCategory(CAT_MOVIE_RECENT)}
          >
            <span className="cat-panel-icon">🕐</span>
            <span className="cat-panel-name">Últimas Vistas</span>
            {recentMovies.length > 0 && (
              <span className="cat-panel-count">{recentMovies.length}</span>
            )}
          </button>

          <div className="cat-panel-separator" />

          <button
            className={`cat-panel-item ${activeMovieCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveMovieCategory('all')}
          >
            <span className="cat-panel-name">Todas las películas</span>
            <span className="cat-panel-count">{movies.length}</span>
          </button>

          {movieCategories.map((cat) => (
            <button
              key={cat.category_id}
              className={`cat-panel-item ${activeMovieCategory === cat.category_id ? 'active' : ''}`}
              onClick={() => setActiveMovieCategory(cat.category_id)}
            >
              <span className="cat-panel-name">{cat.category_name}</span>
            </button>
          ))}
        </div>
      </aside>
    )
  }

  if (currentSection === 'series') {
    return (
      <aside className="categories-panel">
        <div className="categories-panel-title">Categorías</div>
        <div className="categories-panel-list">

          <button
            className={`cat-panel-item special ${activeSeriesCategory === CAT_SERIES_FAVS ? 'active' : ''}`}
            onClick={() => setActiveSeriesCategory(CAT_SERIES_FAVS)}
          >
            <span className="cat-panel-icon">⭐</span>
            <span className="cat-panel-name">Favoritos</span>
            {seriesFavorites.length > 0 && (
              <span className="cat-panel-count">{seriesFavorites.length}</span>
            )}
          </button>

          <button
            className={`cat-panel-item special ${activeSeriesCategory === CAT_SERIES_RECENT ? 'active' : ''}`}
            onClick={() => setActiveSeriesCategory(CAT_SERIES_RECENT)}
          >
            <span className="cat-panel-icon">🕐</span>
            <span className="cat-panel-name">Últimas Vistas</span>
            {recentSeries.length > 0 && (
              <span className="cat-panel-count">{recentSeries.length}</span>
            )}
          </button>

          <div className="cat-panel-separator" />

          <button
            className={`cat-panel-item ${activeSeriesCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveSeriesCategory('all')}
          >
            <span className="cat-panel-name">Todas las series</span>
            <span className="cat-panel-count">{series.length}</span>
          </button>

          {seriesCategories.map((cat) => (
            <button
              key={cat.category_id}
              className={`cat-panel-item ${activeSeriesCategory === cat.category_id ? 'active' : ''}`}
              onClick={() => setActiveSeriesCategory(cat.category_id)}
            >
              <span className="cat-panel-name">{cat.category_name}</span>
            </button>
          ))}
        </div>
      </aside>
    )
  }

  return null
}

// ── Componente que auto-guarda favoritos e historial ──────────────────────
const SAVE_DEBOUNCE_MS = 800

function PersistenceManager() {
  const {
    isAuthenticated, appReady,
    movieFavorites, seriesFavorites, channelFavorites,
    recentChannels, recentMovies, recentSeries,
  } = useStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      appReady: s.appReady,
      movieFavorites: s.movieFavorites,
      seriesFavorites: s.seriesFavorites,
      channelFavorites: s.channelFavorites,
      recentChannels: s.recentChannels,
      recentMovies: s.recentMovies,
      recentSeries: s.recentSeries,
    }))
  )

  // Sólo guardar cuando la app ya está lista y el usuario autenticado
  const ready = isAuthenticated && appReady

  // electron-store escribe el JSON de forma sincrónica en el proceso principal,
  // así que conviene no hacerlo en cada clic de favorito o cambio de canal.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(
      () => saveFavorites(movieFavorites, seriesFavorites, channelFavorites),
      SAVE_DEBOUNCE_MS
    )
    return () => clearTimeout(t)
  }, [ready, movieFavorites, seriesFavorites, channelFavorites])

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(
      () => saveHistory(recentChannels, recentMovies, recentSeries),
      SAVE_DEBOUNCE_MS
    )
    return () => clearTimeout(t)
  }, [ready, recentChannels, recentMovies, recentSeries])

  return null
}

// ── App principal ─────────────────────────────────────────────────────────
export default function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const appReady        = useStore((s) => s.appReady)
  const currentSection  = useStore((s) => s.currentSection)
  const logout          = useStore((s) => s.logout)
  const setSavedAccounts = useStore((s) => s.setSavedAccounts)
  const setAuthenticated = useStore((s) => s.setAuthenticated)

  const bootstrapped = useRef(false)

  // Al arrancar: restaurar cuentas + favoritos + historial + auto-login
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const bootstrap = async () => {
      const { accounts, favorites, history } = await loadAllPersisted()

      // Restaurar cuentas guardadas en el store
      if (accounts.length > 0) {
        setSavedAccounts(accounts)
      }

      // Restaurar favoritos e historial antes de auto-login
      if (favorites) {
        useStore.setState({
          movieFavorites:   Array.isArray(favorites.movieFavorites)   ? favorites.movieFavorites   : [],
          seriesFavorites:  Array.isArray(favorites.seriesFavorites)  ? favorites.seriesFavorites  : [],
          channelFavorites: Array.isArray(favorites.channelFavorites) ? favorites.channelFavorites : [],
        })
      }
      if (history) {
        useStore.setState({
          recentChannels: Array.isArray(history.recentChannels) ? history.recentChannels : [],
          recentMovies:   Array.isArray(history.recentMovies)   ? history.recentMovies   : [],
          recentSeries:   Array.isArray(history.recentSeries)   ? history.recentSeries   : [],
        })
      }

      // Auto-login: buscar la cuenta usada más recientemente
      if (accounts.length === 0) return
      const lastAccount = accounts.reduce((a, b) =>
        (b.lastUsedAt || 0) > (a.lastUsedAt || 0) ? b : a
      )
      if (!lastAccount) return

      // Si expiró, no hacer auto-login (Login mostrará el aviso)
      if (isAccountExpired(lastAccount)) {
        // El store ya tiene savedAccounts; Login mostrará el aviso visual
        return
      }

      // Autenticar automáticamente con los datos guardados
      if (lastAccount.method === 'xtream') {
        setAuthenticated(
          'xtream',
          { username: lastAccount.username, password: lastAccount.password },
          lastAccount.userInfo || null,
        )
      } else if (lastAccount.method === 'm3u') {
        setAuthenticated('m3u', { m3uUrl: lastAccount.m3uUrl }, null)
      }
    }

    bootstrap()
  }, [])

  const handleLogout = () => {
    // Si no se limpia, la siguiente cuenta hereda el servidor de la anterior
    resetActiveServer()
    logout()
  }

  const renderSection = () => {
    switch (currentSection) {
      case 'livetv':  return <LiveTV />
      case 'movies':  return <Movies />
      case 'series':  return <Series />
      default:        return <LiveTV />
    }
  }

  // 1. Sin autenticar → Login
  if (!isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Titlebar />
        <Login />
      </div>
    )
  }

  // 2. Autenticado pero cargando → SplashLoader
  if (!appReady) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Titlebar />
        <SplashLoader />
      </div>
    )
  }

  // 3. Todo listo → App principal
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Titlebar onLogout={handleLogout} />
      <UpdateNotifier />
      <DemoTimer />
      <div className="app-layout">
        <CategoriesPanel />
        <main className="main-content">
          {renderSection()}
        </main>
      </div>
      <Player />
      <PersistenceManager />
    </div>
  )
}

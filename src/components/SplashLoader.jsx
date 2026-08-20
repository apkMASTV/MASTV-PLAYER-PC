import { useEffect, useState, useRef } from 'react'
import useStore from '../store/useStore'
import { xtreamApi } from '../services/xtreamApi'
import { loadM3UData } from '../services/m3uParser'

const STEPS = [
  { label: 'Conectando al servidor...',   pct: 5  },
  { label: 'Cargando canales en vivo...', pct: 30 },
  { label: 'Cargando películas...',       pct: 60 },
  { label: 'Cargando series...',          pct: 88 },
  { label: '¡Listo! Iniciando...',        pct: 100 },
]

export default function SplashLoader() {
  const authMethod  = useStore((s) => s.authMethod)
  const credentials = useStore((s) => s.credentials)
  const setLiveData    = useStore((s) => s.setLiveData)
  const setMovieData   = useStore((s) => s.setMovieData)
  const setSeriesData  = useStore((s) => s.setSeriesData)
  const setLiveStream  = useStore((s) => s.setLiveStream)
  const setAppReady    = useStore((s) => s.setAppReady)

  const [stepIndex, setStepIndex] = useState(0)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState('')

  const mountedRef   = useRef(true)
  const rafRef       = useRef(null)
  const timerRef     = useRef(null)
  const progressRef  = useRef(0)      // tracking para animateTo sin closure stale

  useEffect(() => {
    mountedRef.current = true
    loadAll()
    return () => {
      mountedRef.current = false
      if (rafRef.current)   cancelAnimationFrame(rafRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Anima desde el valor actual (via ref) hasta target, sin retroceder.
  // La animación es decorativa y nunca debe bloquear el arranque: si la ventana
  // está minimizada u oculta, Chromium pausa requestAnimationFrame y la promesa
  // no resolvería nunca, dejando la app colgada en el splash. Por eso corre
  // contra un plazo máximo.
  const animateTo = (target) =>
    new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(deadline)
        resolve()
      }
      const deadline = setTimeout(finish, 1500)

      const tick = () => {
        if (settled) return
        if (!mountedRef.current) { finish(); return }
        const next = Math.min(progressRef.current + 1, target)
        progressRef.current = next
        setProgress(next)
        if (next < target) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          finish()
        }
      }
      tick()
    })

  const loadAll = async () => {
    if (!mountedRef.current) return
    setError('')
    // Al reintentar hay que volver a empezar la barra desde cero
    progressRef.current = 0
    setProgress(0)
    try {
      if (authMethod === 'xtream') {
        await loadXtream()
      } else if (authMethod === 'm3u') {
        await loadM3U()
      } else {
        if (mountedRef.current) setStepIndex(4)
        await animateTo(100)
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) setAppReady()
        }, 400)
      }
    } catch (err) {
      if (mountedRef.current) setError('No se pudo cargar el contenido. Verifica tu conexión.')
    }
  }

  const finish = async () => {
    if (mountedRef.current) setStepIndex(4)
    await animateTo(100)
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setAppReady()
    }, 400)
  }

  const loadM3U = async () => {
    if (mountedRef.current) setStepIndex(0)
    await animateTo(STEPS[0].pct)

    // El login manual ya deja la lista en el store; solo hay que descargarla
    // cuando entramos desde una cuenta guardada o con auto-login.
    if (useStore.getState().liveChannels.length === 0) {
      if (mountedRef.current) setStepIndex(1)
      const { categories, liveChannels, movieChannels } = await loadM3UData(credentials.m3uUrl)
      if (!mountedRef.current) return
      setLiveData(categories, liveChannels)
      setMovieData(categories, movieChannels)
      setSeriesData([], [])
    }
    await animateTo(STEPS[2].pct)

    // Dejar el primer canal listo, igual que en Xtream
    const channels = useStore.getState().liveChannels
    if (mountedRef.current && channels.length > 0) {
      const first = channels[0]
      setLiveStream({
        name: first.name,
        url: first.url,
        logo: first.stream_icon || first.logo,
        stream_type: 'live',
        stream_id: first.stream_id,
      })
    }

    await finish()
  }

  const loadXtream = async () => {
    const { username, password } = credentials

    if (mountedRef.current) setStepIndex(0)
    await animateTo(STEPS[0].pct)

    if (mountedRef.current) setStepIndex(1)
    const [liveCats, liveChannels] = await Promise.all([
      xtreamApi.getLiveCategories(username, password),
      xtreamApi.getLiveStreams(username, password),
    ])
    if (mountedRef.current) setLiveData(liveCats, liveChannels)
    await animateTo(STEPS[1].pct)

    if (mountedRef.current) setStepIndex(2)
    const [movieCats, movies] = await Promise.all([
      xtreamApi.getVodCategories(username, password),
      xtreamApi.getVodStreams(username, password),
    ])
    if (mountedRef.current) setMovieData(movieCats, movies)
    await animateTo(STEPS[2].pct)

    if (mountedRef.current) setStepIndex(3)
    const [seriesCats, seriesList] = await Promise.all([
      xtreamApi.getSeriesCategories(username, password),
      xtreamApi.getSeries(username, password),
    ])
    if (mountedRef.current) setSeriesData(seriesCats, seriesList)
    await animateTo(STEPS[3].pct)

    // Reproducir primer canal automáticamente
    if (mountedRef.current && liveChannels.length > 0) {
      const first = liveChannels[0]
      const url = xtreamApi.getLiveStreamUrl(username, password, first.stream_id, 'ts')
      setLiveStream({ name: first.name, url, logo: first.stream_icon || first.logo, stream_type: 'live', stream_id: first.stream_id })
    }

    if (mountedRef.current) setStepIndex(4)
    await animateTo(100)

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setAppReady()
    }, 500)
  }

  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)]

  return (
    <div className="splash-screen">
      <div className="splash-bg" />
      <div className="splash-content fade-in">
        <img src="logo.jpg" alt="MASTV Player" className="splash-logo" />
        <h1 className="splash-title">MASTV <span>PLAYER</span></h1>

        {error ? (
          <>
            <p className="splash-error">{error}</p>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px', marginTop: 16 }} onClick={loadAll}>
              Reintentar
            </button>
          </>
        ) : (
          <>
            <div className="splash-progress-wrap">
              <div className="splash-progress-bar">
                <div className="splash-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="splash-pct">{progress}%</span>
            </div>
            <p className="splash-step">{step.label}</p>
          </>
        )}
      </div>
    </div>
  )
}

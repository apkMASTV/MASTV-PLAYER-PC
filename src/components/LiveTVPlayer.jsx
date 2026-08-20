import { useEffect, useRef, useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import useStore from '../store/useStore'

const MAX_RETRIES    = 4
const RETRY_DELAY_S  = 10
// Un servidor IPTV puede aceptar la conexión y no enviar nunca datos: sin este
// límite el spinner giraría para siempre porque no llega ningún evento de error.
const STALL_TIMEOUT_S = 20

export default function LiveTVPlayer({ filteredChannels, onChannelSelect }) {
  const setActiveLiveCategory = useStore((s) => s.setActiveLiveCategory)

  const { liveStream, liveCategories, activeLiveCategory } = useStore(
    useShallow((s) => ({
      liveStream: s.liveStream,
      liveCategories: s.liveCategories,
      activeLiveCategory: s.activeLiveCategory,
    }))
  )

  const containerRef   = useRef(null)
  const videoRef       = useRef(null)
  const hlsRef         = useRef(null)
  const mpegtsRef      = useRef(null)
  const hideTimer      = useRef(null)
  const retryTimerRef  = useRef(null)
  const countdownRef   = useRef(null)
  const watchdogRef    = useRef(null)
  const retryCountRef  = useRef(0)
  const currentUrlRef  = useRef(null)
  const mountedRef     = useRef(true)
  const suppressErrorRef = useRef(false)   // ignora los errores que produce el propio desmontaje
  const loadStreamRef    = useRef(null)    // evita capturar una versión vieja de loadStream

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const [isLoading,         setIsLoading]         = useState(false)
  const [hasError,          setHasError]           = useState(false)
  const [isFullscreen,      setIsFullscreen]       = useState(false)
  const [showOverlay,       setShowOverlay]        = useState(false)
  const [isMuted,           setIsMuted]            = useState(false)
  const [volume,            setVolume]             = useState(1)
  const [retryCountdown,    setRetryCountdown]     = useState(0)   // segundos para el próximo reintento
  const [retryAttempt,      setRetryAttempt]       = useState(0)   // intento actual (solo para mostrar)
  const [maxRetriesReached, setMaxRetriesReached]  = useState(false)

  // ── Helpers de timers ────────────────────────────────────
  const clearRetryTimers = () => {
    clearTimeout(retryTimerRef.current)
    clearInterval(countdownRef.current)
    clearTimeout(watchdogRef.current)
    retryTimerRef.current = null
    countdownRef.current  = null
    watchdogRef.current   = null
    if (mountedRef.current) setRetryCountdown(0)
  }

  // ── Reintentar automáticamente ───────────────────────────
  const scheduleRetry = useCallback(() => {
    // Sin esto, dos errores seguidos dejan dos intervalos y dos timeouts vivos:
    // la cuenta atrás bajaría de dos en dos y se lanzarían recargas en paralelo.
    clearRetryTimers()

    if (retryCountRef.current >= MAX_RETRIES) {
      setMaxRetriesReached(true)
      return
    }

    retryCountRef.current += 1
    setRetryAttempt(retryCountRef.current)
    setRetryCountdown(RETRY_DELAY_S)

    // Countdown visual cada segundo
    countdownRef.current = setInterval(() => {
      if (!mountedRef.current) { clearInterval(countdownRef.current); return }
      setRetryCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)

    // Reintento real después de RETRY_DELAY_S segundos
    retryTimerRef.current = setTimeout(() => {
      clearInterval(countdownRef.current)
      countdownRef.current = null
      if (currentUrlRef.current) {
        loadStreamRef.current?.(currentUrlRef.current, false) // false = no reiniciar contador
      }
    }, RETRY_DELAY_S * 1000)
  }, [])

  // Punto único de fallo: lo usan el <video>, hls.js y mpegts.js por igual
  const handleStreamFailure = useCallback(() => {
    if (!mountedRef.current || suppressErrorRef.current) return
    setHasError(true)
    setIsLoading(false)
    scheduleRetry()
  }, [scheduleRetry])

  // Vigila que el stream arranque y que no se congele a mitad
  const armWatchdog = useCallback(() => {
    clearTimeout(watchdogRef.current)
    const timeAtArm = videoRef.current?.currentTime ?? 0
    watchdogRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      // Si el reloj del vídeo no avanzó, no está llegando nada
      if ((videoRef.current?.currentTime ?? 0) <= timeAtArm) handleStreamFailure()
    }, STALL_TIMEOUT_S * 1000)
  }, [handleStreamFailure])

  // ── Destruir players actuales ────────────────────────────
  const destroyPlayers = () => {
    suppressErrorRef.current = true
    if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current = null }
    if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
    const video = videoRef.current
    if (video) {
      video.pause()
      // Poner src = '' hace que Chromium emita un error de "src vacío", que llegaba
      // después de limpiar el estado y pintaba un fallo falso en cada cambio de canal.
      video.removeAttribute('src')
      video.load()
    }
  }

  // ── Cargar stream ─────────────────────────────────────────
  // resetRetry = true cuando es un canal nuevo o reintento manual
  const loadStream = (url, resetRetry = true) => {
    if (!url || !videoRef.current) return
    clearRetryTimers()
    destroyPlayers()

    if (resetRetry) {
      retryCountRef.current = 0
      setRetryAttempt(0)
      setMaxRetriesReached(false)
    }

    currentUrlRef.current = url
    setIsLoading(true)
    setHasError(false)
    armWatchdog()

    const video  = videoRef.current
    const isHLS  = url.includes('.m3u8') || url.includes('hls')
    const isTS   = url.includes('.ts')   || url.includes('/live/')

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 20 })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) handleStreamFailure() })
      hlsRef.current = hls
    } else if (isTS && mpegts.isSupported()) {
      const p = mpegts.createPlayer(
        { type: 'mpegts', url, isLive: true },
        { enableWorker: true, enableStashBuffer: true, stashInitialSize: 128 }
      )
      p.attachMediaElement(video)
      p.load(); p.play()
      p.on(mpegts.Events.ERROR, handleStreamFailure)
      mpegtsRef.current = p
    } else {
      video.src = url
      video.load()
      video.play().catch(() => {})
    }

    // Los players tardan un instante en soltar los eventos del stream anterior
    setTimeout(() => { suppressErrorRef.current = false }, 250)
  }

  loadStreamRef.current = loadStream

  // Al cambiar de canal, cargar el nuevo stream y resetear contadores
  useEffect(() => {
    if (!liveStream?.url) return
    loadStream(liveStream.url, true)
    return () => { clearRetryTimers(); destroyPlayers() }
  }, [liveStream])

  // ── Eventos del video ────────────────────────────────────
  const onWaiting = () => {
    if (!mountedRef.current) return
    setIsLoading(true)
    armWatchdog()   // si el buffer no se recupera, lo damos por caído
  }
  const onCanPlay = () => { if (mountedRef.current) setIsLoading(false) }
  const onPlaying = () => {
    if (!mountedRef.current) return
    setIsLoading(false)
    clearRetryTimers()
    retryCountRef.current = 0
    setRetryAttempt(0)
    setMaxRetriesReached(false)
  }
  const onError = handleStreamFailure

  // ── Fullscreen ───────────────────────────────────────────
  useEffect(() => {
    const onChange = () => {
      const inFs = !!document.fullscreenElement
      setIsFullscreen(inFs)
      if (!inFs) setShowOverlay(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // ── Actividad para mostrar overlay ──────────────────────
  const resetHideTimer = useCallback(() => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowOverlay(false), 3500)
  }, [])

  const handleActivity = useCallback(() => {
    if (!isFullscreen) return
    setShowOverlay(true)
    resetHideTimer()
  }, [isFullscreen, resetHideTimer])

  useEffect(() => {
    if (!isFullscreen) return
    const onKey = () => handleActivity()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen, handleActivity])

  // ── Controles de volumen ─────────────────────────────────
  const toggleMute = () => {
    if (!videoRef.current) return
    const next = !isMuted
    videoRef.current.muted = next
    setIsMuted(next)
  }

  const changeVolume = (delta) => {
    if (!videoRef.current) return
    const next = Math.min(1, Math.max(0, volume + delta))
    videoRef.current.volume = next
    setVolume(next)
    if (next > 0 && isMuted) { videoRef.current.muted = false; setIsMuted(false) }
  }

  const handleVolumeSlider = (e) => {
    const v = parseFloat(e.target.value)
    if (!videoRef.current) return
    videoRef.current.volume = v
    setVolume(v)
    if (v > 0 && isMuted) { videoRef.current.muted = false; setIsMuted(false) }
  }

  const volIcon = isMuted || volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'
  const volPercent = Math.round((isMuted ? 0 : volume) * 100)

  // ── Pantalla vacía (sin canal seleccionado) ──────────────
  if (!liveStream) {
    return (
      <div className="livetv-player-empty">
        <div className="livetv-player-empty-inner">
          <span style={{ fontSize: 56, opacity: 0.25 }}>▶</span>
          <p>Selecciona un canal para reproducir</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="livetv-player-container"
      onMouseMove={handleActivity}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="livetv-video"
        playsInline
        onWaiting={onWaiting}
        onCanPlay={onCanPlay}
        onPlaying={onPlaying}
        onError={onError}
      />

      {/* Spinner */}
      {isLoading && !hasError && <div className="livetv-spinner" />}

      {/* ── Error con reintentos automáticos ── */}
      {hasError && (
        <div className="livetv-error">
          <div className="livetv-error-icon">
            {maxRetriesReached ? '📡' : '⚠'}
          </div>

          {maxRetriesReached ? (
            <>
              <p className="livetv-error-title">Canal no disponible</p>
              <p className="livetv-error-sub">No se pudo conectar después de {MAX_RETRIES} intentos</p>
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '8px 22px', marginTop: 16 }}
                onClick={() => loadStream(liveStream.url, true)}
              >
                Reintentar
              </button>
            </>
          ) : (
            <>
              <p className="livetv-error-title">Señal interrumpida</p>
              <p className="livetv-error-sub">
                Reintentando en <span className="livetv-retry-countdown">{retryCountdown}s</span>
                &nbsp;&mdash;&nbsp;intento {retryAttempt}/{MAX_RETRIES}
              </p>
              <div className="livetv-retry-bar">
                <div
                  className="livetv-retry-bar-fill"
                  style={{ width: `${((RETRY_DELAY_S - retryCountdown) / RETRY_DELAY_S) * 100}%` }}
                />
              </div>
              <button
                className="livetv-retry-now-btn"
                onClick={() => {
                  clearRetryTimers()
                  loadStream(liveStream.url, false)
                }}
              >
                Reintentar ahora
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Barra inferior (siempre visible) ── */}
      <div className={`livetv-controls-bar ${isFullscreen ? 'fullscreen-mode' : ''}`}>
        <span className="live-badge">● EN VIVO</span>
        <span className="livetv-channel-name">{liveStream.name}</span>

        <div className="livetv-controls-right">
          {/* Mute */}
          <button className="livetv-ctrl-btn" onClick={toggleMute} title="Silenciar/Activar">
            {volIcon}
          </button>
          {/* Volumen - */}
          <button className="livetv-ctrl-btn vol-step" onClick={() => changeVolume(-0.1)} title="Bajar volumen">−</button>
          {/* Slider */}
          <input
            type="range" min="0" max="1" step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeSlider}
            className="livetv-volume"
            title={`Volumen: ${volPercent}%`}
          />
          {/* Volumen + */}
          <button className="livetv-ctrl-btn vol-step" onClick={() => changeVolume(0.1)} title="Subir volumen">+</button>
          {/* % */}
          <span className="livetv-vol-pct">{volPercent}%</span>
          {/* Fullscreen */}
          <button
            className="livetv-ctrl-btn fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? '⊡' : '⛶'}
          </button>
        </div>
      </div>

      {/* ── OVERLAY FULLSCREEN ── */}
      {isFullscreen && (
        <div className={`livetv-fs-overlay ${showOverlay ? 'visible' : ''}`}>

          {/* Columna izquierda: categorías */}
          <div className="livetv-fs-col livetv-fs-col-cats">
            <div className="livetv-fs-col-header">Categorías</div>
            <div className="livetv-fs-col-body">
              <button
                className={`livetv-fs-cat ${activeLiveCategory === 'all' ? 'active' : ''}`}
                onClick={() => { setActiveLiveCategory('all'); handleActivity() }}
              >
                Todos
              </button>
              {liveCategories.map((cat) => (
                <button
                  key={cat.category_id}
                  className={`livetv-fs-cat ${activeLiveCategory === cat.category_id ? 'active' : ''}`}
                  onClick={() => { setActiveLiveCategory(cat.category_id); handleActivity() }}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>

            {/* Controles de volumen dentro del overlay */}
            <div className="livetv-fs-vol-panel">
              <button className="livetv-fs-vol-btn" onClick={toggleMute}>{volIcon}</button>
              <button className="livetv-fs-vol-btn" onClick={() => changeVolume(-0.1)}>−</button>
              <div className="livetv-fs-vol-bar-wrap">
                <div
                  className="livetv-fs-vol-bar-fill"
                  style={{ width: `${volPercent}%` }}
                />
              </div>
              <button className="livetv-fs-vol-btn" onClick={() => changeVolume(0.1)}>+</button>
              <span className="livetv-fs-vol-pct">{volPercent}%</span>
            </div>
          </div>

          {/* Divisor vertical */}
          <div className="livetv-fs-col-divider" />

          {/* Columna derecha: canales */}
          <div className="livetv-fs-col livetv-fs-col-channels">
            <div className="livetv-fs-col-header">Canales</div>
            <div className="livetv-fs-col-body">
              {filteredChannels.map((ch) => (
                <div
                  key={ch.stream_id || ch.name}
                  className={`livetv-fs-channel-item ${liveStream?.stream_id === ch.stream_id ? 'playing' : ''}`}
                  onClick={() => { onChannelSelect(ch); handleActivity() }}
                >
                  {(ch.stream_icon || ch.logo) && (
                    <img
                      src={ch.stream_icon || ch.logo}
                      alt=""
                      className="livetv-fs-ch-logo"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}
                  <span className="livetv-fs-ch-name">{ch.name}</span>
                  {liveStream?.stream_id === ch.stream_id && (
                    <span className="livetv-fs-ch-playing">▶</span>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

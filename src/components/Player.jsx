import { useEffect, useRef, useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import useStore from '../store/useStore'

const SKIP_SECS = 300 // 5 minutos
// Igual que en TV en vivo: si el servidor no envía datos no llega ningún evento,
// así que sin este límite el spinner giraría indefinidamente.
const STALL_TIMEOUT_S = 25

export default function Player() {
  // ── TODOS los hooks PRIMERO — nunca después de un return ──────────
  const closePlayer       = useStore((s) => s.closePlayer)
  const minimizePlayer    = useStore((s) => s.minimizePlayer)
  const setEpisodeContext = useStore((s) => s.setEpisodeContext)
  const playStream        = useStore((s) => s.playStream)

  const { currentStream, isPlayerOpen, playerMinimized, currentSection, episodeContext } = useStore(
    useShallow((s) => ({
      currentStream: s.currentStream,
      isPlayerOpen: s.isPlayerOpen,
      playerMinimized: s.playerMinimized,
      currentSection: s.currentSection,
      episodeContext: s.episodeContext,
    }))
  )

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const mpegtsRef    = useRef(null)
  const containerRef = useRef(null)
  const watchdogRef  = useRef(null)
  const suppressErrorRef = useRef(false)   // ignora los errores del propio desmontaje

  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isLoading,    setIsLoading]    = useState(false)
  const [hasError,     setHasError]     = useState(false)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [volume,       setVolume]       = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted,      setIsMuted]      = useState(false)

  const destroyPlayers = useCallback(() => {
    suppressErrorRef.current = true
    clearTimeout(watchdogRef.current)
    if (hlsRef.current)    { hlsRef.current.destroy();    hlsRef.current = null }
    if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
    const video = videoRef.current
    if (video) {
      video.pause()
      // src = '' provoca un error de "src vacío" en Chromium que se mostraba
      // como un fallo de reproducción inexistente.
      video.removeAttribute('src')
      video.load()
    }
  }, [])

  const handleStreamFailure = useCallback(() => {
    if (suppressErrorRef.current) return
    clearTimeout(watchdogRef.current)
    setHasError(true)
    setIsLoading(false)
  }, [])

  // Si el vídeo no arranca ni avanza, avisamos en lugar de dejar el spinner girando
  const armWatchdog = useCallback(() => {
    clearTimeout(watchdogRef.current)
    const timeAtArm = videoRef.current?.currentTime ?? 0
    watchdogRef.current = setTimeout(() => {
      if ((videoRef.current?.currentTime ?? 0) <= timeAtArm) handleStreamFailure()
    }, STALL_TIMEOUT_S * 1000)
  }, [handleStreamFailure])

  const loadStream = useCallback((url) => {
    if (!url || !videoRef.current) return
    destroyPlayers()
    const video = videoRef.current
    setIsLoading(true)
    setHasError(false)
    setCurrentTime(0)
    setDuration(0)
    armWatchdog()

    const isHLS = url.includes('.m3u8') || url.includes('hls')
    const isTS  = url.includes('.ts')

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) handleStreamFailure() })
      hlsRef.current = hls
    } else if (isTS && mpegts.isSupported()) {
      const player = mpegts.createPlayer(
        { type: 'mpegts', url, isLive: false },
        { enableWorker: true, enableStashBuffer: true, stashInitialSize: 128, lazyLoadMaxDuration: 3 * 60 }
      )
      player.attachMediaElement(video)
      player.load()
      player.play()
      player.on(mpegts.Events.ERROR, handleStreamFailure)
      mpegtsRef.current = player
    } else {
      video.src = url
      video.load()
      video.play().catch(() => {})
    }

    setTimeout(() => { suppressErrorRef.current = false }, 250)
  }, [destroyPlayers, armWatchdog, handleStreamFailure])

  useEffect(() => {
    if (!isPlayerOpen || !currentStream?.url) return
    loadStream(currentStream.url)
    return destroyPlayers
  }, [currentStream, isPlayerOpen, loadStream, destroyPlayers])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ── Early returns DESPUÉS de todos los hooks ──────────────────────
  if (currentSection === 'livetv') return null
  if (!isPlayerOpen || !currentStream) return null

  // ── Helpers ───────────────────────────────────────────────────────
  const isLive    = currentStream?.stream_type === 'live'
  const isSeries  = currentStream?.stream_type === 'series'

  const hasPrevEp = isSeries && episodeContext && episodeContext.currentIndex > 0
  const hasNextEp = isSeries && episodeContext && episodeContext.currentIndex < episodeContext.episodes.length - 1

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }

  // ── Handlers ─────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) videoRef.current.play()
    else videoRef.current.pause()
  }

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    if (videoRef.current && duration > 0) videoRef.current.currentTime = ratio * duration
  }

  const skip = (seconds) => {
    if (!videoRef.current || duration <= 0) return
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds))
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const handleVolume = (e) => {
    const vol = parseFloat(e.target.value)
    if (videoRef.current) videoRef.current.volume = vol
    setVolume(vol)
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) containerRef.current.requestFullscreen()
    else document.exitFullscreen()
  }

  const goToEpisode = (newIndex) => {
    if (!episodeContext) return
    const ep = episodeContext.episodes[newIndex]
    if (!ep || !ep._url) return
    setEpisodeContext(episodeContext.episodes, newIndex)
    playStream({ name: ep._name, url: ep._url, stream_type: 'series', stream_id: ep.id })
  }

  const skipLabel = (s) => s > 0 ? `+${s / 60}m` : `${s / 60}m`

  return (
    <div
      ref={containerRef}
      className={`player-overlay${playerMinimized ? ' minimized' : ''}`}
      onDoubleClick={!playerMinimized ? toggleFullscreen : undefined}
    >
      <div className="player-video-wrapper">
        <video
          ref={videoRef}
          className="player-video"
          playsInline
          onWaiting={() => { setIsLoading(true); armWatchdog() }}
          onCanPlay={() => setIsLoading(false)}
          onPlaying={() => {
            setIsPlaying(true)
            setIsLoading(false)
            clearTimeout(watchdogRef.current)
          }}
          onPause={() => setIsPlaying(false)}
          onError={handleStreamFailure}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onDurationChange={(e) => setDuration(e.target.duration)}
        />

        {isLoading && !hasError && <div className="player-spinner" />}

        {hasError && (
          <div className="player-error-msg">
            <span style={{ fontSize: 40 }}>⚠</span>
            <p>No se pudo reproducir</p>
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 20px', marginTop: 16 }}
              onClick={() => loadStream(currentStream.url)}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Barra superior */}
        <div className="player-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            {isLive && (
              <span style={{ background: 'var(--accent)', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: 1, flexShrink: 0 }}>
                EN VIVO
              </span>
            )}
            <span className="player-title">{currentStream.name}</span>
          </div>
          <div className="player-btn-group">
            <button className="player-btn" onClick={() => minimizePlayer(!playerMinimized)} title="Minimizar">⊟</button>
            <button className="player-btn danger" onClick={closePlayer} title="Cerrar">✕</button>
          </div>
        </div>

        {/* Controles */}
        {!playerMinimized && (
          <div className="player-controls">
            {/* Barra de progreso */}
            {!isLive && duration > 0 && (
              <div className="player-progress" onClick={handleSeek} role="slider" aria-label="Progreso">
                <div className="player-progress-fill" style={{ width: `${(currentTime / duration) * 100}%` }} />
              </div>
            )}

            <div className="player-bottom-row">
              {/* Grupo izquierdo: navegación episodios + skip + play + volumen */}
              <div className="player-btn-group" style={{ flexWrap: 'wrap', gap: 2 }}>

                {/* Episodio anterior — solo para series */}
                {isSeries && (
                  <button
                    className="player-btn"
                    style={hasPrevEp ? { fontSize: 11 } : { fontSize: 11, opacity: 0.3, cursor: 'not-allowed' }}
                    onClick={() => hasPrevEp && goToEpisode(episodeContext.currentIndex - 1)}
                    title={hasPrevEp ? `Episodio anterior (${episodeContext.episodes[episodeContext.currentIndex - 1]?.episode_num})` : 'No hay episodio anterior'}
                    disabled={!hasPrevEp}
                  >
                    ⏮ Ant
                  </button>
                )}

                {/* Retroceder 5 min — solo para VOD/series */}
                {!isLive && (
                  <button
                    className="player-btn"
                    style={{ fontSize: 12 }}
                    onClick={() => skip(-SKIP_SECS)}
                    title="Retroceder 5 minutos"
                  >
                    ⏪ {skipLabel(-SKIP_SECS)}
                  </button>
                )}

                {/* Play / Pausa */}
                <button className="player-btn" onClick={togglePlay} title="Play/Pausa" style={{ fontSize: 16, padding: '4px 10px' }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>

                {/* Adelantar 5 min — solo para VOD/series */}
                {!isLive && (
                  <button
                    className="player-btn"
                    style={{ fontSize: 12 }}
                    onClick={() => skip(SKIP_SECS)}
                    title="Adelantar 5 minutos"
                  >
                    {skipLabel(SKIP_SECS)} ⏩
                  </button>
                )}

                {/* Episodio siguiente — solo para series */}
                {isSeries && (
                  <button
                    className="player-btn"
                    style={hasNextEp ? { fontSize: 11 } : { fontSize: 11, opacity: 0.3, cursor: 'not-allowed' }}
                    onClick={() => hasNextEp && goToEpisode(episodeContext.currentIndex + 1)}
                    title={hasNextEp ? `Siguiente episodio (${episodeContext.episodes[episodeContext.currentIndex + 1]?.episode_num})` : 'No hay episodio siguiente'}
                    disabled={!hasNextEp}
                  >
                    Sig ⏭
                  </button>
                )}

                {/* Separador visual */}
                <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)', margin: '0 4px', flexShrink: 0 }} />

                {/* Volumen */}
                <button className="player-btn" onClick={toggleMute} title="Silenciar">
                  {isMuted ? '🔇' : '🔊'}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={isMuted ? 0 : volume} onChange={handleVolume}
                  style={{ width: 72, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  title="Volumen"
                />

                {/* Tiempo */}
                {!isLive && (
                  <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
                )}
              </div>

              {/* Grupo derecho: pantalla completa */}
              <div className="player-btn-group">
                <button className="player-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
                  {isFullscreen ? '⊡' : '⛶'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

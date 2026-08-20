import { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import { fmtDemoTime } from './DemoTimer'

function UpdateButton() {
  const [status, setStatus] = useState('idle')
  const fallbackTimerRef = useRef(null)

  useEffect(() => {
    const e = window?.electronAPI
    if (!e) return

    // Recuperar estado actual al montar (por si el evento llegó antes)
    e.updateGetStatus?.().then((s) => {
      if (s?.ready)     setStatus('downloaded')
      else if (s?.error) setStatus('error')
      else if (s?.available) setStatus('available')
    }).catch(() => {})

    const offs = [
      e.onUpdateAvailable?.(() => setStatus('available')),
      e.onUpdateProgress?.(() => setStatus('downloading')),
      e.onUpdateDownloaded?.(() => setStatus('downloaded')),
      e.onUpdateError?.(() => setStatus('error')),
      e.onUpdateNotAvailable?.(() => setStatus((s) => s === 'checking' ? 'uptodate' : s)),
    ]

    return () => {
      clearTimeout(fallbackTimerRef.current)
      offs.forEach((off) => off?.())
    }
  }, [])

  const handleClick = async () => {
    const e = window?.electronAPI
    if (!e) return

    if (status === 'available') {
      e.updateDownload()
      setStatus('downloading')
      return
    }
    if (status === 'downloaded') {
      e.updateInstall()
      return
    }

    setStatus('checking')
    clearTimeout(fallbackTimerRef.current)
    fallbackTimerRef.current = setTimeout(
      () => setStatus((s) => s === 'checking' ? 'uptodate' : s),
      8000
    )
    try {
      await e.updateCheck()
    } catch {
      setStatus('error')
    }
  }

  const labels = {
    idle:        '🔄 Actualizaciones',
    checking:    '⏳ Buscando...',
    available:   '⬇ Descargar update',
    downloading: '⬇ Descargando...',
    downloaded:  '✅ Instalar ahora',
    uptodate:    '✔ Al día',
    error:       '⚠ Error de actualización',
  }

  return (
    <button
      className={`titlebar-update-btn status-${status}`}
      onClick={handleClick}
      disabled={status === 'checking' || status === 'downloading'}
      title="Buscar actualizaciones"
    >
      {labels[status] || labels.idle}
    </button>
  )
}

const NAV_ITEMS = [
  { id: 'livetv',  label: 'TV en Vivo', icon: '📺' },
  { id: 'movies',  label: 'Películas',  icon: '🎬' },
  { id: 'series',  label: 'Series',     icon: '🎭' },
]

function formatExpiry(expDate) {
  if (!expDate) return null
  // expDate puede ser timestamp Unix (string o number)
  const ts = typeof expDate === 'string' ? parseInt(expDate, 10) : expDate
  if (isNaN(ts)) return null
  const date = new Date(ts * 1000)
  const now   = new Date()
  const diffMs   = date - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const formatted = date.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return { formatted, diffDays, expired: diffDays < 0 }
}

function DemoBadge() {
  const isDemoMode  = useStore((s) => s.isDemoMode)
  const demoExpires = useStore((s) => s.demoExpires)
  const [remaining, setRemaining] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (!isDemoMode || !demoExpires) return
    const tick = () => setRemaining(Math.max(0, demoExpires - Date.now()))
    tick()
    ref.current = setInterval(tick, 30_000)
    return () => clearInterval(ref.current)
  }, [isDemoMode, demoExpires])

  if (!isDemoMode || remaining <= 0) return null

  const isLow = remaining <= 5 * 60 * 1000
  return (
    <div className={`titlebar-demo-badge ${isLow ? 'titlebar-demo-badge-low' : ''}`}>
      🎬 DEMO · {fmtDemoTime(remaining)}
    </div>
  )
}

export default function Titlebar({ onLogout }) {
  const [maximized, setMaximized] = useState(false)
  const currentSection    = useStore((s) => s.currentSection)
  const setCurrentSection = useStore((s) => s.setCurrentSection)
  const isAuthenticated   = useStore((s) => s.isAuthenticated)
  const userInfo          = useStore((s) => s.userInfo)
  const appReady          = useStore((s) => s.appReady)

  useEffect(() => {
    if (!window.electronAPI) return
    return window.electronAPI.onMaximized((val) => setMaximized(val))
  }, [])

  const expiry = userInfo?.exp_date ? formatExpiry(userInfo.exp_date) : null

  const expiryClass = expiry
    ? expiry.expired
      ? 'expiry-badge expired'
      : expiry.diffDays <= 7
        ? 'expiry-badge warning'
        : 'expiry-badge ok'
    : ''

  const expiryLabel = expiry
    ? expiry.expired
      ? `⚠ Vencida`
      : expiry.diffDays <= 7
        ? `⚠ Vence en ${expiry.diffDays}d`
        : `Vence: ${expiry.formatted}`
    : null

  return (
    <div className="titlebar">
      {/* Logo + nombre + expiración */}
      <div className="titlebar-logo">
        <img src="logo.jpg" alt="MASTV" className="titlebar-logo-img" />
        <div className="titlebar-brand">
          <span className="titlebar-name">
            MASTV <span className="titlebar-name-accent">PLAYER</span>
          </span>
          {isAuthenticated && appReady && expiryLabel && (
            <span className={expiryClass} title="Fecha de vencimiento de tu cuenta">
              {expiryLabel}
            </span>
          )}
        </div>
      </div>

      {/* Centro: badge demo + botón actualizaciones */}
      <div className="titlebar-center">
        {isAuthenticated && appReady && (
          <>
            <DemoBadge />
            <UpdateButton />
          </>
        )}
      </div>

      {/* Navegación principal */}
      {isAuthenticated && appReady && (
        <nav className="titlebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`titlebar-nav-item ${currentSection === item.id ? 'active' : ''}`}
              onClick={() => setCurrentSection(item.id)}
            >
              <span className="titlebar-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div className="titlebar-nav-divider" />
          <button className="titlebar-nav-item logout" onClick={onLogout} title="Cerrar sesión">
            <span className="titlebar-nav-icon">⎋</span>
            Salir
          </button>
        </nav>
      )}

      {/* Controles de ventana */}
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={() => window.electronAPI?.minimize()} title="Minimizar">─</button>
        <button className="titlebar-btn" onClick={() => window.electronAPI?.maximize()} title={maximized ? 'Restaurar' : 'Maximizar'}>
          {maximized ? '❐' : '□'}
        </button>
        <button className="titlebar-btn close" onClick={() => window.electronAPI?.close()} title="Cerrar">✕</button>
      </div>
    </div>
  )
}

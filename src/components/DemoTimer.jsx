import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'

const FIVE_MIN_MS = 5 * 60 * 1000

export function fmtDemoTime(ms) {
  if (ms <= 0) return '0 min'
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

/**
 * DemoTimer
 * - Comprueba cada 30 s si el demo sigue vigente
 * - A los 5 min restantes muestra un aviso descartable
 * - Al llegar a 0 muestra el modal bloqueante
 */
export default function DemoTimer() {
  const isDemoMode     = useStore((s) => s.isDemoMode)
  const demoExpires    = useStore((s) => s.demoExpires)
  const logout         = useStore((s) => s.logout)
  const setDemoNotice  = useStore((s) => s.setDemoNotice)
  const [showExpired, setShowExpired] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [remaining,   setRemaining]   = useState(0)

  const intervalRef        = useRef(null)
  const warningDismissed   = useRef(false)   // ref para no reiniciar el intervalo al dismissar

  useEffect(() => {
    if (!isDemoMode || !demoExpires) return

    const tick = () => {
      const left = demoExpires - Date.now()
      if (left <= 0) {
        clearInterval(intervalRef.current)
        setShowExpired(true)
        setRemaining(0)
        setShowWarning(false)
      } else {
        setRemaining(left)
        if (left <= FIVE_MIN_MS && !warningDismissed.current) {
          setShowWarning(true)
        }
      }
    }

    tick()
    intervalRef.current = setInterval(tick, 30_000)
    return () => clearInterval(intervalRef.current)
  }, [isDemoMode, demoExpires])   // warningDismissed es ref → no es dependencia

  const handleDismissWarning = () => {
    warningDismissed.current = true
    setShowWarning(false)
  }

  const handleAccept = () => {
    setDemoNotice('expired')
    logout()
  }

  if (!isDemoMode) return null

  return (
    <>
      {/* Aviso de 5 min — descartable */}
      {showWarning && !showExpired && (
        <div className="demo-warning-bar">
          <span className="demo-warning-icon">⚠</span>
          <span className="demo-warning-text">
            <strong>Demo a punto de expirar</strong> — Te quedan{' '}
            <strong>{fmtDemoTime(remaining)}</strong>. Consulta con tu proveedor para adquirir el servicio.
          </span>
          <button className="demo-warning-close" onClick={handleDismissWarning} title="Cerrar">
            ✕
          </button>
        </div>
      )}

      {/* Modal de vencimiento — bloquea toda la UI */}
      {showExpired && (
        <div className="demo-expired-overlay">
          <div className="demo-expired-modal">
            <div className="demo-expired-icon">⏱</div>
            <h2>Demo finalizado</h2>
            <p>
              Tu periodo de prueba de <strong>3 horas</strong> ha vencido.
              <br />
              Para seguir disfrutando del servicio, contacta con tu proveedor
              y adquiere una cuenta.
            </p>
            <button className="btn-primary demo-expired-btn" onClick={handleAccept}>
              Entendido ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

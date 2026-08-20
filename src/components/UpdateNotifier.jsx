import { useEffect, useRef, useState } from 'react'

export default function UpdateNotifier() {
  const [state,   setState]   = useState(null)
  const [errMsg,  setErrMsg]  = useState(null)

  const verifyTimerRef = useRef(null)   // timeout para detectar verificación colgada

  // Al llegar al 100%, esperamos max 30 s el evento update-downloaded.
  // Si no llega, pedimos el estado al main process para saber si hay error.
  const startVerifyTimer = () => {
    clearTimeout(verifyTimerRef.current)
    verifyTimerRef.current = setTimeout(async () => {
      const status = await window.electronAPI?.updateGetStatus?.()
      if (status?.ready) {
        // El main process ya lo tiene listo aunque el evento se perdió
        setState({ type: 'downloaded' })
      } else if (status?.error) {
        setErrMsg(status.error)
        setState({ type: 'error' })
      } else {
        // Seguimos esperando (no mostrar nada extra)
        setState({ type: 'error' })
        setErrMsg('La verificación tardó demasiado. Intenta de nuevo.')
      }
    }, 30_000)
  }

  useEffect(() => {
    const e = window?.electronAPI
    if (!e) return

    // Consultar estado actual al montar (recupera eventos que llegaron antes)
    e.updateGetStatus?.().then((status) => {
      if (status?.ready)     setState({ type: 'downloaded' })
      else if (status?.error) { setErrMsg(status.error); setState({ type: 'error' }) }
    }).catch(() => {})

    const offs = [
      e.onUpdateAvailable?.((info) => setState({ type: 'available', info })),
      e.onUpdateProgress?.((prog) => {
        const percent = Math.round(prog.percent || 0)
        setState({ type: 'downloading', percent })
        if (percent >= 100) startVerifyTimer()
      }),
      e.onUpdateDownloaded?.(() => {
        clearTimeout(verifyTimerRef.current)
        setState({ type: 'downloaded' })
      }),
      e.onUpdateError?.((msg) => {
        clearTimeout(verifyTimerRef.current)
        setErrMsg(msg || 'Error desconocido en la actualización')
        setState({ type: 'error' })
      }),
    ]

    return () => {
      clearTimeout(verifyTimerRef.current)
      offs.forEach((off) => off?.())
    }
  }, [])

  if (!state) return null

  const handleDownload = () => {
    window.electronAPI?.updateDownload()
    setErrMsg(null)
    setState({ type: 'downloading', percent: 0 })
  }
  const handleInstall = () => window.electronAPI?.updateInstall()
  const handleDismiss = () => { setState(null); setErrMsg(null) }

  return (
    <div className={`update-bar${state.type === 'error' ? ' update-bar-error' : ''}`}>
      {state.type === 'available' && (
        <>
          <span className="update-bar-icon">🔄</span>
          <span className="update-bar-text">
            Nueva versión <strong>v{state.info?.version}</strong> disponible
          </span>
          <button className="update-bar-btn" onClick={handleDownload}>Descargar</button>
          <button className="update-bar-dismiss" onClick={handleDismiss}>✕</button>
        </>
      )}

      {state.type === 'downloading' && (
        <>
          <span className="update-bar-icon">⬇</span>
          <span className="update-bar-text">
            {state.percent >= 100
              ? 'Verificando descarga...'
              : `Descargando actualización... ${state.percent}%`}
          </span>
          {state.percent < 100 && (
            <div className="update-bar-progress">
              <div className="update-bar-fill" style={{ width: `${state.percent}%` }} />
            </div>
          )}
          <button className="update-bar-dismiss" onClick={handleDismiss}>✕</button>
        </>
      )}

      {state.type === 'downloaded' && (
        <>
          <span className="update-bar-icon">✅</span>
          <span className="update-bar-text">
            Actualización lista. Haz clic en <strong>Instalar ahora</strong> o cierra la app para instalar automáticamente.
          </span>
          <button className="update-bar-btn" onClick={handleInstall}>Instalar ahora</button>
          <button className="update-bar-dismiss" onClick={handleDismiss}>✕</button>
        </>
      )}

      {state.type === 'error' && (
        <>
          <span className="update-bar-icon">⚠</span>
          <span className="update-bar-text">
            {errMsg
              ? `Error: ${errMsg}`
              : 'No se pudo completar la actualización.'}
          </span>
          <button className="update-bar-btn" onClick={handleDownload}>Reintentar</button>
          <button className="update-bar-dismiss" onClick={handleDismiss}>✕</button>
        </>
      )}
    </div>
  )
}

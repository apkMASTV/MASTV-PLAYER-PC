import { useState } from 'react'
import useStore from '../store/useStore'
import { xtreamApi } from '../services/xtreamApi'
import { loadM3UData } from '../services/m3uParser'
import { XTREAM_SERVERS } from '../store/useStore'
import { saveAccounts, isAccountExpired, accountLabel } from '../services/persistence'

// Credenciales de la cuenta demo (hardcoded)
const DEMO_USERNAME = 'apkautodemotest'
const DEMO_PASSWORD = 'xrced4xb'

// ── Icono de usuario genérico ─────────────────────────────────────────────
function UserAvatar({ label }) {
  return (
    <div className="acct-avatar">
      {label.charAt(0).toUpperCase()}
    </div>
  )
}

export default function Login() {
  const [tab, setTab] = useState('xtream')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [m3uUrl, setM3uUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serverStatus, setServerStatus] = useState('')

  const setAuthenticated = useStore((s) => s.setAuthenticated)
  const setDemoMode      = useStore((s) => s.setDemoMode)
  const setDemoNotice    = useStore((s) => s.setDemoNotice)
  const setLiveData      = useStore((s) => s.setLiveData)
  const setMovieData     = useStore((s) => s.setMovieData)
  const setSeriesData    = useStore((s) => s.setSeriesData)
  const addOrUpdateSavedAccount = useStore((s) => s.addOrUpdateSavedAccount)
  const removeSavedAccount      = useStore((s) => s.removeSavedAccount)
  const demoNotice    = useStore((s) => s.demoNotice)
  const savedAccounts = useStore((s) => s.savedAccounts)

  // Estado propio para manejar mensajes del flujo demo
  const [demoLoading, setDemoLoading] = useState(false)

  // ── Guardar cuenta después de un login exitoso ────────────────────────
  const persistAccount = async (account) => {
    addOrUpdateSavedAccount(account)
    // Obtener el estado actualizado del store para guardar todo
    const updated = useStore.getState().savedAccounts
    // Si la cuenta recién añadida no está aún en 'updated', añadirla manualmente
    const exists = updated.some((a) => a.id === account.id)
    const list = exists ? updated : [...updated, account]
    await saveAccounts(list)
  }

  // ── Login con cuenta guardada ─────────────────────────────────────────
  const loginWithAccount = (account) => {
    if (isAccountExpired(account)) {
      setError(`La cuenta "${accountLabel(account)}" ha vencido. Renueva tu suscripción para continuar.`)
      return
    }
    setError('')
    if (account.method === 'xtream') {
      setAuthenticated(
        'xtream',
        { username: account.username, password: account.password },
        account.userInfo || null,
      )
    } else if (account.method === 'm3u') {
      setAuthenticated('m3u', { m3uUrl: account.m3uUrl }, null)
    }
  }

  // ── Eliminar cuenta guardada ──────────────────────────────────────────
  const handleDeleteAccount = async (e, id) => {
    e.stopPropagation()
    removeSavedAccount(id)
    const updated = useStore.getState().savedAccounts.filter((a) => a.id !== id)
    await saveAccounts(updated)
  }

  // ── Login Xtream (nueva cuenta) ───────────────────────────────────────
  const handleXtreamLogin = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Ingresa usuario y contraseña')
      return
    }
    setLoading(true)
    setError('')
    setServerStatus('Probando servidores...')

    try {
      const result = await xtreamApi.authenticate(username.trim(), password.trim())
      const serverIndex = XTREAM_SERVERS.indexOf(result.connectedServer) + 1
      setServerStatus(`Conectado al servidor ${serverIndex}`)

      const userInfo = result.user_info || null

      // Upsert: buscar si ya existe esta cuenta
      const existing = savedAccounts.find(
        (a) => a.method === 'xtream' && a.username === username.trim()
      )
      const account = {
        id:         existing?.id || String(Date.now()),
        method:     'xtream',
        username:   username.trim(),
        password:   password.trim(),
        userInfo,
        lastUsedAt: Date.now(),
        addedAt:    existing?.addedAt || Date.now(),
      }
      await persistAccount(account)

      setAuthenticated('xtream', { username: username.trim(), password: password.trim() }, userInfo)
    } catch (err) {
      setError(err.message || 'No se pudo conectar. Verifica tus credenciales.')
      setServerStatus('')
    } finally {
      setLoading(false)
    }
  }

  // ── Login M3U (nueva cuenta) ──────────────────────────────────────────
  const handleM3ULogin = async (e) => {
    e.preventDefault()
    if (!m3uUrl.trim()) {
      setError('Ingresa el link de la lista M3U')
      return
    }
    setLoading(true)
    setError('')
    setServerStatus('Cargando lista...')

    try {
      const { categories, liveChannels, movieChannels } = await loadM3UData(m3uUrl.trim())

      setLiveData(categories, liveChannels)
      setMovieData(categories, movieChannels)
      setSeriesData([], [])

      const existing = savedAccounts.find(
        (a) => a.method === 'm3u' && a.m3uUrl === m3uUrl.trim()
      )
      const account = {
        id:         existing?.id || String(Date.now()),
        method:     'm3u',
        m3uUrl:     m3uUrl.trim(),
        userInfo:   null,
        lastUsedAt: Date.now(),
        addedAt:    existing?.addedAt || Date.now(),
      }
      await persistAccount(account)

      setAuthenticated('m3u', { m3uUrl: m3uUrl.trim() }, null)
    } catch (err) {
      setError(err.message || 'Error al cargar la lista M3U. Verifica el link.')
      setServerStatus('')
    } finally {
      setLoading(false)
    }
  }

  // ── Login Demo ───────────────────────────────────────────────────────
  const handleDemoLogin = async () => {
    if (!window.electronAPI) {
      setError('Demo no disponible en modo desarrollo')
      return
    }
    setDemoLoading(true)
    setError('')

    try {
      const check = await window.electronAPI.demoCheck()

      if (check.status === 'expired') {
        setDemoNotice('used')
        setError('El demo ya fue usado en esta computadora y no puede volver a utilizarse. Contacta con tu proveedor para adquirir una cuenta.')
        setDemoLoading(false)
        return
      }

      // Activar (o retomar si ya está activo)
      const result = await window.electronAPI.demoActivate()
      if (!result.ok && result.reason === 'expired') {
        setDemoNotice('used')
        setError('El demo ya venció en esta computadora. Contacta con tu proveedor para adquirir una cuenta.')
        setDemoLoading(false)
        return
      }

      // Autenticar con la cuenta demo a través de los servidores Xtream
      let authResult
      try {
        authResult = await xtreamApi.authenticate(DEMO_USERNAME, DEMO_PASSWORD)
      } catch {
        // La cuenta demo fue desactivada en el servidor
        setError('LOS DEMOS SE DESACTIVARON.\nConsulte con su proveedor para un demo manual o adquirir una cuenta directamente.')
        setDemoLoading(false)
        return
      }

      const userInfo  = authResult.user_info || null
      const expiresAt = result.startTime + (3 * 60 * 60 * 1000)   // 3 horas

      setAuthenticated('xtream', { username: DEMO_USERNAME, password: DEMO_PASSWORD }, userInfo)
      setDemoMode(expiresAt)
    } catch (err) {
      setError('Error inesperado. Intenta más tarde.')
    } finally {
      setDemoLoading(false)
    }
  }

  // ── Formatear fecha de expiración ─────────────────────────────────────
  const formatExpiry = (account) => {
    if (account.method !== 'xtream' || !account.userInfo?.exp_date) return null
    const ts = parseInt(account.userInfo.exp_date, 10)
    if (isNaN(ts)) return null
    return new Date(ts * 1000).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  const hasSavedAccounts = savedAccounts.length > 0

  return (
    <div className="login-page">
      <div className={`login-card fade-in ${hasSavedAccounts ? 'login-card-wide' : ''}`}>

        {/* Logo */}
        <div className="login-logo">
          <img src="logo.jpg" alt="MASTV Player" className="login-logo-img" />
          <h1>MASTV <span>PLAYER</span></h1>
          <p>Tu entretenimiento, sin límites</p>
        </div>

        {/* Aviso de demo vencido o ya usado (persiste de sesión anterior) */}
        {(demoNotice === 'expired' || demoNotice === 'used') && (
          <div className="demo-notice-banner">
            <span className="demo-notice-icon">⛔</span>
            <div>
              <strong>Demo no disponible</strong>
              <p>
                {demoNotice === 'expired'
                  ? 'Tu periodo de prueba de 3 horas ha vencido.'
                  : 'El demo ya fue utilizado en esta computadora.'}
                <br />
                Contacta con tu proveedor para adquirir una cuenta completa.
              </p>
            </div>
            <button className="demo-notice-close" onClick={() => setDemoNotice(null)}>✕</button>
          </div>
        )}

        {/* Cuentas guardadas */}
        {hasSavedAccounts && (
          <div className="saved-accounts-section">
            <div className="saved-accounts-title">
              <span className="saved-accounts-icon">👤</span>
              Cuentas guardadas
            </div>

            <div className="saved-accounts-grid">
              {savedAccounts.map((account) => {
                const expired = isAccountExpired(account)
                const label   = accountLabel(account)
                const expDate = formatExpiry(account)

                return (
                  <div
                    key={account.id}
                    className={`acct-card ${expired ? 'acct-card-expired' : ''}`}
                    onClick={() => loginWithAccount(account)}
                    title={expired ? 'Cuenta vencida' : `Iniciar sesión como ${label}`}
                  >
                    <button
                      className="acct-card-delete"
                      onClick={(e) => handleDeleteAccount(e, account.id)}
                      title="Eliminar cuenta"
                    >
                      ✕
                    </button>

                    <UserAvatar label={label} />

                    <div className="acct-card-info">
                      <span className="acct-card-name">{label}</span>
                      <span className="acct-card-method">
                        {account.method === 'xtream' ? 'Xtream Codes' : 'Lista M3U'}
                      </span>
                      {expDate && (
                        <span className={`acct-card-exp ${expired ? 'acct-card-exp-bad' : ''}`}>
                          {expired ? '⛔ Vencida' : `Expira: ${expDate}`}
                        </span>
                      )}
                    </div>

                    {!expired && (
                      <div className="acct-card-enter">▶</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Separador */}
        <div className="login-divider">
          <span>{hasSavedAccounts ? 'o agrega una nueva cuenta' : 'Inicia sesión'}</span>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'xtream' ? 'active' : ''}`}
            onClick={() => { setTab('xtream'); setError(''); setServerStatus('') }}
          >
            Xtream Codes
          </button>
          <button
            className={`login-tab ${tab === 'm3u' ? 'active' : ''}`}
            onClick={() => { setTab('m3u'); setError(''); setServerStatus('') }}
          >
            Lista M3U
          </button>
        </div>

        {/* Formulario Xtream */}
        {tab === 'xtream' ? (
          <form onSubmit={handleXtreamLogin}>
            <div className="form-group">
              <label>Usuario</label>
              <input
                type="text"
                placeholder="Ingresa tu usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {loading && serverStatus && (
              <div className="server-status">
                <div className="server-status-dot" />
                {serverStatus}
              </div>
            )}

            {!loading && (
              <div className="servers-hint">
                <span>Servidores:</span>
                {XTREAM_SERVERS.map((_, i) => (
                  <span key={i} className="server-dot" title={`Servidor ${i + 1}`}>●</span>
                ))}
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="btn-spinner" /> Conectando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
        ) : (
          /* Formulario M3U */
          <form onSubmit={handleM3ULogin}>
            <div className="form-group">
              <label>Link de la lista M3U</label>
              <input
                type="url"
                placeholder="http://ejemplo.com/lista.m3u"
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="btn-spinner" /> Cargando...
                </span>
              ) : 'Cargar Lista'}
            </button>
          </form>
        )}
        {/* Botón demo */}
        {demoNotice !== 'used' && demoNotice !== 'expired' && (
          <div className="demo-btn-row">
            <div className="demo-btn-divider" />
            <button
              className="btn-demo"
              onClick={handleDemoLogin}
              disabled={demoLoading || loading}
              title="Prueba la app gratis durante 3 horas (una sola vez por PC)"
            >
              {demoLoading
                ? <><span className="btn-spinner" /> Conectando demo...</>
                : <>🎬 DEMO 3 hrs &nbsp;<span className="demo-btn-hint">— por única vez</span></>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

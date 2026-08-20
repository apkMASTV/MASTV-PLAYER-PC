/**
 * persistence.js
 * Capa de abstracción para guardar y restaurar datos en electron-store.
 * Todas las funciones son no-ops si electronAPI no está disponible (modo web/dev).
 */

const KEYS = {
  ACCOUNTS:  'mastv_accounts_v1',
  FAVORITES: 'mastv_favorites_v1',
  HISTORY:   'mastv_history_v1',
}

const api = () => window?.electronAPI || null

// ── Leer todo de una vez al arrancar ──────────────────────────────────────
export const loadAllPersisted = async () => {
  const e = api()
  if (!e) return { accounts: [], favorites: null, history: null }
  const [accounts, favorites, history] = await Promise.all([
    e.storeGet(KEYS.ACCOUNTS),
    e.storeGet(KEYS.FAVORITES),
    e.storeGet(KEYS.HISTORY),
  ])
  return {
    accounts:  Array.isArray(accounts) ? accounts : [],
    favorites: favorites  || null,
    history:   history    || null,
  }
}

// ── Cuentas ───────────────────────────────────────────────────────────────
export const saveAccounts = async (accounts) => {
  const e = api()
  if (!e) return
  await e.storeSet(KEYS.ACCOUNTS, accounts)
}

// ── Favoritos ─────────────────────────────────────────────────────────────
export const saveFavorites = async (movieFavorites, seriesFavorites, channelFavorites) => {
  const e = api()
  if (!e) return
  await e.storeSet(KEYS.FAVORITES, { movieFavorites, seriesFavorites, channelFavorites })
}

// ── Historial ─────────────────────────────────────────────────────────────
export const saveHistory = async (recentChannels, recentMovies, recentSeries) => {
  const e = api()
  if (!e) return
  await e.storeSet(KEYS.HISTORY, { recentChannels, recentMovies, recentSeries })
}

// ── Helper: comprobar expiración de una cuenta Xtream ────────────────────
export const isAccountExpired = (account) => {
  if (!account?.userInfo?.exp_date) return false
  const expTs = parseInt(account.userInfo.exp_date, 10)
  if (isNaN(expTs)) return false
  return Date.now() > expTs * 1000
}

// ── Helper: nombre visible de una cuenta ─────────────────────────────────
export const accountLabel = (account) => {
  if (account.method === 'xtream') return account.username || 'Cuenta Xtream'
  if (account.method === 'm3u') {
    if (!account.m3uUrl) return 'Lista M3U'
    // Una URL guardada inválida haría fallar el render entero del login
    try {
      return new URL(account.m3uUrl).hostname
    } catch {
      return 'Lista M3U'
    }
  }
  return 'Cuenta'
}

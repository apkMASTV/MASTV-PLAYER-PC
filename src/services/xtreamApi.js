import axios from 'axios'
import { XTREAM_SERVERS } from '../store/useStore'

// Servidor activo en esta sesión (se determina al autenticar)
let activeServer = null

// Sin escapar, una contraseña con &, #, + o espacios rompe la query
// y el login falla sin ningún mensaje que lo explique.
const enc = encodeURIComponent

export const resetActiveServer = () => { activeServer = null }

const apiUrl = (server, username, password, params = '') =>
  `${server}/player_api.php?username=${enc(username)}&password=${enc(password)}${params}`

/**
 * Intenta una petición contra los servidores disponibles.
 * El que funcionó la última vez va primero, pero si dejó de responder
 * se sigue probando con el resto en lugar de rendirse.
 */
const requestWithFallback = async (buildUrl, options = {}) => {
  const servers = activeServer
    ? [activeServer, ...XTREAM_SERVERS.filter((s) => s !== activeServer)]
    : XTREAM_SERVERS
  let lastError = null

  for (const server of servers) {
    try {
      const response = await axios.get(buildUrl(server), { timeout: 15000, ...options })
      activeServer = server
      return response
    } catch (err) {
      lastError = err
      // Continuar con el siguiente servidor
    }
  }
  throw lastError || new Error('No se pudo conectar a ningún servidor')
}

export const xtreamApi = {
  // Autenticación con fallback entre los servidores configurados
  authenticate: async (username, password) => {
    let lastError = null

    for (const server of XTREAM_SERVERS) {
      try {
        const response = await axios.get(apiUrl(server, username, password), { timeout: 12000 })
        const data = response.data

        if (data?.user_info?.auth === 1 || data?.user_info?.auth === '1') {
          // Guardar el servidor que funcionó
          activeServer = server
          return { ...data, connectedServer: server }
        }
        // Auth fallida pero servidor respondió → error de credenciales
        throw new Error('Credenciales incorrectas')
      } catch (err) {
        // Si es error de credenciales (no de conexión), no probar más servidores
        if (err.message === 'Credenciales incorrectas') throw err
        lastError = err
        // Si es error de red, probar siguiente servidor
      }
    }

    throw lastError && lastError.message === 'Credenciales incorrectas'
      ? lastError
      : new Error('No se pudo conectar a ningún servidor. Verifica tu conexión.')
  },

  // Live TV
  getLiveCategories: async (username, password) => {
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, '&action=get_live_categories')
    )
    return res.data || []
  },

  getLiveStreams: async (username, password, categoryId = null) => {
    const extra = categoryId ? `&category_id=${enc(categoryId)}` : ''
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, `&action=get_live_streams${extra}`),
      { timeout: 30000 }
    )
    return res.data || []
  },

  getLiveStreamUrl: (username, password, streamId, ext = 'ts') => {
    const server = activeServer || XTREAM_SERVERS[0]
    return `${server}/live/${enc(username)}/${enc(password)}/${enc(streamId)}.${ext}`
  },

  // Movies (VOD)
  getVodCategories: async (username, password) => {
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, '&action=get_vod_categories')
    )
    return res.data || []
  },

  getVodStreams: async (username, password, categoryId = null) => {
    const extra = categoryId ? `&category_id=${enc(categoryId)}` : ''
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, `&action=get_vod_streams${extra}`),
      { timeout: 30000 }
    )
    return res.data || []
  },

  getVodInfo: async (username, password, vodId) => {
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, `&action=get_vod_info&vod_id=${enc(vodId)}`)
    )
    return res.data
  },

  getVodStreamUrl: (username, password, streamId, ext = 'mp4') => {
    const server = activeServer || XTREAM_SERVERS[0]
    return `${server}/movie/${enc(username)}/${enc(password)}/${enc(streamId)}.${ext}`
  },

  // Series
  getSeriesCategories: async (username, password) => {
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, '&action=get_series_categories')
    )
    return res.data || []
  },

  getSeries: async (username, password, categoryId = null) => {
    const extra = categoryId ? `&category_id=${enc(categoryId)}` : ''
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, `&action=get_series${extra}`),
      { timeout: 30000 }
    )
    return res.data || []
  },

  getSeriesInfo: async (username, password, seriesId) => {
    const res = await requestWithFallback(
      (server) => apiUrl(server, username, password, `&action=get_series_info&series_id=${enc(seriesId)}`)
    )
    return res.data
  },

  getEpisodeStreamUrl: (username, password, episodeId, ext = 'mp4') => {
    const server = activeServer || XTREAM_SERVERS[0]
    return `${server}/series/${enc(username)}/${enc(password)}/${enc(episodeId)}.${ext}`
  },
}

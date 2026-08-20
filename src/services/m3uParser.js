import axios from 'axios'

/**
 * Parsea una lista M3U desde una URL o texto
 */
export const parseM3U = async (urlOrText) => {
  let text = urlOrText

  // Si es URL, descargar primero
  if (urlOrText.startsWith('http://') || urlOrText.startsWith('https://')) {
    const response = await axios.get(urlOrText, {
      timeout: 30000,
      responseType: 'text',
    })
    text = response.data
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const channels = []
  const categories = new Set()

  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('#EXTINF:')) {
      current = parseExtinf(line)
      if (current.group) categories.add(current.group)
    } else if (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp')) {
      if (current) {
        current.url = line
        current.stream_id = channels.length + 1
        channels.push(current)
        current = null
      }
    }
  }

  const catArray = [
    { category_id: 'all', category_name: 'Todos' },
    ...[...categories].map((name, i) => ({
      category_id: `cat_${i}`,
      category_name: name,
    })),
  ]

  return { channels, categories: catArray }
}

/**
 * Descarga la lista y la reparte por secciones, lista para el store.
 * La usan tanto el login manual como el auto-login de una cuenta guardada,
 * para que ambos caminos produzcan exactamente el mismo resultado.
 */
export const loadM3UData = async (url) => {
  const { channels, categories } = await parseM3U(url)
  if (channels.length === 0) {
    throw new Error('No se encontraron canales en la lista M3U')
  }

  const live   = channels.filter((c) => c.stream_type !== 'movie' && c.stream_type !== 'series')
  const movies = channels.filter((c) => c.stream_type === 'movie')

  return {
    categories,
    liveChannels: live.length > 0 ? live : channels,
    movieChannels: movies,
  }
}

function parseExtinf(line) {
  const result = {
    name: '',
    logo: '',
    group: '',
    stream_type: 'live',
  }

  // Nombre del canal (último segmento después de la coma)
  const commaIdx = line.lastIndexOf(',')
  if (commaIdx !== -1) {
    result.name = line.substring(commaIdx + 1).trim()
  }

  // Logo
  const logoMatch = line.match(/tvg-logo="([^"]*)"/)
  if (logoMatch) result.logo = logoMatch[1]

  // Grupo/categoría
  const groupMatch = line.match(/group-title="([^"]*)"/)
  if (groupMatch) result.group = groupMatch[1]

  // Detectar tipo por grupo
  const group = result.group.toLowerCase()
  if (group.includes('movie') || group.includes('película') || group.includes('vod')) {
    result.stream_type = 'movie'
  } else if (group.includes('serie') || group.includes('series') || group.includes('show')) {
    result.stream_type = 'series'
  }

  return result
}

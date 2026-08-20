import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useStore, { CAT_FAVS, CAT_RECENT } from '../store/useStore'
import { xtreamApi } from '../services/xtreamApi'
import LiveTVPlayer from './LiveTVPlayer'

// Una lista Xtream puede traer decenas de miles de canales: pintarlos todos
// de golpe bloquea la interfaz, así que se muestran por tandas.
const PAGE_SIZE = 300

export default function LiveTV() {
  const setSearchQuery       = useStore((s) => s.setSearchQuery)
  const toggleChannelFavorite = useStore((s) => s.toggleChannelFavorite)
  const addRecentChannel     = useStore((s) => s.addRecentChannel)
  const setLiveData          = useStore((s) => s.setLiveData)
  const setLiveStream        = useStore((s) => s.setLiveStream)

  const {
    authMethod, credentials,
    liveChannels,
    activeLiveCategory,
    searchQuery,
    channelFavorites,
    recentChannels,
    liveStream,
  } = useStore(
    useShallow((s) => ({
      authMethod: s.authMethod,
      credentials: s.credentials,
      liveChannels: s.liveChannels,
      activeLiveCategory: s.activeLiveCategory,
      searchQuery: s.searchQuery,
      channelFavorites: s.channelFavorites,
      recentChannels: s.recentChannels,
      liveStream: s.liveStream,
    }))
  )

  const [localLoading, setLocalLoading] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (liveChannels.length === 0 && authMethod === 'xtream') {
      loadData()
    }
  }, [])

  useEffect(() => { setPage(1) }, [activeLiveCategory, searchQuery])

  const loadData = async () => {
    setLocalLoading(true)
    try {
      const { username, password } = credentials
      const [cats, channels] = await Promise.all([
        xtreamApi.getLiveCategories(username, password),
        xtreamApi.getLiveStreams(username, password),
      ])
      setLiveData(cats, channels)
    } catch (err) {
      console.error('Error cargando canales:', err)
    } finally {
      setLocalLoading(false)
    }
  }

  const filteredChannels = useMemo(() => {
    // Categorías especiales
    if (activeLiveCategory === CAT_FAVS)   return channelFavorites
    if (activeLiveCategory === CAT_RECENT) return recentChannels

    let list = liveChannels
    if (activeLiveCategory !== 'all') {
      list = list.filter((c) => String(c.category_id) === String(activeLiveCategory))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((c) => c.name?.toLowerCase().includes(q))
    }
    return list
  }, [liveChannels, activeLiveCategory, searchQuery, channelFavorites, recentChannels])

  // Set de IDs para consultar favoritos en O(1) durante el render
  const favSet = useMemo(
    () => new Set(channelFavorites.map((c) => c.stream_id)),
    [channelFavorites]
  )

  const displayedChannels = filteredChannels.slice(0, page * PAGE_SIZE)
  const hasMore = displayedChannels.length < filteredChannels.length

  const playChannel = (channel) => {
    const { username, password } = credentials || {}
    let url = channel.url
    if (!url && authMethod === 'xtream') {
      url = xtreamApi.getLiveStreamUrl(username, password, channel.stream_id, 'ts')
    }
    const stream = {
      name: channel.name,
      url,
      logo: channel.stream_icon || channel.logo,
      stream_type: 'live',
      stream_id: channel.stream_id,
    }
    setLiveStream(stream)
    addRecentChannel({ ...channel, url, stream_type: 'live' })
  }

  if (localLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Cargando canales...</p>
      </div>
    )
  }

  return (
    <div className="livetv-layout">

      {/* ── Columna izquierda: lista de canales ── */}
      <div className="livetv-channels-col">
        <div className="livetv-search-bar">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Buscar canal..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="channel-list">
          {filteredChannels.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                {activeLiveCategory === CAT_FAVS   ? '⭐' :
                 activeLiveCategory === CAT_RECENT ? '🕐' : '📺'}
              </span>
              <p>
                {activeLiveCategory === CAT_FAVS   ? 'No tenés canales favoritos aún' :
                 activeLiveCategory === CAT_RECENT ? 'Aún no viste ningún canal' :
                 'No se encontraron canales'}
              </p>
            </div>
          ) : (
            displayedChannels.map((channel) => (
              <div
                key={channel.stream_id || channel.name}
                className={`channel-item ${liveStream?.stream_id === channel.stream_id ? 'playing' : ''}`}
                onClick={() => playChannel(channel)}
              >
                {channel.stream_icon || channel.logo ? (
                  <img
                    className="channel-logo"
                    src={channel.stream_icon || channel.logo}
                    alt={channel.name}
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling && (e.target.nextSibling.style.display = 'flex')
                    }}
                  />
                ) : null}
                <div
                  className="channel-logo-placeholder"
                  style={{ display: channel.stream_icon || channel.logo ? 'none' : 'flex' }}
                >
                  📺
                </div>
                <div className="channel-info">
                  <div className="channel-name">{channel.name}</div>
                  <div className="channel-group">
                    {channel.category_name || channel.group || 'General'}
                  </div>
                </div>
                {liveStream?.stream_id === channel.stream_id && (
                  <span className="playing-indicator">▶</span>
                )}
                <button
                  className={`channel-fav-btn ${favSet.has(channel.stream_id) ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleChannelFavorite(channel) }}
                  title={favSet.has(channel.stream_id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                >
                  {favSet.has(channel.stream_id) ? '★' : '☆'}
                </button>
              </div>
            ))
          )}

          {hasMore && (
            <button
              className="channel-load-more"
              onClick={() => setPage((p) => p + 1)}
            >
              Cargar más ({filteredChannels.length - displayedChannels.length} restantes)
            </button>
          )}
        </div>
      </div>

      {/* ── Columna derecha: reproductor inline ── */}
      <div className="livetv-player-col">
        <LiveTVPlayer
          filteredChannels={displayedChannels}
          onChannelSelect={playChannel}
        />
      </div>

    </div>
  )
}

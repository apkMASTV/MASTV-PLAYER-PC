const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const os   = require('os')
const fs   = require('fs')
const { execSync } = require('child_process')
const Store = require('electron-store')

const store  = new Store()
const isDev  = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Auto-updater (solo en producción) ────────────────────────────────────
let autoUpdater = null

// Estado persistente del update para que el renderer pueda recuperarlo al montar
const updateState = { available: false, ready: false, version: null, error: null }

if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload         = false
    autoUpdater.autoInstallOnAppQuit = true
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO — utilidades de registro/MAC
// ═══════════════════════════════════════════════════════════════════════════
const DEMO_DURATION_MS = 3 * 60 * 60 * 1000   // 3 horas
const REG_KEY          = 'HKCU\\SOFTWARE\\MASTVPlayer'
const REG_VALUE        = 'DemoRecord'
const STORE_DEMO_KEY   = 'demo_record_v1'

// Las credenciales del demo viven aquí y no en el renderer: así no quedan
// incrustadas en el bundle y sólo se entregan cuando el demo resulta válido.
const DEMO_CREDENTIALS = { username: 'apkautodemotest', password: 'xrced4xb' }

function getMacAddress() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac
      }
    }
  }
  return 'unknown'
}

function getProgramDataPath() {
  return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'MASTVPlayer', 'demo.dat')
}

// Margen para desajustes normales de reloj
const CLOCK_SKEW_MS = 5 * 60 * 1000

/**
 * Valida un registro leído del disco. Devuelve null si no sirve.
 * Un startTime ausente, no numérico o en el futuro dejaba el demo sin límite:
 * el temporizador del renderer no arrancaba y nunca vencía.
 */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null
  const startTime = Number(raw.startTime)
  if (!Number.isFinite(startTime) || startTime <= 0) return null

  const now = Date.now()
  return {
    mac: typeof raw.mac === 'string' ? raw.mac : 'unknown',
    // Un reloj adelantado no debe alargar el demo
    startTime: startTime > now + CLOCK_SKEW_MS ? now : startTime,
  }
}

/**
 * Lee el registro del demo de las tres capas y devuelve el más antiguo válido.
 *
 *   null                → el demo nunca se usó en esta PC
 *   { startTime: ... }  → ya se usó (o hay rastro manipulado, que se da por vencido)
 *
 * Si hay rastro pero ninguna capa es legible se falla en cerrado: se considera
 * usado. Así borrar o corromper una capa no devuelve el demo.
 */
function readDemoRecord() {
  let foundTrace = false
  const candidates = []

  const collect = (value) => {
    foundTrace = true
    try { candidates.push(JSON.parse(value)) } catch {}
  }

  // Capa 1 — registro de Windows (HKCU, no requiere admin)
  try {
    const out = execSync(`reg query "${REG_KEY}" /v ${REG_VALUE} 2>nul`, { encoding: 'utf8' })
    const match = out.match(new RegExp(`${REG_VALUE}\\s+REG_SZ\\s+(.+)`))
    if (match) collect(match[1].trim())
  } catch {}

  // Capa 2 — ProgramData (sobrevive a desinstalar la app)
  try {
    const p = getProgramDataPath()
    if (fs.existsSync(p)) collect(fs.readFileSync(p, 'utf8'))
  } catch {}

  // Capa 3 — electron-store, en la carpeta de datos del usuario
  try {
    const fromStore = store.get(STORE_DEMO_KEY)
    if (fromStore) {
      foundTrace = true
      candidates.push(typeof fromStore === 'string' ? JSON.parse(fromStore) : fromStore)
    }
  } catch {}

  if (!foundTrace) return null

  const valid = candidates.map(normalizeRecord).filter(Boolean)
  if (valid.length === 0) {
    // Había rastro pero ilegible: se marca como vencido de forma definitiva
    return { mac: 'unknown', startTime: Date.now() - DEMO_DURATION_MS }
  }

  // El más antiguo gana: alterar una capa no reinicia la cuenta
  return valid.reduce((a, b) => (a.startTime <= b.startTime ? a : b))
}

function writeDemoRecord(data) {
  const json = JSON.stringify(data)

  // Registro HKCU (no requiere admin)
  try {
    execSync(`reg add "${REG_KEY}" /v ${REG_VALUE} /t REG_SZ /d "${json.replace(/"/g, '\\"')}" /f`, { windowsHide: true })
  } catch {}

  // ProgramData (segunda capa de persistencia)
  try {
    const p = getProgramDataPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, json, 'utf8')
  } catch {}

  // Datos de usuario (tercera capa)
  try {
    store.set(STORE_DEMO_KEY, json)
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// Ventana principal
// ═══════════════════════════════════════════════════════════════════════════
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '..', 'assets', 'logo.jpg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      // Con el throttling activo, minimizar la ventana congela los temporizadores
      // y requestAnimationFrame: el splash y los reintentos se quedaban colgados.
      backgroundThrottling: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

    // En producción, las DevTools son la vía más directa para leer el código
    // en caliente y saltarse la ofuscación.
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase()
      const blocked =
        key === 'f12' ||
        (input.control && input.shift && ['i', 'j', 'c'].includes(key)) ||
        (input.control && key === 'u')
      if (blocked) event.preventDefault()
    })
  }

  mainWindow.on('maximize',   () => sendToRenderer('window-maximized', true))
  mainWindow.on('unmaximize', () => sendToRenderer('window-maximized', false))

  // Sin esto la referencia queda apuntando a una ventana destruida
  mainWindow.on('closed', () => { mainWindow = null })

  // Lanzar búsqueda de actualización 5 s después de abrir (solo producción)
  if (autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 5000)
  }
}

// Enviar al renderer sólo si la ventana sigue viva
function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

// ── IPC: controles de ventana ─────────────────────────────────────────────
// Se registran una sola vez: dentro de createWindow() se duplicarían
// cada vez que la ventana se vuelve a crear.
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())

// ── IPC: store persistente ────────────────────────────────────────────────
ipcMain.handle('store-get',    (_, key)        => store.get(key))
ipcMain.handle('store-set',    (_, key, value) => store.set(key, value))

// ── IPC: demo ─────────────────────────────────────────────────────────────
ipcMain.handle('demo-check', () => {
  const rec = readDemoRecord()
  if (!rec) return { status: 'unused' }

  // Reescribir el registro deja de nuevo las tres capas en su sitio, así que
  // borrar sólo una no devuelve el demo.
  writeDemoRecord(rec)

  const elapsed = Date.now() - rec.startTime
  if (elapsed >= DEMO_DURATION_MS) return { status: 'expired' }
  return {
    status: 'active',
    remainingMs: DEMO_DURATION_MS - elapsed,
    startTime:   rec.startTime,
  }
})

// Permite al renderer detectar la cuenta demo sin conocer sus credenciales,
// para que el formulario normal no pueda saltarse el límite de 3 horas.
ipcMain.handle('demo-is-demo-user', (_, username) =>
  String(username || '').trim().toLowerCase() === DEMO_CREDENTIALS.username.toLowerCase()
)

ipcMain.handle('demo-activate', () => {
  const existing = readDemoRecord()

  if (existing) {
    const elapsed = Date.now() - existing.startTime
    if (elapsed >= DEMO_DURATION_MS) return { ok: false, reason: 'expired' }
    writeDemoRecord(existing)
    return {
      ok: true,
      remainingMs: DEMO_DURATION_MS - elapsed,
      startTime: existing.startTime,
      credentials: DEMO_CREDENTIALS,
    }
  }

  // Primer uso en esta PC: se registra antes de entregar las credenciales
  const rec = { mac: getMacAddress(), startTime: Date.now() }
  writeDemoRecord(rec)

  // Si no se pudo dejar rastro en ninguna capa, el demo sería infinito
  if (!readDemoRecord()) return { ok: false, reason: 'storage' }

  return {
    ok: true,
    remainingMs: DEMO_DURATION_MS,
    startTime: rec.startTime,
    credentials: DEMO_CREDENTIALS,
  }
})

// ── IPC: auto-update ──────────────────────────────────────────────────────
// checkForUpdates() resuelve con un cancellationToken (un EventEmitter) que
// el IPC no puede clonar: devolverlo tal cual hacía fallar la llamada y el
// botón mostraba error aunque la búsqueda hubiese ido bien.
ipcMain.handle('update-check', async () => {
  if (!autoUpdater) return { available: false }
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version || null
    return {
      available: result?.isUpdateAvailable ?? (!!version && version !== app.getVersion()),
      version,
    }
  } catch (err) {
    return { available: false, error: err?.message || 'No se pudo buscar actualizaciones' }
  }
})

ipcMain.handle('update-download', async () => {
  if (!autoUpdater) return { ok: false }
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo descargar la actualización' }
  }
})

ipcMain.handle('update-get-status', () => updateState)
ipcMain.handle('update-install',    () => {
  if (!autoUpdater) return
  try { autoUpdater.quitAndInstall(false, true) } catch {}
})

// Eventos de autoUpdater → renderer + actualizan updateState
if (autoUpdater) {
  autoUpdater.on('update-available', (info) => {
    updateState.available = true
    updateState.version   = info?.version || null
    updateState.error     = null
    sendToRenderer('update-available', info)
  })
  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-not-available')
  })
  autoUpdater.on('download-progress', (prog) => {
    sendToRenderer('update-progress', prog)
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateState.ready   = true
    updateState.error   = null
    sendToRenderer('update-downloaded', info)
  })
  autoUpdater.on('error', (err) => {
    updateState.error = err?.message || 'Error desconocido'
    sendToRenderer('update-error', updateState.error)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Los switches de Chromium hay que registrarlos antes de que la app esté lista;
// dentro de whenReady() ya no surten efecto y la decodificación HEVC por
// hardware nunca se activaba.
app.commandLine.appendSwitch(
  'enable-features',
  'PlatformHEVCDecoderSupport,HardwareMediaKeyHandling,MediaFoundationVideoCapture'
)

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

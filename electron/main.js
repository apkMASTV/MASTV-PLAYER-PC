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

function readDemoRecord() {
  // Intentar desde registro de Windows
  try {
    const out = execSync(`reg query "${REG_KEY}" /v ${REG_VALUE} 2>nul`, { encoding: 'utf8' })
    const match = out.match(new RegExp(`${REG_VALUE}\\s+REG_SZ\\s+(.+)`))
    if (match) return JSON.parse(match[1].trim())
  } catch {}

  // Intentar desde ProgramData
  try {
    const p = getProgramDataPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {}

  return null
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
  const elapsed = Date.now() - rec.startTime
  if (elapsed >= DEMO_DURATION_MS) return { status: 'expired' }
  return {
    status: 'active',
    remainingMs: DEMO_DURATION_MS - elapsed,
    startTime:   rec.startTime,
  }
})

ipcMain.handle('demo-activate', () => {
  const existing = readDemoRecord()
  if (existing) {
    const elapsed = Date.now() - existing.startTime
    if (elapsed >= DEMO_DURATION_MS) return { ok: false, reason: 'expired' }
    return { ok: true, remainingMs: DEMO_DURATION_MS - elapsed, startTime: existing.startTime }
  }
  const rec = { mac: getMacAddress(), startTime: Date.now() }
  writeDemoRecord(rec)
  return { ok: true, remainingMs: DEMO_DURATION_MS, startTime: rec.startTime }
})

// ── IPC: auto-update ──────────────────────────────────────────────────────
ipcMain.handle('update-check',      () => autoUpdater ? autoUpdater.checkForUpdates() : null)
ipcMain.handle('update-download',   () => autoUpdater ? autoUpdater.downloadUpdate()  : null)
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

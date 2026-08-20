const { contextBridge, ipcRenderer } = require('electron')

// Devuelve la función de baja para que el renderer pueda limpiar al desmontar.
// Sin ella los listeners se acumulaban en cada ciclo de login y logout.
const on = (channel, cb) => {
  const handler = (_, ...args) => cb(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Controles de ventana
  minimize:    () => ipcRenderer.send('window-minimize'),
  maximize:    () => ipcRenderer.send('window-maximize'),
  close:       () => ipcRenderer.send('window-close'),
  onMaximized: (cb) => on('window-maximized', cb),

  // Store persistente
  storeGet:    (key)        => ipcRenderer.invoke('store-get', key),
  storeSet:    (key, value) => ipcRenderer.invoke('store-set', key, value),

  // Demo
  demoCheck:      ()         => ipcRenderer.invoke('demo-check'),
  demoActivate:   ()         => ipcRenderer.invoke('demo-activate'),
  demoIsDemoUser: (username) => ipcRenderer.invoke('demo-is-demo-user', username),

  // Auto-update
  updateCheck:     ()    => ipcRenderer.invoke('update-check'),
  updateDownload:  ()    => ipcRenderer.invoke('update-download'),
  updateInstall:   ()    => ipcRenderer.invoke('update-install'),
  updateGetStatus: ()    => ipcRenderer.invoke('update-get-status'),

  onUpdateAvailable:    (cb) => on('update-available',     cb),
  onUpdateNotAvailable: (cb) => on('update-not-available', cb),
  onUpdateProgress:     (cb) => on('update-progress',      cb),
  onUpdateDownloaded:   (cb) => on('update-downloaded',    cb),
  onUpdateError:        (cb) => on('update-error',         cb),
})

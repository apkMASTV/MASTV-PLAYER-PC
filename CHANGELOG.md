# MASTV Player — Changelog

> Formato: `v{MAYOR}.{MENOR}` — se incrementa el menor con cada grupo de cambios.
> Para leer el estado actual del proyecto, consulta este archivo antes de continuar.

---

## v1.4.1 — 2026-06 (versión actual)

### Bugs corregidos — Auto-Update

| Bug | Fix |
|---|---|
| **Descarga llega al 100% y se queda sin mostrar "Instalar ahora"** | El evento `update-downloaded` llegaba al renderer en estado correcto pero podía perderse. Ahora el main process guarda el estado en `updateState` y el renderer lo consulta activamente al montarse (`updateGetStatus`). Si el evento se pierde, el renderer lo recupera en el siguiente poll |
| **Verificación del archivo tarda o falla en silencio** | Añadido `startVerifyTimer`: si pasados 30 s tras el 100% no llega el evento `update-downloaded`, se consulta `updateGetStatus` y si hay error se muestra al usuario con texto explicativo (antes se perdía en `console.warn`) |
| **Errores del updater invisibles para el usuario** | La barra de update ahora tiene estado `error` con banner rojo y mensaje legible, más botón "Reintentar" |
| **`quitAndInstall()` sin parámetros podía no forzar la instalación** | Cambiado a `autoUpdater.quitAndInstall(false, true)` (isSilent=false, isForceRunAfter=true) |
| **Botón del titlebar no reflejaba estado "descargado" si evento se perdió al montar** | `UpdateButton` también consulta `updateGetStatus` al montar y refleja `ready`/`error`/`available` correctamente |

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `electron/main.js` | `updateState` global, `ipcMain.handle('update-get-status')`, `quitAndInstall(false,true)` |
| `electron/preload.js` | Expuesto `updateGetStatus` |
| `src/components/UpdateNotifier.jsx` | Estado `error` visible, `startVerifyTimer`, consulta `updateGetStatus` al montar |
| `src/components/Titlebar.jsx` | `UpdateButton` consulta `updateGetStatus` al montar |
| `src/styles/globals.css` | `.update-bar-error` (banner rojo para errores) |

---

## v1.4 — 2026-06

### Bugs corregidos

| Bug | Fix |
|---|---|
| `productName: "MASTV-Player"` mostraba nombre con guión en la barra de tareas, Panel de Control y acceso directo de Windows | Revertido a `"MASTV Player"`; se usa `nsis.artifactName` para forzar guiones solo en el nombre del instalador (`MASTV-Player-Setup-X.X.X.exe`), que es lo que necesita el auto-update |
| `LiveTVPlayer.jsx` — `clearRetryTimers()` llamaba `setRetryCountdown(0)` durante el cleanup de unmount → advertencia de React "setState on unmounted component" | Añadido `mountedRef`; todas las llamadas a `setState` ahora comprueban `mountedRef.current` antes de ejecutar |
| `LiveTVPlayer.jsx` — ticker de cuenta regresiva podía seguir disparando setState tras el unmount | Mismo `mountedRef` guard en el `setInterval` del countdown |
| `LiveTVPlayer.jsx` — eventos de video (`onWaiting`, `onCanPlay`, `onPlaying`, `onError`) podían ejecutar setState tras unmount si el stream tardaba en responder | Todos protegidos con `if (!mountedRef.current) return` |
| `UpdateNotifier.jsx` — al llegar a 100% de descarga la barra se quedaba estática mostrando "100%" sin transicionar a "Instalar ahora" | Al alcanzar `percent >= 100`, la barra muestra directamente el botón "Instalar ahora" y el texto "Descarga completa. Listo para instalar." sin esperar el evento `update-downloaded` |

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `package.json` | `productName` → `"MASTV Player"`; agregado `nsis.artifactName` para nombre del instalador con guiones |
| `src/components/LiveTVPlayer.jsx` | `mountedRef` + guards en todos los setters usados en timers y eventos de video |
| `src/components/UpdateNotifier.jsx` | Botón instalar aparece al llegar a 100% sin esperar evento externo |

---

## v1.3 — 2026-06

### Nuevas funcionalidades

#### Botón DEMO 3 horas (por única vez por PC)
- Botón **"🎬 DEMO 3 hrs — por única vez"** en la pantalla de login.
- Al presionar: verifica en el **Registro de Windows** (`HKCU\SOFTWARE\MASTVPlayer\DemoRecord`) y en `C:\ProgramData\MASTVPlayer\demo.dat` si ya fue usado.
- Primera vez: autentica con la cuenta demo hardcodeada y arranca el contador de 3 horas desde el reloj del sistema.
- Cuenta demo desactivada en el servidor: muestra "LOS DEMOS SE DESACTIVARON. Consulte con su proveedor…" — se activa/desactiva simplemente deshabilidando la cuenta en el panel Xtream.
- Ya usada o expirada en esa PC: muestra mensaje bloqueante y oculta el botón.
- Persistencia en **dos capas** para sobrevivir reinstalaciones: Registro de Windows + archivo en ProgramData.

#### Indicador de tiempo restante del demo
- Badge **"🎬 DEMO · Xh Ym"** en la barra de título, entre el logo y el botón de actualizaciones.
- A los últimos 5 minutos: badge cambia a naranja parpadeante + aparece barra de aviso descartable: *"Demo a punto de expirar — contacta con tu proveedor"*.
- Al llegar a 0: modal bloqueante (no tiene X ni cierre con clic fuera). El usuario debe confirmar con **"Entendido ✕"** para volver al login.

#### Sistema de auto-actualización (GitHub Releases)
- Al abrir la app (producción), verifica automáticamente en 5 s si hay versión nueva en `github.com/apkMASTV/MASTV-PLAYER-PC`.
- Botón **"🔄 Actualizaciones"** manual en la barra de título con estados: idle → buscando → disponible → descargando → listo para instalar.
- Barra de progreso de descarga visible.
- Al terminar la descarga: botón "Instalar ahora" que reinicia la app en la nueva versión.

### Bugs corregidos en v1.3

| Bug | Fix |
|---|---|
| Demo duration hardcodeada en 7 min (modo prueba) | Restaurada a 3 horas |
| `setSavedAccounts` importado en Login sin usar | Eliminado del destructuring |
| Rama `check.status === 'used'` imposible (IPC nunca retorna ese valor) | Eliminada |
| `warningDismissed` como estado en `useEffect` deps → reiniciaba el intervalo al dismissar la barra | Convertido a `useRef`, eliminado de dependencias del efecto |
| `logout()` borraba favoritos/historial en memoria → si el usuario reloginaba sin reiniciar la app, perdía sus listas | `logout()` ya no borra favoritos ni historial en memoria; solo limpia datos de sesión |
| `UpdateButton` — `setTimeout` de fallback no se limpiaba en desmontaje | Convertido a `useRef` + cleanup en `useEffect` return |
| `UpdateNotifier` — listeners IPC se registraban múltiples veces si el componente se remontaba | Guardado con `useRef` flag `listenersRef` para registrar solo una vez |
| `UpdateButton` — dos `useEffect` separados para eventos | Unificados en uno solo con cleanup |

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `electron/main.js` | Duración demo restaurada a 3 h; IPC `demo-check`, `demo-activate`, autoUpdater eventos |
| `src/components/DemoTimer.jsx` | `warningDismissed` → `useRef`; cleanup correcto del intervalo |
| `src/components/Titlebar.jsx` | `DemoBadge` en centro; `UpdateButton` unificado + cleanup del timer |
| `src/components/UpdateNotifier.jsx` | `listenersRef` para evitar registros duplicados de IPC |
| `src/components/Login.jsx` | Duration 3h; rama `'used'` eliminada; `setSavedAccounts` eliminado |
| `src/store/useStore.js` | `logout()` preserva favoritos e historial en memoria |

---

## v1.2 — 2026-06

### Nuevas funcionalidades

#### Login persistente (auto-login)
- Al cerrar y volver a abrir la app, se inicia sesión automáticamente sin necesidad de reintroducir credenciales.
- Si la cuenta **ha vencido** (campo `exp_date` del servidor Xtream), se muestra un mensaje de error y se requiere renovar en lugar de hacer auto-login.

#### Gestión de múltiples cuentas en el login
- Panel de **cuentas guardadas** con tarjetas visuales que muestran el nombre de usuario.
- Un clic en la tarjeta inicia sesión directamente (sin teclear credenciales de nuevo).
- Botón **✕** en cada tarjeta para eliminar una cuenta guardada.
- Badge **⛔ Vencida** con fondo rojo para cuentas expiradas; no permiten auto-login.
- La tarjeta siempre muestra la fecha de expiración formateada (si aplica).
- La sección "agregar nueva cuenta" sigue disponible debajo de las tarjetas; el card se ensancha automáticamente (`login-card-wide`) cuando hay cuentas guardadas.

#### Favoritos e historial persistentes
- `movieFavorites`, `seriesFavorites`, `channelFavorites` se guardan automáticamente en `electron-store` cada vez que cambian.
- `recentChannels`, `recentMovies`, `recentSeries` igualmente persistentes.
- Todos se restauran al arrancar la app, antes del auto-login, para que el usuario vea sus listas inmediatamente.

### Archivos nuevos / modificados
| Archivo | Cambio |
|---|---|
| `src/services/persistence.js` | **Nuevo.** Capa de abstracción para leer/escribir `accounts`, `favorites` e `history` en `electron-store`. También exporta `isAccountExpired` y `accountLabel`. |
| `src/store/useStore.js` | Agrega `savedAccounts: []`, `setSavedAccounts`, `addOrUpdateSavedAccount`, `removeSavedAccount`. `logout` preserva las cuentas guardadas. |
| `src/App.jsx` | Bootstrap al arrancar: restaura favoritos/historial, detecta último cuenta, ejecuta auto-login. Nuevo `<PersistenceManager />` que suscribe y auto-guarda favoritos/historial. |
| `src/components/Login.jsx` | Panel de cuentas guardadas con tarjetas; login por clic; eliminar cuenta; after-login guarda cuenta con `persistAccount`. |
| `src/styles/globals.css` | Estilos de `.acct-card`, `.acct-avatar`, `.acct-card-expired`, `.acct-card-delete`, `.login-divider`, `.login-card-wide`, etc. |

---

## v1.1 — 2025-06

### Bugs críticos corregidos
- **`Player.jsx` — Violación de Rules of Hooks**: El `return null` para Live TV estaba colocado entre hooks (`useStore` y los `useRef/useState/useEffect` siguientes). Al navegar de Live TV a Películas, React detectaba un número distinto de hooks y crasheaba, congelando toda la UI. **Fix**: todos los hooks se movieron al principio; los `return null` van después de todos los hooks.
- **`electron/main.js` — `commandLine.appendSwitch` duplicado**: las instrucciones de H.265/HEVC se llamaban dos veces (dentro de `createWindow()` y en `app.whenReady()`). Solo deben ejecutarse una vez, antes de crear la ventana. **Fix**: eliminados de `createWindow()`, solo persisten en `app.whenReady()`.

### Rendimiento
- **Paginación en Películas y Series**: las listas de IPTV pueden tener 10 000+ ítems. Renderizarlos todos al mismo tiempo bloqueaba el hilo del navegador varios segundos. **Fix**: se muestran 100 ítems a la vez con botón "Cargar más (X restantes)".
- **`isFav` O(n²) → O(1)**: se reemplazó el `.some()` por render por un `useMemo` con `Set` para lookup constante.
- **Selectores de store globales**: se dejó como referencia para futura optimización con selectores Zustand.

### Bugs funcionales corregidos
- **Favoritos no aparecían en la sección Favoritos**: `toggleFavorite(movie)` guardaba el objeto sin `stream_type: 'movie'`/`'series'`. La sección Favoritos filtraba por ese campo, así que los ítems nunca aparecían. **Fix**: `stream_type` explícito en `toggleMovieFavorite` y `toggleSeriesFavorite`.
- **`onError` en posters podía crashear**: `e.target.nextSibling.style.display` sin comprobar `null`. **Fix**: guard `if (e.target.nextSibling)` agregado en `Movies.jsx`, `Series.jsx` y `LiveTV.jsx`.
- **`category_id` comparación estricta (`===`)**: Xtream a veces devuelve números, a veces strings. **Fix**: `String(a) === String(b)` en Movies, Series y LiveTV.
- **`logout()` dejaba datos de sesión anterior**: no limpiaba `favorites`, historial, sección activa, búsqueda, etc. **Fix**: logout ahora resetea todo el estado.
- **`SplashLoader` anti-patrón React**: `animateTo` llamaba a `setProgress` dentro de un updater de `setProgress`. **Fix**: se usa `progressRef` para trackear el valor actual sin closures obsoletos.
- **`SplashLoader` memoria leak al desmontar**: `setTimeout` y `requestAnimationFrame` seguían corriendo tras desmontar. **Fix**: se usan refs (`mountedRef`, `rafRef`, `timerRef`) con cleanup en el `useEffect`.
- **`Player.jsx` — useEffect duplicado**: había dos efectos que cargaban el stream, uno de ellos con `url` declarada pero nunca usada. **Fix**: unificado en un solo `useEffect` limpio.
- **`parseFloat(rating).toFixed(1)` sin validación**: mostraba `NaN` si el rating no era numérico. **Fix**: función `safeRating()` que retorna `null` si el valor no es número.

### Nuevas funcionalidades
- **Orden por más reciente**: Películas y Series ordenadas por campo `added`/`last_modified` (timestamp Unix de la API Xtream), de más nuevo a más antiguo, en todas las categorías.
- **Carpetas especiales en Películas**:
  - ⭐ **Favoritos** — películas marcadas con ★
  - 🕐 **Últimas Vistas** — últimas 10 películas reproducidas (se registran automáticamente)
- **Carpetas especiales en Series**:
  - ⭐ **Favoritos** — series marcadas con ★
  - 🕐 **Últimas Vistas** — últimas 10 series reproducidas (por episodio)
- **Menú Favoritos eliminado del menú de navegación**: reemplazado por las carpetas por sección.
- **Controles de episodios en el reproductor**:
  - ⏮ **Episodio anterior** (deshabilitado si es el primero)
  - **Sig** ⏭ **Episodio siguiente** (deshabilitado si es el último)
  - ⏪ **-5 min** / **+5 min** ⏩ — saltar 5 minutos (solo VOD/series)
  - Navegación dentro de la misma temporada; el título se actualiza automáticamente.
- **Contador de títulos**: cabecera de Películas y Series muestra la cantidad de resultados.
- **Mensajes de estado vacío descriptivos**: cada carpeta especial muestra un mensaje explicativo cuando está vacía.

### Limpieza de código
- **`Favorites.jsx` eliminado**: componente sin uso tras separar favoritos por sección.
- **`react-router-dom` eliminado** de dependencias: nunca se usó en la app.
- **Imports duplicados mergeados** en `LiveTV.jsx` (dos líneas de React, dos líneas de `useStore`).
- **`favorites` y `toggleFavorite` eliminados** del store: reemplazados por `movieFavorites`/`seriesFavorites` y sus acciones específicas.
- **Imports no usados limpiados**: `movieCategories`, `setActiveMovieCategory`, `seriesCategories`, `setActiveSeriesCategory`, `isMovieFav`, `isSeriesFav` removidos de Movies/Series.

### Empaquetado y firma de código
- Versión: **v1.1.0**
- Ícono: `assets/icon.png` (256×256 generado desde logo.jpg)
- Salida en `C:\mastv-release\`
- Scripts disponibles:
  - `npm run dist` → `.exe` firmado (NSIS)
  - `npm run dist:msix` → `.appx` para Store (sin firma, MS la pone al subir)
  - `npm run dist:all` → ambos
  - `npm run sign:appx` → firma el `.appx` con signtool del SDK (si está instalado)

#### Certificado autofirmado (pruebas locales)
- Archivo: `assets/mastv-cert.pfx` (clave privada — **NO subir a git**)
- Archivo: `assets/mastv-cert.cer` (clave pública — para distribuir a PCs de prueba)
- Contraseña: `MASTVSign2025!`
- Válido hasta: 09/06/2027
- SHA1: `A51A575439916B1A7348656878534DE11ED65801`
- Para instalar en otra PC: `assets/install-cert.ps1` (ejecutar como Administrador)

#### Estado de los archivos generados
| Archivo | Tamaño | Firma |
|---------|--------|-------|
| `MASTV Player Setup 1.1.0.exe` | 80.5 MB | ✅ Firmado (CN=MASTV, self-signed) |
| `MASTV Player 1.1.0.appx` | 118.7 MB | ⚠ Sin firma (correcto para subir a Store) |

#### Para producción / Microsoft Store
1. **Microsoft Store**: sube el `.appx` sin firmar al [Partner Center](https://partner.microsoft.com). Microsoft lo firma. Antes de subir, actualiza `appx.publisher` con la identidad que te asigne Partner Center (formato `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`).
2. **Distribución directa sin advertencias**: compra un certificado EV de [DigiCert](https://www.digicert.com/signing/code-signing-certificates) o [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) (~$200-500/año), reemplaza `mastv-cert.pfx` en `assets/` y actualiza `cscLink`/`cscKeyPassword` en `package.json`.
3. **Firmar el .appx** (para sideloading): instalar Windows SDK y ejecutar `npm run sign:appx`.

---

## v1.0 — 2025-06 (versión inicial)

### Funcionalidades base
- **Login**: Xtream Codes API (3 servidores con fallback: mtv.bo, 1234.bo, mastv.me) y M3U/M3U8.
- **Splash Screen**: barra de progreso mientras se cargan canales, películas y series.
- **TV en Vivo**: lista de canales con categorías, búsqueda, favoritos de canal, historial "Últimos Vistos".
- **Reproductor Live TV inline**: a la derecha de la lista de canales.
  - Pantalla completa con overlay semitransparente (categorías + canales).
  - Overlay se oculta automáticamente tras 3,5 s de inactividad; reaparece con movimiento o tecla.
  - Auto-reconexión: 4 reintentos con 10 s de espera y countdown visual; botón "Reintentar ahora".
  - Controles de volumen: mute, +/-, slider, porcentaje.
- **Películas**: grilla con pósters, búsqueda, favoritos, detalle/sinopsis, reproducción VOD.
- **Series**: grilla con pósters, búsqueda, favoritos, detalle con temporadas y episodios.
- **Reproductor overlay (VOD/Series)**: minimizable, barra de progreso, controles de volumen, pantalla completa.
- **Favoritos**: sección separada (luego migrada a carpetas por sección en v1.1).
- **Fecha de expiración**: mostrada en la barra de título con colores de alerta (verde/amarillo/rojo).
- **H.265/HEVC**: habilitado via `PlatformHEVCDecoderSupport` en Chromium.
- **Tema oscuro**: paleta azul marino/dorado/cyan derivada del logo y fondo provistos por el usuario.
- **Ventana personalizada**: sin frame nativo, controles min/max/cerrar propios.
- **Persistencia**: credenciales guardadas con `electron-store`.

---

## Cómo actualizar la versión

1. Hacer los cambios en el código.
2. Actualizar `"version"` en `package.json` (ej. `"1.2.0"`).
3. Agregar una sección `## v1.2` en este archivo describiendo los cambios.
4. Correr `npm run dist:all` para generar los instaladores.

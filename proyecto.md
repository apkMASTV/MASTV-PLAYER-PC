# MASTV Player — Estado del proyecto

Documento de continuidad. Resume qué es la aplicación, qué se corrigió, cómo se
compila y qué queda pendiente. **Versión actual: v2.0.0.**

---

## 1. Qué es y cómo está montado

Reproductor IPTV de escritorio para Windows, en Electron + React.

| Capa | Tecnología | Archivos clave |
|---|---|---|
| Proceso principal | Electron | `electron/main.js`, `electron/preload.js` |
| Interfaz | React 18 + Vite | `src/App.jsx`, `src/components/` |
| Estado | Zustand | `src/store/useStore.js` |
| Datos | Xtream API y listas M3U | `src/services/xtreamApi.js`, `src/services/m3uParser.js` |
| Vídeo | hls.js y mpegts.js | `src/components/Player.jsx`, `src/components/LiveTVPlayer.jsx` |
| Persistencia | electron-store | `src/services/persistence.js` |
| Actualizaciones | electron-updater | Publicadas en GitHub (`apkMASTV/MASTV-PLAYER-PC`) |

**Convención de versiones:** solo sube el último dígito. v2.0.0 → v2.0.1 → v2.0.2.
Se cambia en el campo `version` de `package.json`.

> **Por qué se empieza en 2.0.0 y no en 1.0.7.** `electron-updater` compara las
> versiones numéricamente, y en GitHub ya había publicada una **v1.4.1 con 1719
> descargas**. Con un número como 1.0.7 pasarían dos cosas malas: esos usuarios
> nunca recibirían la actualización (1.0.7 es menor que 1.4.1), y una instalación
> nueva vería la 1.4.1 como más reciente e intentaría actualizarse *hacia atrás*.
> **Nunca publiques una versión por debajo de la última que ya esté en GitHub.**

---

## 2. Cómo compilar

```powershell
npm run dist          # instalador NSIS firmado, queda en instalador/
npm run dist:msix     # paquete APPX
npm run dist -- --unsigned   # solo si quieres saltarte la firma a propósito
```

El resultado aparece en `instalador/MASTV-Player-Setup-2.0.0.exe` (~81 MB), en la
carpeta principal del proyecto para tenerlo a mano.

Para publicar una versión nueva en GitHub y que los usuarios la reciban solos:

```powershell
npm run release        # compila, firma, sube la release y genera latest.yml
```

> **Antes de publicar hay que crear y subir la etiqueta**, porque GitHub rechaza
> una release publicada cuya etiqueta no existe (`Published releases must have a
> valid tag`):
>
> ```powershell
> git tag v2.0.1
> git push origin v2.0.1
> npm run release
> ```
>
> Comprueba después que la release tiene **tres** archivos: el `.exe`, el
> `.blockmap` y el **`latest.yml`**. Sin `latest.yml` el actualizador no
> detecta nada.

`npm run dist` ejecuta `scripts/build.mjs`, que hace tres pasos: compila el
renderer con Vite, ofusca el código propio y empaqueta con electron-builder.

### Firma del instalador

La contraseña del certificado **ya no está en `package.json`** (antes quedaba
versionada y además viajaba dentro de la aplicación). Ahora se lee de
`certs/signing.env`, y toda la carpeta `certs/` está en `.gitignore`.

```
certs/mastv-cert.pfx    el certificado
certs/signing.env       CSC_KEY_PASSWORD=...
```

Si falta la contraseña, `scripts/build.mjs` **aborta con un mensaje explicativo**.
Esto es deliberado: antes electron-builder generaba un instalador sin firmar sin
avisar, y Windows le mostraba al usuario la advertencia de SmartScreen.

> El certificado es autofirmado (`CN=MASTV`), así que Windows lo marca como
> "editor no verificado" salvo que se instale en Entidades de certificación raíz
> de confianza (`assets/install-cert.ps1`). Para que desaparezca la advertencia
> en cualquier PC haría falta un certificado de una autoridad reconocida (OV/EV).

---

## 3. Actualización automática

Publicada en GitHub (`apkMASTV/MASTV-PLAYER-PC`) mediante `electron-updater`.
El flujo es: la app lee `latest.yml` de la última release, compara versiones,
descarga el `.exe`, comprueba su integridad (sha512) y lo ejecuta con
`--updated /S`, que **actualiza sobre la instalación existente sin desinstalar
nada y conservando los datos del usuario**.

### El problema de la verificación de firma

`electron-updater` verificaba la firma del instalador descargado contra el
`publisherName` que electron-builder escribe en `app-update.yml`. Esa
comprobación exige que el estado de la firma sea `Valid`, y **un certificado
autofirmado nunca lo es**: Windows devuelve `UnknownError` porque la cadena
termina en una raíz no confiable.

Resultado: la actualización se descargaba y **luego se rechazaba** con
`ERR_UPDATER_INVALID_SIGNATURE`. Eso explica por qué la v1.4.1 acumuló 1719
descargas mientras la v1.4.0 tenía 3: las apps descargaban la actualización una
y otra vez sin poder instalarla nunca.

La solución aplicada es `win.verifyUpdateCodeSignature: false` en
`package.json`, que omite `publisherName` de `app-update.yml` y salta esa
comprobación. **La integridad sigue protegida** por HTTPS y por el sha512 que
viene en `latest.yml`; lo que se pierde es una defensa extra frente a una
release de GitHub comprometida. Con un certificado de una autoridad reconocida
esta opción podría volver a activarse.

### Los usuarios de la v1.4.1 necesitan una instalación manual

Importante: la v1.4.1 ya instalada lleva `publisherName` grabado en su propio
`app-update.yml`, en el disco del usuario. Por eso **esos 1719 usuarios no
pueden actualizarse solos a la 2.0.0**: hay que pedirles que descarguen e
instalen la 2.0.0 una vez, a mano. A partir de ahí todas las siguientes
(2.0.1, 2.0.2...) les llegarán automáticamente.

### Verificado el 20/08/2026

Probado de extremo a extremo, no por lectura de código:

- Se instaló la **v1.4.1 real** descargada de GitHub y se ejecutó el instalador
  de la 2.0.0 con los mismos argumentos que usa electron-updater
  (`--updated /S --force-run`): la versión pasó de 1.4.1 a 2.0.0 **en el mismo
  sitio, sin desinstalar**, el registro de Windows se actualizó y el
  `config.json` del usuario se conservó intacto (7034 bytes).
- Se ejecutó el electron-updater real contra la release publicada simulando una
  versión instalada antigua:
  - **Con** `publisherName`: detecta la 2.0.0, la descarga y **falla** con
    `ERR_UPDATER_INVALID_SIGNATURE`. Reproduce el fallo original.
  - **Sin** `publisherName`: detecta, descarga los 84 MB, **verifica correctamente**
    y lanza el instalador con `--updated /S`. Cadena completa funcionando.

---

## 4. Protección del código

Objetivo: que no sea trivial copiar la aplicación ni leer su lógica con ayuda de
una IA. Implementado en `scripts/protect.mjs` con `javascript-obfuscator`.

**Qué se ofusca**

- `dist/assets/index-*.js` — el código propio del renderer (66 KB → ~202 KB).
- `electron/main.js` y `electron/preload.js` — se copian ofuscados a
  `dist-electron/`, que es lo que se empaqueta. `build.extraMetadata.main`
  redirige el punto de entrada ahí.

**Qué NO se ofusca, y por qué**

`dist/assets/vendor-*.js` (hls.js, mpegts.js) se deja intacto a propósito: esas
librerías construyen sus workers a partir de su propio código fuente en tiempo
de ejecución, así que renombrar identificadores las rompe. Se separaron en su
propio chunk con `manualChunks` en `vite.config.js` justamente para poder
ofuscar el resto sin tocarlas. Además son librerías públicas: ocultarlas no
aportaría nada.

**Medidas complementarias**

- Sourcemaps desactivados en producción.
- DevTools bloqueadas en producción (F12, Ctrl+Shift+I/J/C, Ctrl+U).
- Credenciales del demo movidas al proceso principal: ya no están en el bundle
  del renderer y solo se entregan por IPC si el demo resulta válido.

**Límite honesto:** la ofuscación encarece la lectura, no la impide. Las URLs de
los servidores viajan por HTTP y son visibles con cualquier analizador de red,
sin necesidad de tocar el código.

---

## 5. El sistema de demo

Demo de **3 horas, una sola vez por computadora**. Debe sobrevivir a que el
usuario desinstale y reinstale la aplicación.

### Cómo se registra el uso

El registro se guarda en **tres capas independientes**, todas fuera de la carpeta
de la aplicación para que sobrevivan a la desinstalación:

| Capa | Ubicación |
|---|---|
| Registro de Windows | `HKCU\SOFTWARE\MASTVPlayer` → `DemoRecord` |
| ProgramData | `C:\ProgramData\MASTVPlayer\demo.dat` |
| Datos de usuario | electron-store, clave `demo_record_v1` |

Reglas de lectura (`readDemoRecord` en `electron/main.js`):

- **Sin rastro en ninguna capa** → demo disponible.
- **Varias capas con datos** → gana la fecha **más antigua**. Así, poner una capa
  a cero no reinicia la cuenta mientras otra conserve la original.
- **Hay rastro pero ilegible o manipulado** → se considera *usado* (falla en
  cerrado). Corromper un archivo no devuelve el demo.
- Al activar o comprobar el demo se **reescriben las tres capas**, de modo que
  borrar solo una se repara por sí solo.

### Verificado el 20/08/2026

Se comprobó de forma empírica, no solo por lectura de código:

- Ida y vuelta real al registro de Windows y a ProgramData: correcto. Se
  confirmó que escribir en `C:\ProgramData` **no requiere permisos de
  administrador**.
- Diez casos límite sobre la lógica de validación, todos con el resultado
  esperado (registro nuevo, vencido, capa borrada, capa manipulada, capa
  reseteada frente a otra antigua).
- Aplicación empaquetada y ofuscada: arranca y se mantiene estable.
- Instalador firmado correctamente con `CN=MASTV`.

### Límite conocido

El control es **local**, así que un usuario decidido puede recuperar el demo si
encuentra y borra las tres capas a la vez. Cerrar esto del todo exige validar
contra un servidor (por ejemplo, que el proveedor registre el identificador de
la máquina al activar el demo). Es la mejora pendiente más relevante.

---

## 6. Correcciones aplicadas

### 6.1 Seguridad

| Problema | Solución |
|---|---|
| `mastv-cert.pfx` se empaquetaba dentro de la app y la contraseña estaba en `package.json` | Certificado movido a `certs/` (ignorado por git) y excluido del paquete; contraseña por variable de entorno |
| Credenciales del demo escritas en el código del renderer | Movidas al proceso principal, entregadas por IPC solo si el demo es válido |
| DevTools accesibles en producción | Bloqueadas |

### 6.2 Cargas infinitas (cinco causas distintas)

1. `video.src = ''` disparaba un error falso que reiniciaba el ciclo de carga.
   Ahora se usa `removeAttribute('src')` + `load()`, con supresión de errores
   durante la destrucción del reproductor.
2. Los errores de HLS y mpegts no reintentaban: quedaba la pantalla de carga fija.
3. Sin vigilante de bloqueo: si el vídeo no avanzaba, nadie lo detectaba. Añadido
   un *watchdog* (20 s en TV en vivo, 25 s en películas y series).
4. Los temporizadores de reintento se acumulaban y competían entre sí.
5. Al minimizar la ventana, Chromium congelaba `requestAnimationFrame` y el
   splash se quedaba a medias. Resuelto con `backgroundThrottling: false` y un
   plazo máximo en la animación de progreso.

### 6.3 Funcionalidad

| Problema | Solución |
|---|---|
| El auto-login con lista M3U entraba a una app vacía: no recargaba la lista | Lógica de carga unificada en `loadM3UData` y usada también al arrancar |
| Usuarios o contraseñas con caracteres especiales rompían las URLs | `encodeURIComponent` en todas las llamadas a la API |
| El servidor de la cuenta anterior se heredaba al cambiar de cuenta | `resetActiveServer()` al cerrar sesión |
| Una URL M3U inválida guardada rompía toda la pantalla de login | `try/catch` en `accountLabel()` |
| La aceleración HEVC por hardware nunca se activaba: los switches de Chromium se registraban después de `app.whenReady()` | Movidos antes de `whenReady()` |
| Buscar actualizaciones mostraba error aunque funcionase: `checkForUpdates()` devuelve un `cancellationToken` que el IPC no puede clonar | El handler devuelve solo datos serializables, y el botón usa esa respuesta |
| Escribir las credenciales del demo a mano en el formulario Xtream saltaba el límite de 3 horas y activaba el auto-login | El proceso principal identifica esa cuenta y la redirige al flujo del demo |
| Un registro de demo con fecha inválida dejaba el demo **sin límite**: el temporizador no arrancaba | Validación estricta de la fecha y fallo en cerrado |
| Un reloj adelantado alargaba el demo (se midieron 53 h en lugar de 3) | La fecha futura se recorta al momento actual |

### 6.4 Rendimiento

- **Re-renderizados**: los componentes llamaban a `useStore()` sin selector, así
  que cualquier cambio del estado los redibujaba todos. Migrados a selectores
  con `useShallow`.
- **Lista de canales**: se pintaban miles de canales de golpe. Paginada a 300 con
  botón "Cargar más", como ya hacían Películas y Series.
- **Escrituras a disco**: favoritos e historial se guardaban en cada cambio.
  Ahora se agrupan con un retardo de 800 ms.
- **Fugas de listeners**: `preload.js` devuelve funciones de baja y los
  componentes las usan al desmontarse.

### 6.5 Limpieza

- Código muerto retirado: `storeDelete`, `storeClear`, `updateOpenUrl`,
  `getActiveServer`, `setActiveServer`, `isMovieFav`, `isSeriesFav`, el
  `onPause` vacío y estilos sin usar.
- Imports sin usar (`shell`, `dialog`) eliminados.
- Archivos huérfanos borrados: `3.jpg`, `4.jpg` y una carpeta temporal vacía.
- Repositorio git inicializado.

---

## 7. Pendientes

Por prioridad:

1. **Avisar a los usuarios de la v1.4.1** de que instalen la 2.0.0 a mano una
   vez. No pueden llegar solos (ver sección 3). Es lo más urgente: son 1719.
2. **Validación del demo en servidor.** Es la única forma de cerrar el reinicio
   manual borrando las tres capas locales.
3. **Certificado de una autoridad reconocida (OV/EV).** Resolvería dos cosas de
   golpe: quitaría la advertencia de SmartScreen y permitiría volver a activar
   `verifyUpdateCodeSignature`, que hoy está desactivada porque un certificado
   autofirmado nunca supera la validación de Windows.
4. **`webSecurity: false` sigue activo** en `electron/main.js`. Está así para que
   el vídeo cargue desde orígenes distintos, pero conviene sustituirlo por una
   política de CSP concreta en lugar de desactivar la protección entera.
5. **Virtualización real de listas.** La paginación alivia el problema; una
   ventana virtual (`react-window`) lo resolvería del todo en listas enormes.
6. **`globals.css` tiene ~2100 líneas.** Ya se comprobó que no hay clases
   muertas, pero convendría partirlo por componente.
7. **Sin pruebas automatizadas.** La lógica del demo es el mejor candidato para
   empezar: es la que protege el negocio y es fácil de probar en aislamiento.

---

## 8. Comprobaciones útiles

Ver el estado del demo en esta máquina:

```powershell
reg query "HKCU\SOFTWARE\MASTVPlayer" /v DemoRecord
Get-Content "$env:PROGRAMDATA\MASTVPlayer\demo.dat"
```

Reiniciar el demo **solo para hacer pruebas** (hay que borrar las tres capas):

```powershell
reg delete "HKCU\SOFTWARE\MASTVPlayer" /v DemoRecord /f
Remove-Item "$env:PROGRAMDATA\MASTVPlayer\demo.dat" -Force
Remove-Item "$env:APPDATA\mastv-player\config.json" -Force
```

Comprobar la firma del instalador:

```powershell
Get-AuthenticodeSignature "instalador\MASTV-Player-Setup-2.0.0.exe" | Format-List Status, SignerCertificate
```

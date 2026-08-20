/**
 * build.mjs — Encadena compilación, ofuscación y empaquetado.
 *
 * Existe por una razón concreta: la contraseña del certificado se sacó de
 * package.json (donde quedaba versionada y dentro del paquete) y ahora se pasa
 * por CSC_LINK/CSC_KEY_PASSWORD. Sin esas variables electron-builder no firma
 * y no falla: generaba un instalador sin firmar en silencio, y Windows le
 * mostraba al usuario la advertencia de SmartScreen.
 *
 * Este script carga las credenciales desde certs/signing.env (que no se sube al
 * repositorio) y avisa de forma visible si no puede firmar.
 *
 * Uso:  node scripts/build.mjs [--target nsis|appx|all] [--unsigned] [--publish]
 *
 * Con --publish sube el resultado a la release de GitHub y genera el latest.yml
 * que electron-updater necesita para detectar la versión nueva. El token se
 * toma de GH_TOKEN, o de la sesión de la CLI de GitHub si no está definido.
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const args          = process.argv.slice(2)
const allowUnsigned = args.includes('--unsigned')
const doPublish     = args.includes('--publish')
const targetArg     = args.indexOf('--target')
const target        = targetArg !== -1 ? args[targetArg + 1] : 'nsis'

const targets = {
  nsis: ['--win', 'nsis'],
  appx: ['--win', 'appx'],
  all:  ['--win', 'nsis', 'appx'],
}
if (!targets[target]) {
  console.error(`build: objetivo desconocido "${target}". Usa nsis, appx o all.`)
  process.exit(1)
}

// ── Credenciales de firma ────────────────────────────────────────────────────
const envFile = join(root, 'certs', 'signing.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    // Sólo se rellena lo que no venga ya del entorno, para poder sobreescribir
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim()
  }
}

const defaultPfx = join(root, 'certs', 'mastv-cert.pfx')
if (!process.env.CSC_LINK && existsSync(defaultPfx)) {
  process.env.CSC_LINK = defaultPfx
} else if (process.env.CSC_LINK) {
  process.env.CSC_LINK = resolve(root, process.env.CSC_LINK)
}

const canSign = !!process.env.CSC_LINK && !!process.env.CSC_KEY_PASSWORD
if (!canSign) {
  const motivo = !process.env.CSC_LINK
    ? `no se encontró el certificado (${defaultPfx})`
    : 'falta la contraseña (CSC_KEY_PASSWORD)'
  if (!allowUnsigned) {
    console.error('')
    console.error('  build: NO SE PUEDE FIRMAR — ' + motivo + '.')
    console.error('  Un instalador sin firmar hace que Windows muestre la advertencia de SmartScreen.')
    console.error('')
    console.error('  Opciones:')
    console.error('    1) Crea certs/signing.env con la línea:  CSC_KEY_PASSWORD=tu-password')
    console.error('    2) O define la variable antes de compilar:  $env:CSC_KEY_PASSWORD = "tu-password"')
    console.error('    3) O compila a propósito sin firma:  npm run dist -- --unsigned')
    console.error('')
    process.exit(1)
  }
  console.warn(`build: aviso — compilando SIN FIRMA (${motivo}).`)
}

// ── Publicación ─────────────────────────────────────────────────────────────
const publishArgs = []
if (doPublish) {
  if (!process.env.GH_TOKEN) {
    // Reutiliza la sesión de la CLI de GitHub para no guardar el token en disco
    const token = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', shell: true })
    const value = (token.stdout || '').trim()
    if (token.status !== 0 || !value) {
      console.error('build: no hay token de GitHub. Define GH_TOKEN o ejecuta "gh auth login".')
      process.exit(1)
    }
    process.env.GH_TOKEN = value
  }
  publishArgs.push('--publish', 'always')
}

// ── Pasos ───────────────────────────────────────────────────────────────────
// npx necesita shell en Windows (es un .cmd); process.execPath no debe usarlo,
// porque la ruta de Node lleva espacios y el shell la partiría en dos.
const steps = [
  ['Compilando renderer', 'npx', ['vite', 'build'], true],
  ['Ofuscando código',    process.execPath, [join(root, 'scripts', 'protect.mjs')], false],
  ['Empaquetando',        'npx', ['electron-builder', ...targets[target], ...publishArgs], true],
]

for (const [label, cmd, cmdArgs, useShell] of steps) {
  console.log(`\nbuild: ${label}...`)
  const res = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: useShell })
  if (res.status !== 0) {
    console.error(`\nbuild: falló "${label}".`)
    process.exit(res.status ?? 1)
  }
}

console.log(canSign ? '\nbuild: listo (firmado).' : '\nbuild: listo (SIN FIRMAR).')

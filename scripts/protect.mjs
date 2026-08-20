/**
 * protect.mjs — Ofusca el código propio antes de empaquetar.
 *
 * Qué se ofusca:
 *   - dist/assets/index-*.js  → el chunk de entrada, que sólo tiene código propio
 *   - electron/*.js           → se copian ofuscados a dist-electron/
 *
 * Qué NO se ofusca y por qué:
 *   - dist/assets/vendor-*.js → hls.js y mpegts.js construyen sus workers a
 *     partir del código fuente en tiempo de ejecución (Function.toString), así
 *     que renombrar identificadores o mover las cadenas a un array los rompería.
 *     Además son librerías públicas: ocultarlas no aporta nada.
 *
 * Limitación conocida: la ofuscación encarece leer el código, no lo hace
 * imposible. Las URLs de los servidores viajan por HTTP y son visibles con
 * cualquier analizador de red, sin necesidad de tocar el código.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import obfuscator from 'javascript-obfuscator'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// transformObjectKeys queda desactivado en ambos perfiles: renombraría las
// claves de las respuestas de la API, las props de React y el objeto que
// expone contextBridge, que el renderer busca por nombre.
const baseOptions = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayEncoding: ['base64'],
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  simplify: true,
  disableConsoleOutput: true,
  transformObjectKeys: false,
  deadCodeInjection: false,
  selfDefending: false,
}

// El renderer pinta listas grandes, así que se aplica un aplanado de flujo
// moderado para no penalizar la interfaz.
const rendererOptions = {
  ...baseOptions,
  stringArrayThreshold: 0.8,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
}

// El proceso principal casi no ejecuta código caliente: puede ir más duro.
const mainOptions = {
  ...baseOptions,
  stringArrayThreshold: 1,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  selfDefending: true,
}

const obfuscate = (code, options) =>
  obfuscator.obfuscate(code, options).getObfuscatedCode()

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

// ── 1. Chunk de entrada del renderer ──────────────────────────────────────
const assetsDir = join(root, 'dist', 'assets')
const entryChunks = readdirSync(assetsDir).filter(
  (f) => f.startsWith('index-') && f.endsWith('.js')
)

if (entryChunks.length === 0) {
  console.error('protect: no se encontró el chunk de entrada. ¿Falta ejecutar vite build?')
  process.exit(1)
}

for (const file of entryChunks) {
  const path = join(assetsDir, file)
  const original = readFileSync(path, 'utf8')
  const result = obfuscate(original, rendererOptions)
  writeFileSync(path, result, 'utf8')
  console.log(`protect: dist/assets/${file}  ${kb(original.length)} -> ${kb(result.length)}`)
}

const untouched = readdirSync(assetsDir).filter((f) => f.startsWith('vendor-'))
for (const file of untouched) {
  console.log(`protect: dist/assets/${file}  sin ofuscar (workers en tiempo de ejecución)`)
}

// ── 2. Proceso principal y preload ────────────────────────────────────────
const outDir = join(root, 'dist-electron')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const file of ['main.js', 'preload.js']) {
  const original = readFileSync(join(root, 'electron', file), 'utf8')
  const result = obfuscate(original, mainOptions)
  writeFileSync(join(outDir, file), result, 'utf8')
  console.log(`protect: dist-electron/${file}  ${kb(original.length)} -> ${kb(result.length)}`)
}

console.log('protect: listo')

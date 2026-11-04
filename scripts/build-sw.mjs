import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const assetsDir = resolve(dist, 'assets')

if (!existsSync(assetsDir)) {
  console.error('dist/assets is missing — run vite build first.')
  process.exit(1)
}

const assets = readdirSync(assetsDir)
  .filter((file) => !file.endsWith('.map'))
  .map((file) => `assets/${file}`)

const template = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
const marker = 'const PRECACHE_ASSETS = []'
if (!template.includes(marker)) {
  console.error('Precache marker not found in public/sw.js.')
  process.exit(1)
}

const output = template.replace(marker, `const PRECACHE_ASSETS = ${JSON.stringify(assets, null, 2)}`)
writeFileSync(resolve(dist, 'sw.js'), output)
console.log(`sw.js written with ${assets.length} precached assets`)

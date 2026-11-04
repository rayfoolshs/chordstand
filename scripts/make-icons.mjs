import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const radius = size * 0.225
  const samples = 4

  const cornerAlpha = (x, y) => {
    const cx = Math.min(Math.max(x, radius), size - radius)
    const cy = Math.min(Math.max(y, radius), size - radius)
    const dx = x - cx
    const dy = y - cy
    return Math.hypot(dx, dy) <= radius ? 1 : 0
  }

  const insideRoundRect = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return 0
    if (x > radius && x < size - radius) return 1
    if (y > radius && y < size - radius) return 1
    return cornerAlpha(x, y)
  }

  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const inCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) <= r

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples
          const py = y + (sy + 0.5) / samples

          if (!insideRoundRect(px, py)) continue
          coverage += 1

          // Amber gradient body.
          const t = (px + py) / (size * 2)
          let cr = Math.round(247 - t * 60)
          let cg = Math.round(196 - t * 55)
          let cb = Math.round(92 - t * 50)

          // Fretboard: five strings, two frets, one dot.
          const stringWidth = size * 0.018
          const strings = [0.26, 0.38, 0.5, 0.62, 0.74].map((p) => p * size)
          const onString = strings.some((sxPos) => Math.abs(px - sxPos) <= stringWidth)
          const fretWidth = size * 0.018
          const onFret =
            Math.abs(py - size * 0.34) <= fretWidth || Math.abs(py - size * 0.62) <= fretWidth

          if ((onString || onFret) && inRect(px, py, size * 0.18, size * 0.16, size * 0.82, size * 0.84)) {
            cr = 22
            cg = 16
            cb = 5
          }

          if (inCircle(px, py, size * 0.38, size * 0.48, size * 0.075)) {
            cr = 255
            cg = 248
            cb = 232
          }

          r += cr
          g += cg
          b += cb
        }
      }

      if (coverage === 0) continue
      const total = samples * samples
      const index = (y * size + x) * 4
      pixels[index] = Math.round(r / coverage)
      pixels[index + 1] = Math.round(g / coverage)
      pixels[index + 2] = Math.round(b / coverage)
      pixels[index + 3] = Math.round((coverage / total) * 255)
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [180, 192, 512]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), drawIcon(size))
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7c45c"/>
      <stop offset="1" stop-color="#c17f1c"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="116" fill="url(#g)"/>
  <g stroke="#161005" stroke-width="9" stroke-linecap="round">
    <path d="M133 82v348M195 82v348M256 82v348M317 82v348M378 82v348"/>
    <path d="M92 174h328M92 317h328" stroke-width="9"/>
  </g>
  <circle cx="195" cy="246" r="38" fill="#fff8e8"/>
</svg>
`
writeFileSync(resolve(outDir, 'icon.svg'), svg)
console.log('icons written to public/icons')

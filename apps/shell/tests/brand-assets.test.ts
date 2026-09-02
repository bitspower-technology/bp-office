import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function repoFile(...parts: string[]): string {
  return join(REPO_ROOT, ...parts)
}

interface DecodedPng {
  width: number
  height: number
  pixels: Buffer
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

/** Decode the committed 8-bit, non-interlaced RGBA PNGs using Node builtins only. */
function decodeRgbaPng(contents: Buffer): DecodedPng {
  if (!contents.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature')
  }

  let cursor = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let sawHeader = false
  let sawEnd = false
  const chunkTypes: string[] = []
  const imageData: Buffer[] = []

  while (cursor < contents.length) {
    if (cursor + 12 > contents.length) throw new Error('Truncated PNG chunk header')
    const dataLength = contents.readUInt32BE(cursor)
    const type = contents.toString('ascii', cursor + 4, cursor + 8)
    const dataStart = cursor + 8
    const dataEnd = dataStart + dataLength
    const chunkEnd = dataEnd + 4 // trailing CRC
    if (chunkEnd > contents.length) throw new Error(`Truncated PNG ${type} chunk`)
    const data = contents.subarray(dataStart, dataEnd)
    chunkTypes.push(type)

    if (type === 'IHDR') {
      if (sawHeader || dataLength !== 13) throw new Error('Invalid PNG IHDR')
      sawHeader = true
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      const colorType = data[9]
      const compression = data[10]
      const filtering = data[11]
      const interlace = data[12]
      if (
        bitDepth !== 8 ||
        colorType !== 6 ||
        compression !== 0 ||
        filtering !== 0 ||
        interlace !== 0
      ) {
        throw new Error('Expected an 8-bit, non-interlaced RGBA PNG')
      }
    } else if (type === 'IDAT') {
      imageData.push(data)
    } else if (type === 'IEND') {
      if (dataLength !== 0) throw new Error('Invalid PNG IEND')
      sawEnd = true
    }

    cursor = chunkEnd
    if (sawEnd) break
  }

  if (!sawHeader || !sawEnd || chunkTypes[0] !== 'IHDR' || imageData.length === 0) {
    throw new Error('Incomplete PNG')
  }
  if (cursor !== contents.length) throw new Error('Unexpected data after PNG IEND')

  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const filtered = inflateSync(Buffer.concat(imageData))
  if (filtered.length !== height * (stride + 1)) throw new Error('Unexpected PNG data length')
  const pixels = Buffer.alloc(width * height * bytesPerPixel)

  for (let row = 0; row < height; row += 1) {
    const sourceRow = row * (stride + 1)
    const targetRow = row * stride
    const filter = filtered[sourceRow]
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`)
    for (let columnByte = 0; columnByte < stride; columnByte += 1) {
      const encoded = filtered[sourceRow + 1 + columnByte]
      const left = columnByte >= bytesPerPixel ? pixels[targetRow + columnByte - 4] : 0
      const above = row > 0 ? pixels[targetRow - stride + columnByte] : 0
      const upperLeft =
        row > 0 && columnByte >= bytesPerPixel ? pixels[targetRow - stride + columnByte - 4] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = above
      else if (filter === 3) predictor = Math.floor((left + above) / 2)
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft)
      pixels[targetRow + columnByte] = (encoded + predictor) & 0xff
    }
  }

  return { width, height, pixels }
}

interface AlphaBounds {
  left: number
  top: number
  right: number
  bottom: number
  visiblePixels: number
}

function alphaBounds(png: DecodedPng): AlphaBounds {
  let left = png.width
  let top = png.height
  let right = -1
  let bottom = -1
  let visiblePixels = 0
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.pixels[(y * png.width + x) * 4 + 3] === 0) continue
      visiblePixels += 1
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (visiblePixels === 0) throw new Error('PNG has no visible pixels')
  return { left, top, right: right + 1, bottom: bottom + 1, visiblePixels }
}

function alphaAt(png: DecodedPng, x: number, y: number): number {
  return png.pixels[(y * png.width + x) * 4 + 3]
}

function countOpaqueColor(png: DecodedPng, red: number, green: number, blue: number): number {
  let count = 0
  for (let offset = 0; offset < png.pixels.length; offset += 4) {
    if (
      png.pixels[offset] === red &&
      png.pixels[offset + 1] === green &&
      png.pixels[offset + 2] === blue &&
      png.pixels[offset + 3] === 255
    ) {
      count += 1
    }
  }
  return count
}

function countOpaqueMatching(
  png: DecodedPng,
  predicate: (red: number, green: number, blue: number) => boolean,
): number {
  let count = 0
  for (let offset = 0; offset < png.pixels.length; offset += 4) {
    if (
      png.pixels[offset + 3] === 255 &&
      predicate(png.pixels[offset], png.pixels[offset + 1], png.pixels[offset + 2])
    ) {
      count += 1
    }
  }
  return count
}

interface IcoFrame {
  size: number
  bitCount: number
  offset: number
  length: number
  payload: Buffer
}

function parseIco(contents: Buffer): IcoFrame[] {
  if (contents.length < 6) throw new Error('Truncated ICO header')
  if (contents.readUInt16LE(0) !== 0 || contents.readUInt16LE(2) !== 1) {
    throw new Error('Invalid ICO header')
  }
  const count = contents.readUInt16LE(4)
  const directoryEnd = 6 + count * 16
  if (directoryEnd > contents.length) throw new Error('Truncated ICO directory')

  const frames: IcoFrame[] = []
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16
    const width = contents[entry] || 256
    const height = contents[entry + 1] || 256
    if (width !== height) throw new Error('ICO frame is not square')
    if (contents[entry + 2] !== 0 || contents[entry + 3] !== 0) {
      throw new Error('Unexpected ICO color table or reserved byte')
    }
    const bitCount = contents.readUInt16LE(entry + 6)
    const length = contents.readUInt32LE(entry + 8)
    const offset = contents.readUInt32LE(entry + 12)
    if (length === 0 || offset < directoryEnd || offset + length > contents.length) {
      throw new Error('Invalid ICO frame range')
    }
    frames.push({
      size: width,
      bitCount,
      offset,
      length,
      payload: contents.subarray(offset, offset + length),
    })
  }

  const orderedRanges = [...frames].sort((left, right) => left.offset - right.offset)
  for (let index = 1; index < orderedRanges.length; index += 1) {
    const previous = orderedRanges[index - 1]
    if (orderedRanges[index].offset < previous.offset + previous.length) {
      throw new Error('Overlapping ICO frames')
    }
  }
  return frames
}

interface IcnsChunk {
  type: string
  length: number
  payload: Buffer
}

function parseIcns(contents: Buffer): IcnsChunk[] {
  if (contents.length < 8 || contents.toString('ascii', 0, 4) !== 'icns') {
    throw new Error('Invalid ICNS magic')
  }
  if (contents.readUInt32BE(4) !== contents.length) throw new Error('Invalid ICNS length')

  const chunks: IcnsChunk[] = []
  let cursor = 8
  while (cursor < contents.length) {
    if (cursor + 8 > contents.length) throw new Error('Truncated ICNS chunk header')
    const type = contents.toString('ascii', cursor, cursor + 4)
    const length = contents.readUInt32BE(cursor + 4)
    if (length < 8 || cursor + length > contents.length) {
      throw new Error(`Invalid ICNS ${type} chunk length`)
    }
    chunks.push({
      type,
      length,
      payload: contents.subarray(cursor + 8, cursor + length),
    })
    cursor += length
  }
  if (cursor !== contents.length) throw new Error('Invalid ICNS chunk table')
  return chunks
}

describe('generated BP Office brand assets', () => {
  const shellBuild = repoFile('apps', 'shell', 'build')
  const shellRenderer = repoFile('apps', 'shell', 'src', 'renderer', 'src')

  it('uses one valid 1024px RGBA icon for shell and renderer surfaces', () => {
    const shellIcon = readFileSync(join(shellBuild, 'icon.png'))
    const rendererIcon = readFileSync(join(shellRenderer, 'assets', 'app-icon.png'))
    expect(rendererIcon.equals(shellIcon), 'shell and renderer PNGs differ').toBe(true)

    const png = decodeRgbaPng(shellIcon)
    expect({ width: png.width, height: png.height }).toEqual({ width: 1024, height: 1024 })
    const bounds = alphaBounds(png)
    expect(bounds.visiblePixels).toBeGreaterThan(0)
    // The distributor master is a monochrome mark: an ink tile with negative-space art.
    expect(countOpaqueColor(png, 0, 0, 0), 'missing black mark ink').toBeGreaterThan(300_000)
    expect(
      countOpaqueMatching(png, (red, green, blue) => red > 240 && green > 240 && blue > 240),
      'missing negative-space art',
    ).toBeGreaterThan(100_000)
    // The mark keeps a transparent margin instead of filling the whole canvas.
    expect(bounds.left).toBeGreaterThan(8)
    expect(bounds.top).toBeGreaterThan(8)
    expect(png.width - bounds.right).toBeGreaterThan(8)
    expect(png.height - bounds.bottom).toBeGreaterThan(8)
    for (const [x, y] of [
      [0, 0],
      [png.width - 1, 0],
      [0, png.height - 1],
      [png.width - 1, png.height - 1],
    ]) {
      expect(alphaAt(png, x, y)).toBe(0)
    }
  })

  it('keeps a larger transparent safe-zone around the macOS icon', () => {
    const regular = alphaBounds(decodeRgbaPng(readFileSync(join(shellBuild, 'icon.png'))))
    const mac = alphaBounds(decodeRgbaPng(readFileSync(join(shellBuild, 'icon-mac.png'))))
    expect(mac.left).toBeGreaterThan(regular.left)
    expect(mac.top).toBeGreaterThan(regular.top)
    expect(mac.right).toBeLessThan(regular.right)
    expect(mac.bottom).toBeLessThan(regular.bottom)
  })

  it('contains the complete Windows ICO size set as 32-bit RGBA PNG frames', () => {
    const frames = parseIco(readFileSync(join(shellBuild, 'icon.ico')))
    expect(frames.map((frame) => frame.size).sort((a, b) => a - b)).toEqual([
      16, 24, 32, 48, 64, 128, 256,
    ])
    for (const frame of frames) {
      expect(frame.bitCount).toBe(32)
      const png = decodeRgbaPng(frame.payload)
      expect({ width: png.width, height: png.height }).toEqual({
        width: frame.size,
        height: frame.size,
      })
      expect(alphaBounds(png).visiblePixels).toBeGreaterThan(0)
    }
  })

  it('contains a valid modern ICNS representation table', () => {
    const chunks = parseIcns(readFileSync(join(shellBuild, 'icon.icns')))
    const toc = chunks.find((chunk) => chunk.type === 'TOC ')
    expect(toc, 'ICNS table of contents is missing').toBeDefined()
    if (!toc) return
    expect(toc.payload.length % 8).toBe(0)
    const tocEntries: Array<{ type: string; length: number }> = []
    for (let cursor = 0; cursor < toc.payload.length; cursor += 8) {
      tocEntries.push({
        type: toc.payload.toString('ascii', cursor, cursor + 4),
        length: toc.payload.readUInt32BE(cursor + 4),
      })
    }
    expect(tocEntries).toEqual(
      chunks
        .filter((chunk) => chunk.type !== 'TOC ')
        .map((chunk) => ({ type: chunk.type, length: chunk.length })),
    )

    const expectedSizes = new Map([
      ['ic07', 128],
      ['ic08', 256],
      ['ic09', 512],
      ['ic10', 1024],
      ['ic11', 32],
      ['ic12', 64],
      ['ic13', 256],
      ['ic14', 512],
    ])
    const representations = chunks.filter((chunk) => chunk.type !== 'TOC ')
    expect(representations.map((chunk) => chunk.type)).toEqual([...expectedSizes.keys()])
    for (const chunk of representations) {
      const expectedSize = expectedSizes.get(chunk.type)
      const png = decodeRgbaPng(chunk.payload)
      expect({ width: png.width, height: png.height }).toEqual({
        width: expectedSize,
        height: expectedSize,
      })
    }
  })

  it('uses the accessible BP Office lockup from the active Home import', () => {
    const logoPath = join(shellRenderer, 'assets', 'bpoffice-logo.svg')
    expect(existsSync(logoPath)).toBe(true)
    for (const stale of ['genoffice-logo.svg', 'niuoffice-logo.svg']) {
      expect(
        existsSync(join(shellRenderer, 'assets', stale)),
        `stale ${stale} is still shipped`,
      ).toBe(false)
    }

    const homeSource = readFileSync(join(shellRenderer, 'Home.tsx'), 'utf8')
    expect(homeSource).toMatch(/^import bpOfficeLogo from ['"]\.\/assets\/bpoffice-logo\.svg['"]$/m)
    expect(homeSource).toMatch(/src=\{bpOfficeLogo\} alt="BP Office"/)
    expect(homeSource).not.toMatch(/(?:genoffice|niuoffice)-logo\.svg/i)

    const svg = readFileSync(logoPath, 'utf8')
    const openingTag = svg.match(/^<svg\b[^>]*>/)?.[0] ?? ''
    const labelledBy = openingTag.match(/\baria-labelledby="([^"]+)"/)?.[1]
    const title = svg.match(/<title\s+id="([^"]+)">([^<]+)<\/title>/)
    expect(openingTag).toContain('role="img"')
    expect(labelledBy).toBe('bpoffice-title')
    expect(title?.[1]).toBe(labelledBy)
    expect(title?.[2]).toBe('BP Office')

    // Monochrome and currentColor-driven, so one asset serves light and dark themes.
    expect(svg).toContain('viewBox="0 0 1050 240"')
    expect(svg).toMatch(/<g\b[^>]*\bfill="currentColor"/)
    expect((svg.match(/<path\b/g) ?? []).length).toBeGreaterThan(6)
    expect(svg).not.toMatch(/<(?:script|foreignObject)\b/i)
    expect(svg).not.toMatch(/\b(?:href|xlink:href)\s*=/i)
    expect(svg).not.toMatch(/(?:@import|\bdata:)/i)
    expect(svg).not.toMatch(/<!DOCTYPE/i)
    expect(svg).not.toMatch(/GenOffice|Genspark|NiuOffice/i)
  })

  it('keeps the traced vector mark, its build copy and the shared React icon identical', () => {
    const canonical = readFileSync(repoFile('branding', 'bpoffice-mark.svg'), 'utf8')
    const buildCopy = readFileSync(join(shellBuild, 'bpoffice-mark.svg'), 'utf8')
    const uiModule = readFileSync(repoFile('packages', 'ui', 'src', 'brand-mark.ts'), 'utf8')

    for (const svg of [canonical, buildCopy]) {
      expect(svg).toContain('<title id="bpoffice-mark-title">BP Office</title>')
      expect(svg).toContain('viewBox="0 0 1024 1024"')
      expect(svg).toContain('fill="currentColor"')
      expect((svg.match(/<path\b/g) ?? []).length).toBe(1)
      expect(svg).not.toMatch(/<(?:script|foreignObject)\b/i)
      expect(svg).not.toMatch(/(?:@import|\bdata:)/i)
      expect(svg).not.toMatch(/GenOffice|Genspark|NiuOffice/i)
    }

    const pathOf = (svg: string): string => svg.match(/\bd="([^"]+)"/)?.[1] ?? ''
    const uiPath = uiModule.match(/BP_OFFICE_MARK_PATH =\s*\n?\s*"([^"]+)"/)?.[1] ?? ''
    expect(pathOf(buildCopy).length, 'build mark carries no geometry').toBeGreaterThan(1000)
    expect(pathOf(canonical)).toBe(pathOf(buildCopy))
    expect(uiPath).toBe(pathOf(buildCopy))

    // The shared icon renders that same geometry with the client accessibility label.
    const icons = readFileSync(repoFile('packages', 'ui', 'src', 'icons.tsx'), 'utf8')
    expect(icons).toContain('export function BPOfficeMark')
    expect(icons).toContain('aria-label="BP Office"')
    expect(icons).toContain('d={BP_OFFICE_MARK_PATH}')
    expect(icons).not.toMatch(/NiuOffice/i)
  })

  it('brands both Windows artifacts and excludes removed packaged modules', () => {
    const builder = readFileSync(repoFile('apps', 'shell', 'electron-builder.cjs'), 'utf8')
    const manifest = JSON.parse(
      readFileSync(repoFile('apps', 'shell', 'package.json'), 'utf8'),
    ) as {
      productName: string
      version: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const productConfig = JSON.parse(
      readFileSync(repoFile('branding', 'product.json'), 'utf8'),
    ) as {
      productName: string
      artifactSlug: string
      edition: string
      features: { chatgptSubscription: boolean }
      updates: { enabled: boolean }
    }
    expect(manifest).toMatchObject({ productName: 'BP Office', version: '1.0.0-bp.1' })
    expect(productConfig).toMatchObject({
      productName: 'BP Office',
      artifactSlug: 'BPOffice',
      edition: 'oem',
      features: { chatgptSubscription: false },
      updates: { enabled: true },
    })
    expect(builder).toContain('productName: productConfig.productName')
    expect(builder).toContain("target: 'portable'")
    expect(builder).toContain(
      'artifactName: `${productConfig.artifactSlug}-Setup-\\${version}.\\${ext}`',
    )
    expect(builder).toContain(
      'artifactName: `${productConfig.artifactSlug}-Portable-\\${version}.\\${ext}`',
    )
    expect(builder).toContain("icon: 'build/icon.ico'")
    expect([...builder.matchAll(/to: 'modules\/([^']+)'/g)].map((match) => match[1])).toEqual([
      'docs',
      'sheets',
      'pdf',
      'markdown',
    ])
    expect([...builder.matchAll(/\bext:\s*'([^']+)'/g)].map((match) => match[1])).toEqual([
      'docx',
      'xlsx',
      'xlsm',
      'xls',
      'csv',
      'pdf',
      'md',
      'markdown',
    ])
    expect(manifest.devDependencies?.['@openai/codex']).toBeUndefined()
    expect(manifest.dependencies?.['@openai/codex']).toBeUndefined()
    expect(builder.match(/from: codexBinary/g) ?? []).toHaveLength(1)
    expect(builder).toContain(
      "to: process.platform === 'win32' ? 'native/codex.exe' : 'native/codex'",
    )
    expect(builder.match(/from: codexCodeModeHost/g) ?? []).toHaveLength(1)
    expect(builder).toContain("? 'native/codex-code-mode-host.exe'")
    expect(builder).toContain(": 'native/codex-code-mode-host'")
    expect(builder).not.toMatch(/from:[^\n]*(?:codex-command-runner|sandbox-setup|rg\.exe)/i)
    expect(builder).not.toMatch(/from:\s*['"][^'"]*node_modules\/@openai\/codex/i)
    expect(builder).not.toMatch(/modules\/slides|@genspark\/cli|google-analytics/i)
  })

  it('ships required legal files without attributing the Codex license to Mainfunc', () => {
    const builder = readFileSync(repoFile('apps', 'shell', 'electron-builder.cjs'), 'utf8')
    expect(builder).toMatch(/from: '\.\.\/\.\.\/LICENSE',[\s\S]*?to: 'LICENSE'/)
    expect(builder).toMatch(/from: '\.\.\/\.\.\/NOTICE',[\s\S]*?to: 'NOTICE'/)
    expect(builder).toMatch(
      /from: '\.\.\/\.\.\/LICENSE-UNICODE\.txt',[\s\S]*?to: 'LICENSE-UNICODE\.txt'/,
    )

    const generator = readFileSync(repoFile('tools', 'gen-third-party-notices.mjs'), 'utf8')
    expect(generator).toContain(
      "const APACHE_TEMPLATE_COPYRIGHT = '   Copyright [yyyy] [name of copyright owner]'",
    )
    expect(generator).toContain('canonicalApacheLicense')
    expect(generator).not.toMatch(
      /CODEX_NOTICE\s*=[\s\S]*?\+\s*readFileSync\(join\(ROOT, 'LICENSE'/,
    )
  })
})

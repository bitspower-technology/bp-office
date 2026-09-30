/** Collect an exact, clean commit's distributable assets without publishing. */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { load } from 'js-yaml'

const release = resolve(process.argv[2] || 'apps/shell/release')
const platform = process.argv[3]
if (!['windows', 'linux'].includes(platform)) throw new Error('Expected platform windows or linux.')
const product = JSON.parse(readFileSync('branding/product.json', 'utf8'))
const { version } = JSON.parse(readFileSync('apps/shell/package.json', 'utf8'))
if (product.edition !== 'main') throw new Error('OEM source must not publish NiuOffice binaries.')
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
  encoding: 'utf8',
}).trim()
if (dirty) throw new Error('Release assembly requires a clean committed source tree.')
const output = join(release, 'artifacts')
if (existsSync(output) && readdirSync(output).length)
  throw new Error('Artifact directory is not empty; use a fresh release output directory.')
const prefix = product.artifactSlug
const setup = `${prefix}-Setup-${version}.exe`
const portable = `${prefix}-Portable-${version}.exe`
// The Linux release targets x64. Match the builder's complete names, including
// its different architecture separators, so niu.1 cannot pick up niu.10 assets.
const appImage = `${prefix}-${version}-x86_64.AppImage`
const rpm = `${prefix}-${version}.x86_64.rpm`
const primary = platform === 'windows' ? setup : appImage
const metadata = platform === 'windows' ? 'latest.yml' : 'latest-linux.yml'
const assets = platform === 'windows' ? [setup, portable, metadata] : [primary, rpm, metadata]
if (existsSync(join(release, `${primary}.blockmap`))) assets.push(`${primary}.blockmap`)
for (const name of assets)
  if (!existsSync(join(release, name))) throw new Error(`Missing release asset: ${name}`)
const feed = load(readFileSync(join(release, metadata), 'utf8'))
if (feed?.version !== version || !Array.isArray(feed.files) || !feed.files.length)
  throw new Error('Update metadata version or files are invalid.')
const expectedSha512 = createHash('sha512')
  .update(readFileSync(join(release, primary)))
  .digest('base64')
for (const entry of feed.files) {
  if (entry.url !== primary || entry.sha512 !== expectedSha512)
    throw new Error('Update feed must reference exactly the current primary asset and its SHA-512.')
}
if (feed.path && feed.path !== primary)
  throw new Error('Legacy update path does not match the current primary asset.')
mkdirSync(output, { recursive: true })
for (const name of assets) copyFileSync(join(release, name), join(output, name))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const archive = `${prefix}-${version}-source.zip`
execFileSync('git', [
  'archive',
  '--format=zip',
  `--prefix=${prefix}-${version}/`,
  `--output=${join(output, archive)}`,
  commit,
])
assets.push(archive, `BUILD-${platform}.txt`)
writeFileSync(
  join(output, `BUILD-${platform}.txt`),
  `Product: ${prefix}\nVersion: ${version}\nCommit: ${commit}\nPlatform: ${platform}\nUnsigned contributor build.\n`,
)
const hashes = assets.sort().map(
  (name) =>
    `${createHash('sha256')
      .update(readFileSync(join(output, name)))
      .digest('hex')} *${name}`,
)
writeFileSync(join(output, `SHA256SUMS-${platform}.txt`), `${hashes.join('\n')}\n`)
console.log(`Assembled ${platform} release assets from ${commit}: ${output}`)

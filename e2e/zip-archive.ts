import { readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'

async function loadZip(archivePath: string): Promise<JSZip> {
  return JSZip.loadAsync(await readFile(archivePath))
}

function requireEntry(zip: JSZip, archivePath: string, entryName: string): JSZip.JSZipObject {
  const entry = zip.file(entryName)
  if (!entry) {
    throw new Error(`Missing ZIP entry "${entryName}" in ${archivePath}`)
  }
  return entry
}

export async function readZipEntry(archivePath: string, entryName: string): Promise<Buffer> {
  const zip = await loadZip(archivePath)
  return requireEntry(zip, archivePath, entryName).async('nodebuffer')
}

export async function readZipText(archivePath: string, entryName: string): Promise<string> {
  const zip = await loadZip(archivePath)
  return requireEntry(zip, archivePath, entryName).async('string')
}

export async function listZipEntries(archivePath: string): Promise<string[]> {
  const zip = await loadZip(archivePath)
  return Object.keys(zip.files)
}

export async function writeZipEntry(
  archivePath: string,
  entryName: string,
  contents: string | Buffer,
): Promise<void> {
  const zip = await loadZip(archivePath)
  zip.file(entryName, contents)
  const updated = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await writeFile(archivePath, updated)
}

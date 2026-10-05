/**
 * The schema gate reads xmllint diagnostics out of stderr. These cases pin the Windows CRLF
 * behaviour that made correct .pptx files fail the release job: a trailing \r prevented the
 * ` validates` success line from being recognised, so every cleanly validated part was pushed
 * as a problem. Pure parsing - runs on any host, with or without xmllint installed.
 */
import { describe, expect, it } from 'vitest'
import {
  parseXmllintStderr,
  parseDiagnostic,
  sameDiagnosticPath,
} from '../../../tools/ooxml-validate/validate-pptx.mjs'

const PROBLEM_LINE = /^(.*?):(\d+): (.*)$/

describe('xmllint stderr parsing', () => {
  it('recognises a success line written with CRLF (Windows)', () => {
    const [line] = parseXmllintStderr('C:\\build\\a__ppt__slide1.xml validates\r\n')
    expect(line).toBe('C:\\build\\a__ppt__slide1.xml validates')
    // this is the filter validatePptx() uses to drop successful validations
    expect(/ validates$/.test(line)).toBe(true)
  })

  it('still recognises the Unix form', () => {
    const [line] = parseXmllintStderr('/tmp/a__ppt__slide1.xml validates\n')
    expect(/ validates$/.test(line)).toBe(true)
  })

  it('extracts a clean message from a CRLF diagnostic', () => {
    const [line] = parseXmllintStderr(
      'C:\\tmp\\x__ppt__slide1.xml:7: element foo: Schemas validity error : Element foo not expected.\r\n',
    )
    const m = PROBLEM_LINE.exec(line)
    expect(m?.[1]).toBe('C:\\tmp\\x__ppt__slide1.xml')
    expect(m?.[3]).toBe('element foo: Schemas validity error : Element foo not expected.')
    expect(m?.[3].endsWith('\r')).toBe(false)
  })

  it('drops the empty trailing line and tolerates missing output', () => {
    expect(parseXmllintStderr('a\nb\n')).toEqual(['a', 'b'])
    expect(parseXmllintStderr('')).toEqual([])
    expect(parseXmllintStderr(undefined)).toEqual([])
  })
})

describe('xmllint diagnostic parsing', () => {
  it('reads the Unix form (file:line: severity : message)', () => {
    const d = parseDiagnostic('/tmp/v-abc/raw__ppt__slides__slide1.xml:1: parser error : mismatch')
    expect(d?.file).toBe('/tmp/v-abc/raw__ppt__slides__slide1.xml')
    expect(d?.line).toBe(1)
    expect(d?.message).toBe('parser error : mismatch')
  })

  it('reads the Windows form with a column, keeping the drive-letter colon out of it', () => {
    const d = parseDiagnostic(
      'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\v-abc\\raw__ppt__slides__slide1.xml:1:28: parser error : StartTag: invalid element name',
    )
    // without an optional column group this used to come back as "...slide1.xml:1", matching no
    // part, so a malformed slide produced no reported problem at all on Windows
    expect(d?.file).toBe(
      'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\v-abc\\raw__ppt__slides__slide1.xml',
    )
    expect(d?.line).toBe(1)
    expect(d?.message).toBe('parser error : StartTag: invalid element name')
  })

  it('reads the Windows form without a column', () => {
    const d = parseDiagnostic('C:\\tmp\\v\\raw__x.xml:7: validity error : Element foo not expected')
    expect(d?.file).toBe('C:\\tmp\\v\\raw__x.xml')
    expect(d?.line).toBe(7)
  })

  it('is not a diagnostic when there is no position', () => {
    expect(parseDiagnostic('C:\\tmp\\v\\raw__x.xml validates')).toBeNull()
    expect(parseDiagnostic('Schemas parser error : failed to load')).toBeNull()
  })

  it('matches echoed paths across separators and case', () => {
    const win = 'C:\\Temp\\v\\raw__a.xml'
    expect(sameDiagnosticPath(win, win)).toBe(true)
    expect(sameDiagnosticPath('C:/Temp/v/raw__a.xml', win)).toBe(true)
    expect(sameDiagnosticPath('/tmp/v/raw__a.xml', '/tmp/v/raw__b.xml')).toBe(false)
  })
})

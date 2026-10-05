/**
 * The schema gate reads xmllint diagnostics out of stderr. These cases pin the Windows CRLF
 * behaviour that made correct .pptx files fail the release job: a trailing \r prevented the
 * ` validates` success line from being recognised, so every cleanly validated part was pushed
 * as a problem. Pure parsing - runs on any host, with or without xmllint installed.
 */
import { describe, expect, it } from 'vitest'
import { parseXmllintStderr } from '../../../tools/ooxml-validate/validate-pptx.mjs'

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

import { describe, expect, it } from 'vitest'
import { aiStreamRequestSchema } from '../src/shared/desktop-api'

const request = {
  requestId: 'reasoning-round-trip',
  settings: {
    provider: 'lmstudio',
    providers: { lmstudio: { model: 'local-reasoning-model' } },
  },
  system: 'Edit the current workbook.',
  messages: [
    { role: 'user', text: 'Set A1 to 42.' },
    {
      role: 'assistant',
      text: '',
      reasoning: 'Use the workbook tool to edit cell A1.',
      toolCalls: [{ id: 'call-1', name: 'set_cells', input: { cell: 'A1', value: 42 } }],
    },
    { role: 'tool', results: [{ id: 'call-1', name: 'set_cells', output: 'Updated A1.' }] },
  ],
}

describe('AI stream request schema', () => {
  it('preserves assistant reasoning when continuing after a tool result', () => {
    const parsed = aiStreamRequestSchema.parse(request)
    expect(parsed.messages[1]).toEqual(request.messages[1])
    expect(parsed.settings.providers.lmstudio?.apiKey).toBe('')
  })

  it('allows existing assistant messages without reasoning', () => {
    expect(
      aiStreamRequestSchema.safeParse({
        ...request,
        messages: [{ role: 'assistant', text: 'Done.' }],
      }).success,
    ).toBe(true)
  })

  it('rejects oversized or non-string reasoning', () => {
    for (const reasoning of ['x'.repeat(1_048_577), { text: 'not a string' }]) {
      expect(
        aiStreamRequestSchema.safeParse({
          ...request,
          messages: [{ role: 'assistant', text: '', reasoning }],
        }).success,
      ).toBe(false)
    }
  })
})

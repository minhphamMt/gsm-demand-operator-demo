import { describe, expect, it } from 'vitest'

import { agentModeReadiness, type LlmHealth } from '@/features/operator-pipeline/model/llmHealth'
import { readLlmHealth } from '@/features/operator-pipeline/model/pipelineRunGuard'

const health = (overrides: Partial<LlmHealth> = {}): LlmHealth => ({
  isRoutingEnabled: true,
  isApiKeyConfigured: true,
  baseUrl: 'https://openrouter.ai/api/v1',
  analysis: { ok: true, model: 'google/gemini-3.7-flash' },
  explanation: { ok: true, model: 'anthropic/claude-haiku-4.5' },
  ...overrides,
})

describe('agentModeReadiness', () => {
  // Bám đúng điều kiện của đồ thị: `llm_enabled and client.configured`.
  it('routes through the LLM only when the flag is on and both models answer', () => {
    expect(agentModeReadiness(health())).toBe('llm')
  })

  it('stays deterministic when the flag is off, whatever the gateway says', () => {
    expect(agentModeReadiness(health({ isRoutingEnabled: false }))).toBe('deterministic_by_config')
  })

  it('separates a missing key from a deliberate deterministic setting', () => {
    expect(agentModeReadiness(health({ isApiKeyConfigured: false }))).toBe('deterministic_no_key')
  })

  it('flags a configured but unreachable gateway instead of claiming LLM mode', () => {
    expect(agentModeReadiness(health({ analysis: { ok: false, model: 'x', error: 'model không tồn tại' } })))
      .toBe('llm_degraded')
  })

  it('has no answer before the preflight returns', () => {
    expect(agentModeReadiness(undefined)).toBeUndefined()
  })
})

describe('readLlmHealth', () => {
  it('maps the snake_case payload of the AI service', () => {
    expect(readLlmHealth({
      llm_routing_enabled: true,
      base_url: 'https://gw.test/v1',
      api_key_configured: true,
      analysis: { ok: true, model: 'a', served_by: 'a-2026' },
      explanation: { ok: false, model: 'b', error: 'timeout' },
    })).toEqual({
      isRoutingEnabled: true,
      isApiKeyConfigured: true,
      baseUrl: 'https://gw.test/v1',
      analysis: { ok: true, model: 'a', servedBy: 'a-2026' },
      explanation: { ok: false, model: 'b', error: 'timeout' },
    })
  })

  it('rejects a payload missing the two flags rather than guessing them', () => {
    expect(readLlmHealth({ base_url: 'x', analysis: { ok: true, model: 'a' } })).toBeUndefined()
    expect(readLlmHealth(undefined)).toBeUndefined()
  })

  // Khoá API không bao giờ được đi qua biên này, kể cả khi service lỡ trả về.
  it('never carries an api key into the frontend model', () => {
    const parsed = readLlmHealth({
      llm_routing_enabled: true,
      api_key_configured: true,
      base_url: 'x',
      api_key: 'sk-should-never-appear',
      analysis: { ok: true, model: 'a' },
      explanation: { ok: true, model: 'b' },
    })

    expect(JSON.stringify(parsed)).not.toContain('sk-should-never-appear')
  })
})

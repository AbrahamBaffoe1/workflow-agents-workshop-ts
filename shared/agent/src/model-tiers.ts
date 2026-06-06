/**
 * Model tier mapping. One place to update when new models ship.
 *
 *   medium → resolved via MODEL_TIERS
 *   gpt-4o → raw passthrough, provider inferred
 */
import type { ModelSpec } from './types.js'

export type ModelTier = 'small' | 'medium' | 'large'

export const MODEL_TIERS: Record<ModelTier, ModelSpec> = {
  small: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  medium: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  large: { provider: 'anthropic', model: 'claude-opus-4-6' },
}

function isTier(value: string): value is ModelTier {
  return value in MODEL_TIERS
}

function inferProvider(model: string): 'anthropic' | 'openai' {
  if (/^(gpt-|o[13]|dall-e|chatgpt)/.test(model)) return 'openai'
  return 'anthropic'
}

export function resolveModelSpec(model?: string, provider?: string): ModelSpec {
  const modelName = model ?? 'medium'
  if (isTier(modelName)) return { ...MODEL_TIERS[modelName] }
  return {
    provider: (provider as ModelSpec['provider']) ?? inferProvider(modelName),
    model: modelName,
  }
}

/**
 * Test data builders -- factories with sensible defaults that can be overridden
 * per test.  Keeps test bodies focused on the *delta* relevant to each case.
 */

import type {
  ApiKeyValidationResult,
  ProviderDefaults,
  ProviderUsageSummary,
  ModelConstraints,
} from '../hooks/useApiKeys';

export const makeValidationResult = (
  overrides: Partial<ApiKeyValidationResult> = {},
): ApiKeyValidationResult => ({
  isValid: true,
  models: ['gpt-4', 'gpt-3.5-turbo'],
  ...overrides,
});

export const makeProviderDefaults = (
  overrides: Partial<ProviderDefaults> = {},
): ProviderDefaults => ({
  default_model: 'gpt-4',
  temperature: 0.7,
  max_tokens: 4096,
  thinking_enabled: false,
  thinking_budget: 2048,
  reasoning_effort: 'medium',
  reasoning_format: 'parsed',
  ...overrides,
});

export const makeModelConstraints = (
  overrides: Partial<ModelConstraints> = {},
): ModelConstraints => ({
  found: true,
  model: 'gpt-4',
  provider: 'openai',
  max_output_tokens: 16384,
  context_length: 128_000,
  temperature_range: [0, 2],
  supports_thinking: false,
  thinking_type: 'none',
  is_reasoning_model: false,
  ...overrides,
});

export const makeProviderUsage = (
  overrides: Partial<ProviderUsageSummary> = {},
): ProviderUsageSummary => ({
  provider: 'openai',
  total_input_tokens: 1000,
  total_output_tokens: 500,
  total_tokens: 1500,
  total_input_cost: 0.01,
  total_output_cost: 0.015,
  total_cache_cost: 0,
  total_cost: 0.025,
  execution_count: 3,
  models: [],
  ...overrides,
});

/**
 * Build a fake `useWebSocket` return value with all the methods consumed by
 * `useApiKeys`.  Each method is a vi.fn() with a sensible default resolution.
 *
 * Tests can override any method via `mockResolvedValue`/`mockRejectedValue`
 * and inspect call args via `.mock.calls`.
 */
export const makeWebSocketMock = (overrides: Record<string, unknown> = {}) => {
  const { vi } = (globalThis as unknown as { vi: typeof import('vitest').vi });
  return {
    isConnected: true,
    sendRequest: vi.fn().mockResolvedValue({}),
    validateApiKey: vi
      .fn()
      .mockResolvedValue({ valid: true, models: ['gpt-4'] }),
    getStoredApiKey: vi
      .fn()
      .mockResolvedValue({ hasKey: false }),
    saveApiKey: vi.fn().mockResolvedValue(true),
    deleteApiKey: vi.fn().mockResolvedValue(true),
    validateMapsKey: vi.fn().mockResolvedValue({ valid: true }),
    validateApifyKey: vi.fn().mockResolvedValue({ valid: true }),
    getAiModels: vi.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']),
    ...overrides,
  };
};

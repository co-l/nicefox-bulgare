import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as spark from './spark.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Spark Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the model cache
    spark.resetCache()
  })

  afterEach(() => {
    spark.resetCache()
  })

  describe('getModel', () => {
    it('should fetch and cache the first available model from /v1/models', async () => {
      const mockModelsResponse = {
        data: [
          { id: 'model-1' },
          { id: 'model-2' },
        ],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockModelsResponse,
      })

      const model = await spark.getModel()

      expect(model).toBe('model-1')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/models'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('should return cached model on subsequent calls', async () => {
      const mockModelsResponse = {
        data: [{ id: 'cached-model' }],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockModelsResponse,
      })

      await spark.getModel()
      const model2 = await spark.getModel()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(model2).toBe('cached-model')
    })

    it('should throw error when no models available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      })

      await expect(spark.getModel()).rejects.toThrow('No models available')
    })

    it('should throw error when /v1/models endpoint fails', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'))

      await expect(spark.getModel()).rejects.toThrow('Failed to connect to vLLM')
    })
  })

  describe('generateChatResponse', () => {
    it('should call /v1/chat/completions with correct format and parse streaming response', async () => {
      // First mock for model discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'test-model' }] }),
      })

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices": [{"delta": {"content": "Hello"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: {"choices": [{"delta": {"content": " world"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      // Second mock for chat completions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      })

      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hello' },
      ]

      const response = await spark.generateChatResponse(messages, 'Bulgarian', 'beginner', 'French', 'Test User')

      expect(response).toBe('Hello world')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('stream'),
        })
      )
    })

    it('should include chat_template_kwargs with enable_thinking: false', async () => {
      // First mock for model discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'test-model' }] }),
      })

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices": [{"delta": {"content": "test"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      })

      await spark.generateChatResponse(
        [{ role: 'user' as const, content: 'test' }],
        'Bulgarian',
        'beginner',
        'French',
        'User'
      )

      const callArgs = mockFetch.mock.calls[1][1]
      const body = JSON.parse(callArgs.body)
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
    })

    it('should handle connection timeout', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'))

      await expect(
        spark.generateChatResponse(
          [{ role: 'user' as const, content: 'test' }],
          'Bulgarian',
          'beginner',
          'French',
          'User'
        )
      ).rejects.toThrow('Failed to connect to vLLM')
    })

    it('should handle SSE parsing errors gracefully', async () => {
      // First mock for model discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'test-model' }] }),
      })

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: invalid json\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      })

      await expect(
        spark.generateChatResponse(
          [{ role: 'user' as const, content: 'test' }],
          'Bulgarian',
          'beginner',
          'French',
          'User'
        )
      ).rejects.toThrow('Failed to parse SSE response')
    })
  })

  describe('analyzeGrammar', () => {
    it('should parse JSON response correctly', async () => {
      // First mock for model discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'grammar-model' }] }),
      })

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 'minor',
                explanation: 'Small grammar error',
                correctedSentence: 'Corrected sentence',
                corrections: [
                  { original: 'wrong', corrected: 'right', reason: 'grammar rule' },
                ],
              }),
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await spark.analyzeGrammar('test message', 'Bulgarian', 'French')

      expect(result.score).toBe('minor')
      expect(result.explanation).toBe('Small grammar error')
      expect(result.correctedSentence).toBe('Corrected sentence')
      expect(result.corrections).toHaveLength(1)
    })

    it('should return default values when response is empty', async () => {
      // First mock for model discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'grammar-model' }] }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      })

      const result = await spark.analyzeGrammar('test message', 'Bulgarian', 'French')

      expect(result.score).toBe('perfect')
      expect(result.explanation).toBe('')
    })

    it('should handle JSON parsing errors', async () => {
      // First mock for model discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'grammar-model' }] }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'invalid json' } }],
        }),
      })

      const result = await spark.analyzeGrammar('test message', 'Bulgarian', 'French')

      expect(result.score).toBe('perfect')
      expect(result.explanation).toBe('')
    })

    it('should use the cached model for grammar analysis', async () => {
      const mockModelsResponse = { data: [{ id: 'grammar-model' }] }
      const mockGrammarResponse = {
        choices: [{ message: { content: JSON.stringify({ score: 'perfect', explanation: '' }) } }],
      }

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockGrammarResponse })

      await spark.analyzeGrammar('test', 'Bulgarian', 'French')

      // First call is for model discovery, second for grammar analysis
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        body: expect.stringContaining('grammar-model'),
      })
    })
  })
})

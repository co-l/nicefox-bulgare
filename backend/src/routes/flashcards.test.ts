import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock the db module
const mockRunQuery = vi.fn()
const mockRunSingleQuery = vi.fn()

vi.mock('../db.js', () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
  runSingleQuery: (...args: unknown[]) => mockRunSingleQuery(...args),
}))

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as { userId?: string }).userId = 'test-user-123'
    next()
  },
  AuthRequest: {},
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-flashcard-uuid'),
}))

// Mock spaced repetition
vi.mock('../utils/spacedRepetition.js', () => ({
  getInitialReview: vi.fn().mockReturnValue({
    nextDisplay: new Date('2024-01-01T03:00:00Z'),
    newIntervalIndex: 0,
    status: 'new',
  }),
  calculateNextReview: vi.fn().mockImplementation((intervalIndex: number, action: string) => {
    if (action === 'easy') {
      return {
        nextDisplay: new Date('2024-01-02T03:00:00Z'),
        newIntervalIndex: intervalIndex + 1,
        status: 'learning',
      }
    }
    if (action === 'hard') {
      return {
        nextDisplay: new Date('2024-01-01T15:00:00Z'),
        newIntervalIndex: intervalIndex,
        status: 'learning',
      }
    }
    return {
      nextDisplay: new Date('2024-01-02T03:00:00Z'),
      newIntervalIndex: 0,
      status: 'learning',
    }
  }),
}))

import flashcardsRouter from './flashcards.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/flashcards', flashcardsRouter)
  return app
}

describe('Flashcards Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /', () => {
    it('should return all flashcards', async () => {
      // Mock flashcards found - NiceFox GraphDB format (flat)
      mockRunQuery.mockResolvedValueOnce([
        {
          f: {
            id: 'fc-1',
            native: 'bonjour',
            target: 'zdravei',
            original_word: 'zdravei',
            part_of_speech: 'greeting',
            forms: null,
          },
          rel: {
            next_display: Date.now() + 86400000,
            interval_index: 1,
            status: 'learning',
          },
        },
      ])

      const app = createApp()
      const res = await request(app).get('/api/flashcards')

      expect(res.status).toBe(200)
      expect(res.body.flashcards).toHaveLength(1)
      expect(res.body.flashcards[0]).toMatchObject({
        id: 'fc-1',
        native: 'bonjour',
        target: 'zdravei',
        originalWord: 'zdravei',
        partOfSpeech: 'greeting',
        intervalIndex: 1,
        status: 'learning',
      })
    })
  })

  describe('GET /due-count', () => {
    it('should return count of due flashcards', async () => {
      mockRunSingleQuery.mockResolvedValueOnce({ count: 5 })

      const app = createApp()
      const res = await request(app).get('/api/flashcards/due-count')

      expect(res.status).toBe(200)
      expect(res.body.count).toBe(5)
    })

    it('should return 0 when no flashcards due', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app).get('/api/flashcards/due-count')

      expect(res.status).toBe(200)
      expect(res.body.count).toBe(0)
    })
  })

  describe('GET /session', () => {
    it('should return due flashcards for session', async () => {
      mockRunQuery.mockResolvedValueOnce([
        {
          f: {
            id: 'fc-1',
            native: 'bonjour',
            target: 'zdravei',
          },
          rel: {
            next_display: Date.now() - 1000,
            interval_index: 0,
            status: 'new',
          },
        },
      ])

      const app = createApp()
      const res = await request(app).get('/api/flashcards/session')

      expect(res.status).toBe(200)
      expect(res.body.cards).toHaveLength(1)
    })
  })

  describe('POST /', () => {
    it('should create a new flashcard', async () => {
      // Mock language lookup
      mockRunSingleQuery.mockResolvedValueOnce({
        l: { language: 'Bulgarian' },
      })
      // Mock creation
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .post('/api/flashcards')
        .send({
          native: 'bonjour',
          target: 'zdravei',
          originalWord: 'zdravei',
          partOfSpeech: 'greeting',
        })

      expect(res.status).toBe(201)
      expect(res.body.flashcard).toMatchObject({
        id: 'test-flashcard-uuid',
        native: 'bonjour',
        target: 'zdravei',
      })
    })

    it('should return 400 if native/target missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/flashcards')
        .send({ native: 'bonjour' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Native and target words are required')
    })

    it('should return 400 if no language set up', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/flashcards')
        .send({ native: 'bonjour', target: 'zdravei' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No target language found. Please set up a language first.')
    })
  })

  describe('POST /:id/review', () => {
    it('should update flashcard after easy review', async () => {
      // Mock flashcard lookup
      mockRunSingleQuery.mockResolvedValueOnce({
        f: { id: 'fc-1' },
        rel: { interval_index: 0 },
      })
      // Mock update
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .post('/api/flashcards/fc-1/review')
        .send({ action: 'easy' })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        intervalIndex: 1,
        status: 'learning',
      })
    })

    it('should return 404 if flashcard not found', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/flashcards/fc-nonexistent/review')
        .send({ action: 'easy' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Flashcard not found')
    })

    it('should return 400 if invalid action', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/flashcards/fc-1/review')
        .send({ action: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid action. Must be easy, hard, or again.')
    })
  })

  describe('DELETE /:id', () => {
    it('should delete a flashcard', async () => {
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app).delete('/api/flashcards/fc-1')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Flashcard deleted')
    })
  })
})

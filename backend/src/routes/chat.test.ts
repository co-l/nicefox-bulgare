import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { authMiddleware } from '../shared/middleware.js'

// Mock the db module
const mockRunQuery = vi.fn()
const mockRunSingleQuery = vi.fn()

vi.mock('../db.js', () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
  runSingleQuery: (...args: unknown[]) => mockRunSingleQuery(...args),
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-chat-uuid'),
}))

// Mock mistral service
vi.mock('../services/mistral.js', () => ({
  generateChatResponse: vi.fn().mockResolvedValue('Hello! How can I help you today?'),
  analyzeGrammar: vi.fn().mockResolvedValue({
    original: 'test message',
    corrected: 'test message',
    isCorrect: true,
    explanation: null,
  }),
}))

import chatRouter from './chat.js'

const JWT_SECRET = 'test-secret-for-testing'

// Helper to create a valid JWT token
function createToken(userId: string, email: string, role: 'user' | 'admin' = 'user') {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '15m' })
}

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  const auth = authMiddleware({ jwtSecret: JWT_SECRET })
  app.use('/api/chat', auth, chatRouter)
  return app
}

describe('Chat Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validToken = createToken('test-user-123', 'test@example.com')

  describe('GET /history', () => {
    it('should return chat history', async () => {
      // Mock chats found
      mockRunQuery.mockResolvedValueOnce([
        {
          c: {
            id: 'chat-1',
            messages: JSON.stringify([{ role: 'assistant', content: 'Hello!', timestamp: '2024-01-01T00:00:00Z' }]),
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        },
      ])

      const app = createApp()
      const res = await request(app)
        .get('/api/chat/history')
        .set('Cookie', [`auth_token=${validToken}`])

      expect(res.status).toBe(200)
      expect(res.body.chats).toHaveLength(1)
      expect(res.body.chats[0]).toHaveProperty('id', 'chat-1')
    })

    it('should return 401 without authentication', async () => {
      const app = createApp()
      const res = await request(app).get('/api/chat/history')

      expect(res.status).toBe(401)
    })
  })

  describe('GET /:id', () => {
    it('should return a specific chat', async () => {
      mockRunSingleQuery.mockResolvedValueOnce({
        c: {
          id: 'chat-1',
          messages: JSON.stringify([
            { role: 'assistant', content: 'Hello!', timestamp: '2024-01-01T00:00:00Z' },
          ]),
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      })

      const app = createApp()
      const res = await request(app)
        .get('/api/chat/chat-1')
        .set('Cookie', [`auth_token=${validToken}`])

      expect(res.status).toBe(200)
      expect(res.body.id).toBe('chat-1')
      expect(res.body.messages).toHaveLength(1)
    })

    it('should return 404 if chat not found', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .get('/api/chat/nonexistent')
        .set('Cookie', [`auth_token=${validToken}`])

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Chat not found')
    })
  })

  describe('POST /start', () => {
    it('should start a new chat', async () => {
      // Mock user language lookup
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          name: 'Test User',
          native_language: 'French',
        },
        l: {
          language: 'Bulgarian',
          proficiency: 'beginner',
        },
      })

      // Mock chat creation
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .post('/api/chat/start')
        .set('Cookie', [`auth_token=${validToken}`])

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('chatId', 'test-chat-uuid')
      expect(res.body.messages).toHaveLength(1)
    })

    it('should return 400 if no language set', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/chat/start')
        .set('Cookie', [`auth_token=${validToken}`])

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No target language set. Please complete onboarding.')
    })
  })

  describe('POST /', () => {
    it('should send a message to existing chat', async () => {
      // Mock user language lookup
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          name: 'Test User',
          native_language: 'French',
        },
        l: {
          language: 'Bulgarian',
          proficiency: 'beginner',
        },
      })

      // Mock existing chat lookup
      mockRunSingleQuery.mockResolvedValueOnce({
        c: {
          id: 'existing-chat',
          messages: JSON.stringify([
            { role: 'assistant', content: 'Hello!', timestamp: '2024-01-01T00:00:00Z' },
          ]),
        },
      })

      // Mock chat update
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .post('/api/chat')
        .set('Cookie', [`auth_token=${validToken}`])
        .send({
          chatId: 'existing-chat',
          message: 'Zdravei!',
        })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('chatId', 'existing-chat')
      expect(res.body).toHaveProperty('response')
    })

    it('should create new chat if no chatId provided', async () => {
      // Mock user language lookup
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          name: 'Test User',
          native_language: 'French',
        },
        l: {
          language: 'Bulgarian',
          proficiency: 'beginner',
        },
      })

      // Mock chat creation
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .post('/api/chat')
        .set('Cookie', [`auth_token=${validToken}`])
        .send({
          message: 'Zdravei!',
        })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('chatId', 'test-chat-uuid')
    })

    it('should return 400 if message is missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/chat')
        .set('Cookie', [`auth_token=${validToken}`])
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Message is required')
    })

    it('should return 400 if no language set', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/chat')
        .set('Cookie', [`auth_token=${validToken}`])
        .send({ message: 'Hello' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No target language set. Please complete onboarding.')
    })
  })
})

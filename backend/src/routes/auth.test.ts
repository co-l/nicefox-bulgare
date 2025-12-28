import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'test-secret-for-testing'

// Set environment BEFORE importing modules that use them
process.env.JWT_SECRET = JWT_SECRET
process.env.NODE_ENV = 'test'

// Mock the db module
const mockRunQuery = vi.fn()
const mockRunSingleQuery = vi.fn()

vi.mock('../db.js', () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
  runSingleQuery: (...args: unknown[]) => mockRunSingleQuery(...args),
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1234'),
}))

// Import after setting env and mocks
const { default: authRouter } = await import('./auth.js')

// Helper to create a valid JWT token
function createToken(userId: string, email: string, role: 'user' | 'admin' = 'user') {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '15m' })
}

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/auth', authRouter)
  return app
}

describe('Auth Routes (SSO)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /me', () => {
    it('should return user data when authenticated with valid token', async () => {
      const token = createToken('user-123', 'test@example.com')
      
      // Mock: no existing user found first, then user created
      mockRunSingleQuery.mockResolvedValueOnce(null) // ensureUserExists check
      mockRunQuery.mockResolvedValueOnce([]) // user creation
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          native_language: 'French',
        },
      })

      const app = createApp()
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`auth_token=${token}`])

      expect(res.status).toBe(200)
      expect(res.body.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        nativeLanguage: 'French',
      })
    })

    it('should return user data when existing user is found', async () => {
      const token = createToken('user-123', 'test@example.com')
      
      // Mock: existing user found
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Existing User',
        },
      }) // ensureUserExists check - user exists
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Existing User',
          native_language: null,
        },
      })

      const app = createApp()
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`auth_token=${token}`])

      expect(res.status).toBe(200)
      expect(res.body.user.name).toBe('Existing User')
    })

    it('should return 401 when no token provided', async () => {
      const app = createApp()
      const res = await request(app)
        .get('/api/auth/me')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
      expect(res.body).toHaveProperty('loginUrl')
    })

    it('should return 401 when invalid token provided', async () => {
      const app = createApp()
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', ['auth_token=invalid-token'])

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Unauthorized')
    })

    it('should accept token via Authorization header in dev mode', async () => {
      const token = createToken('user-123', 'test@example.com')
      
      mockRunSingleQuery.mockResolvedValueOnce({
        u: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
      })
      mockRunSingleQuery.mockResolvedValueOnce({
        u: { id: 'user-123', email: 'test@example.com', name: 'Test User', native_language: null },
      })

      const app = createApp()
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
    })
  })

  describe('POST /logout', () => {
    it('should return logout URL', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/logout')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out successfully')
      expect(res.body).toHaveProperty('logoutUrl')
      expect(res.body.logoutUrl).toContain('auth.nicefox.net')
    })
  })
})

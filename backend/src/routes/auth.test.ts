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

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockImplementation((password: string, hash: string) => {
      return Promise.resolve(password === 'correctpassword')
    }),
  },
}))

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1234'),
}))

// Mock JWT functions
vi.mock('../middleware/auth.js', () => ({
  generateAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  verifyRefreshToken: vi.fn().mockImplementation((token: string) => {
    if (token === 'valid-refresh-token') {
      return { userId: 'user-123' }
    }
    throw new Error('Invalid token')
  }),
}))

import authRouter from './auth.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  return app
}

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      // Mock: no existing user found
      mockRunSingleQuery.mockResolvedValueOnce(null)
      // Mock: user creation succeeds
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('accessToken', 'mock-access-token')
      expect(res.body).toHaveProperty('refreshToken', 'mock-refresh-token')
      expect(res.body.user).toEqual({
        id: 'test-uuid-1234',
        email: 'test@example.com',
        name: 'Test User',
        nativeLanguage: null,
      })

      // Verify the query was called with correct params
      expect(mockRunSingleQuery).toHaveBeenCalledWith(
        'MATCH (u:BF_User {email: $email}) RETURN u',
        { email: 'test@example.com' }
      )
    })

    it('should return 400 if email already exists', async () => {
      // Mock: existing user found - NiceFox GraphDB format (flat)
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'existing-user',
          email: 'test@example.com',
          name: 'Existing User',
        },
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Email already registered')
    })

    it('should return 400 if required fields are missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Email, password, and name are required')
    })
  })

  describe('POST /login', () => {
    it('should login successfully with correct credentials', async () => {
      // Mock: user found - NiceFox GraphDB format (flat)
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          password_hash: 'hashed_password',
          native_language: 'French',
        },
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'correctpassword',
        })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('accessToken', 'mock-access-token')
      expect(res.body).toHaveProperty('refreshToken', 'mock-refresh-token')
      expect(res.body.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        nativeLanguage: 'French',
      })
    })

    it('should return 401 if user not found', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid credentials')
    })

    it('should return 401 if password is incorrect', async () => {
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          password_hash: 'hashed_password',
        },
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid credentials')
    })

    it('should return 400 if required fields are missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Email and password are required')
    })
  })

  describe('POST /refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'valid-refresh-token',
        })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('accessToken', 'mock-access-token')
    })

    it('should return 401 with invalid refresh token', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid refresh token')
    })

    it('should return 400 if refresh token is missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Refresh token required')
    })
  })

  describe('POST /logout', () => {
    it('should logout successfully', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/logout')
        .send({
          refreshToken: 'some-refresh-token',
        })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out successfully')
    })

    it('should logout even without refresh token', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/auth/logout')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Logged out successfully')
    })
  })
})

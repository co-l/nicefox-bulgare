import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

import jwt from 'jsonwebtoken'
import { authMiddleware } from 'nicefox-auth'

// Mock the db module
const mockRunQuery = vi.fn()
const mockRunSingleQuery = vi.fn()

vi.mock('../db.js', () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
  runSingleQuery: (...args: unknown[]) => mockRunSingleQuery(...args),
}))

import userRouter from './user.js'

const JWT_SECRET = 'test-secret-for-testing'

// Helper to create a valid JWT token (nicefox-auth expects userId in payload)
function createToken(userId: string, email: string, role: 'user' | 'admin' = 'user') {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '15m' })
}

function createApp() {
  const app = express()
  app.use(express.json())
  // Apply auth middleware
  const auth = authMiddleware({ jwtSecret: JWT_SECRET })
  app.use('/api/user', auth, userRouter)
  return app
}

describe('User Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validToken = createToken('test-user-123', 'test@example.com')

  describe('GET /profile', () => {
    it('should return user profile with languages', async () => {
      // Mock user found
      mockRunSingleQuery.mockResolvedValueOnce({
        u: {
          id: 'test-user-123',
          email: 'test@example.com',
          name: 'Test User',
          native_language: 'French',
        },
      })

      // Mock languages found
      mockRunQuery.mockResolvedValueOnce([
        {
          l: {
            language: 'Bulgarian',
            proficiency: 'beginner',
          },
        },
      ])

      const app = createApp()
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.user).toEqual({
        id: 'test-user-123',
        email: 'test@example.com',
        name: 'Test User',
        nativeLanguage: 'French',
      })
      expect(res.body.languages).toEqual([
        { language: 'Bulgarian', proficiency: 'beginner' },
      ])
    })

    it('should return 404 if user not found', async () => {
      mockRunSingleQuery.mockResolvedValueOnce(null)

      const app = createApp()
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${validToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('should return 401 without authentication', async () => {
      const app = createApp()
      const res = await request(app).get('/api/user/profile')

      expect(res.status).toBe(401)
    })
  })

  describe('PUT /profile', () => {
    it('should update user name', async () => {
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ name: 'Updated Name' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Profile updated')
      expect(mockRunQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET u.name = $name'),
        expect.objectContaining({ name: 'Updated Name', userId: 'test-user-123' })
      )
    })

    it('should update native language', async () => {
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ nativeLanguage: 'English' })

      expect(res.status).toBe(200)
      expect(mockRunQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET u.native_language = $nativeLanguage'),
        expect.objectContaining({ nativeLanguage: 'English' })
      )
    })

    it('should return 400 if no updates provided', async () => {
      const app = createApp()
      const res = await request(app)
        .put('/api/user/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No updates provided')
    })
  })

  describe('GET /languages', () => {
    it('should return list of languages', async () => {
      mockRunQuery.mockResolvedValueOnce([
        {
          l: {
            language: 'Bulgarian',
            proficiency: 'beginner',
          },
        },
        {
          l: {
            language: 'Spanish',
            proficiency: 'intermediate',
          },
        },
      ])

      const app = createApp()
      const res = await request(app)
        .get('/api/user/languages')
        .set('Authorization', `Bearer ${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.languages).toEqual([
        { language: 'Bulgarian', proficiency: 'beginner' },
        { language: 'Spanish', proficiency: 'intermediate' },
      ])
    })
  })

  describe('POST /languages', () => {
    it('should add a new language', async () => {
      // Mock: MERGE creates new language, returns created=true
      mockRunQuery.mockResolvedValueOnce([{ created: true }])

      const app = createApp()
      const res = await request(app)
        .post('/api/user/languages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ language: 'Bulgarian', proficiency: 'beginner' })

      expect(res.status).toBe(201)
      expect(res.body.message).toBe('Language added')
    })

    it('should return 400 if already learning language', async () => {
      // Mock: MERGE finds existing language, returns created=false
      mockRunQuery.mockResolvedValueOnce([{ created: false }])

      const app = createApp()
      const res = await request(app)
        .post('/api/user/languages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ language: 'Bulgarian', proficiency: 'beginner' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Already learning this language')
    })

    it('should return 400 if invalid proficiency', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/user/languages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ language: 'Bulgarian', proficiency: 'expert' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid proficiency level')
    })

    it('should return 400 if missing required fields', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/user/languages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ language: 'Bulgarian' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Language and proficiency are required')
    })
  })

  describe('PUT /languages/:language', () => {
    it('should update language proficiency', async () => {
      mockRunQuery.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app)
        .put('/api/user/languages/Bulgarian')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ proficiency: 'intermediate' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Language updated')
    })

    it('should return 400 if invalid proficiency', async () => {
      const app = createApp()
      const res = await request(app)
        .put('/api/user/languages/Bulgarian')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ proficiency: 'expert' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid proficiency level')
    })
  })
})

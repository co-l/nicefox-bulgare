import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import { runQuery, runSingleQuery } from '../db.js'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth.js'

const router = Router()

const invalidatedTokens = new Set<string>()

interface UserRecord {
  u: {
    properties: {
      id: string
      email: string
      name: string
      password_hash: string
      native_language?: string
    }
  }
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' })
      return
    }

    const existing = await runSingleQuery<UserRecord>(
      'MATCH (u:BF_User {email: $email}) RETURN u',
      { email }
    )

    if (existing) {
      res.status(400).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userId = uuidv4()

    await runQuery(
      `CREATE (u:BF_User {
        id: $id,
        email: $email,
        password_hash: $passwordHash,
        name: $name,
        created_at: timestamp()
      })`,
      { id: userId, email, passwordHash, name }
    )

    const accessToken = generateAccessToken(userId)
    const refreshToken = generateRefreshToken(userId)

    res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: userId, email, name, nativeLanguage: null },
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const result = await runSingleQuery<UserRecord>(
      'MATCH (u:BF_User {email: $email}) RETURN u',
      { email }
    )

    if (!result) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const user = result.u.properties
    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken(user.id)

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nativeLanguage: user.native_language || null,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' })
      return
    }

    if (invalidatedTokens.has(refreshToken)) {
      res.status(401).json({ error: 'Token has been invalidated' })
      return
    }

    const decoded = verifyRefreshToken(refreshToken)
    const accessToken = generateAccessToken(decoded.userId)

    res.json({ accessToken })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body

    if (refreshToken) {
      invalidatedTokens.add(refreshToken)
    }

    res.json({ message: 'Logged out successfully' })
  } catch {
    res.status(500).json({ error: 'Logout failed' })
  }
})

export default router

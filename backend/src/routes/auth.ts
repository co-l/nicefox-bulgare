import { Router, Request, Response } from 'express'
import { runQuery, runSingleQuery } from '../db.js'
import { authMiddleware, getLoginUrl, getJwtSecret } from 'nicefox-auth'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

const JWT_SECRET = getJwtSecret()
const AUTH_SERVICE_URL = 'https://auth.nicefox.net'

// NiceFox GraphDB returns node objects directly
interface UserRecord {
  u: {
    id: string
    email: string
    name: string
    native_language?: string
  }
}

// Ensure user exists in database (SSO users are created on first /me call)
async function ensureUserExists(authId: string, email: string): Promise<void> {
  // Use MERGE to avoid race conditions creating duplicate users
  // Native language defaults to French (app is for French speakers learning Bulgarian)
  await runQuery(
    `MERGE (u:BF_User {id: $id})
     ON CREATE SET u.email = $email,
                   u.name = $name,
                   u.native_language = $nativeLanguage,
                   u.created_at = $createdAt`,
    { id: authId, email, name: email.split('@')[0], nativeLanguage: 'French', createdAt: Date.now() }
  )
}

// SSO auth middleware for /me endpoint
const ssoAuth = authMiddleware({
  jwtSecret: JWT_SECRET,
  onUnauthorized: (_req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5180'
    const loginUrl = getLoginUrl(frontendUrl)
    res.status(401).json({
      error: 'Unauthorized',
      loginUrl
    })
  },
})

// Check current auth status - used by frontend to verify token
// Also ensures user node exists in database on first login
router.get('/me', ssoAuth, async (req: Request, res: Response) => {
  try {
    // Ensure user exists in database (SSO users are created on first /me call)
    await ensureUserExists(req.authUser!.id, req.authUser!.email)

    // Fetch user data from database to get full profile (name, etc.)
    const result = await runSingleQuery<UserRecord>(
      'MATCH (u:BF_User {id: $id}) RETURN u',
      { id: req.authUser!.id }
    )

    if (!result) {
      res.status(500).json({ error: 'Failed to fetch user data' })
      return
    }

    const user = result.u
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nativeLanguage: user.native_language || null,
      },
    })
  } catch (error) {
    console.error('Error in /auth/me - ensureUserExists failed for user:', req.authUser!.id, req.authUser!.email)
    console.error('Error details:', error)
    res.status(500).json({ error: 'Failed to sync user to database' })
  }
})

// Logout - clears local state, frontend handles token removal
router.post('/logout', (_req: Request, res: Response) => {
  res.json({
    message: 'Logged out successfully',
    logoutUrl: `${AUTH_SERVICE_URL}/logout`,
  })
})

export default router

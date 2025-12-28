import { Router, Request, Response } from 'express'
import { runQuery, runSingleQuery } from '../db.js'
import { authMiddleware, getLoginUrl } from '../shared/middleware.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'https://auth.nicefox.net'

// NiceFox GraphDB returns node objects with properties nested
interface UserRecord {
  u: {
    properties: {
      id: string
      email: string
      name: string
      native_language?: string
    }
  }
}

// Ensure user exists in database (SSO users are created on first /me call)
async function ensureUserExists(authId: string, email: string): Promise<void> {
  // Check if user already exists with this SSO ID
  const existing = await runSingleQuery<UserRecord>(
    'MATCH (u:BF_User {id: $id}) RETURN u',
    { id: authId }
  )

  if (!existing) {
    // Create new user with SSO ID
    // Native language defaults to French (app is for French speakers learning Bulgarian)
    await runQuery(
      `CREATE (u:BF_User {
        id: $id,
        email: $email,
        name: $name,
        native_language: $nativeLanguage,
        created_at: $createdAt
      })`,
      { id: authId, email, name: email.split('@')[0], nativeLanguage: 'French', createdAt: Date.now() }
    )
  }
}

// SSO auth middleware for /me endpoint
const ssoAuth = authMiddleware({
  jwtSecret: JWT_SECRET,
  authServiceUrl: AUTH_SERVICE_URL,
  onUnauthorized: (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5180'
    // Add token_in_url=true for non-.nicefox.net domains (dev mode)
    const needTokenInUrl = !req.get('host')?.endsWith('.nicefox.net')
    const tokenParam = needTokenInUrl ? '&token_in_url=true' : ''
    const loginUrl = getLoginUrl(AUTH_SERVICE_URL, frontendUrl) + tokenParam
    res.status(401).json({
      error: 'Unauthorized',
      loginUrl
    })
  },
})

// Check current auth status - used by frontend to verify SSO cookie
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

    const user = result.u.properties
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

// Logout - clears any local state (SSO cookie is managed by auth.nicefox.net)
router.post('/logout', (_req: Request, res: Response) => {
  // The actual auth cookie is httpOnly on .nicefox.net domain
  // We can't clear it from here, but we can redirect to SSO logout if needed
  res.json({
    message: 'Logged out successfully',
    // Frontend can redirect here if full logout is needed
    logoutUrl: `${AUTH_SERVICE_URL}/logout`,
  })
})

export default router

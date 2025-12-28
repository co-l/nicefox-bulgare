import { Request, Response, NextFunction, RequestHandler } from 'express'
import { verifyToken } from './jwt.js'
import type { AuthUser, TokenPayload } from './types.js'

const COOKIE_NAME = 'auth_token'

// Development mode: check for token in Authorization header as fallback
// This allows local development without .nicefox.net cookie domain
function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production'
}

// Extend Express Request to include auth user
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
      tokenPayload?: TokenPayload
    }
  }
}

export interface AuthMiddlewareOptions {
  jwtSecret: string
  authServiceUrl?: string
  onUnauthorized?: (req: Request, res: Response) => void
}

/**
 * Express middleware to verify JWT from auth_token cookie.
 * Attaches authUser and tokenPayload to request.
 * 
 * Usage:
 * ```typescript
 * import { authMiddleware } from './shared/middleware'
 * 
 * app.use('/api', authMiddleware({ jwtSecret: process.env.JWT_SECRET }))
 * ```
 */
export function authMiddleware(options: AuthMiddlewareOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    let token: string | undefined
    
    // In dev mode, check Authorization header FIRST (takes precedence over cookie)
    // This allows the fresh token from localStorage/URL to override stale cookies
    if (isDevMode()) {
      const authHeader = req.headers.authorization
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7)
      }
    }
    
    // Fall back to cookie if no Authorization header
    if (!token) {
      token = req.cookies?.[COOKIE_NAME]
    }

    if (!token) {
      if (options.onUnauthorized) {
        options.onUnauthorized(req, res)
        return
      }
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const payload = verifyToken(token, options.jwtSecret)
    if (!payload) {
      if (options.onUnauthorized) {
        options.onUnauthorized(req, res)
        return
      }
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    // Attach user info to request
    req.authUser = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    }
    req.tokenPayload = payload

    next()
  }
}

/**
 * Middleware to require admin role.
 * Must be used after authMiddleware.
 */
export function requireAdmin(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (req.authUser.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' })
      return
    }

    next()
  }
}

/**
 * Optional auth middleware - doesn't fail if no token present.
 * Use for routes that work for both authenticated and unauthenticated users.
 */
export function optionalAuthMiddleware(options: Pick<AuthMiddlewareOptions, 'jwtSecret'>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.[COOKIE_NAME]

    if (token) {
      const payload = verifyToken(token, options.jwtSecret)
      if (payload) {
        req.authUser = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
        }
        req.tokenPayload = payload
      }
    }

    next()
  }
}

/**
 * Helper to get login URL for redirecting unauthenticated users.
 */
export function getLoginUrl(authServiceUrl: string, redirectUrl?: string): string {
  const base = `${authServiceUrl}/login`
  if (redirectUrl) {
    return `${base}?redirect=${encodeURIComponent(redirectUrl)}`
  }
  return base
}

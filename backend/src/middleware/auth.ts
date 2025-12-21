import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
}

export interface TokenPayload {
  userId: string
  type: 'access' | 'refresh'
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new Error('JWT_SECRET not configured')
    }

    const decoded = jwt.verify(token, secret) as TokenPayload

    if (decoded.type !== 'access') {
      res.status(401).json({ error: 'Invalid token type' })
      return
    }

    req.userId = decoded.userId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function generateAccessToken(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not configured')

  return jwt.sign({ userId, type: 'access' }, secret, { expiresIn: '15m' })
}

export function generateRefreshToken(userId: string): string {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured')

  return jwt.sign({ userId, type: 'refresh' }, secret, { expiresIn: '7d' })
}

export function verifyRefreshToken(token: string): TokenPayload {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured')

  const decoded = jwt.verify(token, secret) as TokenPayload

  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type')
  }

  return decoded
}

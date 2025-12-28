import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { verifyConnection, closeConnection } from './db.js'
import { authMiddleware, getLoginUrl } from './shared/middleware.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import flashcardRoutes from './routes/flashcards.js'
import chatRoutes from './routes/chat.js'
import translateRoutes from './routes/translate.js'
import ttsRoutes from './routes/tts.js'
import sttRoutes from './routes/stt.js'

const app = express()
const PORT = process.env.PORT || 3188

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'https://auth.nicefox.net'

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5180',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.get('/api/health', async (_req, res) => {
  const dbConnected = await verifyConnection()
  res.json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
})

// Auth routes (handles /api/auth/me for checking auth status)
app.use('/api/auth', authRoutes)

// SSO auth middleware for protected routes
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

// Protected routes
app.use('/api/user', ssoAuth, userRoutes)
app.use('/api/flashcards', ssoAuth, flashcardRoutes)
app.use('/api/chat', ssoAuth, chatRoutes)
app.use('/api/translate', ssoAuth, translateRoutes)
app.use('/api/tts', ssoAuth, ttsRoutes)
app.use('/api/stt', ssoAuth, sttRoutes)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

async function start() {
  const dbConnected = await verifyConnection()
  if (!dbConnected) {
    console.warn('Warning: Database not connected. Some features may not work.')
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

process.on('SIGINT', async () => {
  await closeConnection()
  process.exit(0)
})

start()

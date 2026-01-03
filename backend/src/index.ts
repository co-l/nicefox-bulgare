import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { verifyConnection, closeConnection } from './db.js'
import { authMiddleware, getLoginUrl, getJwtSecret } from 'nicefox-auth'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import flashcardRoutes from './routes/flashcards.js'
import chatRoutes from './routes/chat.js'
import translateRoutes from './routes/translate.js'
import ttsRoutes from './routes/tts.js'
import sttRoutes from './routes/stt.js'

const app = express()
const PORT = process.env.PORT || 3188

const JWT_SECRET = getJwtSecret()

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5180',
  credentials: true,
}))
app.use(express.json())

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
  onUnauthorized: (_req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5180'
    const loginUrl = getLoginUrl(frontendUrl)
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
app.use('/api/tts', ttsRoutes)
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

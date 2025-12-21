import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { verifyConnection, closeConnection } from './db.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import flashcardRoutes from './routes/flashcards.js'
import chatRoutes from './routes/chat.js'
import translateRoutes from './routes/translate.js'
import ttsRoutes from './routes/tts.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/flashcards', flashcardRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/translate', translateRoutes)
app.use('/api/tts', ttsRoutes)

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

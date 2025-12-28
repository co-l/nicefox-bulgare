import { Router, Request, Response } from 'express'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { runSingleQuery } from '../db.js'
import { generateAudio, getAudioPath } from '../services/tts.js'
import { authMiddleware, getLoginUrl } from '../shared/middleware.js'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'https://auth.nicefox.net'

const ssoAuth = authMiddleware({
  jwtSecret: JWT_SECRET,
  authServiceUrl: AUTH_SERVICE_URL,
  onUnauthorized: (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5180'
    const needTokenInUrl = !req.get('host')?.endsWith('.nicefox.net')
    const tokenParam = needTokenInUrl ? '&token_in_url=true' : ''
    const loginUrl = getLoginUrl(AUTH_SERVICE_URL, frontendUrl) + tokenParam
    res.status(401).json({
      error: 'Unauthorized',
      loginUrl
    })
  },
})

interface UserLanguageRecord {
  l: {
    properties: {
      language: string
    }
  }
}

// Stream audio file (public - audio IDs are random UUIDs that expire)
router.get('/audio/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    console.log(`[TTS] Audio requested: ${id}`)

    const filePath = getAudioPath(id)
    if (!filePath) {
      console.error(`[TTS] Audio file not found: ${id}`)
      res.status(404).json({ error: 'Audio not found' })
      return
    }

    console.log(`[TTS] Streaming audio file: ${filePath}`)
    const stats = await stat(filePath)
    console.log(`[TTS] File size: ${stats.size} bytes`)

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', stats.size)
    res.setHeader('Accept-Ranges', 'bytes')

    const stream = createReadStream(filePath)
    stream.pipe(res)
  } catch (error) {
    console.error('[TTS] Audio streaming error:', error)
    res.status(500).json({ error: 'Failed to stream audio' })
  }
})

// Generate audio from text (requires auth)
router.post('/generate', ssoAuth, async (req: Request, res: Response) => {
  try {
    const { text } = req.body

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required' })
      return
    }

    if (text.length > 1000) {
      res.status(400).json({ error: 'Text too long (max 1000 characters)' })
      return
    }

    console.log(`[TTS] Generate request from user ${req.authUser!.id}`)

    // Get user's target language
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN l LIMIT 1`,
      { userId: req.authUser!.id }
    )

    const language = userLang?.l.properties.language || 'english'
    console.log(`[TTS] User language: ${language}`)

    const { audioId } = await generateAudio(text, language)

    console.log(`[TTS] Audio generated successfully: ${audioId}`)
    res.json({ audioId })
  } catch (error) {
    console.error('[TTS] TTS generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate audio'
    res.status(500).json({ error: errorMessage })
  }
})

export default router

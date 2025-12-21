import { Router, Request, Response } from 'express'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { runSingleQuery } from '../db.js'
import { generateAudio, getAudioPath } from '../services/tts.js'

const router = Router()

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

    const filePath = getAudioPath(id)
    if (!filePath) {
      res.status(404).json({ error: 'Audio not found' })
      return
    }

    const stats = await stat(filePath)

    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Content-Length', stats.size)
    res.setHeader('Accept-Ranges', 'bytes')

    const stream = createReadStream(filePath)
    stream.pipe(res)
  } catch (error) {
    console.error('Audio streaming error:', error)
    res.status(500).json({ error: 'Failed to stream audio' })
  }
})

// Generate audio from text (requires auth)
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
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

    // Get user's target language
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN l LIMIT 1`,
      { userId: req.userId }
    )

    const language = userLang?.l.properties.language || 'english'

    const { audioId } = await generateAudio(text, language)

    res.json({ audioId })
  } catch (error) {
    console.error('TTS generation error:', error)
    res.status(500).json({ error: 'Failed to generate audio' })
  }
})

export default router

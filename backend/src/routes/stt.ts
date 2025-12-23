import { Router, Response } from 'express'
import multer from 'multer'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { runSingleQuery } from '../db.js'
import { transcribeAudio } from '../services/stt.js'

const router = Router()

// Configure multer for memory storage (we'll write to temp file ourselves)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
})

interface UserLanguageRecord {
  l: {
    properties: {
      language: string
    }
  }
}

// Transcribe audio (requires auth)
router.post('/transcribe', authMiddleware, upload.single('audio'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' })
      return
    }

    // Get user's target language
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN l LIMIT 1`,
      { userId: req.userId }
    )

    const language = userLang?.l.properties.language || 'english'

    const result = await transcribeAudio(req.file.buffer, language)
    res.json(result)
  } catch (error) {
    console.error('STT transcription error:', error)
    res.status(500).json({ error: 'Failed to transcribe audio' })
  }
})

export default router

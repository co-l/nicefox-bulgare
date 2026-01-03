import { Router, Request, Response } from 'express'
import multer from 'multer'
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
    language: string
  }
}

// Transcribe audio (requires auth - middleware applied in index.ts)
router.post('/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' })
      return
    }

    // Get user's target language
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN l LIMIT 1`,
      { userId: req.authUser!.id }
    )

    const language = userLang?.l.language || 'english'

    const result = await transcribeAudio(req.file.buffer, language)
    res.json(result)
  } catch (error) {
    console.error('STT transcription error:', error)
    res.status(500).json({ error: 'Failed to transcribe audio' })
  }
})

export default router

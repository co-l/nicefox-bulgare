import { Router, Request, Response } from 'express'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
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

// Generate audio from text (requires auth - middleware applied in index.ts)
router.post('/generate', async (req: Request, res: Response) => {
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

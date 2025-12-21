import { Router, Response } from 'express'
import { Mistral } from '@mistralai/mistralai'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { runSingleQuery } from '../db.js'

const router = Router()

router.use(authMiddleware)

let mistralClient: Mistral | null = null

function getMistral(): Mistral {
  if (!mistralClient) {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not configured')
    }
    mistralClient = new Mistral({ apiKey })
  }
  return mistralClient
}

interface UserLanguageRecord {
  u: {
    properties: {
      native_language: string
    }
  }
  l: {
    properties: {
      language: string
    }
  }
}

interface TranslationResponse {
  word: string
  translation: string
  partOfSpeech: string
  grammarNote?: string
}

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { word, context } = req.body

    if (!word) {
      res.status(400).json({ error: 'Word is required' })
      return
    }

    // Get user's language settings
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN u, l LIMIT 1`,
      { userId: req.userId }
    )

    if (!userLang) {
      res.status(400).json({ error: 'No target language set' })
      return
    }

    const nativeLanguage = userLang.u.properties.native_language || 'English'
    const targetLanguage = userLang.l.properties.language

    const mistral = getMistral()

    const prompt = context
      ? `Translate the word "${word}" from ${targetLanguage} to ${nativeLanguage}. The word appears in this context: "${context}"

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{"word": "${word}", "translation": "the translation", "partOfSpeech": "noun/verb/adjective/etc", "grammarNote": "brief grammar note if relevant"}`
      : `Translate the word "${word}" from ${targetLanguage} to ${nativeLanguage}.

Respond ONLY with a JSON object in this exact format (no markdown, no extra text):
{"word": "${word}", "translation": "the translation", "partOfSpeech": "noun/verb/adjective/etc", "grammarNote": "brief grammar note if relevant"}`

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: `You are a language translation assistant. Always respond with valid JSON only, no markdown formatting or extra text. Keep grammar notes concise (under 10 words).`,
        },
        { role: 'user', content: prompt },
      ],
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('No response from Mistral')
    }

    const textContent = typeof content === 'string' ? content : JSON.stringify(content)

    // Parse JSON response, handling potential markdown wrapping
    let parsed: TranslationResponse
    try {
      // Remove markdown code blocks if present
      const cleaned = textContent.replace(/```json\n?|\n?```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // Fallback if JSON parsing fails
      parsed = {
        word,
        translation: textContent,
        partOfSpeech: 'unknown',
      }
    }

    res.json(parsed)
  } catch (error) {
    console.error('Translation error:', error)
    res.status(500).json({ error: 'Failed to translate' })
  }
})

export default router

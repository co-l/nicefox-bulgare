import { Router, Request, Response } from 'express'
import { Mistral } from '@mistralai/mistralai'
import { runSingleQuery } from '../db.js'

const router = Router()

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

interface AdjectiveForms {
  masculine: string
  feminine: string
  neuter?: string
  plural?: string
}

interface NounForms {
  singular: string
  plural: string
  numeralPlural?: string
  definiteSingular?: string
  definitePlural?: string
}

interface VerbForms {
  present: string
  past: string
  future: string
}

type GrammaticalForms =
  | { type: 'adjective'; forms: AdjectiveForms }
  | { type: 'noun'; forms: NounForms }
  | { type: 'verb'; forms: VerbForms }
  | { type: 'other'; forms: null }

interface TranslationResponse {
  word: string
  lemma: string
  translation: string
  partOfSpeech: string
  grammarNote?: string
  grammaticalForms?: GrammaticalForms
}

router.post('/', async (req: Request, res: Response) => {
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
      { userId: req.authUser!.id }
    )

    if (!userLang) {
      res.status(400).json({ error: 'No target language set' })
      return
    }

    const nativeLanguage = userLang.u.properties.native_language || 'English'
    const targetLanguage = userLang.l.properties.language

    const mistral = getMistral()

    const contextInfo = context ? `The word appears in this context: "${context}"` : ''

    const prompt = `Analyze and translate the word "${word}" from ${targetLanguage} to ${nativeLanguage}. ${contextInfo}

Provide a JSON response with:
1. "word": the exact word "${word}"
2. "lemma": the dictionary/base form (infinitive for verbs, nominative singular masculine for adjectives, nominative singular for nouns)
3. "translation": translation of the lemma to ${nativeLanguage}
4. "partOfSpeech": noun/verb/adjective/adverb/pronoun/preposition/conjunction/other
5. "grammarNote": brief grammar note if relevant (max 10 words)
6. "grammaticalForms": based on part of speech, include one of:

For ADJECTIVES:
{"type": "adjective", "forms": {"masculine": "...", "feminine": "...", "neuter": "..." (if applicable in ${targetLanguage}), "plural": "..."}}

For NOUNS:
{"type": "noun", "forms": {"singular": "...", "plural": "...", "numeralPlural": "..." (for Bulgarian: form used with numbers 2-6, e.g. "два стола")}}

For VERBS:
{"type": "verb", "forms": {"present": "1st person singular present", "past": "1st person singular past", "future": "1st person singular future"}}

For other parts of speech:
{"type": "other", "forms": null}

Respond with valid JSON only, no markdown.`

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: `You are a ${targetLanguage} language expert and translator. Always respond with valid JSON only, no markdown formatting or extra text. Be accurate with grammatical forms for ${targetLanguage}.`,
        },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
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
      // Ensure lemma exists, fallback to word
      if (!parsed.lemma) {
        parsed.lemma = parsed.word || word
      }
    } catch {
      // Fallback if JSON parsing fails
      parsed = {
        word,
        lemma: word,
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

// Reverse translation: native language -> target language with forms
router.post('/reverse', async (req: Request, res: Response) => {
  try {
    const { word, nativeLanguage, targetLanguage } = req.body

    if (!word || !nativeLanguage || !targetLanguage) {
      res.status(400).json({ error: 'Word, nativeLanguage, and targetLanguage are required' })
      return
    }

    const mistral = getMistral()

    const prompt = `Translate the word "${word}" from ${nativeLanguage} to ${targetLanguage}.

Provide a JSON response with:
1. "word": the ${targetLanguage} translation (base/dictionary form)
2. "lemma": same as "word" (the dictionary/base form in ${targetLanguage})
3. "translation": the base/dictionary form of "${word}" in ${nativeLanguage} (e.g., if input is "coupables", return "coupable"; if input is "running", return "run" for verbs or keep as-is for gerunds)
4. "partOfSpeech": noun/verb/adjective/adverb/pronoun/preposition/conjunction/other
5. "grammarNote": brief grammar note if relevant (max 10 words)
6. "grammaticalForms": based on part of speech, include one of:

For ADJECTIVES:
{"type": "adjective", "forms": {"masculine": "...", "feminine": "...", "neuter": "..." (if applicable in ${targetLanguage}), "plural": "..."}}

For NOUNS:
{"type": "noun", "forms": {"singular": "...", "plural": "...", "numeralPlural": "..." (for Bulgarian: form used with numbers 2-6, e.g. "два стола")}}

For VERBS:
{"type": "verb", "forms": {"present": "1st person singular present", "past": "1st person singular past", "future": "1st person singular future"}}

For other parts of speech:
{"type": "other", "forms": null}

Respond with valid JSON only, no markdown.`

    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: `You are a ${targetLanguage} language expert and translator. Always respond with valid JSON only, no markdown formatting or extra text. Be accurate with grammatical forms for ${targetLanguage}.`,
        },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('No response from Mistral')
    }

    const textContent = typeof content === 'string' ? content : JSON.stringify(content)

    // Parse JSON response
    let parsed: TranslationResponse
    try {
      const cleaned = textContent.replace(/```json\n?|\n?```/g, '').trim()
      parsed = JSON.parse(cleaned)
      if (!parsed.lemma) {
        parsed.lemma = parsed.word || word
      }
    } catch {
      parsed = {
        word,
        lemma: word,
        translation: word,
        partOfSpeech: 'unknown',
      }
    }

    res.json(parsed)
  } catch (error) {
    console.error('Reverse translation error:', error)
    res.status(500).json({ error: 'Failed to translate' })
  }
})

export default router

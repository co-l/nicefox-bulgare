import { Router, Request, Response } from 'express'
import { runSingleQuery } from '../db.js'
import { getModel } from '../services/spark.js'

const router = Router()

interface UserLanguageRecord {
  u: {
    native_language: string
  }
  l: {
    language: string
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

async function callLLM(prompt: string): Promise<string> {
  const model = await getModel()

  const response = await fetch(`${process.env.SPARK_BASE_URL || 'http://192.168.1.223:8000'}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a language expert and translator. Always respond with valid JSON only, no markdown formatting or extra text.',
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`vLLM API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No response from vLLM')
  }

  return content
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

    const nativeLanguage = userLang.u.native_language || 'French'
    const targetLanguage = userLang.l.language

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

    const content = await callLLM(prompt)

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

    const content = await callLLM(prompt)

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

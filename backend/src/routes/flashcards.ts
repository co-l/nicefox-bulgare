import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { runQuery, runSingleQuery } from '../db.js'
import { calculateNextReview, getInitialReview, ReviewAction } from '../utils/spacedRepetition.js'

const router = Router()

// NiceFox GraphDB returns flat node/relationship objects
interface FlashcardRecord {
  f: {
    id: string
    native: string
    target: string
    original_word?: string
    part_of_speech?: string
    forms?: string // JSON stringified
  }
  rel: {
    next_display: number
    interval_index: number
    status: string
  }
}

interface CountRecord {
  count: number
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const results = await runQuery<FlashcardRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[rel:BF_HAS_FLASHCARD]->(f:BF_Flashcard)
       RETURN f, rel
       ORDER BY f.created_at DESC`,
      { userId: req.authUser!.id }
    )

    const flashcards = results.map((r) => ({
      id: r.f.id,
      native: r.f.native,
      target: r.f.target,
      originalWord: r.f.original_word,
      partOfSpeech: r.f.part_of_speech,
      forms: r.f.forms ? JSON.parse(r.f.forms) : undefined,
      nextDisplay: new Date(r.rel.next_display || Date.now()),
      intervalIndex: r.rel.interval_index || 0,
      status: r.rel.status || 'new',
    }))

    res.json({ flashcards })
  } catch (error) {
    console.error('Get flashcards error:', error)
    res.status(500).json({ error: 'Failed to get flashcards' })
  }
})

router.get('/due-count', async (req: Request, res: Response) => {
  try {
    const result = await runSingleQuery<CountRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[rel:BF_HAS_FLASHCARD]->(f:BF_Flashcard)
       WHERE rel.next_display <= $now
       RETURN count(f) as count`,
      { userId: req.authUser!.id, now: Date.now() }
    )

    res.json({ count: result?.count || 0 })
  } catch (error) {
    console.error('Get due count error:', error)
    res.status(500).json({ error: 'Failed to get due count' })
  }
})

router.get('/session', async (req: Request, res: Response) => {
  try {
    const results = await runQuery<FlashcardRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[rel:BF_HAS_FLASHCARD]->(f:BF_Flashcard)
       WHERE rel.next_display <= $now
       RETURN f, rel
       ORDER BY rel.next_display ASC
       LIMIT 10`,
      { userId: req.authUser!.id, now: Date.now() }
    )

    const cards = results.map((r) => ({
      id: r.f.id,
      native: r.f.native,
      target: r.f.target,
      originalWord: r.f.original_word,
      partOfSpeech: r.f.part_of_speech,
      forms: r.f.forms ? JSON.parse(r.f.forms) : undefined,
      nextDisplay: new Date(r.rel.next_display || Date.now()),
      intervalIndex: r.rel.interval_index || 0,
      status: r.rel.status || 'new',
    }))

    res.json({ cards })
  } catch (error) {
    console.error('Get session error:', error)
    res.status(500).json({ error: 'Failed to get session' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { native, target, originalWord, partOfSpeech, forms, language } = req.body

    if (!native || !target) {
      res.status(400).json({ error: 'Native and target words are required' })
      return
    }

    const flashcardId = uuidv4()
    const initial = getInitialReview()

    // If language not specified, use the first language the user is learning
    let targetLanguage = language
    if (!targetLanguage) {
      const langResult = await runSingleQuery<{ l: { language: string } }>(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
         RETURN l LIMIT 1`,
        { userId: req.authUser!.id }
      )
      targetLanguage = langResult?.l.language
    }

    if (!targetLanguage) {
      res.status(400).json({ error: 'No target language found. Please set up a language first.' })
      return
    }

    await runQuery(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language {language: $language})
       CREATE (l)-[:BF_HAS_FLASHCARD {
         next_display: $nextDisplay,
         interval_index: $intervalIndex,
         status: $status
       }]->(f:BF_Flashcard {
         id: $flashcardId,
         native: $native,
         target: $target,
         original_word: $originalWord,
         part_of_speech: $partOfSpeech,
         forms: $forms,
         created_at: timestamp()
       })`,
      {
        userId: req.authUser!.id,
        language: targetLanguage,
        flashcardId,
        native,
        target,
        originalWord: originalWord || null,
        partOfSpeech: partOfSpeech || null,
        forms: forms ? JSON.stringify(forms) : null,
        nextDisplay: initial.nextDisplay.getTime(),
        intervalIndex: initial.newIntervalIndex,
        status: initial.status,
      }
    )

    res.status(201).json({
      flashcard: {
        id: flashcardId,
        native,
        target,
        originalWord,
        partOfSpeech,
        forms,
        nextDisplay: initial.nextDisplay,
        intervalIndex: initial.newIntervalIndex,
        status: initial.status,
      },
    })
  } catch (error) {
    console.error('Create flashcard error:', error)
    res.status(500).json({ error: 'Failed to create flashcard' })
  }
})

router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { action } = req.body as { action: ReviewAction }

    if (!['easy', 'hard', 'again'].includes(action)) {
      res.status(400).json({ error: 'Invalid action. Must be easy, hard, or again.' })
      return
    }

    const current = await runSingleQuery<FlashcardRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[rel:BF_HAS_FLASHCARD]->(f:BF_Flashcard {id: $flashcardId})
       RETURN f, rel`,
      { userId: req.authUser!.id, flashcardId: id }
    )

    if (!current) {
      res.status(404).json({ error: 'Flashcard not found' })
      return
    }

    const currentIntervalIndex = current.rel.interval_index || 0
    const result = calculateNextReview(currentIntervalIndex, action)

    await runQuery(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[rel:BF_HAS_FLASHCARD]->(f:BF_Flashcard {id: $flashcardId})
       SET rel.next_display = $nextDisplay,
           rel.interval_index = $intervalIndex,
           rel.status = $status,
           f.last_reviewed = timestamp()`,
      {
        userId: req.authUser!.id,
        flashcardId: id,
        nextDisplay: result.nextDisplay.getTime(),
        intervalIndex: result.newIntervalIndex,
        status: result.status,
      }
    )

    res.json({
      nextDisplay: result.nextDisplay,
      intervalIndex: result.newIntervalIndex,
      status: result.status,
    })
  } catch (error) {
    console.error('Review flashcard error:', error)
    res.status(500).json({ error: 'Failed to review flashcard' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    await runQuery(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[rel:BF_HAS_FLASHCARD]->(f:BF_Flashcard {id: $flashcardId})
       DELETE rel, f`,
      { userId: req.authUser!.id, flashcardId: id }
    )

    res.json({ message: 'Flashcard deleted' })
  } catch (error) {
    console.error('Delete flashcard error:', error)
    res.status(500).json({ error: 'Failed to delete flashcard' })
  }
})

export default router

import { Router, Request, Response } from 'express'
import { runQuery, runSingleQuery } from '../db.js'

const router = Router()

// NiceFox GraphDB returns node objects with properties nested
interface UserRecord {
  u: {
    properties: {
      id: string
      email: string
      name: string
      native_language?: string
    }
  }
}

interface LanguageRecord {
  l: {
    properties: {
      language: string
      proficiency: string
    }
  }
}

router.get('/profile', async (req: Request, res: Response) => {
  try {
    const result = await runSingleQuery<UserRecord>(
      'MATCH (u:BF_User {id: $userId}) RETURN u',
      { userId: req.authUser!.id }
    )

    if (!result) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const user = result.u.properties

    // Also fetch languages
    const langResults = await runQuery<LanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN l`,
      { userId: req.authUser!.id }
    )

    const languages = langResults.map((r) => ({
      language: r.l.properties.language,
      proficiency: r.l.properties.proficiency,
    }))

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nativeLanguage: user.native_language || null,
      },
      languages,
    })
  } catch (error) {
    console.error('Get profile error:', error)
    res.status(500).json({ error: 'Failed to get profile' })
  }
})

router.put('/profile', async (req: Request, res: Response) => {
  try {
    const { name, nativeLanguage } = req.body

    const updates: string[] = []
    const params: Record<string, unknown> = { userId: req.authUser!.id }

    if (name !== undefined) {
      updates.push('u.name = $name')
      params.name = name
    }

    if (nativeLanguage !== undefined) {
      updates.push('u.native_language = $nativeLanguage')
      params.nativeLanguage = nativeLanguage
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No updates provided' })
      return
    }

    await runQuery(
      `MATCH (u:BF_User {id: $userId}) SET ${updates.join(', ')}`,
      params
    )

    res.json({ message: 'Profile updated' })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

router.get('/languages', async (req: Request, res: Response) => {
  try {
    const results = await runQuery<LanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN l`,
      { userId: req.authUser!.id }
    )

    const languages = results.map((r) => ({
      language: r.l.properties.language,
      proficiency: r.l.properties.proficiency,
    }))

    res.json({ languages })
  } catch (error) {
    console.error('Get languages error:', error)
    res.status(500).json({ error: 'Failed to get languages' })
  }
})

router.post('/languages', async (req: Request, res: Response) => {
  try {
    const { language, proficiency } = req.body

    if (!language || !proficiency) {
      res.status(400).json({ error: 'Language and proficiency are required' })
      return
    }

    const validProficiency = ['beginner', 'intermediate', 'advanced', 'fluent']
    if (!validProficiency.includes(proficiency)) {
      res.status(400).json({ error: 'Invalid proficiency level' })
      return
    }

    // Use MERGE to avoid race conditions creating duplicate languages
    const result = await runQuery<{ created: boolean }>(
      `MATCH (u:BF_User {id: $userId})
       MERGE (u)-[:BF_LEARNS]->(l:BF_Language {language: $language})
       ON CREATE SET l.proficiency = $proficiency,
                     l.created_at = $createdAt
       RETURN l.created_at = $createdAt as created`,
      { userId: req.authUser!.id, language, proficiency, createdAt: Date.now() }
    )

    // If not created (already existed), return error
    if (result.length > 0 && !result[0].created) {
      res.status(400).json({ error: 'Already learning this language' })
      return
    }

    res.status(201).json({ message: 'Language added' })
  } catch (error) {
    console.error('Add language error:', error)
    res.status(500).json({ error: 'Failed to add language' })
  }
})

router.put('/languages/:language', async (req: Request, res: Response) => {
  try {
    const { language } = req.params
    const { proficiency } = req.body

    const validProficiency = ['beginner', 'intermediate', 'advanced', 'fluent']
    if (!validProficiency.includes(proficiency)) {
      res.status(400).json({ error: 'Invalid proficiency level' })
      return
    }

    await runQuery(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language {language: $language})
       SET l.proficiency = $proficiency`,
      { userId: req.authUser!.id, language, proficiency }
    )

    res.json({ message: 'Language updated' })
  } catch (error) {
    console.error('Update language error:', error)
    res.status(500).json({ error: 'Failed to update language' })
  }
})

export default router

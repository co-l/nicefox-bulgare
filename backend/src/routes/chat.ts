import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { runQuery, runSingleQuery } from '../db.js'
import { generateChatResponse, analyzeGrammar, GrammarAnalysis } from '../services/mistral.js'

const router = Router()

// NiceFox GraphDB returns flat node objects
interface ChatRecord {
  c: {
    id: string
    messages: string
    created_at: number
    updated_at: number
  }
}

interface UserLanguageRecord {
  u: {
    name: string
    native_language: string
  }
  l: {
    language: string
    proficiency: string
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  grammar?: GrammarAnalysis
}

router.get('/history', async (req: Request, res: Response) => {
  try {
    const results = await runQuery<ChatRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat)
       RETURN c
       ORDER BY c.updated_at DESC
       LIMIT 20`,
      { userId: req.authUser!.id }
    )

    const chats = results.map((r) => {
      let messages: Message[] = []
      try {
        messages = JSON.parse(r.c.messages || '[]')
      } catch {
        messages = []
      }

      return {
        id: r.c.id,
        createdAt: new Date(r.c.created_at || Date.now()),
        updatedAt: new Date(r.c.updated_at || Date.now()),
        messages: messages.slice(0, 1), // Only first message for preview
      }
    })

    res.json({ chats })
  } catch (error) {
    console.error('Get chat history error:', error)
    res.status(500).json({ error: 'Failed to get chat history' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const result = await runSingleQuery<ChatRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat {id: $chatId})
       RETURN c`,
      { userId: req.authUser!.id, chatId: id }
    )

    if (!result) {
      res.status(404).json({ error: 'Chat not found' })
      return
    }

    let messages: Message[] = []
    try {
      messages = JSON.parse(result.c.messages || '[]')
    } catch {
      messages = []
    }

    res.json({
      id: result.c.id,
      messages,
      createdAt: new Date(result.c.created_at || Date.now()),
      updatedAt: new Date(result.c.updated_at || Date.now()),
    })
  } catch (error) {
    console.error('Get chat error:', error)
    res.status(500).json({ error: 'Failed to get chat' })
  }
})

router.post('/start', async (req: Request, res: Response) => {
  try {
    // Get user's language settings
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN u, l LIMIT 1`,
      { userId: req.authUser!.id }
    )

    if (!userLang) {
      res.status(400).json({ error: 'No target language set. Please complete onboarding.' })
      return
    }

    const userName = userLang.u.name || 'friend'
    const nativeLanguage = userLang.u.native_language || 'English'
    const targetLanguage = userLang.l.language
    const proficiency = userLang.l.proficiency

    // Generate initial greeting
    const aiResponse = await generateChatResponse(
      [{ role: 'user', content: 'Start a new conversation with me.' }],
      targetLanguage,
      proficiency,
      nativeLanguage,
      userName
    )

    const chatId = uuidv4()
    const messages: Message[] = [{
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    }]

    const now = Date.now()
    await runQuery(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language {language: $language})
       CREATE (l)-[:BF_HAS_CHAT]->(c:BF_Chat {
         id: $chatId,
         messages: $messages,
         created_at: $now,
         updated_at: $now
       })`,
      {
        userId: req.authUser!.id,
        language: targetLanguage,
        chatId,
        messages: JSON.stringify(messages),
        now,
      }
    )

    res.json({
      chatId,
      messages,
    })
  } catch (error) {
    console.error('Start chat error:', error)
    res.status(500).json({ error: 'Failed to start chat' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { chatId, message } = req.body

    if (!message) {
      res.status(400).json({ error: 'Message is required' })
      return
    }

    // Get user's language settings
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN u, l LIMIT 1`,
      { userId: req.authUser!.id }
    )

    if (!userLang) {
      res.status(400).json({ error: 'No target language set. Please complete onboarding.' })
      return
    }

    const userName = userLang.u.name || 'friend'
    const nativeLanguage = userLang.u.native_language || 'English'
    const targetLanguage = userLang.l.language
    const proficiency = userLang.l.proficiency

    let messages: Message[] = []
    let currentChatId = chatId

    // Load existing chat if provided
    if (chatId) {
      console.log('Loading chat:', chatId)
      const existingChat = await runSingleQuery<ChatRecord>(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat {id: $chatId})
         RETURN c`,
        { userId: req.authUser!.id, chatId }
      )

      if (existingChat) {
        try {
          messages = JSON.parse(existingChat.c.messages || '[]')
          console.log('Loaded messages count:', messages.length)
        } catch {
          messages = []
        }
      } else {
        console.log('No existing chat found for id:', chatId)
      }
    } else {
      console.log('No chatId provided')
    }

    // Add user message (grammar will be added after analysis)
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    messages.push(userMessage)

    // Generate AI response and analyze grammar in parallel
    const messagesToSend = messages.map((m) => ({ role: m.role, content: m.content }))
    console.log('Sending to AI:', messagesToSend.length, 'messages')

    const [aiResponse, grammarAnalysis] = await Promise.all([
      generateChatResponse(
        messagesToSend,
        targetLanguage,
        proficiency,
        nativeLanguage,
        userName
      ),
      analyzeGrammar(message, targetLanguage, nativeLanguage),
    ])

    // Add grammar analysis to user message
    userMessage.grammar = grammarAnalysis

    // Add AI response
    const assistantMessage: Message = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    }
    messages.push(assistantMessage)

    // Save chat
    const now = Date.now()
    if (!currentChatId) {
      currentChatId = uuidv4()

      await runQuery(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language {language: $language})
         CREATE (l)-[:BF_HAS_CHAT]->(c:BF_Chat {
           id: $chatId,
           messages: $messages,
           created_at: $now,
           updated_at: $now
         })`,
        {
          userId: req.authUser!.id,
          language: targetLanguage,
          chatId: currentChatId,
          messages: JSON.stringify(messages),
          now,
        }
      )
    } else {
      await runQuery(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat {id: $chatId})
         SET c.messages = $messages, c.updated_at = $now`,
        {
          userId: req.authUser!.id,
          chatId: currentChatId,
          messages: JSON.stringify(messages),
          now,
        }
      )
    }

    res.json({
      chatId: currentChatId,
      response: aiResponse,
      grammar: grammarAnalysis,
    })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to process chat message' })
  }
})

export default router

import { Router, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { runQuery, runSingleQuery } from '../db.js'
import { generateChatResponse, analyzeGrammar, GrammarAnalysis } from '../services/mistral.js'

const router = Router()

router.use(authMiddleware)

interface ChatRecord {
  c: {
    properties: {
      id: string
      messages: string
      created_at: number
      updated_at: number
    }
  }
}

interface UserLanguageRecord {
  u: {
    properties: {
      name: string
      native_language: string
    }
  }
  l: {
    properties: {
      language: string
      proficiency: string
    }
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  grammar?: GrammarAnalysis
}

router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const results = await runQuery<ChatRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat)
       RETURN c
       ORDER BY c.updated_at DESC
       LIMIT 20`,
      { userId: req.userId }
    )

    const chats = results.map((r) => {
      let messages: Message[] = []
      try {
        messages = JSON.parse(r.c.properties.messages || '[]')
      } catch {
        messages = []
      }

      return {
        id: r.c.properties.id,
        createdAt: new Date(r.c.properties.created_at || Date.now()),
        updatedAt: new Date(r.c.properties.updated_at || Date.now()),
        messages: messages.slice(0, 1), // Only first message for preview
      }
    })

    res.json({ chats })
  } catch (error) {
    console.error('Get chat history error:', error)
    res.status(500).json({ error: 'Failed to get chat history' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const result = await runSingleQuery<ChatRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat {id: $chatId})
       RETURN c`,
      { userId: req.userId, chatId: id }
    )

    if (!result) {
      res.status(404).json({ error: 'Chat not found' })
      return
    }

    let messages: Message[] = []
    try {
      messages = JSON.parse(result.c.properties.messages || '[]')
    } catch {
      messages = []
    }

    res.json({
      id: result.c.properties.id,
      messages,
      createdAt: new Date(result.c.properties.created_at || Date.now()),
      updatedAt: new Date(result.c.properties.updated_at || Date.now()),
    })
  } catch (error) {
    console.error('Get chat error:', error)
    res.status(500).json({ error: 'Failed to get chat' })
  }
})

router.post('/start', async (req: AuthRequest, res: Response) => {
  try {
    // Get user's language settings
    const userLang = await runSingleQuery<UserLanguageRecord>(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)
       RETURN u, l LIMIT 1`,
      { userId: req.userId }
    )

    if (!userLang) {
      res.status(400).json({ error: 'No target language set. Please complete onboarding.' })
      return
    }

    const userName = userLang.u.properties.name || 'friend'
    const nativeLanguage = userLang.u.properties.native_language || 'English'
    const targetLanguage = userLang.l.properties.language
    const proficiency = userLang.l.properties.proficiency

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

    await runQuery(
      `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language {language: $language})
       CREATE (l)-[:BF_HAS_CHAT]->(c:BF_Chat {
         id: $chatId,
         messages: $messages,
         created_at: timestamp(),
         updated_at: timestamp()
       })`,
      {
        userId: req.userId,
        language: targetLanguage,
        chatId,
        messages: JSON.stringify(messages),
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

router.post('/', async (req: AuthRequest, res: Response) => {
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
      { userId: req.userId }
    )

    if (!userLang) {
      res.status(400).json({ error: 'No target language set. Please complete onboarding.' })
      return
    }

    const userName = userLang.u.properties.name || 'friend'
    const nativeLanguage = userLang.u.properties.native_language || 'English'
    const targetLanguage = userLang.l.properties.language
    const proficiency = userLang.l.properties.proficiency

    let messages: Message[] = []
    let currentChatId = chatId

    // Load existing chat if provided
    if (chatId) {
      console.log('Loading chat:', chatId)
      const existingChat = await runSingleQuery<ChatRecord>(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat {id: $chatId})
         RETURN c`,
        { userId: req.userId, chatId }
      )

      if (existingChat) {
        try {
          messages = JSON.parse(existingChat.c.properties.messages || '[]')
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
    if (!currentChatId) {
      currentChatId = uuidv4()

      await runQuery(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language {language: $language})
         CREATE (l)-[:BF_HAS_CHAT]->(c:BF_Chat {
           id: $chatId,
           messages: $messages,
           created_at: timestamp(),
           updated_at: timestamp()
         })`,
        {
          userId: req.userId,
          language: targetLanguage,
          chatId: currentChatId,
          messages: JSON.stringify(messages),
        }
      )
    } else {
      await runQuery(
        `MATCH (u:BF_User {id: $userId})-[:BF_LEARNS]->(l:BF_Language)-[:BF_HAS_CHAT]->(c:BF_Chat {id: $chatId})
         SET c.messages = $messages, c.updated_at = timestamp()`,
        {
          userId: req.userId,
          chatId: currentChatId,
          messages: JSON.stringify(messages),
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

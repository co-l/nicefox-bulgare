/**
 * Spark Service - vLLM client using native fetch
 * 
 * Communicates with a local vLLM instance for chat and grammar analysis.
 * Uses streaming SSE responses and automatic model discovery.
 */

// Configuration
const SPARK_BASE_URL = process.env.SPARK_BASE_URL || 'http://192.168.1.223:8000'

// Model cache
let cachedModel: string | null = null

/**
 * Reset the model cache (useful for testing)
 */
export function resetCache(): void {
  cachedModel = null
}

/**
 * Get the base URL for vLLM API
 */
function getBaseUrl(): string {
  return SPARK_BASE_URL
}

/**
 * Fetch the list of available models and return the first one
 */
async function fetchModels(): Promise<string> {
  const url = `${getBaseUrl()}/v1/models`
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as { data: Array<{ id: string }> }
    
    if (!data.data || data.data.length === 0) {
      throw new Error('No models available from vLLM')
    }

    return data.data[0].id
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      throw new Error(`Failed to connect to vLLM: ${error.message}`)
    }
    if (error instanceof Error && error.message.includes('No models available')) {
      throw error
    }
    console.error('[Spark] Error fetching models:', error)
    throw new Error(`Failed to connect to vLLM: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get the model ID, fetching from vLLM if not cached
 */
export async function getModel(): Promise<string> {
  if (cachedModel) {
    return cachedModel
  }

  try {
    cachedModel = await fetchModels()
    console.log(`[Spark] Selected model: ${cachedModel}`)
    return cachedModel
  } catch (error) {
    console.error('[Spark] Error fetching models:', error)
    throw new Error(`Failed to fetch models from vLLM: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Parse SSE (Server-Sent Events) stream and extract content
 */
async function parseSSEStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  let buffer = ''
  let result = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      buffer += new TextDecoder().decode(value, { stream: true })
      
      // Process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim()
        
        // Skip empty lines and data: [DONE]
        if (!trimmed || trimmed === 'data: [DONE]') continue

        // Parse data: {...} lines
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim()
          
          try {
            const chunk = JSON.parse(jsonStr)
            
            // Extract content from delta
            if (chunk.choices && chunk.choices[0]?.delta?.content) {
              result += chunk.choices[0].delta.content
            }
          } catch (parseError) {
            console.error('[Spark] Failed to parse SSE chunk:', jsonStr, parseError)
            // Continue parsing other chunks
          }
        }
      }
    }

    return result
  } finally {
    reader.releaseLock()
  }
}

/**
 * Generate a chat response using vLLM streaming
 */
export async function generateChatResponse(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  targetLanguage: string,
  proficiency: string,
  nativeLanguage: string,
  userName: string
): Promise<string> {
  const model = await getModel()

  // Build system prompt (same logic as mistral.ts)
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const proficiencyGuidelines: Record<string, string> = {
    beginner: 'Use simple vocabulary and short sentences. Focus on basic greetings and everyday phrases.',
    intermediate: 'Use moderately complex sentences. Engage in everyday topics like hobbies, work, and daily life.',
    advanced: 'Use natural, fluent language including idioms. Discuss complex topics.',
    fluent: 'Speak as you would with a native speaker. Use sophisticated vocabulary and cultural references.',
  }

  const systemPrompt = `You are a friendly conversation partner helping ${userName} practice ${targetLanguage}.
Their proficiency level is ${proficiency}. Today is ${dateStr}.

${proficiencyGuidelines[proficiency] || proficiencyGuidelines.intermediate}

CONVERSATION STYLE:
- Actually engage with what ${userName} says - react, comment, share your own thoughts
- Don't ask a question in every response - sometimes just respond naturally
- If they share something, respond to it meaningfully before moving on
- Be like a real friend having a chat, not an interviewer

CRITICAL RULES:
- Respond ONLY in ${targetLanguage}
- NEVER include translations in parentheses
- NEVER add meta-commentary or notes
- Keep responses short (1-3 sentences max)
- Only provide translations if explicitly asked in ${nativeLanguage}
- When starting a NEW conversation, greet and ask one simple question`

  const messagesToSend = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  try {
    const response = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messagesToSend,
        stream: true,
        stream_options: { include_usage: true },
        chat_template_kwargs: {
          enable_thinking: false,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(`vLLM API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    if (!response.body) {
      throw new Error('No response body from vLLM')
    }

    const result = await parseSSEStream(response.body)

    if (!result) {
      throw new Error('Failed to parse SSE response')
    }

    return result
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      throw new Error(`Failed to connect to vLLM: ${error.message}`)
    }
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      throw new Error('Failed to parse SSE response')
    }
    throw error
  }
}

/**
 * Interface for grammar analysis result
 */
export interface GrammarAnalysis {
  score: 'perfect' | 'minor' | 'major'
  explanation: string
  correctedSentence?: string
  corrections?: Array<{
    original: string
    corrected: string
    reason: string
  }>
}

/**
 * Analyze grammar using vLLM
 */
export async function analyzeGrammar(
  userMessage: string,
  targetLanguage: string,
  nativeLanguage: string
): Promise<GrammarAnalysis> {
  const model = await getModel()

  const systemPrompt = `You are a ${targetLanguage} grammar expert. Analyze the user's message for grammar, spelling, and natural expression.

Respond in JSON format with this structure:
{
  "score": "perfect" | "minor" | "major",
  "explanation": "Brief explanation in ${nativeLanguage}",
  "correctedSentence": "The full corrected sentence in ${targetLanguage} (only if there are errors)",
  "corrections": [
    {
      "original": "the incorrect part",
      "corrected": "the correct version",
      "reason": "why in ${nativeLanguage}"
    }
  ]
}

Score guidelines:
- "perfect": No errors, sounds natural (omit correctedSentence and corrections)
- "minor": Small errors (typos, minor grammar) but meaning is clear
- "major": Significant errors affecting comprehension or very unnatural

Keep explanations concise and helpful. Always respond in valid JSON only.`

  try {
    const response = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
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

    const data = await response.json() as { choices?: Array<{ message?: { content?: string | object } }> }
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return { score: 'perfect', explanation: '' }
    }

    try {
      const parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content))
      return {
        score: parsed.score || 'perfect',
        explanation: parsed.explanation || '',
        correctedSentence: parsed.correctedSentence,
        corrections: parsed.corrections || [],
      }
    } catch {
      // If JSON parsing fails, return default response
      return { score: 'perfect', explanation: '' }
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      throw new Error(`Failed to connect to vLLM: ${error.message}`)
    }
    // On any error, return a safe default
    return { score: 'perfect', explanation: '' }
  }
}

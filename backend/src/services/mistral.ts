import { Mistral } from '@mistralai/mistralai'

let client: Mistral | null = null

function getClient(): Mistral {
  if (!client) {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not configured')
    }
    client = new Mistral({ apiKey })
  }
  return client
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function buildSystemPrompt(
  targetLanguage: string,
  proficiency: string,
  nativeLanguage: string,
  userName: string
): string {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const proficiencyGuidelines: Record<string, string> = {
    beginner: `Use simple vocabulary and short sentences. Focus on basic greetings and everyday phrases.`,
    intermediate: `Use moderately complex sentences. Engage in everyday topics like hobbies, work, and daily life.`,
    advanced: `Use natural, fluent language including idioms. Discuss complex topics.`,
    fluent: `Speak as you would with a native speaker. Use sophisticated vocabulary and cultural references.`,
  }

  return `You are a friendly conversation partner helping ${userName} practice ${targetLanguage}.
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
}

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

export async function analyzeGrammar(
  userMessage: string,
  targetLanguage: string,
  nativeLanguage: string
): Promise<GrammarAnalysis> {
  const mistral = getClient()

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

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    responseFormat: { type: 'json_object' },
  })

  const content = response.choices?.[0]?.message?.content
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
    return { score: 'perfect', explanation: '' }
  }
}

export async function generateChatResponse(
  messages: Message[],
  targetLanguage: string,
  proficiency: string,
  nativeLanguage: string,
  userName: string
): Promise<string> {
  const mistral = getClient()

  const systemPrompt = buildSystemPrompt(targetLanguage, proficiency, nativeLanguage, userName)

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  })

  const content = response.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No response from Mistral')
  }

  return typeof content === 'string' ? content : JSON.stringify(content)
}

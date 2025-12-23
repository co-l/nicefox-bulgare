export interface User {
  id: string
  email: string
  name: string
  nativeLanguage: string
}

export interface Language {
  language: string
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'fluent'
}

export interface Flashcard {
  id: string
  native: string
  target: string
  nextDisplay: string
  intervalIndex: number
  status: 'new' | 'learning' | 'review'
}

export interface GrammarCorrection {
  original: string
  corrected: string
  reason: string
}

export interface GrammarAnalysis {
  score: 'perfect' | 'minor' | 'major'
  explanation: string
  correctedSentence?: string
  corrections?: GrammarCorrection[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  grammar?: GrammarAnalysis
}

export interface Chat {
  id: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface Translation {
  word: string
  translation: string
  partOfSpeech: string
  grammarNote?: string
}

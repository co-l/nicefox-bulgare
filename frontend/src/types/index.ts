export interface User {
  id: string
  email: string
  name: string
  nativeLanguage: string | null
}

// SSO Auth context - cookie-based authentication via auth.nicefox.net
export interface AuthContextType {
  user: User | null
  isLoading: boolean
  authError: string | null // Server error during auth check (not 401)
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export interface Language {
  language: string
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'fluent'
}

export interface AdjectiveForms {
  masculine: string
  feminine: string
  neuter?: string
  plural?: string
}

export interface NounForms {
  singular: string
  plural: string
  numeralPlural?: string
  definiteSingular?: string
  definitePlural?: string
}

export interface VerbForms {
  present: string
  past: string
  future: string
}

export type GrammaticalForms =
  | { type: 'adjective'; forms: AdjectiveForms }
  | { type: 'noun'; forms: NounForms }
  | { type: 'verb'; forms: VerbForms }
  | { type: 'other'; forms: null }

export interface Flashcard {
  id: string
  native: string
  target: string
  originalWord?: string
  partOfSpeech?: string
  forms?: GrammaticalForms
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



export interface Translation {
  word: string
  lemma: string
  translation: string
  partOfSpeech: string
  grammarNote?: string
  grammaticalForms?: GrammaticalForms
}

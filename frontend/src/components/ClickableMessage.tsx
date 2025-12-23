import { useState, useCallback } from 'react'
import WordPopover from './WordPopover'
import api from '../services/api'
import type { GrammaticalForms } from '../types'

interface ClickableMessageProps {
  content: string
  isAssistant: boolean
}

interface PopoverState {
  word: string
  context: string
  position: { x: number; y: number }
}

interface FlashcardData {
  target: string
  native: string
  originalWord: string
  partOfSpeech: string
  forms?: GrammaticalForms
}

export default function ClickableMessage({ content, isAssistant }: ClickableMessageProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const handleWordClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: string) => {
      if (!isAssistant) return

      // Clean the word (remove punctuation for translation)
      const cleanWord = word.replace(/[.,!?;:"""''()[\]{}]/g, '').trim()
      if (!cleanWord) return

      const rect = e.currentTarget.getBoundingClientRect()
      setPopover({
        word: cleanWord,
        context: content,
        position: { x: rect.left + rect.width / 2, y: rect.top },
      })
    },
    [content, isAssistant]
  )

  const handleAddToFlashcards = async (data: FlashcardData) => {
    try {
      await api.post('/flashcards', {
        target: data.target,
        native: data.native,
        originalWord: data.originalWord,
        partOfSpeech: data.partOfSpeech,
        forms: data.forms,
      })
    } catch (err) {
      console.error('Failed to add flashcard:', err)
    }
  }

  // For user messages, just render plain text
  if (!isAssistant) {
    return <>{content}</>
  }

  // Tokenize the message into words and whitespace/punctuation
  const tokens = content.split(/(\s+|[.,!?;:"""''()[\]{}]+)/)

  return (
    <>
      {tokens.map((token, idx) => {
        // Check if this is a word (not whitespace or punctuation only)
        const isWord = /\S/.test(token) && !/^[.,!?;:"""''()[\]{}]+$/.test(token)

        if (isWord) {
          return (
            <span
              key={idx}
              onClick={(e) => handleWordClick(e, token)}
              style={{
                cursor: 'pointer',
                borderRadius: '2px',
                transition: 'background-color 0.15s',
              }}
              className="clickable-word"
            >
              {token}
            </span>
          )
        }

        return <span key={idx}>{token}</span>
      })}

      {popover && (
        <WordPopover
          word={popover.word}
          context={popover.context}
          position={popover.position}
          onClose={() => setPopover(null)}
          onAddToFlashcards={handleAddToFlashcards}
        />
      )}
    </>
  )
}

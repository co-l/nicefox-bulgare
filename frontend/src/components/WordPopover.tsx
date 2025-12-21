import { useState, useEffect } from 'react'
import type { Translation } from '../types'
import api from '../services/api'

interface WordPopoverProps {
  word: string
  context: string
  position: { x: number; y: number }
  onClose: () => void
  onAddToFlashcards: (word: string, translation: string) => void
}

export default function WordPopover({
  word,
  context,
  position,
  onClose,
  onAddToFlashcards,
}: WordPopoverProps) {
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    const fetchTranslation = async () => {
      try {
        const response = await api.post('/translate', { word, context })
        setTranslation(response.data)
      } catch (err) {
        console.error('Translation error:', err)
        setError('Failed to translate')
      } finally {
        setIsLoading(false)
      }
    }
    fetchTranslation()
  }, [word, context])

  const handleAddToFlashcards = () => {
    if (translation) {
      onAddToFlashcards(word, translation.translation)
      setAdded(true)
    }
  }

  // Position the popover above the word
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 280),
    top: Math.max(position.y - 10, 10),
    transform: 'translateY(-100%)',
    zIndex: 1050,
    minWidth: '250px',
    maxWidth: '300px',
  }

  return (
    <>
      <div
        className="position-fixed top-0 start-0 w-100 h-100"
        style={{ zIndex: 1040 }}
        onClick={onClose}
      />
      <div className="card shadow" style={style}>
        <div className="card-body p-3">
          {isLoading ? (
            <div className="text-center">
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : error ? (
            <p className="text-danger mb-0 small">{error}</p>
          ) : translation ? (
            <>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <h6 className="mb-0">{translation.word}</h6>
                <span className="badge bg-secondary">{translation.partOfSpeech}</span>
              </div>
              <p className="mb-2 fs-5">{translation.translation}</p>
              {translation.grammarNote && (
                <p className="text-muted small mb-2">{translation.grammarNote}</p>
              )}
              <button
                className={`btn btn-sm w-100 ${added ? 'btn-success' : 'btn-primary'}`}
                onClick={handleAddToFlashcards}
                disabled={added}
              >
                {added ? 'Added!' : 'Add to Flashcards'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

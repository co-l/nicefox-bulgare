import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../services/api'
import type { Flashcard, GrammaticalForms } from '../types'

// Intervals in minutes - must match backend spacedRepetition.ts
const INTERVALS = [15, 1440, 4320, 10080, 21600, 43200]

// Calculate interval text for display
function getIntervalText(intervalMinutes: number): string {
  if (intervalMinutes < 60) return `${intervalMinutes} min`
  if (intervalMinutes < 1440) return `${Math.round(intervalMinutes / 60)} hours`
  const days = Math.round(intervalMinutes / 1440)
  return days === 1 ? '1 day' : `${days} days`
}

// Get what interval "easy" would give
function getEasyInterval(currentIntervalIndex: number): string {
  const nextIndex = Math.min(currentIntervalIndex + 1, INTERVALS.length - 1)
  return getIntervalText(INTERVALS[nextIndex])
}

// Get what interval "hard" would give (half of next interval)
function getHardInterval(currentIntervalIndex: number): string {
  const nextIndex = Math.min(currentIntervalIndex + 1, INTERVALS.length - 1)
  const halfInterval = Math.floor(INTERVALS[nextIndex] / 2)
  return getIntervalText(halfInterval)
}

export default function FlashcardSession() {
  const [cards, setCards] = useState<Flashcard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    fetchSession()
  }, [])

  const fetchSession = async () => {
    try {
      const response = await api.get('/flashcards/session')
      const sessionCards = response.data.cards || []
      if (sessionCards.length === 0) {
        setSessionComplete(true)
      }
      setCards(sessionCards)
    } catch (err) {
      console.error('Failed to fetch session:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReview = async (action: 'easy' | 'hard' | 'again') => {
    const card = cards[currentIndex]

    if (action === 'again') {
      // Move card to end of queue locally, don't call API
      const newCards = [...cards]
      const [removedCard] = newCards.splice(currentIndex, 1)
      newCards.push(removedCard)
      setCards(newCards)
      setIsFlipped(false)
      // Don't increment currentIndex since we removed the current card
      // If we're at the end after removal, stay at same index (which now has the next card)
      if (currentIndex >= newCards.length) {
        setCurrentIndex(newCards.length - 1)
      }
      return
    }

    try {
      await api.post(`/flashcards/${card.id}/review`, { action })
      setReviewed((r) => r + 1)

      if (currentIndex < cards.length - 1) {
        setCurrentIndex((i) => i + 1)
        setIsFlipped(false)
      } else {
        setSessionComplete(true)
      }
    } catch (err) {
      console.error('Failed to submit review:', err)
    }
  }

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="container mt-4 text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </>
    )
  }

  if (sessionComplete) {
    return (
      <>
        <Navbar />
        <div className="container mt-4">
          <div className="text-center py-5">
            <h2>Session Complete!</h2>
            <p className="text-muted mb-4">
              {reviewed > 0
                ? `You reviewed ${reviewed} card${reviewed !== 1 ? 's' : ''}.`
                : 'No cards due for review right now.'}
            </p>
            <button className="btn btn-primary me-2" onClick={() => navigate('/flashcards')}>
              Back to Flashcards
            </button>
            <button className="btn btn-outline-primary" onClick={() => navigate('/chat')}>
              Start a Chat
            </button>
          </div>
        </div>
      </>
    )
  }

  const currentCard = cards[currentIndex]

  const renderForms = (forms: GrammaticalForms) => {
    switch (forms.type) {
      case 'adjective':
        return (
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            <span>m. {forms.forms.masculine}</span>
            <span>f. {forms.forms.feminine}</span>
            {forms.forms.neuter && <span>n. {forms.forms.neuter}</span>}
            {forms.forms.plural && <span>pl. {forms.forms.plural}</span>}
          </div>
        )
      case 'noun':
        return (
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            <span>sg. {forms.forms.singular}</span>
            <span>pl. {forms.forms.plural}</span>
            {forms.forms.numeralPlural && <span>num. {forms.forms.numeralPlural}</span>}
          </div>
        )
      case 'verb':
        return (
          <div className="text-center">
            <div>present: {forms.forms.present}</div>
            <div>past: {forms.forms.past}</div>
            <div>future: {forms.forms.future}</div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <div className="d-flex justify-content-between mb-4">
          <span className="text-muted">
            Card {currentIndex + 1} of {cards.length}
          </span>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/flashcards')}>
            Exit Session
          </button>
        </div>

        <div className="row justify-content-center">
          <div className="col-md-8">
            <div
              className="card text-center py-5"
              style={{ cursor: 'pointer', minHeight: '300px' }}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div className="card-body d-flex flex-column justify-content-center">
                <p className="text-muted small mb-2">
                  {isFlipped ? 'Target Language' : 'Native Language'}
                </p>
                <h1 className="display-4">
                  {isFlipped ? currentCard.target : currentCard.native}
                </h1>
                {isFlipped && currentCard.partOfSpeech && (
                  <span className="badge bg-secondary mx-auto mt-2">{currentCard.partOfSpeech}</span>
                )}
                {isFlipped && currentCard.forms && currentCard.forms.type !== 'other' && (
                  <div className="mt-3 text-muted">
                    {renderForms(currentCard.forms)}
                  </div>
                )}
                {!isFlipped && (
                  <p className="text-muted mt-3">Click to reveal answer</p>
                )}
              </div>
            </div>

            {isFlipped && (
              <div className="d-flex justify-content-center gap-3 mt-4">
                <button
                  className="btn btn-danger btn-lg px-4 d-flex flex-column align-items-center"
                  onClick={() => handleReview('again')}
                >
                  <span>Again</span>
                  <small style={{ fontSize: '0.65rem', opacity: 0.8 }}>Show again</small>
                </button>
                <button
                  className="btn btn-warning btn-lg px-4 d-flex flex-column align-items-center"
                  onClick={() => handleReview('hard')}
                >
                  <span>Hard</span>
                  <small style={{ fontSize: '0.65rem', opacity: 0.8 }}>{getHardInterval(currentCard.intervalIndex)}</small>
                </button>
                <button
                  className="btn btn-success btn-lg px-4 d-flex flex-column align-items-center"
                  onClick={() => handleReview('easy')}
                >
                  <span>Easy</span>
                  <small style={{ fontSize: '0.65rem', opacity: 0.8 }}>{getEasyInterval(currentCard.intervalIndex)}</small>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../services/api'
import type { Flashcard, GrammaticalForms } from '../types'

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
              You reviewed {reviewed} card{reviewed !== 1 ? 's' : ''}.
            </p>
            <button className="btn btn-primary me-2" onClick={() => navigate('/flashcards')}>
              Back to Flashcards
            </button>
            <button className="btn btn-outline-primary" onClick={() => window.location.reload()}>
              Start New Session
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
                  className="btn btn-danger btn-lg px-4"
                  onClick={() => handleReview('again')}
                >
                  Again
                </button>
                <button
                  className="btn btn-warning btn-lg px-4"
                  onClick={() => handleReview('hard')}
                >
                  Hard
                </button>
                <button
                  className="btn btn-success btn-lg px-4"
                  onClick={() => handleReview('easy')}
                >
                  Easy
                </button>
              </div>
            )}

            <div className="text-center mt-4">
              <small className="text-muted">
                Again: Reset to 1 day | Hard: Half interval | Easy: Next interval
              </small>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

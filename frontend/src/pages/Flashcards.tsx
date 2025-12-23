import { useState, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../services/api'
import type { Flashcard, GrammaticalForms } from '../types'

export default function Flashcards() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [dueCount, setDueCount] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [native, setNative] = useState('')
  const [target, setTarget] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [cardsRes, dueRes] = await Promise.all([
        api.get('/flashcards'),
        api.get('/flashcards/due-count'),
      ])
      setFlashcards(cardsRes.data.flashcards || [])
      setDueCount(dueRes.data.count || 0)
    } catch (err) {
      setError('Failed to load flashcards')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await api.post('/flashcards', { native, target })
      setNative('')
      setTarget('')
      setShowAddForm(false)
      await fetchData()
    } catch (err) {
      setError('Failed to add flashcard')
    }
  }

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Delete this flashcard?')) return

    try {
      await api.delete(`/flashcards/${id}`)
      await fetchData()
    } catch (err) {
      setError('Failed to delete flashcard')
    }
  }

  const formatForms = (forms: GrammaticalForms): string => {
    switch (forms.type) {
      case 'adjective':
        return `m. ${forms.forms.masculine} / f. ${forms.forms.feminine}${forms.forms.neuter ? ` / n. ${forms.forms.neuter}` : ''}${forms.forms.plural ? ` / pl. ${forms.forms.plural}` : ''}`
      case 'noun':
        return `sg. ${forms.forms.singular} / pl. ${forms.forms.plural}${forms.forms.numeralPlural ? ` / num. ${forms.forms.numeralPlural}` : ''}`
      case 'verb':
        return `pres. ${forms.forms.present} / past. ${forms.forms.past} / fut. ${forms.forms.future}`
      default:
        return ''
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

  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h1>Flashcards</h1>
          <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : 'Add Card'}
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="row mb-4">
          <div className="col-md-4">
            <div className="card text-center">
              <div className="card-body">
                <h3 className="card-title">{flashcards.length}</h3>
                <p className="card-text text-muted">Total Cards</p>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card text-center">
              <div className="card-body">
                <h3 className="card-title">{dueCount}</h3>
                <p className="card-text text-muted">Due Today</p>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card text-center bg-primary text-white">
              <div className="card-body">
                {dueCount > 0 ? (
                  <Link to="/flashcards/session" className="btn btn-light">
                    Start Review Session
                  </Link>
                ) : (
                  <p className="mb-0">No cards due!</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {showAddForm && (
          <div className="card mb-4">
            <div className="card-body">
              <h5 className="card-title">Add New Flashcard</h5>
              <form onSubmit={handleAddCard}>
                <div className="row">
                  <div className="col-md-5 mb-3">
                    <label className="form-label">Native Language</label>
                    <input
                      type="text"
                      className="form-control"
                      value={native}
                      onChange={(e) => setNative(e.target.value)}
                      placeholder="Word in your language"
                      required
                    />
                  </div>
                  <div className="col-md-5 mb-3">
                    <label className="form-label">Target Language</label>
                    <input
                      type="text"
                      className="form-control"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="Word you're learning"
                      required
                    />
                  </div>
                  <div className="col-md-2 d-flex align-items-end mb-3">
                    <button type="submit" className="btn btn-success w-100">
                      Add
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">All Cards</div>
          <ul className="list-group list-group-flush">
            {flashcards.length === 0 ? (
              <li className="list-group-item text-muted text-center py-4">
                No flashcards yet. Add your first card!
              </li>
            ) : (
              flashcards.map((card) => (
                <li key={card.id} className="list-group-item">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="d-flex align-items-center gap-2">
                        <strong>{card.target}</strong>
                        <span className="mx-1">→</span>
                        <span>{card.native}</span>
                        {card.partOfSpeech && (
                          <span className="badge bg-secondary">{card.partOfSpeech}</span>
                        )}
                      </div>
                      {card.forms && card.forms.type !== 'other' && (
                        <small className="text-muted d-block mt-1">
                          {formatForms(card.forms)}
                        </small>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge ${card.status === 'new' ? 'bg-info' : card.status === 'learning' ? 'bg-warning' : 'bg-success'}`}>
                        {card.status}
                      </span>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDeleteCard(card.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </>
  )
}

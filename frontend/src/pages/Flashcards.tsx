import { useState, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../services/api'
import type { Flashcard, GrammaticalForms, Translation } from '../types'

const STATUS_LABELS: Record<string, string> = {
  new: 'nouveau',
  learning: 'en cours',
  review: 'acquis',
}

export default function Flashcards() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [dueCount, setDueCount] = useState(0)
  const [showAddForm, setShowAddForm] = useState(false)
  const [native, setNative] = useState('')
  const [target, setTarget] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Translation state for add form
  const [translationData, setTranslationData] = useState<Translation | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [inputMode, setInputMode] = useState<'native' | 'target'>('native')

  useEffect(() => {
    fetchData()
  }, [])

  const handleTranslate = async () => {
    const wordToTranslate = inputMode === 'target' ? target : native
    if (!wordToTranslate.trim()) return

    setIsTranslating(true)
    setTranslationData(null)

    try {
      if (inputMode === 'target') {
        // User entered Bulgarian word - translate to French
        const response = await api.post('/translate', {
          word: wordToTranslate,
          context: `The word "${wordToTranslate}" in Bulgarian`,
        })
        setTranslationData(response.data)
        setNative(response.data.translation)
        setTarget(response.data.lemma)
      } else {
        // User entered French word - translate to Bulgarian
        const response = await api.post('/translate/reverse', {
          word: wordToTranslate,
          nativeLanguage: 'French',
          targetLanguage: 'Bulgarian',
        })
        setTranslationData(response.data)
        setTarget(response.data.lemma)
        setNative(response.data.translation)
      }
    } catch (err) {
      console.error('Translation failed:', err)
      setError('Échec de la traduction')
    } finally {
      setIsTranslating(false)
    }
  }

  const fetchData = async () => {
    try {
      const [cardsRes, dueRes] = await Promise.all([
        api.get('/flashcards'),
        api.get('/flashcards/due-count'),
      ])
      setFlashcards(cardsRes.data.flashcards || [])
      setDueCount(dueRes.data.count || 0)
    } catch (err) {
      setError('Échec du chargement des flashcards')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      await api.post('/flashcards', {
        native,
        target,
        originalWord: translationData?.word,
        partOfSpeech: translationData?.partOfSpeech,
        forms: translationData?.grammaticalForms,
      })
      setNative('')
      setTarget('')
      setTranslationData(null)
      setShowAddForm(false)
      await fetchData()
    } catch (err) {
      setError('Échec de l\'ajout de la flashcard')
    }
  }

  const clearTranslation = () => {
    setTranslationData(null)
    setNative('')
    setTarget('')
  }

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Supprimer cette flashcard ?')) return

    try {
      await api.delete(`/flashcards/${id}`)
      await fetchData()
    } catch (err) {
      setError('Échec de la suppression')
    }
  }

  const formatForms = (forms: GrammaticalForms): string => {
    switch (forms.type) {
      case 'adjective':
        return `m. ${forms.forms.masculine} / f. ${forms.forms.feminine}${forms.forms.neuter ? ` / n. ${forms.forms.neuter}` : ''}${forms.forms.plural ? ` / pl. ${forms.forms.plural}` : ''}`
      case 'noun':
        return `sg. ${forms.forms.singular} / pl. ${forms.forms.plural}${forms.forms.numeralPlural ? ` / num. ${forms.forms.numeralPlural}` : ''}`
      case 'verb':
        return `prés. ${forms.forms.present} / passé ${forms.forms.past} / fut. ${forms.forms.future}`
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
            <span className="visually-hidden">Chargement...</span>
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
            {showAddForm ? 'Annuler' : 'Ajouter une carte'}
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="row mb-4 g-3">
          <div className="col-md-4">
            <div className="card stat-card h-100">
              <h3>{flashcards.length}</h3>
              <p className="text-muted mb-0">Total des cartes</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card stat-card h-100">
              <h3>{dueCount}</h3>
              <p className="text-muted mb-0">À réviser</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card stat-card h-100 d-flex justify-content-center">
              {dueCount > 0 ? (
                <Link to="/flashcards/session" className="btn btn-primary btn-lg">
                  Commencer la révision
                </Link>
              ) : (
                <p className="text-muted mb-0">Tout est révisé !</p>
              )}
            </div>
          </div>
        </div>

        {showAddForm && (
          <div className="card mb-4">
            <div className="card-body">
              <h5 className="card-title">Ajouter une flashcard</h5>

              {/* Input mode toggle */}
              <div className="btn-group mb-3" role="group">
                <button
                  type="button"
                  className={`btn ${inputMode === 'native' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => { setInputMode('native'); clearTranslation() }}
                >
                  Entrer en français
                </button>
                <button
                  type="button"
                  className={`btn ${inputMode === 'target' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => { setInputMode('target'); clearTranslation() }}
                >
                  Entrer en bulgare
                </button>
              </div>

              <form onSubmit={handleAddCard}>
                <div className="row">
                  {inputMode === 'target' ? (
                    <>
                      <div className="col-md-5 mb-3">
                        <label className="form-label">Bulgare (mot à apprendre)</label>
                        <div className="input-group">
                          <input
                            type="text"
                            className="form-control"
                            value={target}
                            onChange={(e) => { setTarget(e.target.value); setTranslationData(null) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTranslate() } }}
                            placeholder="Entrez un mot en bulgare"
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={handleTranslate}
                            disabled={isTranslating || !target.trim()}
                          >
                            {isTranslating ? '...' : <><span style={{ marginRight: '4px' }}>&#10024;</span>Analyser</>}
                          </button>
                        </div>
                      </div>
                      <div className="col-md-5 mb-3">
                        <label className="form-label">Français (traduction)</label>
                        <input
                          type="text"
                          className="form-control"
                          value={native}
                          onChange={(e) => setNative(e.target.value)}
                          placeholder="Traduction française"
                          required
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-md-5 mb-3">
                        <label className="form-label">Français (votre mot)</label>
                        <div className="input-group">
                          <input
                            type="text"
                            className="form-control"
                            value={native}
                            onChange={(e) => { setNative(e.target.value); setTranslationData(null) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTranslate() } }}
                            placeholder="Entrez un mot en français"
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={handleTranslate}
                            disabled={isTranslating || !native.trim()}
                          >
                            {isTranslating ? '...' : <><span style={{ marginRight: '4px' }}>&#10024;</span>Analyser</>}
                          </button>
                        </div>
                      </div>
                      <div className="col-md-5 mb-3">
                        <label className="form-label">Bulgare (mot à apprendre)</label>
                        <input
                          type="text"
                          className="form-control"
                          value={target}
                          onChange={(e) => setTarget(e.target.value)}
                          placeholder="Traduction bulgare"
                          required
                        />
                      </div>
                    </>
                  )}
                  <div className="col-md-2 d-flex align-items-end mb-3">
                    <button type="submit" className="btn btn-success w-100">
                      Ajouter
                    </button>
                  </div>
                </div>

                {/* Translation preview with forms */}
                {translationData && (
                  <div className="alert alert-info mt-2">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <strong>{translationData.lemma}</strong>
                        {translationData.word !== translationData.lemma && (
                          <small className="text-muted ms-2">(de : {translationData.word})</small>
                        )}
                        {translationData.partOfSpeech && (
                          <span className="badge bg-secondary ms-2">{translationData.partOfSpeech}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1">{translationData.translation}</div>
                    {translationData.grammaticalForms && translationData.grammaticalForms.type !== 'other' && (
                      <div className="mt-2 p-2 bg-white rounded small">
                        {formatForms(translationData.grammaticalForms)}
                      </div>
                    )}
                    {translationData.grammarNote && (
                      <small className="text-muted d-block mt-1">{translationData.grammarNote}</small>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">Toutes les cartes</div>
          <ul className="list-group list-group-flush">
            {flashcards.length === 0 ? (
              <li className="list-group-item text-muted text-center py-4">
                Aucune flashcard. Ajoutez votre première carte !
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
                        {STATUS_LABELS[card.status] || card.status}
                      </span>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDeleteCard(card.id)}
                      >
                        Supprimer
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

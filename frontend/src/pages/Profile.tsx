import { useState, useEffect, FormEvent } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import type { Language } from '../types'

const PROFICIENCY_OPTIONS = [
  { value: 'beginner', label: 'Débutant' },
  { value: 'intermediate', label: 'Intermédiaire' },
  { value: 'advanced', label: 'Avancé' },
  { value: 'fluent', label: 'Courant' },
]

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState('')
  const [languages, setLanguages] = useState<Language[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name)
    }
    fetchLanguages()
  }, [user])

  const fetchLanguages = async () => {
    try {
      const response = await api.get('/user/languages')
      setLanguages(response.data.languages || [])
    } catch (err) {
      console.error('Failed to fetch languages:', err)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setIsLoading(true)

    try {
      await api.put('/user/profile', { name, nativeLanguage: 'French' })
      await refreshUser()
      setMessage('Profil mis à jour')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la mise à jour')
    } finally {
      setIsLoading(false)
    }
  }

  const updateProficiency = async (language: string, proficiency: string) => {
    try {
      await api.put(`/user/languages/${encodeURIComponent(language)}`, { proficiency })
      await fetchLanguages()
    } catch (err) {
      setError('Échec de la mise à jour du niveau')
    }
  }

  const currentProficiency = languages[0]?.proficiency || 'beginner'

  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <h1>Profil</h1>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="row">
          <div className="col-md-6">
            <div className="card mb-4">
              <div className="card-body">
                <h5 className="card-title">Informations personnelles</h5>
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="name" className="form-label">Prénom</label>
                    <input
                      type="text"
                      className="form-control"
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label">Adresse e-mail</label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      value={user?.email || ''}
                      disabled
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Niveau de bulgare</h5>
                <div className="d-flex align-items-center gap-3">
                  <span className="text-muted">Votre niveau actuel :</span>
                  <select
                    className="form-select w-auto"
                    value={currentProficiency}
                    onChange={(e) => updateProficiency('Bulgarian', e.target.value)}
                  >
                    {PROFICIENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

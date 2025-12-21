import { useState, useEffect, FormEvent } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import type { Language } from '../types'

const LANGUAGES = [
  'Bulgarian', 'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Chinese', 'Japanese', 'Korean', 'Russian', 'Arabic', 'Hindi',
  'Dutch', 'Swedish', 'Polish',
]

export default function Profile() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState('')
  const [languages, setLanguages] = useState<Language[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name)
      setNativeLanguage(user.nativeLanguage)
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
      await api.put('/user/profile', { name, nativeLanguage })
      await refreshUser()
      setMessage('Profile updated successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsLoading(false)
    }
  }

  const updateProficiency = async (language: string, proficiency: string) => {
    try {
      await api.put(`/user/languages/${encodeURIComponent(language)}`, { proficiency })
      await fetchLanguages()
    } catch (err) {
      setError('Failed to update proficiency')
    }
  }

  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <h1>Profile</h1>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="row">
          <div className="col-md-6">
            <div className="card mb-4">
              <div className="card-body">
                <h5 className="card-title">Personal Information</h5>
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="name" className="form-label">Name</label>
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
                    <label htmlFor="email" className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      value={user?.email || ''}
                      disabled
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="nativeLanguage" className="form-label">Native Language</label>
                    <select
                      className="form-select"
                      id="nativeLanguage"
                      value={nativeLanguage}
                      onChange={(e) => setNativeLanguage(e.target.value)}
                      required
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Languages You're Learning</h5>
                {languages.length === 0 ? (
                  <p className="text-muted">No languages added yet.</p>
                ) : (
                  <ul className="list-group">
                    {languages.map((lang) => (
                      <li key={lang.language} className="list-group-item d-flex justify-content-between align-items-center">
                        <span>{lang.language}</span>
                        <select
                          className="form-select form-select-sm w-auto"
                          value={lang.proficiency}
                          onChange={(e) => updateProficiency(lang.language, e.target.value)}
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                          <option value="fluent">Fluent</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

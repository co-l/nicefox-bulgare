import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const LANGUAGES = [
  'Bulgarian',
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Chinese',
  'Japanese',
  'Korean',
  'Russian',
  'Arabic',
  'Hindi',
  'Dutch',
  'Swedish',
  'Polish',
]

const PROFICIENCY_LEVELS = [
  { value: 'beginner', label: 'Beginner', description: 'Just starting out' },
  { value: 'intermediate', label: 'Intermediate', description: 'Can hold basic conversations' },
  { value: 'advanced', label: 'Advanced', description: 'Comfortable in most situations' },
  { value: 'fluent', label: 'Fluent', description: 'Near-native proficiency' },
]

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [nativeLanguage, setNativeLanguage] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('')
  const [proficiency, setProficiency] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [originalLanguage, setOriginalLanguage] = useState('')
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  useEffect(() => {
    const loadExistingSettings = async () => {
      try {
        const response = await api.get('/user/profile')
        const { user, languages } = response.data

        if (user?.nativeLanguage) {
          setNativeLanguage(user.nativeLanguage)
          setIsEditing(true)
        }

        if (languages && languages.length > 0) {
          setTargetLanguage(languages[0].language)
          setOriginalLanguage(languages[0].language)
          setProficiency(languages[0].proficiency)
        }
      } catch {
        // New user, use browser language detection
        const browserLang = navigator.language.split('-')[0]
        const langMap: Record<string, string> = {
          en: 'English',
          es: 'Spanish',
          fr: 'French',
          de: 'German',
          it: 'Italian',
          pt: 'Portuguese',
          zh: 'Chinese',
          ja: 'Japanese',
          ko: 'Korean',
          ru: 'Russian',
          ar: 'Arabic',
          hi: 'Hindi',
          nl: 'Dutch',
          sv: 'Swedish',
          pl: 'Polish',
        }
        if (langMap[browserLang]) {
          setNativeLanguage(langMap[browserLang])
        }
      }
    }
    loadExistingSettings()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await api.put('/user/profile', { nativeLanguage })
      if (originalLanguage && targetLanguage === originalLanguage) {
        // Same language, just update proficiency
        await api.put(`/user/languages/${targetLanguage}`, { proficiency })
      } else {
        // New language or changed language
        await api.post('/user/languages', { language: targetLanguage, proficiency })
      }
      await refreshUser()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="row justify-content-center mt-5">
        <div className="col-md-8 col-lg-6">
          <div className="card shadow">
            <div className="card-body p-4">
              <h2 className="text-center mb-4">
                {isEditing ? 'Language Settings' : "Welcome! Let's get started"}
              </h2>

              <div className="d-flex justify-content-center mb-4">
                <div className={`badge ${step >= 1 ? 'bg-primary' : 'bg-secondary'} me-2`}>1</div>
                <div className={`badge ${step >= 2 ? 'bg-primary' : 'bg-secondary'} me-2`}>2</div>
                <div className={`badge ${step >= 3 ? 'bg-primary' : 'bg-secondary'}`}>3</div>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit}>
                {step === 1 && (
                  <div>
                    <h5>What's your native language?</h5>
                    <select
                      className="form-select form-select-lg mb-3"
                      value={nativeLanguage}
                      onChange={(e) => setNativeLanguage(e.target.value)}
                      required
                    >
                      <option value="">Select language...</option>
                      {LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary w-100"
                      onClick={() => setStep(2)}
                      disabled={!nativeLanguage}
                    >
                      Continue
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <h5>What language do you want to learn?</h5>
                    <select
                      className="form-select form-select-lg mb-3"
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      required
                    >
                      <option value="">Select language...</option>
                      {LANGUAGES.filter((l) => l !== nativeLanguage).map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary flex-fill"
                        onClick={() => setStep(1)}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary flex-fill"
                        onClick={() => setStep(3)}
                        disabled={!targetLanguage}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div>
                    <h5>What's your current level in {targetLanguage}?</h5>
                    <div className="list-group mb-3">
                      {PROFICIENCY_LEVELS.map((level) => (
                        <label
                          key={level.value}
                          className={`list-group-item list-group-item-action ${
                            proficiency === level.value ? 'active' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            className="d-none"
                            name="proficiency"
                            value={level.value}
                            checked={proficiency === level.value}
                            onChange={(e) => setProficiency(e.target.value)}
                          />
                          <strong>{level.label}</strong>
                          <br />
                          <small>{level.description}</small>
                        </label>
                      ))}
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary flex-fill"
                        onClick={() => setStep(2)}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary flex-fill"
                        disabled={!proficiency || isLoading}
                      >
                        {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Start Learning'}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

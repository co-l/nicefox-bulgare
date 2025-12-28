import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const PROFICIENCY_LEVELS = [
  { value: 'beginner', label: 'Débutant', description: 'Je commence tout juste' },
  { value: 'intermediate', label: 'Intermédiaire', description: 'Je peux tenir des conversations basiques' },
  { value: 'advanced', label: 'Avancé', description: 'À l\'aise dans la plupart des situations' },
  { value: 'fluent', label: 'Courant', description: 'Proche du niveau natif' },
]

export default function Onboarding() {
  const [proficiency, setProficiency] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  useEffect(() => {
    const loadExistingSettings = async () => {
      try {
        const response = await api.get('/user/profile')
        const { languages } = response.data

        // Check specifically for Bulgarian
        const bulgarian = languages?.find((l: { language: string }) => l.language === 'Bulgarian')
        if (bulgarian) {
          setProficiency(bulgarian.proficiency)
          setIsEditing(true)
        }
      } catch {
        // New user
      }
    }
    loadExistingSettings()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Always set French as native language
      await api.put('/user/profile', { nativeLanguage: 'French' })

      if (isEditing) {
        // Update existing Bulgarian proficiency
        await api.put('/user/languages/Bulgarian', { proficiency })
      } else {
        // Create Bulgarian as target language
        await api.post('/user/languages', { language: 'Bulgarian', proficiency })
      }

      await refreshUser()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la configuration')
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
                {isEditing ? 'Niveau de bulgare' : 'Bienvenue !'}
              </h2>

              {error && <div className="alert alert-danger">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div>
                  <h5 className="mb-3">Quel est votre niveau en bulgare ?</h5>
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
                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={!proficiency || isLoading}
                  >
                    {isLoading ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Commencer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

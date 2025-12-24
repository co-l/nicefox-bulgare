import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import type { Language } from '../types'

const PROFICIENCY_LABELS: Record<string, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  fluent: 'Courant',
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [languages, setLanguages] = useState<Language[]>([])
  const [dueCards, setDueCards] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [langRes, cardsRes] = await Promise.all([
          api.get('/user/languages'),
          api.get('/flashcards/due-count'),
        ])
        setLanguages(langRes.data.languages || [])
        setDueCards(cardsRes.data.count || 0)

        if (!langRes.data.languages?.length) {
          navigate('/onboarding')
        }
      } catch (error) {
        console.error('Erreur lors du chargement:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [navigate])

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="container mt-4">
          <div className="text-center">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Chargement...</span>
            </div>
          </div>
        </div>
      </>
    )
  }

  const currentLevel = languages[0]?.proficiency
    ? PROFICIENCY_LABELS[languages[0].proficiency] || languages[0].proficiency
    : null

  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <h1>Bonjour, {user?.name} !</h1>
        <p className="text-muted">
          Continuez votre apprentissage du bulgare
          {currentLevel && <span className="badge bg-primary ms-2">{currentLevel}</span>}
        </p>

        <div className="row mt-4">
          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">Pratiquer la conversation</h5>
                <p className="card-text">
                  Discutez avec votre tuteur IA pour pratiquer et améliorer votre bulgare.
                </p>
                <Link to="/chat" className="btn btn-primary">
                  Commencer à discuter
                </Link>
              </div>
            </div>
          </div>

          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">Flashcards</h5>
                <p className="card-text">
                  {dueCards > 0
                    ? `Vous avez ${dueCards} carte${dueCards > 1 ? 's' : ''} à réviser.`
                    : 'Aucune carte à réviser. Ajoutez du vocabulaire !'}
                </p>
                <Link to="/flashcards" className="btn btn-primary">
                  Réviser les cartes
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import type { Language } from '../types'

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
        console.error('Failed to fetch dashboard data:', error)
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
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div className="container mt-4">
        <h1>Welcome, {user?.name}!</h1>
        <p className="text-muted">Continue your language learning journey</p>

        <div className="row mt-4">
          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-body">
                <h5 className="card-title">Practice Conversation</h5>
                <p className="card-text">
                  Chat with your AI tutor to practice speaking and improve fluency.
                </p>
                <Link to="/chat" className="btn btn-primary">
                  Start Chatting
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
                    ? `You have ${dueCards} cards due for review.`
                    : 'No cards due. Add new vocabulary!'}
                </p>
                <Link to="/flashcards" className="btn btn-primary">
                  Review Cards
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h5>Your Languages</h5>
          <div className="list-group">
            {languages.map((lang) => (
              <div key={lang.language} className="list-group-item d-flex justify-content-between align-items-center">
                <span>{lang.language}</span>
                <span className="badge bg-primary">{lang.proficiency}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

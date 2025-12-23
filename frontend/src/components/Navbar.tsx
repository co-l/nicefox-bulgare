import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    if (user) {
      fetchDueCount()
      // Refresh due count every 60 seconds
      const interval = setInterval(fetchDueCount, 60000)
      return () => clearInterval(interval)
    }
  }, [user])

  const fetchDueCount = async () => {
    try {
      const response = await api.get('/flashcards/due-count')
      setDueCount(response.data.count || 0)
    } catch (err) {
      // Silently fail - not critical
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
      <div className="container">
        <Link className="navbar-brand" to="/">
          Become Fluent
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <Link className="nav-link" to="/chat">
                Chat
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link d-flex align-items-center" to="/flashcards">
                Flashcards
                {dueCount > 0 && (
                  <span
                    className="badge rounded-pill ms-2"
                    style={{
                      fontSize: '0.7rem',
                      backgroundColor: 'rgba(255,255,255,0.25)',
                      color: 'white',
                      fontWeight: 500
                    }}
                  >
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
              </Link>
            </li>
          </ul>
          <ul className="navbar-nav">
            <li className="nav-item dropdown">
              <a
                className="nav-link dropdown-toggle"
                href="#"
                role="button"
                data-bs-toggle="dropdown"
              >
                {user?.name || 'Account'}
              </a>
              <ul className="dropdown-menu dropdown-menu-end">
                <li>
                  <Link className="dropdown-item" to="/profile">
                    Profile
                  </Link>
                </li>
                <li>
                  <Link className="dropdown-item" to="/onboarding">
                    Language Settings
                  </Link>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button className="dropdown-item" onClick={handleLogout}>
                    Logout
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

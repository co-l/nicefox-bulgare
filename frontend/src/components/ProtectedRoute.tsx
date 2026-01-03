import { useAuth } from '../context/AuthContext'
import { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
}

// SSO login URL - redirects back to current page after auth
const AUTH_SERVICE_URL = 'https://auth.nicefox.net'

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, authError } = useAuth()

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Chargement...</span>
        </div>
      </div>
    )
  }

  // Server error during auth check - show error instead of redirect loop
  if (authError) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="alert alert-danger" role="alert">
            <h5 className="alert-heading">Erreur d'authentification</h5>
            <p>{authError}</p>
            <hr />
            <button
              className="btn btn-outline-danger"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    // Redirect to SSO login with current URL as redirect target
    // Use origin + pathname to avoid including query params (like ?token=) in the redirect
    const currentUrl = window.location.origin + window.location.pathname
    window.location.href = `${AUTH_SERVICE_URL}/login?redirect=${encodeURIComponent(currentUrl)}`

    // Show loading while redirecting
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Redirection vers la connexion...</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

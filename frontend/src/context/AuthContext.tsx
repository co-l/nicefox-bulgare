import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { AxiosError } from 'axios'
import api from '../services/api'
import type { User, AuthContextType } from '../types'

const AuthContext = createContext<AuthContextType | null>(null)

// Storage key for dev mode token
const DEV_TOKEN_KEY = 'dev_auth_token'

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const refreshUser = async () => {
    try {
      const response = await api.get<{ user: User }>('/auth/me')
      setUser(response.data.user)
      setAuthError(null)
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string }>
      const status = axiosError.response?.status

      if (status === 401) {
        // Not authenticated - clear token and allow redirect to SSO
        localStorage.removeItem(DEV_TOKEN_KEY)
        setUser(null)
        setAuthError(null)
      } else {
        // Server error (500, network error, etc.) - don't redirect to SSO
        // Keep user null but set error to prevent redirect loop
        setUser(null)
        setAuthError(axiosError.response?.data?.error || 'Server error during authentication')
        console.error('Auth check failed with server error:', status, axiosError.message)
      }
    }
  }

  // Check auth status on mount using SSO cookie
  useEffect(() => {
    const checkAuth = async () => {
      // Check if SSO returned a token in URL (for dev mode / cross-domain)
      const urlParams = new URLSearchParams(window.location.search)
      const tokenFromUrl = urlParams.get('token')

      if (tokenFromUrl) {
        // Store token for dev mode and clean URL
        localStorage.setItem(DEV_TOKEN_KEY, tokenFromUrl)
        window.history.replaceState({}, '', window.location.pathname)
      }

      await refreshUser()
      setIsLoading(false)
    }

    checkAuth()
  }, [])

  const logout = async () => {
    try {
      const response = await api.post<{ logoutUrl?: string }>('/auth/logout')
      setUser(null)
      localStorage.removeItem(DEV_TOKEN_KEY)
      // Optionally redirect to SSO logout for full logout
      if (response.data.logoutUrl) {
        window.location.href = response.data.logoutUrl
      }
    } catch {
      // Clear local state anyway
      setUser(null)
      localStorage.removeItem(DEV_TOKEN_KEY)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        authError,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

// Storage key for dev mode token
const DEV_TOKEN_KEY = 'dev_auth_token'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3188'

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true, // Important: sends cookies with requests
})

// Request interceptor: add Authorization header in dev mode
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // In dev mode, send stored token as Bearer header
  // (cookies from .nicefox.net won't work on localhost)
  const devToken = localStorage.getItem(DEV_TOKEN_KEY)
  if (devToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${devToken}`
  }
  return config
})

// Track if we're already redirecting to prevent loops
let isRedirecting = false

// Response interceptor to handle 401 with SSO redirect
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; loginUrl?: string }>) => {
    // Don't redirect on /auth/me - let AuthContext handle it
    // Only redirect on protected API calls that fail
    const isAuthCheck = error.config?.url === '/auth/me'

    if (error.response?.status === 401 && !isAuthCheck && !isRedirecting) {
      const loginUrl = error.response.data?.loginUrl
      if (loginUrl) {
        isRedirecting = true
        // Clear any stale token
        localStorage.removeItem(DEV_TOKEN_KEY)
        // Redirect to SSO login
        window.location.href = loginUrl
        // Return a never-resolving promise to prevent further handling
        return new Promise(() => {})
      }
    }
    return Promise.reject(error)
  }
)

export default api

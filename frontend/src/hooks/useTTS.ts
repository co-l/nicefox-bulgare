import { useState, useRef, useCallback } from 'react'
import api from '../services/api'

interface UseTTSReturn {
  isLoading: boolean
  isPlaying: boolean
  error: string | null
  speak: (text: string) => Promise<void>
  stop: () => void
}

export function useTTS(): UseTTSReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadingRef = useRef(false)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
    }
  }, [])

  const speak = useCallback(async (text: string) => {
    // Prevent duplicate calls while loading
    if (loadingRef.current) return
    loadingRef.current = true

    try {
      // Stop any currently playing audio
      stop()

      setIsLoading(true)
      setError(null)

      // Request audio generation
      const response = await api.post('/tts/generate', { text })
      const { audioId } = response.data

      // Create audio element and play
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3188'
      const audio = new Audio(`${apiUrl}/api/tts/audio/${audioId}`)
      audioRef.current = audio

      audio.onplay = () => setIsPlaying(true)
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setError('Failed to play audio')
        setIsPlaying(false)
      }

      await audio.play()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS failed'
      setError(message)
      console.error('TTS error:', err)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [stop])

  return { isLoading, isPlaying, error, speak, stop }
}

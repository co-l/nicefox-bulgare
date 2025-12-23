import { useState, useRef, useCallback } from 'react'
import api from '../services/api'

interface UseSTTReturn {
  isRecording: boolean
  isTranscribing: boolean
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string>
}

export function useSTT(): UseSTTReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      chunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access microphone'
      setError(message)
      throw err
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        reject(new Error('No recording in progress'))
        return
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        setIsTranscribing(true)

        try {
          // Stop all tracks
          mediaRecorder.stream.getTracks().forEach((track) => track.stop())

          // Create blob from chunks
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

          // Send to backend for transcription
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.webm')

          const response = await api.post('/stt/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })

          resolve(response.data.text || '')
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Transcription failed'
          setError(message)
          reject(err)
        } finally {
          setIsTranscribing(false)
          mediaRecorderRef.current = null
          chunksRef.current = []
        }
      }

      mediaRecorder.stop()
    })
  }, [])

  return { isRecording, isTranscribing, error, startRecording, stopRecording }
}

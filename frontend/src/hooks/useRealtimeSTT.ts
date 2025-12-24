import { useState, useRef, useCallback } from 'react'

interface UseRealtimeSTTReturn {
  isRecording: boolean
  transcript: string
  partialTranscript: string
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
}

const GLADIA_WS_URL = 'wss://api.gladia.io/audio/text/audio-transcription'

export function useRealtimeSTT(language: string = 'bulgarian'): UseRealtimeSTTReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [partialTranscript, setPartialTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setTranscript('')
      setPartialTranscript('')

      const gladiaKey = import.meta.env.VITE_GLADIA_API_KEY
      if (!gladiaKey) {
        throw new Error('Gladia API key not configured')
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Create audio context with native sample rate
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)

      // Create processor for audio chunks (use native sample rate)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const nativeSampleRate = audioContext.sampleRate

      // Connect to Gladia WebSocket
      const ws = new WebSocket(GLADIA_WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Gladia WebSocket connected', { sampleRate: nativeSampleRate })

        // Send configuration with native sample rate
        const configuration = {
          x_gladia_key: gladiaKey,
          language_behaviour: 'manual',
          language: language,
          sample_rate: nativeSampleRate,
          encoding: 'WAV/PCM',
        }
        ws.send(JSON.stringify(configuration))
        setIsRecording(true)
      }

      ws.onmessage = (event) => {
        try {
          const utterance = JSON.parse(event.data)

          if (utterance.event === 'transcript') {
            if (utterance.type === 'partial') {
              // Partial transcript (words appearing in real-time)
              setPartialTranscript(utterance.transcription || '')
            } else if (utterance.type === 'final') {
              // Final transcript
              setTranscript(prev => {
                const newText = utterance.transcription || ''
                return prev ? `${prev} ${newText}` : newText
              })
              setPartialTranscript('')
            }
          }
        } catch (err) {
          console.error('Error parsing Gladia message:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('Gladia WebSocket error:', err)
        setError('WebSocket connection error')
      }

      ws.onclose = () => {
        console.log('Gladia WebSocket closed')
      }

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0)

          // Convert Float32Array to Int16Array (PCM 16-bit)
          const pcmData = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff
          }

          // Convert to base64
          const base64 = arrayBufferToBase64(pcmData.buffer)
          ws.send(JSON.stringify({ frames: base64 }))
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording'
      setError(message)
      console.error('Recording error:', err)
      throw err
    }
  }, [language])

  const stopRecording = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    setIsRecording(false)
  }, [])

  return {
    isRecording,
    transcript,
    partialTranscript,
    error,
    startRecording,
    stopRecording,
  }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

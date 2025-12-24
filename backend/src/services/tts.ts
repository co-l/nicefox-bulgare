import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
import { join, dirname } from 'path'
import { unlink } from 'fs/promises'
import { fileURLToPath } from 'url'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = join(__dirname, '..', '..')
const AUDIO_DIR = join(BACKEND_ROOT, 'audio-cache')
const AUDIO_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'

// ElevenLabs voice IDs for different use cases
// Using a neutral multilingual voice that works well for all languages
const DEFAULT_VOICE_ID = 'ErXwobaYiN019PkySvjV' // Antoni - friendly male voice

// Map language codes to ElevenLabs model IDs
const MODEL_MAP: Record<string, string> = {
  bulgarian: 'eleven_multilingual_v2',
  french: 'eleven_multilingual_v2',
  spanish: 'eleven_multilingual_v2',
  german: 'eleven_multilingual_v2',
  english: 'eleven_monolingual_v1',
  italian: 'eleven_multilingual_v2',
  portuguese: 'eleven_multilingual_v2',
  russian: 'eleven_multilingual_v2',
  chinese: 'eleven_multilingual_v2',
  japanese: 'eleven_multilingual_v2',
}

// Ensure audio cache directory exists
if (!existsSync(AUDIO_DIR)) {
  mkdirSync(AUDIO_DIR, { recursive: true })
}

interface AudioResult {
  audioId: string
  filePath: string
}

export async function generateAudio(text: string, language: string): Promise<AudioResult> {
  if (!ELEVENLABS_API_KEY) {
    console.error('ElevenLabs API key not configured')
    throw new Error('ElevenLabs API key not configured')
  }

  const modelId = MODEL_MAP[language.toLowerCase()] || MODEL_MAP.english
  const audioId = randomUUID()
  const filePath = join(AUDIO_DIR, `${audioId}.mp3`)

  console.log(`[TTS] Generating audio for language: ${language}, model: ${modelId}`)
  console.log(`[TTS] Text length: ${text.length} characters`)

  try {
    // Call ElevenLabs API
    const url = `${ELEVENLABS_API_URL}/${DEFAULT_VOICE_ID}`
    console.log(`[TTS] Calling ElevenLabs API: ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: 0.8, // Slower speech (~1.25x slower)
        },
      }),
    })

    console.log(`[TTS] ElevenLabs response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[TTS] ElevenLabs API error: ${errorText}`)
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`)
    }

    // Stream the audio response to file
    if (!response.body) {
      console.error('[TTS] No response body from ElevenLabs API')
      throw new Error('No response body from ElevenLabs API')
    }

    console.log(`[TTS] Streaming audio to file: ${filePath}`)
    const writeStream = createWriteStream(filePath)
    await pipeline(Readable.fromWeb(response.body as any), writeStream)

    console.log(`[TTS] Audio file saved successfully: ${audioId}`)

    // Schedule cleanup after expiry
    setTimeout(() => {
      cleanupAudio(audioId).catch(console.error)
    }, AUDIO_EXPIRY_MS)

    return { audioId, filePath }
  } catch (error) {
    console.error('[TTS] Error generating audio:', error)
    // Clean up file if it was created
    if (existsSync(filePath)) {
      await unlink(filePath).catch(() => {})
    }
    throw error
  }
}

export function getAudioPath(audioId: string): string | null {
  // Validate audioId format (UUID) to prevent path traversal
  if (!/^[a-f0-9-]{36}$/.test(audioId)) {
    return null
  }

  const filePath = join(AUDIO_DIR, `${audioId}.mp3`)
  if (existsSync(filePath)) {
    return filePath
  }
  return null
}

export async function cleanupAudio(audioId: string): Promise<void> {
  const filePath = getAudioPath(audioId)
  if (filePath) {
    try {
      await unlink(filePath)
    } catch {
      // File may already be deleted
    }
  }
}

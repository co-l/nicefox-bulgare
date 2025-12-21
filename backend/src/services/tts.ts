import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { unlink } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const PIPER_BIN = join(PROJECT_ROOT, '.venv', 'bin', 'piper')
const VOICES_DIR = join(PROJECT_ROOT, '.piper-voices')
const AUDIO_DIR = join(PROJECT_ROOT, 'audio-cache')
const AUDIO_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

// Map language codes to Piper voice model files
const VOICE_MAP: Record<string, string> = {
  bulgarian: 'bg_BG-dimitar-medium',
  french: 'fr_FR-siwis-medium',
  spanish: 'es_ES-davefx-medium',
  german: 'de_DE-thorsten-medium',
  english: 'en_US-lessac-medium',
  italian: 'it_IT-riccardo-x_low',
  portuguese: 'pt_BR-faber-medium',
  russian: 'ru_RU-irina-medium',
  chinese: 'zh_CN-huayan-medium',
  japanese: 'ja_JP-takumi-medium',
}

function getModelPath(voice: string): string {
  return join(VOICES_DIR, `${voice}.onnx`)
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
  const voiceName = VOICE_MAP[language.toLowerCase()] || VOICE_MAP.english
  const modelPath = getModelPath(voiceName)
  const audioId = randomUUID()
  const filePath = join(AUDIO_DIR, `${audioId}.wav`)

  // Check if voice model exists
  if (!existsSync(modelPath)) {
    throw new Error(`Voice model not found: ${voiceName}. Please download it first.`)
  }

  return new Promise((resolve, reject) => {
    const piper = spawn(PIPER_BIN, [
      '--model', modelPath,
      '--output_file', filePath,
      '--length-scale', '1.6', // Slower speech
    ])

    piper.stdin.write(text)
    piper.stdin.end()

    let stderr = ''
    piper.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    piper.on('close', (code) => {
      if (code === 0) {
        // Schedule cleanup after expiry
        setTimeout(() => {
          cleanupAudio(audioId).catch(console.error)
        }, AUDIO_EXPIRY_MS)

        resolve({ audioId, filePath })
      } else {
        reject(new Error(`Piper TTS failed (code ${code}): ${stderr}`))
      }
    })

    piper.on('error', (err) => {
      reject(new Error(`Failed to spawn piper: ${err.message}`))
    })
  })
}

export function getAudioPath(audioId: string): string | null {
  // Validate audioId format (UUID) to prevent path traversal
  if (!/^[a-f0-9-]{36}$/.test(audioId)) {
    return null
  }

  const filePath = join(AUDIO_DIR, `${audioId}.wav`)
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

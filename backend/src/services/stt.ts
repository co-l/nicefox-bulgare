import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { unlink } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..', '..')
const PYTHON_BIN = join(PROJECT_ROOT, '.venv', 'bin', 'python3')
const TRANSCRIBE_SCRIPT = join(PROJECT_ROOT, 'scripts', 'transcribe.py')
const TEMP_DIR = join(PROJECT_ROOT, 'temp-audio')

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true })
}

interface TranscribeResult {
  text: string
}

export async function transcribeAudio(audioBuffer: Buffer, language?: string): Promise<TranscribeResult> {
  const tempId = randomUUID()
  const tempPath = join(TEMP_DIR, `${tempId}.webm`)

  // Write audio buffer to temp file
  writeFileSync(tempPath, audioBuffer)

  try {
    const result = await runTranscription(tempPath, language)
    return result
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

function runTranscription(audioPath: string, language?: string): Promise<TranscribeResult> {
  return new Promise((resolve, reject) => {
    const args = [TRANSCRIBE_SCRIPT, audioPath]
    if (language) {
      args.push(language)
    }
    const process = spawn(PYTHON_BIN, args)

    let stdout = ''
    let stderr = ''

    process.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    process.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim())
          if (result.error) {
            reject(new Error(result.error))
          } else {
            resolve({ text: result.text || '' })
          }
        } catch (e) {
          reject(new Error(`Failed to parse transcription result: ${stdout}`))
        }
      } else {
        reject(new Error(`Transcription failed (code ${code}): ${stderr}`))
      }
    })

    process.on('error', (err) => {
      reject(new Error(`Failed to spawn transcription process: ${err.message}`))
    })
  })
}

#!/usr/bin/env python3
"""Transcribe audio using faster-whisper."""
import sys
import json
from faster_whisper import WhisperModel

# Use large-v3-turbo - best accuracy with good speed
model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")

# Map language names to Whisper language codes
LANGUAGE_MAP = {
    "bulgarian": "bg",
    "french": "fr",
    "spanish": "es",
    "german": "de",
    "english": "en",
    "italian": "it",
    "portuguese": "pt",
    "russian": "ru",
    "chinese": "zh",
    "japanese": "ja",
}

def transcribe(audio_path: str, language: str = None) -> str:
    """Transcribe audio file to text."""
    lang_code = LANGUAGE_MAP.get(language.lower()) if language else None
    segments, _ = model.transcribe(audio_path, beam_size=5, language=lang_code)
    text = " ".join(segment.text.strip() for segment in segments)
    return text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <audio_path> [language]"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        text = transcribe(audio_path, language)
        print(json.dumps({"text": text}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

# Spec: Become Fluent (Language Learning App)

## Overview
A responsive web app that helps users learn languages through **AI-powered conversations** and **spaced repetition flashcards**. The app combines real-time chat with an AI tutor and a flashcard system to reinforce vocabulary retention.

---

## User Stories
1. **Authentication**
   - Users can create an account (email/password).
   - Users can log out.

2. **Profile Setup**
   - Users add their name, native language, and target language.
   - Users select their proficiency level (Beginner, Intermediate, Advanced, Fluent).

3. **AI Chat**
   - The AI starts conversations with context-aware small talk (e.g., "How was your day?").
   - AI responses are **TTS-enabled** (text-to-speech).
   - Uses current date/events (e.g., holidays, weekends) for relevance.
   - Users chat with an AI tutor in the target language (text or voice input).
   - Users can click on words in the chat to:
     - See translations and grammatical explanations.
     - Add words to their flashcard deck (highlighted in the chat).

4. **Flashcards**
   - Users can manually add custom flashcards (native ↔ target language).
   - Users can review flashcards in spaced-repetition sessions (10 cards per session).
   - Flashcards follow a **spaced-repetition schedule**:
     - New cards: 15 minutes → 1 day → 3 days → 7 days → 15 days → 30 days.
     - "Easy": Proceeds to the next interval.
     - "Hard": Repeats at half the next interval (e.g., 1 day → 12 hours).
     - "Again": Resets to the 1-day interval.

5. **Chat History**
   - Users can access past conversations and continue them.


---

## Technical Stack
- **Frontend**: React + Bootstrap 5
- **Backend**: Node.js + NiceFox GraphDB (graph database for relationships)
- **AI**:
  - Mistral API (conversation)
  - Whisper (speech-to-text)
  - TTS (text-to-speech for AI responses)

---

## Data Model (NiceFox GraphDB - Cypher)
```cypher
// Users
(u:BF_User { id: string, email: string, name: string, native_language: string })

// Languages
(u)-[:BF_LEARNS]->(l:BF_Language { language: string, proficiency: string })

// Chats
(l)-[:BF_HAS_CHAT]->(c:BF_Chat { id: string, messages: JSON, created_at: timestamp, updated_at: timestamp })

// Flashcards
(l)-[:BF_HAS_FLASHCARD { next_display: timestamp, interval_index: int, status: string }]->(f:BF_Flashcard {
  id: string,
  native: string,
  target: string,
  original_word: string,
  part_of_speech: string,
  forms: JSON,
  last_reviewed: timestamp
})
```

---

## Workflow

### 1. Onboarding
1. User logs in (email/Google).
2. Welcome flow:
   - Auto-detects native language (browser locale).
   - User selects target language and proficiency.
3. Redirects to the main dashboard.

### 2. AI Chat
1. User starts a conversation (text/voice).
2. AI responds with TTS and context-aware small talk.
3. User can:
   - Click words to see translations/grammar.
   - Add words to flashcards (highlighted in chat).
4. Chat history is saved for later review.

### 3. Flashcards
1. User views their flashcard deck (total cards + progress).
2. Starts a session (10 cards):
   - Cards show native → target (or vice versa).
   - User rates difficulty ("Easy," "Hard," "Again").
3. Session ends; user returns to the flashcard dashboard.

---

## Spaced-Repetition Algorithm
| Action  | Next Review Time       |
|---------|------------------------|
| Easy    | Next interval (e.g., 1d → 3d) |
| Hard    | Half the next interval (e.g., 1d → 12h) |
| Again   | Reset to 1 day         |
This is done by setting the "next_display" in the (l)-[:FLASHCARDS]->(f) relationship.
One small important quirk, is that this date should not be set to be exactly 24hours for 1day ; it should be set at 3AM the next day ; so the user can do the previous lesson during the afternoon, and the next one in the morning (less than 24 hours). Same for any duration, except if less than 24 hours.

---

## Open Questions
1. Should flashcards support images/audio?
2. Should the AI tutor correct grammar in real-time?
3. Should there be a "daily streak" feature for motivation?

---

### MVP Features
- Authentication, AI Chat, Flashcards
### Future Features
- Daily streaks, grammar correction

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Become Fluent is a language learning app combining AI-powered conversations (Mistral) with spaced-repetition flashcards. Users chat with an AI tutor in their target language and build vocabulary through flashcard review sessions.

## Commands

```bash
# Development (runs both frontend and backend concurrently)
npm run dev

# Run only backend (Express on port 3001)
npm run dev:backend

# Run only frontend (Vite on port 5173)
npm run dev:frontend

# Build all
npm run build

# Lint all workspaces
npm run lint

# Type check frontend
cd frontend && npx tsc --noEmit

# Type check backend
cd backend && npx tsc --noEmit
```

## Architecture

### Monorepo Structure
- **npm workspaces** with `frontend/` and `backend/` packages
- Frontend proxies `/api` requests to backend via Vite config

### Backend (`backend/src/`)
- **Express + TypeScript** with ES modules (`.js` extensions in imports)
- **Neo4j** graph database for all data storage
- **JWT auth** with access tokens (15min) and refresh tokens (7 days)
- Routes: `/api/auth`, `/api/user`, `/api/flashcards`, `/api/chat`

### Frontend (`frontend/src/`)
- **React 18 + TypeScript + Vite**
- **Bootstrap 5** for styling (imported in `main.tsx`)
- **AuthContext** manages auth state and token refresh
- **ProtectedRoute** component wraps authenticated pages

### Data Model (Neo4j Graph)
```
(User)-[:LEARNS]->(Language)-[:HAS_FLASHCARD {next_display, interval_index}]->(Flashcard)
(User)-[:LEARNS]->(Language)-[:HAS_CHAT]->(Chat {messages: JSON})
```

### Spaced Repetition Algorithm
Located in `backend/src/utils/spacedRepetition.ts`:
- Intervals: 15min → 1day → 3days → 7days → 15days → 30days
- **Easy**: advance to next interval
- **Hard**: half the next interval
- **Again**: reset to 1 day
- For intervals ≥1 day, `next_display` is set to 3:00 AM (not exact 24h)

### AI Integration
`backend/src/services/mistral.ts` builds a system prompt with:
- Target language and proficiency level
- Current date for context-aware conversation
- Proficiency-appropriate vocabulary guidelines

## Environment Setup
Copy `.env.example` to `.env` and configure:
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` - local Neo4j instance
- `JWT_SECRET`, `JWT_REFRESH_SECRET` - min 32 chars each
- `MISTRAL_API_KEY` - for AI chat

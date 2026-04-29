# Lumina - AI Writing Assistant

## Overview
A real-time AI writing assistant tailored for fiction writers. Uses OpenAI (via Replit AI Integrations) to provide grammar corrections, vocabulary enhancements, style improvements, pacing alerts, and creative story ideas as you write.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui components
- **Backend**: Express.js with REST API
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini for suggestions)
- **Routing**: wouter (frontend), Express (backend)

## Key Features
- Distraction-free editor with auto-save
- Real-time AI suggestions split across tabs:
  - Grammar tab (dedicated grammar corrections)
  - Review tab (vocabulary, style, tone)
  - Story tab (pacing alerts, arc tracking)
  - Ideas tab (AI idea generation with streaming responses)
- Suggestion management: dismiss suggestions you don't want, save them for later review; saved suggestions persist across re-analysis and are viewable in a dedicated panel accessible from all tabs
  - Applied suggestions are automatically removed from the sidebar
  - Change History tab tracks all applied suggestions with timestamps, showing what was changed
- Inline spell-check: grammar suggestions with corrections are highlighted with subtle red wavy underlines in the editor; clicking a highlighted word shows a popover with correction options for quick replacement
- Text selection review: select text in the editor to get targeted AI feedback on specific passages
- Voice-to-text dictation: a "Dictate" mic button in the editor toolbar lets writers speak text directly into the editor at the cursor; interim words appear live (italic/purple) and resolve into final text. Supports spoken punctuation ("period", "comma", "question mark", "new paragraph", etc.). Toggleable via Cmd/Ctrl+Shift+M; press Esc to stop. Uses the browser's built-in Web Speech API (Chrome/Edge/Safari) by default, and automatically falls back to server-side transcription via OpenAI Whisper (`/api/transcribe`) for browsers without speech support (e.g., Firefox). A "Cloud" toggle next to the mic lets users force the higher-accuracy Whisper path even on supported browsers; recordings are streamed to the server in-memory and never persisted.
- Ideas Scratchpad: collapsible per-document panel at the bottom of the editor for jotting down and revisiting ideas
- Document management (create, list, delete, export)
- Multiple document types (fiction, non-fiction, essay, blog, script)
- Google Docs integration (import/export)
- PWA support (installable as desktop app)

## Data Model
- `documents`: id, title, content, documentType, createdAt, updatedAt
- `ideas`: id, documentId (FK to documents with cascade delete), content, createdAt
- `users`: id, username, password (from template, not actively used)

## API Routes
- `GET/POST /api/documents` - List/Create documents
- `GET/PATCH/DELETE /api/documents/:id` - Document CRUD
- `GET /api/documents/:docId/ideas` - List ideas for a document
- `POST /api/documents/:docId/ideas` - Create an idea for a document
- `DELETE /api/ideas/:id` - Delete an idea
- `POST /api/suggestions` - AI-powered writing suggestions
- `POST /api/ideas` - Streaming AI idea generation
- `POST /api/gdocs/import` - Import a Google Doc by URL/ID into Lumina
- `POST /api/gdocs/export` - Export a Lumina document to Google Docs
- `POST /api/transcribe` - Server-side speech-to-text fallback (OpenAI Whisper). Accepts `{ audio: base64, language? }`, returns `{ text, language }`. Audio is held in memory only and never persisted.

## File Structure
- `client/src/pages/Home.tsx` - Main workspace page
- `client/src/components/Editor.tsx` - ContentEditable editor
- `client/src/components/SuggestionsSidebar.tsx` - AI suggestions panel
- `client/src/components/DocumentList.tsx` - Document sidebar
- `client/src/components/IdeasPanel.tsx` - Ideas scratchpad panel
- `client/src/hooks/useSuggestions.ts` - Debounced AI suggestion hook
- `client/src/hooks/useAutoSave.ts` - Auto-save hook
- `client/src/lib/api.ts` - API client functions
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database storage interface
- `server/db.ts` - Database connection
- `shared/schema.ts` - Drizzle schema definitions

## Design
- Typography: Merriweather (serif, editor) + Inter (sans, UI)
- Color: Warm neutral backgrounds with purple primary accents
- Style: Clean, distraction-free writing environment

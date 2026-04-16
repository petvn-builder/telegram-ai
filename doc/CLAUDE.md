# Brain OS — CLAUDE.md

AI agent context for the `telegram-ai` repository. Read this before modifying any code.

---

## 1. Project Overview

**Brain OS** is an AI-powered personal knowledge management system. Users capture notes via a web app or Telegram bot; the system automatically extracts named entities (people, projects, topics, tools, etc.), links them into a knowledge graph, and surfaces insights. Tasks can be created from notes, Telegram messages, or the Kanban board. A force-directed graph visualizes the full knowledge network.

- **Type:** Full-stack web app + Telegram bot
- **Primary user surface:** Next.js web app (dashboard, notes, tasks, graph)
- **Secondary surface:** Telegram bot (save notes, create tasks, query entities)
- **AI capabilities:** Entity extraction (GPT-4o-mini), vector embeddings (text-embedding-3-small), entity summaries, graph clustering labels, pattern-matched AI panel commands

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19, inline CSS + CSS variables (no Tailwind in components) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password, Google OAuth PKCE, magic link) |
| AI/LLM | OpenAI API — gpt-4o-mini (entity extraction, summaries, QA), text-embedding-3-small (vector search) |
| Graph viz | react-force-graph-2d + d3-force |
| Data fetching | SWR (client side) |
| Hosting | Vercel (`@vercel/functions` for `waitUntil`) |
| Bot | Telegram Bot API (webhook at `/api/telegram`) |

---

## 3. Repository Structure

```
/app            — Next.js App Router pages and API routes
  /api          — REST API handlers (notes, tasks, spaces, graph, auth, telegram)
  /components   — Shared UI components (AppShell, Sidebar, AiPanel, CommandBar)
  /dashboard    — Dashboard page + widgets
  /notes        — Notes list, detail, composer; shared types (types.ts)
  /tasks        — Kanban board, CreateTaskModal, TaskDetailModal
  /graph        — Force-directed knowledge graph page
  /settings     — Account settings + Telegram connect panel
  /login        — Login page
  /signup       — Signup page
/lib            — Server-safe utilities and service logic
  /supabase     — browser.ts, server.ts, admin.ts (three client factories)
  /graph        — buildGraph.ts (D3 data), buildClusters.ts (union-find)
  openai.js           — askOpenAI() wrapper
  embeddings.js       — createEmbedding() wrapper
  extractEntities.js  — AI entity extraction (strict JSON schema)
  entities.ts         — upsertEntitiesAndLink() smart merge
  entity-summary.ts   — getOrGenerateSummary() with 7-day cache
  tasks.ts            — createTask(), parseTaskText() (NLP dates)
  telegram-link.ts    — token-based account linking
  user.js             — Telegram rate limiting (20/day)
  fetcher.ts          — SWR fetch helper
/migrations     — SQL files run manually in Supabase SQL editor
/types          — Global TypeScript types
/public         — Static assets
middleware.ts   — Auth-based route protection + redirects
```

---

## 4. Architecture

```
Browser (Next.js)
  ├─ AppShell (3-zone layout)
  │    ├─ Sidebar (240px) — nav, spaces, quick-create, theme toggle
  │    ├─ Main content — page-specific
  │    └─ AiPanel (320px, slide-in) — pattern-matched commands
  └─ CommandBar (⌘K overlay)

API Routes (/app/api/)
  ├─ /notes      — CRUD + entity/space/tag sync
  ├─ /tasks      — CRUD
  ├─ /spaces     — CRUD
  ├─ /graph      — entity graph data (cached 60s)
  ├─ /dashboard  — aggregated dashboard (cached 30s)
  ├─ /auth       — OAuth callback + Telegram link
  ├─ /me         — current user
  └─ /telegram   — bot webhook (excluded from auth middleware)

Lib Layer
  ├─ Supabase clients (browser / server / admin)
  ├─ OpenAI wrappers (LLM + embeddings)
  └─ Business logic (entity merge, task NLP, graph build)

External Services
  ├─ Supabase (PostgreSQL, Auth, RLS, vector column)
  ├─ OpenAI API (gpt-4o-mini, text-embedding-3-small)
  └─ Telegram Bot API (webhook)
```

**Auth flow:** Supabase handles sessions via cookies. `middleware.ts` guards `/dashboard`, `/notes`, `/tasks`, `/graph`, `/settings`. Admin client (`getSupabaseAdmin()`) is used server-side for all DB writes (bypasses RLS safely).

---

## 5. Data Flow

### Note Creation
1. User submits in `NoteComposer`
2. `POST /api/notes` — inserts into `knowledge` table, parses `@space`/`#tag` tokens, syncs junctions
3. `waitUntil()` (Vercel background) — creates embedding, runs entity extraction
4. Entity extraction → `upsertEntitiesAndLink()` — smart merge into `entities` + `knowledge_links`

### Task Creation
1. User creates from Kanban board, note detail, or Telegram
2. `POST /api/tasks` — inserts into `tasks`, links entities via `task_entities`
3. `parseTaskText()` parses natural language dates ("in 3 days", "next Friday") and priorities

### Telegram Bot
1. Webhook at `POST /api/telegram` (excluded from auth middleware)
2. `/save [text]` → creates embedding, extracts entities, links to user account
3. `/task [text]` → NLP parse → create task via `createTask()`
4. Natural text → 2-tier semantic search (entity context + vector similarity) → GPT-4o-mini response
5. Rate limit: 20 messages/day per Telegram user

### Knowledge Graph
1. `GET /api/graph` → fetches entities + knowledge_links + notes (capped at 200 entities)
2. `buildGraph.ts` constructs D3 node/link arrays
3. `buildClusters.ts` union-find clustering → color-coded clusters
4. React page renders via `react-force-graph-2d`

---

## 6. Environment Variables

```bash
# Supabase — public (browser safe)
NEXT_PUBLIC_SUPABASE_URL=          # e.g. https://abc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # public anon key

# Supabase — private (server only)
SUPABASE_URL=                      # same URL as above
SUPABASE_SERVICE_ROLE_KEY=         # bypasses RLS — keep secret

# OpenAI
OPENAI_API_KEY=                    # sk-...

# Telegram
TELEGRAM_BOT_TOKEN=                # from @BotFather
TELEGRAM_BOT_USERNAME=             # without @

# App
NEXT_PUBLIC_APP_URL=               # e.g. https://yourdomain.com (for deep links)
```

No `.env.example` file exists. Do not commit `.env.local`.

---

## 7. Key Modules

### `lib/supabase/`
Three distinct clients — use the right one:
- `getSupabaseBrowser()` — client components only (reads session from browser)
- `getSupabaseServer()` — API routes + server components (reads session from cookies)
- `getSupabaseAdmin()` — server only, bypasses RLS. Use for all DB writes in API routes.

### `lib/extractEntities.js`
Calls OpenAI with strict JSON schema mode. Extracts up to 8 entity types: `person`, `project`, `topic`, `company`, `tool`, `goal`, `event`, `resource`. Input capped at 5000 chars.

### `lib/entities.ts` — `upsertEntitiesAndLink()`
Smart merge: names compared case-insensitively, structured JSON fields (attributes, events, relationships, responsibilities) are merged not overwritten. Only clears summary cache if data actually changed.

### `lib/tasks.ts` — `parseTaskText()`
NLP date parser supporting: "in N days", "next [weekday]", "tomorrow", "today", "tonight", "Mar 15", "25 Dec". Extracts priority from "urgent"/"high"/"low" keywords.

### `lib/entity-summary.ts` — `getOrGenerateSummary()`
Generates AI summaries of entities based on linked notes. 7-day TTL cache in DB. Safe to call from API routes or background jobs.

### `lib/telegram-link.ts`
Secure account linking: `generateLinkToken()` creates SHA-256 hashed token (5-min TTL). `consumeLinkToken()` validates and writes to `user_identities`. Enforces 1 Telegram account per web user.

### `app/api/telegram/route.js`
Main Telegram bot webhook (~1500 lines). Handles all bot commands, rate limiting, semantic search, and entity queries. Not protected by `middleware.ts`.

### `app/api/notes/route.ts`
Exports reusable helpers: `extractSpaceTokens()`, `syncNoteSpaces()`, `extractTagTokens()`, `syncNoteTags()`, `fetchTagsForNotes()`. Imported by `[id]/route.ts`.

### `app/notes/types.ts`
Single source of truth for shared interfaces: `Entity`, `Space`, `Tag`, `Note`, `NoteWithEntities`, `NoteDetail`, `Task`, `TaskWithEntities`, `TaskStatus`, `TaskPriority`, `TaskCreatedFrom`.

---

## 8. Database Schema

All tables have RLS enabled. Use `getSupabaseAdmin()` server-side to bypass.

| Table | Key Columns |
|-------|------------|
| `knowledge` | id, user_id, content, role ('note'/'user'/'ai'), embedding (vector), content_hash, created_at |
| `knowledge_links` | user_id, knowledge_id, entity_id |
| `entities` | id, user_id, name, type, attributes (JSON), events (JSON), relationships (JSON), responsibilities (JSON), summary, summary_updated_at |
| `tasks` | id, user_id, title, description, status (inbox/next/doing/waiting/done), priority (low/medium/high), due_date, linked_note_id, created_from (manual/note/telegram), telegram_message_id |
| `task_entities` | task_id, entity_id |
| `spaces` | id, user_id, name — UNIQUE(user_id, name) |
| `note_spaces` | note_id, space_id (CASCADE on delete) |
| `tags` | id, user_id, name — UNIQUE(user_id, name) |
| `note_tags` | note_id, tag_id |
| `user_identities` | user_id, telegram_user_id (UNIQUE), telegram_username |
| `telegram_link_tokens` | id, user_id, token_hash (SHA-256), expires_at (5 min TTL) |

**Migrations** in `/migrations/` are SQL files run manually in Supabase SQL editor. Never auto-run or delete them.

---

## 9. Design System

**CSS variables** defined in `app/globals.css`. Use variables — never hardcode colors.

```css
/* Layout */
--sidebar-w: 240px
--ai-panel-w: 320px

/* Surfaces */
--bg-base        /* Main background: #F5F5F0 light / #1C1C1E dark */
--bg-surface     /* Cards/panels */
--bg-elevated    /* Elevated surfaces */
--bg-sidebar     /* Sidebar background */

/* Accent (main CTA, selection, active states) */
--accent         /* #D4775C warm terracotta */
--accent-dim     /* Subtle tint */
--accent-glow    /* Stronger tint for hover/glow */

/* AI Accent — ONLY for AI-related elements */
--ai-accent      /* #5B8A7A sage — exclusively for AI panel/buttons */
--ai-accent-dim
--ai-border

/* Text hierarchy */
--text-1  /* Primary */
--text-2  /* Secondary */
--text-3  /* Tertiary / muted */

/* Borders & shadows */
--border
--shadow-sm / --shadow-md / --shadow-lg
```

**Dark mode:** `[data-theme="dark"]` on `<html>`. Toggle stored in `localStorage` key `"theme"`. Never use `prefers-color-scheme` — always use the data attribute.

**No Tailwind in components.** Use inline `style={{}}`. Tailwind is only in `globals.css` for base resets.

**Animations:** Standard transitions 180ms ease-in-out. AI panel 220ms ease-in-out.

**3-zone layout:** Sidebar (240px) + main (flex: 1) + AI panel (320px, conditionally right). Managed by `AppShell.tsx`.

---

## 10. URL Conventions

| URL | Behavior |
|-----|----------|
| `/` | Redirects → `/dashboard` (authed) or `/login` |
| `/notes?compose=1` | Auto-open NoteComposer |
| `/notes?compose=1&text=ENCODED` | Pre-fill NoteComposer with text |
| `/notes?open=NOTE_ID` | Open note detail panel |
| `/notes?space=SPACE_ID` | Filter notes by space |
| `/tasks?create=1` | Auto-open CreateTaskModal |

---

## 11. Development Workflow

```bash
npm install      # Install dependencies
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm start        # Start production server
npm run lint     # ESLint
```

**Database migrations:** Apply manually in Supabase SQL editor. Always create a new `.sql` file in `/migrations/` for schema changes — never edit existing files.

**No test suite** is currently configured.

**Vercel deployment:** `waitUntil()` from `@vercel/functions` is used for background processing. This only works on Vercel; locally it falls back to fire-and-forget.

---

## 12. Coding Conventions

- **TypeScript strict mode** — all `app/` and `lib/` files must be TypeScript. Legacy JS files (`openai.js`, `embeddings.js`, etc.) are exceptions.
- **Path alias:** `@/*` resolves to project root (`@/lib/...`, `@/app/...`).
- **API routes:** Use `NextRequest`/`NextResponse`. Dynamic params are `Promise<{ id: string }>` — always `await params`.
- **Auth pattern** in every API route:
  ```ts
  const supabase = getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  ```
- **No Tailwind in components.** Use inline `style={{}}`.
- **CSS variables only** for colors — never hardcode hex values.
- **SWR** for client-side data fetching with `lib/fetcher.ts` as the fetcher.
- **`useSearchParams()`** always needs a `<Suspense>` wrapper in Next.js 14+.
- **Naming:** camelCase for functions/variables, PascalCase for components/types, PascalCase for component file names.
- **Shared types** for notes domain: `app/notes/types.ts`. Task types: `lib/tasks.ts`.
- **Supabase admin:** `getSupabaseAdmin()` returns a singleton — do not create multiple instances.

---

## 13. AI Agent Guidelines

1. **Read before editing.** Always read the full file before modifying it.
2. **Prefer editing existing files** over creating new ones.
3. **Follow the auth pattern** in every new API route (section 12).
4. **Never hardcode colors** — use CSS variables from `globals.css`.
5. **Never add Tailwind classes** to component files — inline styles only.
6. **Use `getSupabaseAdmin()`** for all DB writes in API routes.
7. **Use `getSupabaseServer()`** only for auth checks (`getUser()`).
8. **Schema changes** require a new `.sql` file in `/migrations/`. Never edit existing migration files.
9. **Dynamic route params** must be awaited: `const { id } = await params`.
10. **Background processing** uses `waitUntil()` from `@vercel/functions` — wrap in try/catch for local dev fallback.
11. **Entity merging** — always use `upsertEntitiesAndLink()` from `lib/entities.ts`. Never raw-INSERT entities.
12. **Task creation** — always use `createTask()` from `lib/tasks.ts`. Never raw-INSERT tasks.
13. **Note save** — use `extractSpaceTokens()`, `extractTagTokens()`, `syncNoteSpaces()`, `syncNoteTags()` from `app/api/notes/route.ts`.
14. **AI accent** (`--ai-accent`) is exclusively for AI-related UI elements. Use `--accent` for everything else.
15. **Do not modify** `middleware.ts` matcher without preserving the Telegram webhook exclusion (`/api/telegram`).

---

## 14. Future Improvement Areas

- **No test suite** — unit tests for `parseTaskText()`, `upsertEntitiesAndLink()`, and entity extraction would reduce regressions.
- **JS legacy files** in `lib/` (`openai.js`, `embeddings.js`, `extractEntities.js`, `user.js`, `supabase.js`) should be migrated to TypeScript.
- **`app/api/telegram/route.js`** (~1500 lines) is a candidate for splitting into focused handlers.
- **`app/page.tsx`** is an unused legacy demo page — safe to remove.
- **Error handling** in background entity extraction (inside `waitUntil`) is not surfaced to users.
- **No `.env.example`** — one should be added for onboarding.

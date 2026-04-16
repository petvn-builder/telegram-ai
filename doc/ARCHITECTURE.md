# BrainOS — Solution Architecture

> Last updated: April 2026

---

## 1. Executive Summary

BrainOS is an **AI-powered personal knowledge operating system** that transforms scattered notes, ideas, and conversations into a living knowledge graph. Users capture information through a web application or Telegram bot; the system automatically extracts named entities (people, projects, companies, tools), generates vector embeddings, links everything into a graph, and surfaces insights on demand.

The system is a full-stack monolith deployed on Vercel, backed by Supabase (PostgreSQL + Auth), with OpenAI providing the AI layer. It serves a single-tenant model where each user has an isolated knowledge universe protected by row-level security.

**Core value proposition:** Most note apps focus on storage. BrainOS focuses on *discovery* — surfacing unexpected connections between ideas that users would otherwise miss.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  Web App      │  │  Telegram    │  │  ⌘K Command Bar       │    │
│  │  (React 19)   │  │  Bot Client  │  │  (global search/nav)  │    │
│  │              │  │              │  │                        │    │
│  │  Dashboard   │  │  /save       │  └────────────────────────┘    │
│  │  Notes       │  │  /task       │                                 │
│  │  Tasks       │  │  /todo       │  ┌────────────────────────┐    │
│  │  Graph       │  │  /entity     │  │  AI Chat Panel         │    │
│  │  Settings    │  │  @mention    │  │  (pattern-matched cmds)│    │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘    │
│         │                 │                        │                │
└─────────┼─────────────────┼────────────────────────┼────────────────┘
          │ HTTPS           │ Webhook POST           │ HTTPS
          ▼                 ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          SERVER TIER                                │
│                     Next.js 16 (App Router)                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Middleware (auth guard, route protection, redirects)         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ /api/notes  │ │ /api/tasks  │ │ /api/graph   │ │ /api/ai    │ │
│  │ CRUD +      │ │ CRUD +      │ │ Graph data   │ │ Chat       │ │
│  │ entity sync │ │ NLP dates   │ │ + clusters   │ │ + search   │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬───────┘ └─────┬──────┘ │
│         │               │               │               │         │
│  ┌──────┴───────────────┴───────────────┴───────────────┴──────┐  │
│  │                     LIB LAYER                                │  │
│  │  entities.ts  ·  tasks.ts  ·  ai-search.ts  ·  openai.js   │  │
│  │  embeddings.js  ·  extractEntities.js  ·  query-handler.ts  │  │
│  │  entity-resolver.ts  ·  time-parser.ts  ·  telegram-link.ts │  │
│  │  graph/buildGraph.ts  ·  graph/buildClusters.ts             │  │
│  └─────────────────────────┬────────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────┴───────────────────────────────────┐  │
│  │  /api/telegram — Webhook handler (excluded from auth)        │  │
│  │  Command routing · Rate limiting · Conversation context      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Supabase    │  │  OpenAI API  │  │  Telegram    │
│              │  │              │  │  Bot API     │
│  PostgreSQL  │  │  gpt-4o-mini │  │              │
│  + pgvector  │  │  text-embed  │  │  Webhook     │
│  Auth (PKCE) │  │  -3-small   │  │  sendMessage │
│  RLS         │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
   EXTERNAL SERVICES
```

---

## 3. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Next.js 16 (App Router) | Unified frontend + API in one deployable unit; server components for SSR; API routes for REST endpoints |
| **Language** | TypeScript 5 (strict) | Type safety across full stack; shared types between API and UI |
| **UI** | React 19 + inline CSS + CSS variables | No build-time CSS tooling overhead; design tokens via CSS custom properties; dark/light theming via data attributes |
| **Database** | Supabase (PostgreSQL) | Managed Postgres with built-in auth, RLS, and pgvector extension for embeddings |
| **Auth** | Supabase Auth | Email/password, Google OAuth (PKCE), magic links — no custom auth code needed |
| **AI / LLM** | OpenAI gpt-4o-mini | Cost-effective for high-volume entity extraction and Q&A; strict JSON schema mode for structured output |
| **Embeddings** | text-embedding-3-small | Good quality-to-cost ratio for semantic search at personal-knowledge scale |
| **Graph Viz** | react-force-graph-2d + d3-force | Canvas-based rendering handles hundreds of nodes; force simulation produces organic layouts |
| **Data Fetching** | SWR | Stale-while-revalidate pattern with optimistic updates; minimal boilerplate |
| **Hosting** | Vercel | Zero-config Next.js deployment; `waitUntil()` for background processing without a job queue |
| **Bot** | Telegram Bot API (webhook) | Direct webhook integration — no bot framework dependency; low latency |
| **Analytics** | PostHog | Product analytics with event tracking; self-hostable |

---

## 4. Application Structure

```
telegram-ai/
├── app/                          # Next.js App Router
│   ├── api/                      # REST API routes
│   │   ├── notes/                #   Note CRUD + entity/space/tag sync
│   │   ├── tasks/                #   Task CRUD + NLP date parsing
│   │   ├── spaces/               #   Space management
│   │   ├── tags/                 #   Tag listing
│   │   ├── graph/                #   Knowledge graph data + cluster labels
│   │   ├── ai/chat/             #   Web AI chat endpoint
│   │   ├── dashboard/           #   Aggregated dashboard stats
│   │   ├── entities/[id]/summary #  AI entity summaries
│   │   ├── auth/                 #   OAuth callback + Telegram linking
│   │   ├── telegram/             #   Bot webhook (no auth)
│   │   ├── me/                   #   Current user info
│   │   └── settings/tone/       #   Response tone preference
│   │
│   ├── components/               # Shared UI
│   │   ├── AppShell.tsx          #   3-zone layout wrapper
│   │   ├── Sidebar.tsx           #   Navigation + spaces + theme
│   │   ├── ChatBody.tsx          #   AI chat message rendering
│   │   ├── ChatModal.tsx         #   Floating chat modal
│   │   ├── CommandBar.tsx        #   ⌘K global command palette
│   │   ├── AiPanelContext.tsx    #   AI panel shared state
│   │   └── Providers.tsx         #   Context provider composition
│   │
│   ├── dashboard/                # Dashboard page + widgets
│   ├── notes/                    # Notes list, detail, composer, types
│   ├── tasks/                    # Kanban board + modals
│   ├── graph/                    # Force-directed graph page
│   ├── settings/                 # Account + Telegram linking + tone
│   ├── login/ & signup/          # Auth pages
│   ├── layout.tsx                # Root layout (server component)
│   └── globals.css               # Design system tokens
│
├── lib/                          # Server-safe business logic
│   ├── supabase/                 #   3 client factories (browser/server/admin)
│   ├── graph/                    #   Graph building + clustering algorithms
│   ├── openai.js                 #   LLM wrapper (askOpenAI, askPetAI)
│   ├── embeddings.js             #   Vector embedding generation
│   ├── extractEntities.js        #   AI entity extraction (JSON schema)
│   ├── entities.ts               #   Smart entity merge (upsertEntitiesAndLink)
│   ├── entity-summary.ts         #   Cached entity summaries (7-day TTL)
│   ├── entity-resolver.ts        #   Fuzzy entity name matching
│   ├── tasks.ts                  #   Task creation + NLP date parser
│   ├── query-handler.ts          #   AI command dispatcher
│   ├── ai-search.ts              #   2-tier RAG pipeline
│   ├── time-parser.ts            #   Natural language date parsing
│   ├── temporal-notes.ts         #   Time-range note queries
│   ├── telegram-link.ts          #   Secure account linking (SHA-256)
│   ├── group-chat.ts             #   Telegram group message handling
│   └── user.js                   #   Rate limiting (20 msgs/day)
│
├── migrations/                   # SQL migration files (manual apply)
├── middleware.ts                  # Auth guard + route protection
└── next.config.ts                # CSP headers, HTTP caching rules
```

---

## 5. Core Subsystems

### 5.1 Knowledge Engine

The knowledge engine handles note capture, entity extraction, and semantic linking — the foundation of the entire system.

```
User Input (web or Telegram)
  │
  ▼
┌──────────────────────┐
│  Parse tokens         │  Extract @space and #tag tokens from content
│  (@space, #tag)       │  Strip tokens before storage
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Store note           │  INSERT into `knowledge` table (role='note')
│  (knowledge table)    │  Sync junction tables (note_spaces, note_tags)
└──────────┬───────────┘
           ▼
┌──────────────────────┐     ┌───────────────────────┐
│  Background pipeline  │────▶│  Entity Extraction    │
│  (Vercel waitUntil)  │     │  gpt-4o-mini (JSON)   │
│                      │     │  8 types: person,      │
│                      │     │  project, company, etc.│
│                      │     └───────────┬───────────┘
│                      │                 ▼
│                      │     ┌───────────────────────┐
│                      │     │  Smart Entity Merge    │
│                      │     │  Case-insensitive dedup│
│                      │     │  JSON field union merge│
│                      │     │  Alias tracking        │
│                      │     └───────────┬───────────┘
│                      │                 ▼
│                      │     ┌───────────────────────┐
│                      │────▶│  Vector Embedding      │
│                      │     │  text-embedding-3-small│
└──────────────────────┘     └───────────────────────┘
```

**Key design decisions:**
- Entity extraction runs in background (`waitUntil`) to keep note creation fast (<200ms user-facing latency)
- Entity merging is *additive* — structured fields (attributes, events, relationships) are union-merged, never overwritten. This prevents data loss when the same entity is mentioned across multiple notes
- Content hashing prevents duplicate processing on re-saves

### 5.2 AI Search Pipeline (RAG)

A two-tier retrieval-augmented generation pipeline powers all AI responses:

```
User Question
  │
  ▼
┌─────────────────────────────────────────┐
│  TIER 1: Entity Context                 │
│                                         │
│  1. Resolve entity names in question    │
│     (4-level: exact name → exact alias  │
│      → substring name → substring alias)│
│  2. Fallback: embedding similarity      │
│  3. Fetch entity summaries + linked     │
│     note snippets (up to 5 per entity)  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  TIER 2: Semantic Memory                │
│                                         │
│  1. Embed the question                  │
│  2. Vector similarity search (pgvector) │
│     match_knowledge RPC, top 8 results  │
│  3. Filter: similarity ≥ 0.75,         │
│     exclude conversation history,       │
│     deduplicate against Tier 1          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  LLM Response (gpt-4o-mini)            │
│  System prompt + combined context       │
│  + conversation history + tone pref     │
└─────────────────────────────────────────┘
```

**Why two tiers?** Entity context provides *structured, high-signal* information (summaries, known facts). Semantic memory adds *breadth* — surfacing notes that are semantically relevant but not linked to a recognized entity. Together they produce responses that feel both knowledgeable and serendipitous.

### 5.3 Task Management

Tasks support creation from three sources: the web Kanban board, note detail pages, and Telegram. The system includes natural language date parsing for frictionless capture.

**Status model:** `inbox → next → doing → waiting → done` (5-column Kanban)

**NLP date parsing** (`parseTaskText`):
- "in 3 days", "next Friday", "tomorrow", "tonight"
- "Mar 15", "25 Dec" (absolute dates)
- Priority extraction: "urgent"/"high"/"low" keywords

**Entity linking:** Tasks are automatically linked to entities extracted from their title, connecting the task graph to the knowledge graph.

### 5.4 Knowledge Graph

The graph visualization transforms the entity network into an interactive force-directed layout:

```
API (/api/graph)
  │
  ├── Fetch entities (capped at 200) + knowledge_links
  │
  ├── buildGraph.ts
  │   ├── Entity nodes (sized by mention count)
  │   └── Note nodes (fixed size)
  │   └── Links (entity → note "mention" edges)
  │
  └── buildClusters.ts
      ├── Union-Find algorithm (entities sharing a note = same cluster)
      ├── Filter clusters with < 2 entities
      └── Assign colors from palette
```

**Cluster labels** are generated on-demand by the LLM — the system sends entity names within each cluster and receives 2–4 word descriptive labels.

### 5.5 Telegram Bot

The bot serves as a fast-capture and retrieval channel, operating via a webhook endpoint excluded from the auth middleware.

**Command routing:**

| Command | Handler | Action |
|---------|---------|--------|
| `/save [text]` | `handleSave()` | Create note + extract entities |
| `/task [text]` | `handleTask()` | NLP parse → create task |
| `/todo` | `handleTodo()` | List active tasks by status |
| `/entity [name]` | `handleEntity()` | Entity summary + related notes |
| `@ai_3veryone_bot` | `handlePet()` | Group chat AI with RAG |
| Free text | `semanticSearch()` | 2-tier RAG → answer |

**Group chat support:** Messages in group chats are stored (rolling window of last 30 messages per chat) and used as conversation context when the bot is @mentioned. Each group member's knowledge base is queried independently.

**Rate limiting:** 20 messages/day per user, shared across web and Telegram channels.

### 5.6 Auth & Identity

```
┌───────────────────────────────────────────────────┐
│  Supabase Auth                                    │
│                                                   │
│  Methods:                                         │
│  ├── Email + Password                             │
│  ├── Google OAuth (PKCE flow)                     │
│  └── Magic Link (email OTP)                       │
│                                                   │
│  Smart account merge:                             │
│  If Google sign-in email matches existing          │
│  email/password account → merge (not duplicate)   │
└───────────────────────┬───────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────┐
│  Telegram Account Linking                         │
│                                                   │
│  1. Web app generates link token (SHA-256 hashed) │
│  2. Token stored with 5-minute TTL                │
│  3. User clicks deep link → opens Telegram bot    │
│  4. Bot receives /start link_{token}              │
│  5. consumeLinkToken() validates + creates         │
│     user_identities row (1:1 mapping enforced)    │
└───────────────────────────────────────────────────┘
```

---

## 6. Data Architecture

### 6.1 Entity-Relationship Model

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│   spaces     │       │    knowledge     │       │   entities   │
│──────────────│       │──────────────────│       │──────────────│
│ id           │       │ id               │       │ id           │
│ user_id      │  M:N  │ user_id          │  M:N  │ user_id      │
│ name (unique)│◄─────▶│ content          │◄─────▶│ name         │
└──────────────┘       │ role (note/user/ │       │ type         │
  via note_spaces      │       ai)        │       │ aliases[]    │
                       │ embedding (vec)  │       │ attributes{} │
┌──────────────┐       │ content_hash     │       │ events[]     │
│   tags       │  M:N  │ created_at       │       │ relationships│
│──────────────│◄─────▶│                  │       │ responsibilit│
│ id           │       └────────┬─────────┘       │ summary      │
│ user_id      │  via           │                  │ summary_     │
│ name (unique)│  note_tags     │                  │   updated_at │
└──────────────┘                │                  └──────┬───────┘
                                │                         │
                       ┌────────┴─────────┐              │
                       │ knowledge_links  │              │
                       │─────────────────│              │
                       │ knowledge_id ───┘              │
                       │ entity_id ─────────────────────┘
                       │ user_id                         │
                       └──────────────────┘              │
                                                         │
┌──────────────┐                              ┌──────────┴───────┐
│   tasks      │                              │  task_entities   │
│──────────────│           M:N                │──────────────────│
│ id           │◄────────────────────────────▶│ task_id          │
│ user_id      │                              │ entity_id        │
│ title        │                              └──────────────────┘
│ status       │
│ priority     │       ┌──────────────────┐
│ due_date     │       │ user_identities  │
│ linked_note_id       │──────────────────│
│ created_from │       │ user_id ─────────── auth.users.id
│ telegram_    │       │ telegram_user_id │
│   message_id │       │ telegram_username│
└──────────────┘       └──────────────────┘
```

### 6.2 Key Schema Details

| Table | Purpose | Notable Constraints |
|-------|---------|-------------------|
| `knowledge` | Notes and conversation history | `role` discriminates note/user/ai; `embedding` is a pgvector column for semantic search |
| `entities` | Extracted named entities | JSON columns for `attributes`, `events`, `relationships`, `responsibilities`; `summary` cached with 7-day TTL |
| `knowledge_links` | Note ↔ Entity junction | Composite unique on (knowledge_id, entity_id) |
| `tasks` | User tasks | 5-status enum; `created_from` tracks source (manual/note/telegram) |
| `spaces` | Note organization | UNIQUE(user_id, name) — no duplicate space names per user |
| `user_identities` | Web ↔ Telegram mapping | UNIQUE on telegram_user_id — one Telegram account per web user |
| `telegram_link_tokens` | One-time linking tokens | SHA-256 hashed; 5-minute TTL; deleted after consumption |
| `group_messages` | Telegram group chat cache | Rolling window pruned to 30 messages per chat |

### 6.3 Vector Search Strategy

The system uses **pgvector** (Supabase's built-in vector extension) rather than a dedicated vector database:

- **Embedding model:** text-embedding-3-small (1536 dimensions)
- **Indexed tables:** `knowledge.embedding` (notes), `entities` (via entity alias embeddings)
- **Search method:** Cosine similarity via Supabase RPC functions (`match_knowledge`, `match_entities`)
- **Threshold:** 0.75 minimum similarity for inclusion in search results

**Trade-off:** pgvector is simpler to operate (no additional service) and sufficient for personal-knowledge scale (thousands of notes, not millions). A dedicated vector DB would be warranted at ~100K+ embeddings per user.

---

## 7. Security Model

### Row-Level Security (RLS)

All tables have RLS policies enforcing `user_id = auth.uid()`. This provides defense-in-depth: even if application code has a bug, the database prevents cross-user data access.

**Server-side pattern:** API routes use two Supabase clients:
1. `getSupabaseServer()` — reads the session cookie, used *only* for `auth.getUser()` to identify the caller
2. `getSupabaseAdmin()` — service role key (bypasses RLS), used for all DB operations with explicit `user_id` filtering in queries

This avoids RLS performance overhead on complex queries while maintaining the security boundary at the application layer.

### Telegram Webhook Security

The `/api/telegram` endpoint is excluded from auth middleware (Telegram doesn't send browser cookies). Security relies on:
- The webhook URL containing the bot token (known only to Telegram and the server)
- User identity resolved via `user_identities` table lookup (Telegram user ID → internal user ID)
- Rate limiting (20 messages/day) preventing abuse

### Account Linking Security

The Telegram linking flow uses cryptographic tokens:
- 29-byte random token generated server-side
- Only the SHA-256 hash is stored in the database
- 5-minute TTL prevents replay attacks
- Token is single-use (deleted after consumption)
- 1:1 mapping enforced (one Telegram account per web user)

---

## 8. Key Architecture Decisions

### Monolith over Microservices

The entire system — web app, API, bot webhook, AI pipeline — runs as a single Next.js application. This eliminates inter-service communication complexity, simplifies deployment, and allows shared code (types, utilities, business logic) without package management overhead. At the current scale (single-tenant, personal knowledge), a monolith is the right choice. Service extraction would be warranted if the bot webhook or AI pipeline needed independent scaling.

### Inline Styles over Tailwind

Components use inline `style={{}}` with CSS custom properties instead of Tailwind utility classes. This keeps the design system centralized in `globals.css` and avoids className string management. The trade-off is slightly more verbose component code, but it ensures all colors and spacing flow through the design token system.

### Admin Client for All DB Writes

Rather than writing complex RLS policies for every mutation pattern, the system uses the Supabase admin client (which bypasses RLS) for all server-side operations. This simplifies policy management and avoids the performance overhead of policy evaluation on writes. The security boundary is maintained at the application layer by always filtering on the authenticated `user_id`.

### Background Processing via waitUntil (No Job Queue)

Entity extraction and embedding generation run in Vercel's `waitUntil()` — a lightweight background execution primitive that extends the serverless function lifetime without blocking the response. This avoids the operational complexity of a job queue (Redis, Bull, etc.) at the cost of no retry mechanism and no visibility into failed background tasks.

### pgvector over Dedicated Vector DB

Vector search runs on the same PostgreSQL instance via pgvector. This eliminates an additional service dependency and keeps the data model unified. The trade-off is limited to scale — pgvector performs well for thousands of embeddings but would need evaluation at higher volumes.

### SWR over Server State Management

Client-side data fetching uses SWR (stale-while-revalidate) rather than a heavier state management library. Combined with optimistic updates and `mutate()`, this provides a responsive UI without the boilerplate of Redux or Zustand. The trade-off is that complex cross-component state coordination requires React Context (used for AI panel and sidebar state).

---

## 9. Deployment & Infrastructure

```
┌─────────────────────────────────────────┐
│              Vercel                      │
│                                         │
│  Next.js App (Edge + Serverless)        │
│  ├── Static pages (ISR where applicable)│
│  ├── API routes (serverless functions)  │
│  ├── waitUntil() background processing  │
│  └── HTTP caching headers:              │
│       /api/graph: 60s                   │
│       /api/dashboard: 30s               │
│       /api/spaces: 30s                  │
└─────────────────┬───────────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Supabase │ │ OpenAI   │ │ Telegram │
│ Cloud    │ │ API      │ │ Bot API  │
│          │ │          │ │          │
│ Postgres │ │ gpt-4o-  │ │ Webhook  │
│ Auth     │ │ mini     │ │ receive  │
│ pgvector │ │ embed-3  │ │ + send   │
└──────────┘ └──────────┘ └──────────┘
```

**Caching strategy:**
- HTTP `Cache-Control` headers on read-heavy endpoints (graph, dashboard, spaces)
- Entity summaries cached in-database with 7-day TTL
- SWR client-side deduplication (60s interval)
- Content hashing prevents redundant embedding/extraction on unchanged notes

**Database migrations:** SQL files in `/migrations/` are applied manually via the Supabase SQL editor. No automated migration runner — the trade-off is manual effort for simplicity and safety.

---

## 10. Future Considerations

### Known Gaps

| Area | Current State | Recommendation |
|------|--------------|----------------|
| **Testing** | No test suite | Add unit tests for critical logic: `parseTaskText()`, `upsertEntitiesAndLink()`, entity extraction |
| **Error visibility** | Background task failures (entity extraction, embeddings) are silent | Add error logging/alerting for `waitUntil()` failures |
| **TypeScript migration** | 4 legacy JS files in `lib/` | Migrate `openai.js`, `embeddings.js`, `extractEntities.js`, `user.js` to TypeScript |
| **Bot handler size** | `telegram/route.js` is ~1500 lines | Extract into focused handler modules |
| **Env documentation** | No `.env.example` | Add template for developer onboarding |

### Scaling Considerations

- **Vector search:** pgvector is adequate for personal-knowledge scale (~10K embeddings). At ~100K+ per user or multi-tenant, evaluate Pinecone or Qdrant.
- **Background processing:** `waitUntil()` has no retry or dead-letter queue. If extraction failures become costly, consider a lightweight job queue (Inngest, Trigger.dev).
- **Entity graph:** The 200-entity cap on `/api/graph` is a pragmatic limit for client-side rendering. Larger graphs would need server-side layout computation or level-of-detail rendering.
- **Rate limiting:** The 20 messages/day limit is stored in-memory per serverless invocation. At higher traffic, move to a Redis-backed rate limiter.
- **Real-time:** No WebSocket or real-time subscription is currently used. Supabase Realtime could enable live collaboration or cross-device sync if needed.

# BrainOS — Solution Architecture

> Last updated: May 2026

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
│  │ CRUD +      │ │ CRUD +      │ │ Graph data   │ │ Chat +     │ │
│  │ entity sync │ │ NLP dates   │ │ + clusters   │ │ MCP tools  │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬───────┘ └─────┬──────┘ │
│         │               │               │               │         │
│  ┌──────┴───────────────┴───────────────┴───────────────┴──────┐  │
│  │                     LIB LAYER                                │  │
│  │  entities.ts  ·  tasks.ts  ·  ai-search.ts  ·  openai.js    │  │
│  │  embeddings.js  ·  extractEntities.js  ·  query-handler.ts  │  │
│  │  entity-resolver.ts  ·  time-parser.ts  ·  telegram-link.ts │  │
│  │  graph/buildGraph.ts  ·  graph/buildClusters.ts             │  │
│  │  ai/chat.ts  ·  ai/tools.ts  ·  mcp/tool-registry.ts        │  │
│  │  mcp/{calendar,gmail,tasks,knowledge}/*  ·  mcp/server.ts   │  │
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
│   ├── ai/                       #   Tool-calling agent loop
│   │   ├── chat.ts               #     chatWithTools(): system prompt + hop loop
│   │   └── tools.ts              #     executeTool(), getToolsForUser()
│   ├── openai.js                 #   LLM wrapper (askOpenAI, askPetAI)
│   ├── embeddings.js             #   Vector embedding generation
│   ├── extractEntities.js        #   AI entity extraction (JSON schema)
│   ├── entities.ts               #   Smart entity merge (upsertEntitiesAndLink)
│   ├── entity-summary.ts         #   Cached entity summaries (7-day TTL)
│   ├── entity-resolver.ts        #   Fuzzy entity name matching
│   ├── tasks.ts                  #   Task creation + NLP date parser
│   ├── query-handler.ts          #   Thin dispatcher (slash cmds → handlers; else → chatWithTools)
│   ├── ai-search.ts              #   2-tier RAG (now wrapped by search_notes tool)
│   ├── time-parser.ts            #   Natural language date parsing
│   ├── temporal-notes.ts         #   Time-range note queries (gated on calendar intent)
│   ├── telegram-link.ts          #   Secure account linking (SHA-256)
│   ├── group-chat.ts             #   Telegram group message handling
│   └── user.js                   #   Rate limiting (20 msgs/day)
│
├── mcp/                          # MCP-style tool registry (LLM tool surface)
│   ├── tool-registry.ts          #   defineTool(), toOpenAiTool(), toMcpTool()
│   ├── server.ts                 #   Standalone stdio MCP server (Claude Desktop)
│   ├── shared/                   #   ToolError, UserContext, Google client helpers
│   ├── calendar/                 #   get_events, create/update/delete_event, find_free_time
│   ├── gmail/                    #   search_emails, get_email/thread, create_(reply_)draft
│   ├── tasks/                    #   create/list/update/delete_task
│   └── knowledge/                #   search_notes (wraps 2-tier RAG)
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

### 5.2 AI Chat & MCP Tool Layer

The assistant routes user messages through a thin dispatcher and, for anything beyond slash commands, hands control to a **tool-calling agent**. Tool selection is the LLM's job, not regex routing — the system prompt steers the model toward the right tool, and a small MCP-style registry exposes calendar, gmail, tasks, and knowledge operations as validated function calls.

```
User message (web /api/ai/chat or Telegram /api/telegram)
   │
   ▼
query-handler.ts ──► slash command? ─yes─► direct handler
   │                                          (/save, /task, /todo, /entity)
   │ no
   ▼
calendar intent? ─no──► temporal note query? ─yes─► handleTemporalQuery
   │                    (note-recall verb + time range)   (RAG over time range)
   │ yes (or neither)
   ▼
chatWithTools (lib/ai/chat.ts)
   │  system prompt: time + 14-day weekday table + grounding rules
   │                 + intent routing + email triage + tone
   │  tools: filtered by Google OAuth status (getToolsForUser)
   ▼
gpt-4o-mini  ──► tool_calls? ──yes──► executeTool (Zod validate → handler)
   ▲                                           │
   └───────── feed tool result back ◄──────────┘   (loop, max 4 hops)
   │
   ▼
final text answer + ChatToolEvent[] for UI inspection
```

**Routing (`lib/query-handler.ts`).** Slash commands and `/entity <name>` are handled inline. The temporal-notes RAG handler only fires when a note-recall verb is present *and* no calendar-intent verb is present (commit `e27dbd9` — prevents "schedule this week" from being answered out of notes). Everything else falls through to `chatWithTools()`. The keyword-based gate that previously protected the agent was removed in commit `e89c249`; tool-calling is now the default.

**Tool registry (`mcp/tool-registry.ts`).** Each tool is declared with `defineTool({ name, description, inputSchema (Zod), handler })`. Two adapters expose the same registry to two consumers: `toOpenAiTool()` produces the schema sent to the OpenAI Chat Completions API, and `toMcpTool()` is consumed by `mcp/server.ts` — a standalone stdio MCP server that lets external clients (Claude Desktop, MCP Inspector) drive the same tool surface. Google tools are filtered out for users without OAuth via `getToolsForUser({ hasGoogle })`.

**Tool catalogue (15 tools):**

| Category | Tools | Purpose |
|----------|-------|---------|
| Calendar | `get_events`, `create_event`, `update_event`, `delete_event`, `find_free_time` | Read/write Google Calendar; natural-language times resolved in user TZ |
| Gmail | `search_emails`, `get_email`, `get_thread`, `create_email_draft`, `create_reply_draft` | Search and draft (never send) |
| Tasks | `create_task`, `list_tasks`, `update_task`, `delete_task` | BrainOS tasks, synced with Google Tasks |
| Knowledge | `search_notes` | 2-tier RAG over the user's notes; returns raw excerpts + sources |

**Agent loop (`chatWithTools`).** Model: `gpt-4o-mini`, `tool_choice: "auto"`, up to 4 hops. On each hop the model either emits text (done) or one or more `tool_calls`. `executeTool()` validates args against the tool's Zod schema, runs the handler with `UserContext { userId, timeZone }`, and feeds the JSON result back as a `tool` message. Tool failures surface as structured `ToolError` codes (`auth_error`, `permission`, `not_found`, `invalid_input`, `rate_limit`) so the model can recover or apologize gracefully. If the hop budget is exhausted, the final call is made without tools to force a text answer.

**System-prompt-driven behaviour.** The prompt is load-bearing. Six blocks shape behaviour, each tied to a specific past failure mode:

1. **Time context + 14-day weekday table** (commit `1028126`) — agent must look up weekday↔date pairings rather than self-compute, which stops weekday hallucinations on dates near month boundaries.
2. **GROUNDING RULE** (commit `e89c249`) — any personal-context question MUST trigger a tool call; `search_notes` is the cheap default when intent is ambiguous.
3. **search_notes grounding** (commit `a753498`) — `search_notes` now returns raw excerpts + source IDs (not a pre-summarized answer); the prompt requires the model to quote/paraphrase from those excerpts, match the notes' language, and refuse to fill gaps with general knowledge.
4. **Intent routing** — explicit dispatch hints disambiguate near-collisions (e.g., "email tennis plan to Anna" → `create_email_draft`, not `create_event`, even though the body mentions a time).
5. **Email triage** (commit `b3180f9`) — for "emails that need reply" the model builds a Gmail query that excludes promotions/social/updates/forums and noreply senders, over-fetches 2×, then post-filters automated/transactional/marketing patterns.
6. **Drafts vs. sends** — `create_email_draft` and `create_reply_draft` only save drafts; the prompt forbids the model from claiming an email was sent.

**Observability.** Every `tool_call` and `tool_result` is emitted to an `onEvent` callback and returned in the `tool_answer` response payload as `ChatToolEvent[]`, so the UI can render the agent's tool trace alongside the answer.

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
| Free text | `chatWithTools()` | Tool-calling agent (calendar / gmail / tasks / search_notes) |

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

### Model-Driven Tool Dispatch over Keyword Routing

Tool selection in the AI chat is delegated to the LLM through a system-prompt-driven MCP tool registry, not regex/keyword classification (commit `e89c249` removed the previous keyword gate). Adding a capability now means defining a tool with a Zod schema and adding a routing hint to the prompt — not threading a new branch through `query-handler.ts`. The trade-off is that prompt regressions require explicit safeguards in the prompt rather than code-level guards: see the 14-day weekday table (`1028126`), the calendar-intent gate ahead of the temporal-notes handler (`e27dbd9`), the search_notes grounding block (`a753498`), and the email triage block (`b3180f9`). Each of these is a fix for a model behaviour rather than a routing bug.

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
| **Tool-call observability** | `ChatToolEvent[]` is returned to the UI but never persisted | Persist tool-call traces to debug prompt regressions and measure tool-selection accuracy |
| **MCP server reach** | `mcp/server.ts` is a stdio server intended for Claude Desktop / MCP Inspector — no HTTP/SSE transport | Add an authenticated HTTP MCP transport so other clients can use the same tool surface remotely |

### Scaling Considerations

- **Vector search:** pgvector is adequate for personal-knowledge scale (~10K embeddings). At ~100K+ per user or multi-tenant, evaluate Pinecone or Qdrant.
- **Background processing:** `waitUntil()` has no retry or dead-letter queue. If extraction failures become costly, consider a lightweight job queue (Inngest, Trigger.dev).
- **Entity graph:** The 200-entity cap on `/api/graph` is a pragmatic limit for client-side rendering. Larger graphs would need server-side layout computation or level-of-detail rendering.
- **Rate limiting:** The 20 messages/day limit is stored in-memory per serverless invocation. At higher traffic, move to a Redis-backed rate limiter.
- **Real-time:** No WebSocket or real-time subscription is currently used. Supabase Realtime could enable live collaboration or cross-device sync if needed.

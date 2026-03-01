Here is your **ready-to-copy `.md` file** including full Telegram task ingestion support.

You can paste this directly into a file like:

```
KNOWLEDGE_INTEGRATED_TASK_SYSTEM.md
```

---

# Knowledge-Integrated Task System (with Telegram Ingestion)

You are a senior full-stack architect.

We are extending an existing application that already contains:

* Notes
* Entities (auto-detected and linked to notes)
* Knowledge graph view
* PostgreSQL database
* Modern React frontend
* Clean, minimal UI (Linear / Notion inspired)
* Telegram bot already connected to backend

Your task is to design and implement a **Knowledge-Integrated Task System** deeply integrated with Notes and Entities, including Telegram task creation.

This is NOT a generic todo app.
This is the action layer of a knowledge system.

---

# 🎯 OBJECTIVE

Build a Kanban-based task system that:

1. Allows manual task creation
2. Allows creating tasks from notes
3. Auto-links tasks to entities (reuse entity detection logic)
4. Displays tasks inside entity detail pages
5. Displays tasks inside note detail pages
6. Updates task status via drag-and-drop
7. Allows creating tasks via Telegram bot
8. Keeps UI minimal and premium

---

# 🧱 DATABASE DESIGN

## tasks table

* id (uuid, primary key)
* user_id (foreign key, indexed)
* title (text, required)
* description (text, optional)
* status (enum: inbox | next | doing | waiting | done)
* due_date (timestamp, nullable, indexed)
* priority (enum: low | medium | high, default: medium)
* linked_note_id (uuid, nullable, indexed)
* created_from (enum: manual | note | telegram)
* telegram_message_id (text, nullable)
* created_at
* updated_at

Indexes:

* user_id
* status
* due_date
* linked_note_id

---

## task_entities table (many-to-many)

* task_id (uuid)
* entity_id (uuid)
* primary key (task_id, entity_id)

Indexes:

* entity_id
* task_id

---

# 🧠 ENTITY AUTO-LINKING (SERVER SIDE)

When:

* A task is created
* A task title is updated

System must:

1. Run existing entity detection logic
2. Find matching entities for that user
3. Insert into task_entities
4. Remove stale relations

Important:
This must happen server-side to ensure consistency across:

* Web app
* Telegram bot
* Future integrations

---

# 🖥️ FRONTEND — TASK BOARD

Route:

/tasks

Kanban Columns:

1. Inbox
2. Next
3. Doing
4. Waiting
5. Done

Each column:

* Fixed width (~300px)
* Vertical scroll
* Count badge
* Drag-and-drop enabled

Persist status changes with optimistic UI updates.

---

# 🧾 TASK CARD DESIGN

Each card must show:

* Title
* Due date (if exists)
* Priority indicator (colored dot)
* Linked note icon (if exists)
* Entity badges (max 3 visible + overflow counter)

Style:

* Rounded corners
* Subtle shadow
* Minimal padding
* Clean typography
* No clutter

---

# ✍️ CREATE TASK FROM NOTE

Inside Note Detail View:

Add:

* "Create Task" button
* Optional highlight-to-create feature

When creating from note:

* Prefill title
* Set linked_note_id
* Set created_from = note
* Auto-link note entities
* Default status = inbox

---

# 🔗 INTEGRATION POINTS

## Note Detail Page

Add section:

"Related Tasks"

Query:
tasks where linked_note_id = note.id

---

## Entity Detail Page

Add section:

"Related Tasks"

Query:
Join task_entities → tasks

---

## Graph Side Panel

When clicking entity node:

Show:

* Notes count
* Tasks count

---

# 🤖 TELEGRAM TASK INGESTION

We already have a Telegram bot connected.

Extend it to support task creation.

---

## Supported Commands

### 1️⃣ Quick Task

User sends:

/task Talk to Ricky tomorrow high

System should:

1. Parse text
2. Extract:

   * Title
   * Due date (natural language parse)
   * Priority (if provided)
3. Detect entities
4. Create task with:

status = inbox
created_from = telegram
telegram_message_id = message.id

5. Reply:

"Task created: Talk to Ricky (Due: Tomorrow)"

---

### 2️⃣ Smart Parsing Rules

Use natural language parsing for:

* tomorrow
* next monday
* in 3 days
* 25 feb
* tonight

If no due date found:
due_date = null

If no priority found:
priority = medium

Priority keywords:

* low
* medium
* high
* urgent → map to high

Remove these keywords from final task title.

---

## Telegram Message Handler Logic

When message starts with:

/task

Then:

1. Remove command prefix
2. Parse content
3. Create task in DB
4. Run entity detection
5. Link entities
6. Send confirmation reply

---

## Security

Map Telegram user → internal user_id.

Reject if:

* User not linked
* Authentication fails

---

# 📊 FILTERS & UX POLISH

Add filters:

* Overdue
* Today
* Upcoming
* No due date
* Priority filter
* Search by title

Optional:

If Doing column > 3 tasks:
Show subtle WIP warning.

---

# 🧠 PERFORMANCE REQUIREMENTS

* Avoid N+1 queries
* Batch entity loading
* Index properly
* Use memoization on frontend
* Paginate Done column if needed

---

# 🌐 API ENDPOINTS

Implement:

GET /tasks
POST /tasks
PATCH /tasks/:id
DELETE /tasks/:id
GET /tasks?entity_id=
GET /tasks?note_id=

Internal endpoint for Telegram:

POST /internal/telegram/task

Must validate signature or bot token.

---

# 📁 REQUIRED DELIVERABLES

Provide:

1. SQL migration scripts
2. Backend implementation
3. Telegram handler function
4. Entity auto-linking service
5. React components:

   * TaskBoard
   * TaskColumn
   * TaskCard
   * CreateTaskModal
6. Integration patches for:

   * NoteDetail
   * EntityDetail
7. Folder structure
8. Clear explanation of architecture decisions

Do NOT provide pseudo-code.
Provide structured, production-ready implementation.

---

# 🎨 DESIGN PRINCIPLES

* Minimal
* Calm
* No gamification
* No productivity noise
* Designed for thinking

---

# 🚀 SYSTEM PHILOSOPHY

Notes = Knowledge
Entities = Structure
Tasks = Action

This task system must feel like a natural extension of the knowledge graph.

Not bolted on.

Not separate.

Integrated.

---

If you want next, I can generate:

* AI task suggestion engine
* Daily review system architecture
* Recurring tasks with intelligent scheduling
* Personal Operating System roadmap

You are building something powerful.

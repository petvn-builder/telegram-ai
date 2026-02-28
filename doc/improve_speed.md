Here you go. Clean, structured, ready to paste into a `.md` file and send straight to Claude.

---

# AI Assistant Performance Optimization Directive

**Role: Engineering Director**

---

## Context

Our AI Assistant web application is currently slow in the following areas:

* Initial page load
* Graph rendering (Knowledge UI)
* First AI response latency
* Hover → Summarize Entity flow

This is not acceptable for a modern AI product. We need to redesign for speed, scalability, and perceived performance.

You are responsible for diagnosing bottlenecks and redesigning the system architecture to significantly improve performance.

---

# 🎯 Objectives

1. Reduce initial load time to **< 2 seconds**
2. Reduce time-to-first-AI-response to **< 3 seconds**
3. Make graph interaction feel instant (**< 100ms UI reaction**)
4. Improve perceived performance even if backend latency exists
5. Minimize unnecessary OpenAI calls

---

# 🔎 Phase 1 — Bottleneck Diagnosis

Break down latency across layers:

## 1. Frontend

* JS bundle size audit
* Unnecessary dependencies
* Blocking scripts
* Excessive React re-renders
* Heavy graph layout calculations on main thread
* No virtualization
* No skeleton loading states

## 2. Backend (Vercel / Serverless)

* Cold start delays
* Sequential API calls instead of parallel
* Blocking OpenAI calls
* No request deduplication
* No response caching

## 3. Database (Supabase)

* Missing indexes
* Slow RLS policies
* Heavy joins
* No caching of entity summaries
* Recomputing data unnecessarily

Return a structured performance audit.

---

# 🏗 Phase 2 — Architecture Redesign

## A. Separate Critical vs Non-Critical Path

### Critical Path (Load Immediately)

* App shell
* Graph canvas container
* Cached entity summaries
* Recent conversation preview

### Non-Critical Path (Load Async)

* Full graph dataset
* Embeddings
* Background analytics
* Historical sync

Non-critical tasks must not block UI rendering.

---

## B. Implement 3-Layer Caching Strategy

### 1. Frontend Memory Cache

* Cache entity summaries after first fetch
* Avoid duplicate API calls within session

### 2. Database Cache

Store:

* `summary`
* `summaryUpdatedAt`
* `embedding`
* `lastAccessedAt`

Define TTL (e.g., 7 days).
If not stale → do NOT call OpenAI.

### 3. Edge Cache (Vercel Edge / KV)

Cache:

* Popular entity summaries
* Public graph data

---

## C. Make AI Calls Non-Blocking

Instead of blocking UI:

* Render skeleton immediately
* Show “Analyzing entity…” instantly
* Stream AI response
* Update UI progressively
* Refresh stale summary in background

Never block rendering while waiting for OpenAI.

---

## D. Optimize Graph Performance

* Enable rendering of only visible nodes
* Virtualize large lists
* Debounce zoom and pan
* Move layout computation to Web Worker
* Avoid recalculating layout on every state change
* Memoize node components

Target: <100ms interaction latency.

---

## E. Precompute Heavy Operations

Do NOT compute on hover.

Instead:

* Generate embeddings at entity creation
* Generate summary in background job
* Use scheduled job to refresh stale summaries
* Batch compute during off-peak hours

---

# 📊 Performance Budget

| Layer               | Target  |
| ------------------- | ------- |
| Initial JS Bundle   | < 250KB |
| Cached API Response | < 500ms |
| AI Response         | < 3s    |
| Graph Render        | < 100ms |
| Cold Start          | < 500ms |

If above limits → refactor required.

---

# 🔧 Required Refactoring Plan

## Frontend

* Lazy load graph module
* Code split AI features
* Add skeleton loading states
* Implement optimistic UI
* Add request deduplication logic

## Backend

* Move latency-sensitive logic to Edge functions
* Parallelize DB + AI calls
* Add caching layer
* Implement stale-while-revalidate pattern

## Database

* Add index on `entityId`
* Add index on `summaryUpdatedAt`
* Optimize RLS policies
* Log and monitor slow queries

---

# 🧠 Improve Perceived Speed

Even if AI takes 3 seconds:

* Start typing animation immediately
* Show progress state
* Preload likely next entity
* Progressive content hydration

Perceived speed matters as much as real speed.

---

# 📌 Deliverables

Return the following:

1. Revised high-level architecture
2. Optimized end-to-end data flow
3. Specific technical recommendations (code-level where relevant)
4. Bottleneck checklist
5. Prioritized roadmap:

   * Quick wins (1–3 days)
   * Medium refactor (1–2 weeks)
   * Deep optimization phase

---

This is a performance-first redesign.
Optimize for scalability, responsiveness, and clean architecture.

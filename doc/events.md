# PostHog Event Tracking Taxonomy

Brain · Knowledge Graph — Analytics Event Reference  
Last updated: 2026-04-08

---

## Funnel Overview

```
Acquisition → Activation → Engagement → Retention → Expansion
```

| Stage | Goal | Key Events |
|---|---|---|
| Acquisition | User arrives and creates account | `user_signed_up`, `user_logged_in` |
| Activation | User gets first value moment | `note_created` (first), `telegram_connected` |
| Engagement | User actively uses core features | `note_created`, `ai_message_sent`, `graph_node_clicked` |
| Retention | User returns day over day | `$pageview` on dashboard, `user_logged_in` return visits |
| Expansion | User expands usage depth | `task_created`, `note_updated`, entity growth |

---

## Event Reference

### Authentication

#### `user_signed_up`
User completes account registration.

| Property | Type | Example | Notes |
|---|---|---|---|
| `method` | string | `"email"` \| `"google"` | Auth provider used |

**Funnel stage:** Acquisition  
**Used to build:** Signup conversion funnel, provider attribution

---

#### `user_logged_in`
User successfully signs in.

| Property | Type | Example | Notes |
|---|---|---|---|
| `method` | string | `"email"` \| `"google"` | Auth provider used |

**Funnel stage:** Acquisition / Retention  
**Used to build:** DAU, returning user rate, auth method distribution

---

#### `user_logged_out`
User explicitly signs out.

_(no additional properties)_

**Funnel stage:** Retention signal  
**Used to build:** Session length analysis

---

### Notes

#### `note_created`
User saves a new note (first save of a new note).

| Property | Type | Example | Notes |
|---|---|---|---|
| `note_id` | string | `"abc123"` | DB id of the note |
| `content_length` | number | `142` | Character count of note body |
| `space_count` | number | `2` | Number of spaces assigned |
| `spaces` | string[] | `["work", "ai"]` | Names of assigned spaces |
| `entity_count` | number | `3` | Entities extracted at save time |
| `has_tags` | boolean | `true` | Whether note contains #tags |

**Funnel stage:** Activation / Engagement  
**Used to build:** Notes-per-user, activation funnel (first note), space adoption

---

#### `note_updated`
User edits and re-saves an existing note.

| Property | Type | Example | Notes |
|---|---|---|---|
| `note_id` | string | `"abc123"` | DB id of the note |
| `content_length` | number | `200` | Updated character count |

**Funnel stage:** Engagement  
**Used to build:** Edit frequency, note lifecycle

---

### Tasks

#### `task_created`
User creates one or more tasks via the Create Task modal.

| Property | Type | Example | Notes |
|---|---|---|---|
| `task_count` | number | `3` | Tasks created in batch |
| `status` | string | `"inbox"` | Initial kanban column |
| `has_due_date` | boolean | `true` | At least one task has a due date |
| `priorities` | string[] | `["high", "medium"]` | Priority per task |
| `created_from` | string | `"manual"` \| `"note"` | Entry point for creation |

**Funnel stage:** Expansion  
**Used to build:** Task adoption rate, note→task conversion funnel

---

### AI Assistant

#### `ai_chat_opened`
User sends the first message in a new AI chat session (modal was empty).

_(no additional properties)_

**Funnel stage:** Engagement  
**Used to build:** AI adoption rate, percentage of users who use AI

---

#### `ai_message_sent`
User sends a message to the AI assistant.

| Property | Type | Example | Notes |
|---|---|---|---|
| `message_length` | number | `38` | Character count |
| `is_command` | boolean | `true` | Message starts with `/` |
| `command` | string \| null | `"/save"` | Slash command used, or null |

**Funnel stage:** Engagement  
**Used to build:** AI usage volume, command popularity, query length distribution

---

#### `ai_response_received`
AI responds successfully or with an error.

| Property | Type | Example | Notes |
|---|---|---|---|
| `action` | string | `"answer"` | Response type: `answer`, `note_created`, `task_created`, `entity_summary`, `commands`, `error` |
| `entity` | string \| undefined | `"Claude"` | Only present for `entity_summary` action |

**Funnel stage:** Engagement  
**Used to build:** AI success rate, most-used response types, error rate

---

### Graph

#### `graph_viewed`
User lands on the knowledge graph page.

_(captured automatically via `$pageview` on `/graph`)_

**Funnel stage:** Engagement  
**Used to build:** Graph adoption rate, feature discovery

---

### Telegram

#### `telegram_connect_initiated`
User clicks "Connect Telegram" button in Settings.

_(no additional properties)_

**Funnel stage:** Activation  
**Used to build:** Telegram adoption funnel, settings→activation rate

---

#### `telegram_link_generated`
Server generates a deep link; user is shown the Telegram button.

_(no additional properties)_

**Funnel stage:** Activation  
**Used to build:** Funnel completion: initiated → link generated → connected

---

### Navigation

#### `nav_item_clicked`
User clicks a sidebar navigation link.

| Property | Type | Example | Notes |
|---|---|---|---|
| `label` | string | `"Graph"` | Display label of nav item |
| `href` | string | `"/graph"` | Destination path |

**Funnel stage:** Engagement  
**Used to build:** Feature popularity, navigation patterns

---

### Automatic Events (PostHog built-ins)

| Event | Trigger | Notes |
|---|---|---|
| `$pageview` | Every route change | Captured in PostHogProvider via `usePathname` |
| `$pageleave` | Tab close / navigation away | Enabled in PostHog init |
| `$identify` | After login / session restore | Links anonymous → user ID |

---

## Funnel Definitions

### Onboarding Funnel
```
user_signed_up
  → $pageview (path=/dashboard)
  → note_created
  → telegram_connect_initiated
  → telegram_link_generated
```

### AI Adoption Funnel
```
$pageview (any)
  → ai_chat_opened
  → ai_message_sent
  → ai_response_received (action=answer)
```

### Note → Task Conversion Funnel
```
note_created
  → task_created (created_from=note)
```

### Telegram Save Flow (bot-side, server event)
> These are server-side flows and can be captured via PostHog's server-side SDK in `app/api/telegram/route.js` in a future iteration:
- `telegram_save_received` — bot receives `/save` command
- `telegram_note_saved` — note inserted to DB
- `telegram_entities_extracted` — entities extracted

---

## Implementation Notes

- All events are fired from client components via `usePostHog()` from `posthog-js/react`
- User identity is set automatically in `PostHogProvider` via `posthog.identify(userId, { email })`
- Page views are captured on every route change (not natively by PostHog, since `capture_pageview: false`)
- Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.local` to activate tracking

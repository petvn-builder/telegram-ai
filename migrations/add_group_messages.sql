-- Group chat message buffer for /pet context window
-- Messages are self-cleaning: route.js deletes rows older than 30 min on every insert.

create table if not exists group_messages (
  id               uuid        primary key default gen_random_uuid(),
  chat_id          text        not null,
  telegram_user_id text,
  username         text,
  text             text        not null,
  created_at       timestamptz not null default now()
);

create index if not exists group_messages_chat_created
  on group_messages (chat_id, created_at desc);

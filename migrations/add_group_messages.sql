-- Group chat message buffer for /pet context window
-- Messages are self-cleaning: route.js deletes rows older than 30 min on every insert.

create table if not exists group_messages (
  id               uuid        primary key default gen_random_uuid(),
  chat_id          text        not null,
  telegram_user_id text,
  username         text,
  first_name       text,
  last_name        text,
  text             text        not null,
  created_at       timestamptz not null default now()
);

-- If the table already exists, add the new columns:
alter table group_messages add column if not exists first_name text;
alter table group_messages add column if not exists last_name  text;

create index if not exists group_messages_chat_created
  on group_messages (chat_id, created_at desc);

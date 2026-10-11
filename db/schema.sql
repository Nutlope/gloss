-- Gloss: a signed-in reader's shelf, marks and notes, mirrored from the browser.
-- Every synced table has the same shape so one sync route serves them all:
-- rows are owned by a Clerk user id, carry the client's object as jsonb, and
-- are never hard-deleted by the app (a tombstone tells other devices).
-- Safe to run more than once.

create table if not exists articles (
  user_id text not null,
  id text not null,
  article_id text not null,
  data jsonb not null,          -- the shelf entry: title, author, words, origin
  doc jsonb,                    -- the full text; null for bundled samples and tombstones
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists highlights (
  user_id text not null,
  id text not null,
  article_id text not null,
  data jsonb not null,          -- anchor (with quote), colour, createdAt
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists glosses (
  user_id text not null,
  id text not null,
  article_id text not null,
  data jsonb not null,          -- anchor or position, action, question, turns
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists briefs (
  user_id text not null,
  id text not null,             -- the article id: one per text
  article_id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists progress (
  user_id text not null,
  id text not null,             -- the article id: one per text
  article_id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists articles_user_updated on articles (user_id, updated_at);
create index if not exists highlights_user_updated on highlights (user_id, updated_at);
create index if not exists glosses_user_updated on glosses (user_id, updated_at);
create index if not exists briefs_user_updated on briefs (user_id, updated_at);
create index if not exists progress_user_updated on progress (user_id, updated_at);

-- Free use of the shared Together key: one counter per reader per day.
-- A subject is "answer:user:<clerk id>" or "answer:ip:<hashed address>"; raw addresses are never stored.
create table if not exists free_usage (
  subject text not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (subject, day)
);

-- What that free use cost, in dollars: the allowance is a budget, not a count.
-- "free:all" is everyone's total, for the daily ceiling.
alter table free_usage add column if not exists usd double precision not null default 0;

-- Covers painted for a signed-in reader's texts (opt-in), so other devices fetch them
-- instead of painting them again. A JPEG, base64.
create table if not exists covers (
  user_id text not null,
  id text not null,             -- the article id
  jpeg text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Tokens that let a reader's agent (Grok Bot, Claude, ...) save to their library through /mcp.
-- Only a hash of each token is kept; the token itself is shown once, when it is made.
create table if not exists agent_tokens (
  id text primary key,
  user_id text not null,
  hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked boolean not null default false
);

create index if not exists agent_tokens_user on agent_tokens (user_id);

-- Printed editions: a month of a reader's texts, set as a paperback and posted by Lulu.
-- The id is random and unguessable: it is also how a reader who is not signed in finds their order.
create table if not exists editions (
  id text primary key,
  user_id text,                 -- the Clerk id, when the reader was signed in
  month text not null,          -- "2026-10"
  name text not null default '',
  input jsonb not null,         -- what goes to press: the texts with their marks, and the cover's words
  art text,                     -- the painted cover, a JPEG in base64
  status text not null default 'draft',
  test boolean not null default false,
  attempts integer not null default 0,
  pages integer,
  price_cents integer not null,
  email text,
  ship_to jsonb,
  stripe_session text,
  payment_intent text,
  lulu_job text,
  files jsonb,                  -- the interior and cover PDFs, as the printer was sent them
  tracking jsonb,
  arrival jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editions_user on editions (user_id, created_at);

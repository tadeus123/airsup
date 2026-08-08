-- Multi-peer ChatGPT worker identities + inbox (restart-safe unacked queue)

create table if not exists public.airsup_peers (
  handle text primary key,
  domain text not null default '',
  display_name text not null default '',
  token_hash text not null,
  token_prefix text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists airsup_peers_token_hash_uidx
  on public.airsup_peers (token_hash);

create index if not exists airsup_peers_domain_idx
  on public.airsup_peers (domain);

alter table public.airsup_peers enable row level security;

create table if not exists public.airsup_peer_messages (
  id bigserial primary key,
  conversation_id text not null,
  from_handle text not null references public.airsup_peers(handle) on delete cascade,
  to_handle text not null references public.airsup_peers(handle) on delete cascade,
  body text not null,
  status text not null default 'pending'
    check (status = any (array['pending'::text, 'delivered'::text, 'acked'::text])),
  reply_to_id bigint references public.airsup_peer_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  acked_at timestamptz
);

create index if not exists airsup_peer_messages_inbox_idx
  on public.airsup_peer_messages (to_handle, id);

create index if not exists airsup_peer_messages_unacked_idx
  on public.airsup_peer_messages (to_handle, status, id);

create index if not exists airsup_peer_messages_conversation_idx
  on public.airsup_peer_messages (conversation_id, id);

alter table public.airsup_peer_messages enable row level security;

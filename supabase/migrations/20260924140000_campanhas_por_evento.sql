-- Campanhas do Meta Ads vinculadas aos eventos da landing, e o link secreto do
-- relatório de cada evento.
--
-- Cada campanha pertence a no máximo um evento (campaign_id é a chave). O
-- vínculo é feito na tela Performance → Campanhas. O token do relatório abre
-- /relatorio/<token>, página pública que gera o PDF só com as campanhas
-- vinculadas àquele evento (edge function relatorio-evento, com service role).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lagun_event_campaigns (
  campaign_id text primary key,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  campaign_name text,
  account_id text,
  updated_at timestamptz default now()
);

create index if not exists lagun_event_campaigns_event_idx
  on public.lagun_event_campaigns (event_id);

-- Mesmo padrão de acesso de lagun_events: equipe logada lê e edita.
alter table public.lagun_event_campaigns enable row level security;

create policy "Equipe gerencia lagun_event_campaigns" on public.lagun_event_campaigns
  for all to authenticated using (true) with check (true);

-- Token secreto do relatório (24 caracteres hex).
alter table public.lagun_events
  add column if not exists relatorio_token text unique
  default encode(extensions.gen_random_bytes(12), 'hex');

update public.lagun_events
  set relatorio_token = encode(extensions.gen_random_bytes(12), 'hex')
  where relatorio_token is null;

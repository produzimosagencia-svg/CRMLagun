-- Publicações do Instagram vinculadas aos eventos da landing, no mesmo molde
-- de lagun_event_campaigns (Performance → Campanhas por evento).
--
-- Cada publicação pertence a no máximo um evento (media_id é a chave). O
-- vínculo é feito na tela Social Media do app: a tela sugere o evento pela
-- legenda (nome do evento ou do artista) e a equipe confirma.

create table if not exists public.lagun_event_posts (
  media_id text primary key,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  caption text,
  permalink text,
  posted_at timestamptz,
  updated_at timestamptz default now()
);

create index if not exists lagun_event_posts_event_idx
  on public.lagun_event_posts (event_id);

alter table public.lagun_event_posts enable row level security;

drop policy if exists "Equipe gerencia lagun_event_posts" on public.lagun_event_posts;
create policy "Equipe gerencia lagun_event_posts" on public.lagun_event_posts
  for all to authenticated using (true) with check (true);

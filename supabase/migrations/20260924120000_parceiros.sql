-- Produtores parceiros da casa e o vínculo deles com os eventos da landing.
--
-- Regra: todo evento precisa ter a escolha de parceiros feita — ou um ou mais
-- parceiros vinculados, ou "sem parceiro" marcado (sem_parceiro). A tela de
-- eventos não deixa salvar sem uma das duas. Eventos antigos ficam com
-- sem_parceiro = false e sem vínculo, então a escolha é pedida na próxima
-- edição.

create table if not exists public.lagun_partners (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 2 and 120),
  telefone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lagun_event_partners (
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  partner_id uuid not null references public.lagun_partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, partner_id)
);

create index if not exists lagun_event_partners_partner_idx
  on public.lagun_event_partners (partner_id);

alter table public.lagun_events
  add column if not exists sem_parceiro boolean not null default false;

-- Mesmo padrão de acesso de lagun_events: equipe logada lê e edita.
alter table public.lagun_partners enable row level security;
alter table public.lagun_event_partners enable row level security;

create policy "Equipe gerencia lagun_partners" on public.lagun_partners
  for all to authenticated using (true) with check (true);

create policy "Equipe gerencia lagun_event_partners" on public.lagun_event_partners
  for all to authenticated using (true) with check (true);

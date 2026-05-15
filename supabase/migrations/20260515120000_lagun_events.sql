create table if not exists lagun_events (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  data date not null,
  dia_semana text not null,
  superticket_id text not null,
  superticket_token text not null,
  status text not null default 'upcoming', -- upcoming | past
  -- stats cached when event ends
  total_vendas int,
  receita numeric(10,2),
  participantes int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table lagun_events enable row level security;

create policy "Authenticated read lagun_events" on lagun_events
  for select to authenticated using (true);

create policy "Authenticated insert lagun_events" on lagun_events
  for insert to authenticated with check (true);

create policy "Authenticated update lagun_events" on lagun_events
  for update to authenticated using (true);

create policy "Authenticated delete lagun_events" on lagun_events
  for delete to authenticated using (true);

-- Vínculo manual entre evento da Zig Bar e noite da Lagun (2026-11-20).
-- Sem vínculo, a função casa pela data em que o evento foi criado na Zig.
create table if not exists public.lagun_zig_evento_noite (
  zig_event_id text primary key,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lagun_zig_evento_noite enable row level security;
-- Sem policy: só o servidor (service role) lê e grava.

insert into public.lagun_zig_evento_noite (zig_event_id, event_id) values
  ('5099abb0-0803-48a2-91f0-3b5d2c4ba934', '8052d9aa-7a39-410e-8245-42505e3ff17b'), -- JVila 19/11
  ('17fbd64c-dd8b-447c-b776-df16ed21999d', '31aa0cf9-8dc7-41e1-88cf-c88bbd23b2f1')  -- Lagun Summit 20/11
on conflict (zig_event_id) do update set event_id = excluded.event_id;

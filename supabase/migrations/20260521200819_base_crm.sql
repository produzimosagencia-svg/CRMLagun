create table if not exists base_crm (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  documento text,
  telefone text,
  data_nascimento date,
  eventos text[] default '{}',
  total_eventos integer generated always as (array_length(eventos, 1)) stored,
  checkins_realizados integer default 0,
  checkins_nao_realizados integer default 0,
  created_at timestamptz default now()
);

create index if not exists base_crm_documento_idx on base_crm (documento) where documento is not null and documento != '';
create index if not exists base_crm_email_idx on base_crm (email) where email is not null and email != '';

alter table base_crm enable row level security;
create policy "authenticated read" on base_crm for select to authenticated using (true);
create policy "authenticated insert" on base_crm for insert to authenticated with check (true);
create policy "authenticated update" on base_crm for update to authenticated using (true);
create policy "authenticated delete" on base_crm for delete to authenticated using (true);

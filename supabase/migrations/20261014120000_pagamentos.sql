-- Pagamentos por Pix, direto da conta da Lagun no banco (API do Inter).
--
-- Quem vê e usa: só quem está em lagun_pagamentos_usuarios (lista fechada,
-- hoje Bruno e Peset). Não é por papel: todo mundo do painel é admin.
--
-- Fluxo: cadastra o favorecido (chave Pix) → lança o pagamento (a_pagar) →
-- clica em Pagar → a função de borda pagamentos-pix manda o Pix pelo banco
-- (processando → pago | falhou). Só a função (service role) muda o status
-- para processando/pago/falhou; pelo painel só dá para cancelar.

-- ── Quem pode ─────────────────────────────────────────────────────────────
create table if not exists public.lagun_pagamentos_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.pagamentos_pode_ver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.lagun_pagamentos_usuarios u where u.user_id = auth.uid());
$$;
revoke all on function public.pagamentos_pode_ver() from public, anon;
grant execute on function public.pagamentos_pode_ver() to authenticated;

alter table public.lagun_pagamentos_usuarios enable row level security;
drop policy if exists "Cada um vê se está na lista de pagamentos" on public.lagun_pagamentos_usuarios;
create policy "Cada um vê se está na lista de pagamentos" on public.lagun_pagamentos_usuarios
  for select to authenticated using (user_id = auth.uid());
revoke all on public.lagun_pagamentos_usuarios from anon;
grant select on public.lagun_pagamentos_usuarios to authenticated;

-- Bruno e Peset (perfis bruno.lagun e peset.lagun).
insert into public.lagun_pagamentos_usuarios (user_id)
select id from public.profiles where username in ('bruno.lagun', 'peset.lagun')
on conflict (user_id) do nothing;

-- ── Configuração (linha única) ────────────────────────────────────────────
create table if not exists public.lagun_pagamentos_config (
  id boolean primary key default true check (id),
  limite_diario numeric(12,2) not null default 20000 check (limite_diario >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.lagun_pagamentos_config (id) values (true) on conflict (id) do nothing;

alter table public.lagun_pagamentos_config enable row level security;
drop policy if exists "Lista de pagamentos vê a config" on public.lagun_pagamentos_config;
create policy "Lista de pagamentos vê a config" on public.lagun_pagamentos_config
  for select to authenticated using (public.pagamentos_pode_ver());
drop policy if exists "Lista de pagamentos edita a config" on public.lagun_pagamentos_config;
create policy "Lista de pagamentos edita a config" on public.lagun_pagamentos_config
  for update to authenticated using (public.pagamentos_pode_ver()) with check (public.pagamentos_pode_ver());
revoke all on public.lagun_pagamentos_config from anon;
grant select, update on public.lagun_pagamentos_config to authenticated;

-- ── Favorecidos ───────────────────────────────────────────────────────────
create table if not exists public.lagun_favorecidos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  documento text, -- CPF ou CNPJ, só dígitos
  tipo_chave text not null check (tipo_chave in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  chave_pix text not null check (char_length(chave_pix) between 3 and 140),
  categoria text not null default 'fornecedor' check (categoria in ('artista', 'fornecedor', 'staff', 'outro')),
  observacao text,
  ativo boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lagun_favorecidos_chave_idx on public.lagun_favorecidos (lower(chave_pix));

alter table public.lagun_favorecidos enable row level security;
drop policy if exists "Lista de pagamentos vê favorecidos" on public.lagun_favorecidos;
create policy "Lista de pagamentos vê favorecidos" on public.lagun_favorecidos
  for select to authenticated using (public.pagamentos_pode_ver());
drop policy if exists "Lista de pagamentos cadastra favorecidos" on public.lagun_favorecidos;
create policy "Lista de pagamentos cadastra favorecidos" on public.lagun_favorecidos
  for insert to authenticated with check (public.pagamentos_pode_ver());
drop policy if exists "Lista de pagamentos edita favorecidos" on public.lagun_favorecidos;
create policy "Lista de pagamentos edita favorecidos" on public.lagun_favorecidos
  for update to authenticated using (public.pagamentos_pode_ver()) with check (public.pagamentos_pode_ver());
revoke all on public.lagun_favorecidos from anon;
grant select, insert, update on public.lagun_favorecidos to authenticated;

-- ── Pagamentos ────────────────────────────────────────────────────────────
create table if not exists public.lagun_pagamentos (
  id uuid primary key default gen_random_uuid(),
  favorecido_id uuid not null references public.lagun_favorecidos(id) on delete restrict,
  event_id uuid references public.lagun_events(id) on delete set null,
  descricao text not null check (char_length(descricao) between 2 and 140),
  valor numeric(12,2) not null check (valor > 0),
  vencimento date,
  status text not null default 'a_pagar' check (status in ('a_pagar', 'processando', 'pago', 'falhou', 'cancelado')),
  -- Cópia do que foi usado na hora de pagar, para o histórico não mudar se o cadastro mudar.
  chave_pix_usada text,
  nome_no_banco text,
  codigo_banco text,       -- codigoSolicitacao do Inter
  end_to_end_id text,      -- id do Pix na rede
  erro text,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  pago_por uuid references auth.users(id) on delete set null,
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lagun_pagamentos_status_idx on public.lagun_pagamentos (status, created_at desc);
create index if not exists lagun_pagamentos_pago_em_idx on public.lagun_pagamentos (pago_em);

alter table public.lagun_pagamentos enable row level security;
drop policy if exists "Lista de pagamentos vê pagamentos" on public.lagun_pagamentos;
create policy "Lista de pagamentos vê pagamentos" on public.lagun_pagamentos
  for select to authenticated using (public.pagamentos_pode_ver());
drop policy if exists "Lista de pagamentos lança pagamentos" on public.lagun_pagamentos;
create policy "Lista de pagamentos lança pagamentos" on public.lagun_pagamentos
  for insert to authenticated with check (public.pagamentos_pode_ver() and status = 'a_pagar');
drop policy if exists "Lista de pagamentos edita o que ainda não foi pago" on public.lagun_pagamentos;
create policy "Lista de pagamentos edita o que ainda não foi pago" on public.lagun_pagamentos
  for update to authenticated
  using (public.pagamentos_pode_ver() and status = 'a_pagar')
  with check (public.pagamentos_pode_ver() and status in ('a_pagar', 'cancelado'));
revoke all on public.lagun_pagamentos from anon;
grant select, insert, update on public.lagun_pagamentos to authenticated;

-- Pelo painel ninguém marca como pago: isso é só da função, com a resposta do banco.
create or replace function public.lagun_pagamentos_guarda()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if auth.role() = 'authenticated' and new.status in ('processando', 'pago', 'falhou') then
    raise exception 'O status % só é definido pelo banco.', new.status;
  end if;
  if tg_op = 'UPDATE' and old.status in ('pago', 'processando') and new.status is distinct from old.status
     and auth.role() = 'authenticated' then
    raise exception 'Pagamento % não pode ser alterado.', old.status;
  end if;
  return new;
end $$;
drop trigger if exists lagun_pagamentos_guarda on public.lagun_pagamentos;
create trigger lagun_pagamentos_guarda before insert or update on public.lagun_pagamentos
  for each row execute function public.lagun_pagamentos_guarda();

create or replace function public.lagun_favorecidos_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists lagun_favorecidos_touch on public.lagun_favorecidos;
create trigger lagun_favorecidos_touch before update on public.lagun_favorecidos
  for each row execute function public.lagun_favorecidos_touch();

-- ── Registro de tudo que aconteceu com cada pagamento ─────────────────────
create table if not exists public.lagun_pagamentos_log (
  id bigint generated always as identity primary key,
  pagamento_id uuid not null references public.lagun_pagamentos(id) on delete cascade,
  acao text not null, -- lancado | cancelado | pagar | banco_aceitou | pago | falhou | consulta | webhook
  detalhe jsonb,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lagun_pagamentos_log_pag_idx on public.lagun_pagamentos_log (pagamento_id, created_at);

alter table public.lagun_pagamentos_log enable row level security;
drop policy if exists "Lista de pagamentos vê o registro" on public.lagun_pagamentos_log;
create policy "Lista de pagamentos vê o registro" on public.lagun_pagamentos_log
  for select to authenticated using (public.pagamentos_pode_ver());
drop policy if exists "Lista de pagamentos escreve no registro" on public.lagun_pagamentos_log;
create policy "Lista de pagamentos escreve no registro" on public.lagun_pagamentos_log
  for insert to authenticated with check (public.pagamentos_pode_ver());
revoke all on public.lagun_pagamentos_log from anon;
grant select, insert on public.lagun_pagamentos_log to authenticated;

-- Lançou ou cancelou pelo painel: registra sozinho.
create or replace function public.lagun_pagamentos_registra()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lagun_pagamentos_log (pagamento_id, acao, detalhe, user_id)
      values (new.id, 'lancado', jsonb_build_object('valor', new.valor, 'descricao', new.descricao), auth.uid());
  elsif new.status = 'cancelado' and old.status <> 'cancelado' then
    insert into public.lagun_pagamentos_log (pagamento_id, acao, user_id) values (new.id, 'cancelado', auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists lagun_pagamentos_registra on public.lagun_pagamentos;
create trigger lagun_pagamentos_registra after insert or update on public.lagun_pagamentos
  for each row execute function public.lagun_pagamentos_registra();

-- Item do menu (desligável em Admin > Configurações como os outros).
insert into public.sidebar_menu_settings (key, label, enabled) values ('pagamentos', 'Pagamentos', true) on conflict (key) do nothing;

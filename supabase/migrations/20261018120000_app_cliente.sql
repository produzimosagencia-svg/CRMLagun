-- App do cliente da Lagun (iPhone): login por telefone, lounges e reservas,
-- clube de pontos, ingressos e divulgação.
--
-- Quem usa: o público da casa, autenticado pelo Supabase Auth com um e-mail
-- sintético (<telefone>@app.lagunvitoria.com.br) criado pela função de borda
-- app-cliente depois de validar o código enviado por WhatsApp. Cada pessoa só
-- enxerga o que é dela (RLS por auth.uid()). O que é público (lounges, quais
-- estão ocupados num evento) qualquer um lê.

-- ── Clientes do app ────────────────────────────────────────────────────────
create table if not exists public.lagun_app_clientes (
  id uuid primary key references auth.users(id) on delete cascade,
  telefone text not null unique,            -- só dígitos, com DDI (5527999999999)
  nome text,
  divulgador boolean not null default false,
  slug text unique,                         -- lagunvitoria.com.br/l/<slug>
  avisos_semana boolean not null default true,
  flyer_whatsapp boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lagun_app_clientes enable row level security;
drop policy if exists "Cliente vê o próprio cadastro" on public.lagun_app_clientes;
create policy "Cliente vê o próprio cadastro" on public.lagun_app_clientes
  for select to authenticated using (id = auth.uid());
drop policy if exists "Cliente edita o próprio cadastro" on public.lagun_app_clientes;
create policy "Cliente edita o próprio cadastro" on public.lagun_app_clientes
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and divulgador = (select c.divulgador from public.lagun_app_clientes c where c.id = auth.uid()));
revoke all on public.lagun_app_clientes from anon;
grant select, update (nome, avisos_semana, flyer_whatsapp) on public.lagun_app_clientes to authenticated;

-- Códigos de acesso (só a função de borda, com service role).
create table if not exists public.lagun_app_codigos (
  telefone text primary key,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.lagun_app_codigos enable row level security;
revoke all on public.lagun_app_codigos from anon, authenticated;

-- ── Lounges ────────────────────────────────────────────────────────────────
create table if not exists public.lagun_lounges (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  capacidade int not null check (capacidade > 0),
  inclui text[] not null default '{}',
  preco numeric(12,2) not null check (preco >= 0),   -- consumação
  cor text not null default '#2B0E00',
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.lagun_lounges enable row level security;
drop policy if exists "Todo mundo vê os lounges" on public.lagun_lounges;
create policy "Todo mundo vê os lounges" on public.lagun_lounges for select to anon, authenticated using (ativo);
drop policy if exists "Equipe gerencia lounges" on public.lagun_lounges;
create policy "Equipe gerencia lounges" on public.lagun_lounges for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));
grant select on public.lagun_lounges to anon, authenticated;
grant insert, update, delete on public.lagun_lounges to authenticated;

insert into public.lagun_lounges (nome, capacidade, inclui, preco, cor, ordem) values
  ('Lounge Pista',  10, '{"Mordomo","2 garrafas inclusas","Pista"}',          1200, '#2B0E00', 1),
  ('Lounge Privé',  15, '{"Vista da pista","Cardápio selecionado"}',           2400, '#2B0E00', 2),
  ('Camarote Ouro', 20, '{"Mezanino","Entrada exclusiva","4 garrafas"}',       3800, '#3E3113', 3),
  ('Mesa Bistrô',    6, '{"Área externa","Sem mordomo"}',                       600, '#5C491C', 4)
on conflict do nothing;

-- ── Reservas de lounge ─────────────────────────────────────────────────────
create table if not exists public.lagun_lounge_reservas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('LG-' || upper(substr(md5(random()::text), 1, 4))),
  lounge_id uuid not null references public.lagun_lounges(id) on delete restrict,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  cliente_id uuid not null references public.lagun_app_clientes(id) on delete cascade,
  pessoas int not null check (pessoas > 0),
  nome text not null,
  observacoes text,
  preco numeric(12,2) not null default 0,      -- consumação do lounge na hora
  sinal numeric(12,2) not null default 0,      -- 50% do preço
  desconto numeric(12,2) not null default 0,
  pago numeric(12,2) not null default 0,       -- sinal - desconto
  status text not null default 'confirmada' check (status in ('confirmada', 'cancelada')),
  created_at timestamptz not null default now()
);
-- Um lounge por evento: enquanto a reserva está confirmada, ninguém mais pega.
create unique index if not exists lagun_lounge_reservas_unico
  on public.lagun_lounge_reservas (lounge_id, event_id) where status = 'confirmada';
create index if not exists lagun_lounge_reservas_cliente_idx on public.lagun_lounge_reservas (cliente_id, created_at desc);

alter table public.lagun_lounge_reservas enable row level security;
drop policy if exists "Cliente vê as próprias reservas" on public.lagun_lounge_reservas;
create policy "Cliente vê as próprias reservas" on public.lagun_lounge_reservas
  for select to authenticated using (cliente_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "Cliente reserva para si" on public.lagun_lounge_reservas;
create policy "Cliente reserva para si" on public.lagun_lounge_reservas
  for insert to authenticated with check (cliente_id = auth.uid() and status = 'confirmada');
drop policy if exists "Cliente cancela a própria reserva" on public.lagun_lounge_reservas;
create policy "Cliente cancela a própria reserva" on public.lagun_lounge_reservas
  for update to authenticated using (cliente_id = auth.uid()) with check (cliente_id = auth.uid());
revoke all on public.lagun_lounge_reservas from anon;
grant select, insert, update (status, observacoes) on public.lagun_lounge_reservas to authenticated;

-- Preço, sinal e desconto são calculados aqui, nunca confiados no app.
create or replace function public.lagun_lounge_reserva_calcula()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_preco numeric(12,2);
  v_capacidade int;
  v_pontos int;
begin
  select preco, capacidade into v_preco, v_capacidade from public.lagun_lounges where id = new.lounge_id and ativo;
  if v_preco is null then raise exception 'Lounge indisponível.'; end if;
  if new.pessoas > v_capacidade then raise exception 'Esse lounge recebe até % pessoas.', v_capacidade; end if;
  new.preco := v_preco;
  new.sinal := round(v_preco * 0.5, 2);
  -- Clube: 10% de desconto no sinal a partir do nível Ouro (1.000 pts).
  select coalesce(sum(pontos), 0) into v_pontos from public.lagun_clube_pontos where cliente_id = new.cliente_id;
  new.desconto := case when v_pontos >= 1000 then round(new.sinal * 0.10, 2) else 0 end;
  new.pago := new.sinal - new.desconto;
  return new;
end $$;
drop trigger if exists lagun_lounge_reserva_calcula on public.lagun_lounge_reservas;
create trigger lagun_lounge_reserva_calcula before insert on public.lagun_lounge_reservas
  for each row execute function public.lagun_lounge_reserva_calcula();

-- Quais lounges já estão ocupados em cada evento (público, só ids).
create or replace view public.lagun_lounges_ocupados with (security_invoker = false) as
  select lounge_id, event_id from public.lagun_lounge_reservas where status = 'confirmada';
grant select on public.lagun_lounges_ocupados to anon, authenticated;

-- ── Clube de pontos ────────────────────────────────────────────────────────
-- 1 ponto por R$ 1 pago na casa; 200 por indicação; 2x no aniversário.
create table if not exists public.lagun_clube_pontos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.lagun_app_clientes(id) on delete cascade,
  pontos int not null,
  motivo text not null,
  referencia text,
  created_at timestamptz not null default now()
);
create index if not exists lagun_clube_pontos_cliente_idx on public.lagun_clube_pontos (cliente_id, created_at desc);
alter table public.lagun_clube_pontos enable row level security;
drop policy if exists "Cliente vê os próprios pontos" on public.lagun_clube_pontos;
create policy "Cliente vê os próprios pontos" on public.lagun_clube_pontos
  for select to authenticated using (cliente_id = auth.uid());
revoke all on public.lagun_clube_pontos from anon;
grant select on public.lagun_clube_pontos to authenticated;

-- Reserva confirmada rende pontos (o valor pago agora).
create or replace function public.lagun_lounge_reserva_pontua()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lagun_clube_pontos (cliente_id, pontos, motivo, referencia)
    values (new.cliente_id, greatest(round(new.pago)::int, 0), 'Reserva de lounge', new.codigo);
  return new;
end $$;
drop trigger if exists lagun_lounge_reserva_pontua on public.lagun_lounge_reservas;
create trigger lagun_lounge_reserva_pontua after insert on public.lagun_lounge_reservas
  for each row execute function public.lagun_lounge_reserva_pontua();

-- ── Ingressos no app ───────────────────────────────────────────────────────
-- Preenchido pela integração com a ticketeira (pelo telefone do comprador).
create table if not exists public.lagun_app_ingressos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.lagun_app_clientes(id) on delete cascade,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  tipo text not null default 'Pista',
  quantidade int not null default 1,
  codigo text not null unique,
  usado boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.lagun_app_ingressos enable row level security;
drop policy if exists "Cliente vê os próprios ingressos" on public.lagun_app_ingressos;
create policy "Cliente vê os próprios ingressos" on public.lagun_app_ingressos
  for select to authenticated using (cliente_id = auth.uid());
revoke all on public.lagun_app_ingressos from anon;
grant select on public.lagun_app_ingressos to authenticated;

-- ── Divulgação ─────────────────────────────────────────────────────────────
create table if not exists public.lagun_divulgador_cliques (
  id bigint generated always as identity primary key,
  slug text not null,
  event_id uuid references public.lagun_events(id) on delete set null,
  clicked_at timestamptz not null default now()
);
create index if not exists lagun_divulgador_cliques_slug_idx on public.lagun_divulgador_cliques (slug, clicked_at desc);
alter table public.lagun_divulgador_cliques enable row level security;
drop policy if exists "Site registra clique no link" on public.lagun_divulgador_cliques;
create policy "Site registra clique no link" on public.lagun_divulgador_cliques for insert to anon, authenticated with check (true);
grant insert on public.lagun_divulgador_cliques to anon, authenticated;

create table if not exists public.lagun_divulgador_vendas (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.lagun_app_clientes(id) on delete cascade,
  event_id uuid references public.lagun_events(id) on delete set null,
  comprador text,
  tipo text,
  quantidade int not null default 1,
  comissao numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lagun_divulgador_vendas_cliente_idx on public.lagun_divulgador_vendas (cliente_id, created_at desc);
alter table public.lagun_divulgador_vendas enable row level security;
drop policy if exists "Divulgador vê as próprias vendas" on public.lagun_divulgador_vendas;
create policy "Divulgador vê as próprias vendas" on public.lagun_divulgador_vendas
  for select to authenticated using (cliente_id = auth.uid());
revoke all on public.lagun_divulgador_vendas from anon;
grant select on public.lagun_divulgador_vendas to authenticated;

-- Resumo da divulgação de quem está logado (cliques contam pelo slug).
create or replace function public.app_minha_divulgacao(p_desde timestamptz default null, p_event_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with eu as (select id, slug from public.lagun_app_clientes where id = auth.uid()),
  cliques as (
    select count(*) as n from public.lagun_divulgador_cliques c, eu
     where c.slug = eu.slug and (p_desde is null or c.clicked_at >= p_desde) and (p_event_id is null or c.event_id = p_event_id)
  ),
  vendas as (
    select * from public.lagun_divulgador_vendas v, eu
     where v.cliente_id = eu.id and (p_desde is null or v.created_at >= p_desde) and (p_event_id is null or v.event_id = p_event_id)
  ),
  por_dia as (
    select to_char(d::date, 'YYYY-MM-DD') as dia, coalesce((select count(*) from vendas v where v.created_at::date = d::date), 0) as n
      from generate_series(current_date - 6, current_date, interval '1 day') d
  )
  select jsonb_build_object(
    'slug', (select slug from eu),
    'cliques', (select n from cliques),
    'vendas', (select count(*) from vendas),
    'comissao', (select coalesce(sum(comissao), 0) from vendas),
    'por_dia', (select jsonb_agg(jsonb_build_object('dia', dia, 'n', n) order by dia) from por_dia),
    'ultimas', (select coalesce(jsonb_agg(jsonb_build_object('comprador', comprador, 'tipo', tipo, 'quantidade', quantidade, 'comissao', comissao, 'quando', created_at) order by created_at desc), '[]'::jsonb)
                  from (select * from vendas order by created_at desc limit 10) u)
  );
$$;
revoke all on function public.app_minha_divulgacao(timestamptz, uuid) from public, anon;
grant execute on function public.app_minha_divulgacao(timestamptz, uuid) to authenticated;

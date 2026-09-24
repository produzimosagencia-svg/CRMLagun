-- Resumo diário de vendas para os produtores (WhatsApp).
--
-- Regra: às 20h (horário de Brasília), quando o evento acontece em 4, 3, 2 ou
-- 1 dia, e no próprio dia, os produtores fixos e os parceiros vinculados ao
-- evento recebem o template `resumo_campanha_evento` com o total de ingressos
-- vendidos, os vendidos no dia (00h às 20h) e um botão para o relatório de
-- tráfego pago. O botão leva a /relatorio/<codigo>, um código por envio
-- (lagun_resumo_envios.codigo): a relatorio-evento aceita esse código além do
-- relatorio_token do evento e registra o clique, para saber quem abriu.
--
-- As vendas vêm da Zig (Superticket), sincronizadas a cada 10 minutos pela
-- edge function lagun-zig-sync. Cada evento tem o próprio id de evento e token
-- da Zig. O token fica numa tabela à parte, sem leitura pelo navegador: só a
-- service role (edge functions) lê. A gravação passa pela action salvar_config
-- da lagun-zig-sync.

create extension if not exists pgcrypto with schema extensions;

-- Vínculo evento da landing → evento da Zig (sem segredo).
create table if not exists public.lagun_event_zig (
  event_id uuid primary key references public.lagun_events(id) on delete cascade,
  zig_event_id text not null check (char_length(trim(zig_event_id)) between 1 and 40),
  last_sync_at timestamptz,
  last_sync_error text,
  orders_count int,
  updated_at timestamptz not null default now()
);

alter table public.lagun_event_zig enable row level security;

create policy "Equipe lê lagun_event_zig" on public.lagun_event_zig
  for select to authenticated using (true);

-- Token da Zig por evento. RLS ligado e nenhuma policy: o navegador não lê nem
-- grava; só a service role (que ignora RLS).
create table if not exists public.lagun_zig_credentials (
  event_id uuid primary key references public.lagun_events(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.lagun_zig_credentials enable row level security;
revoke all on public.lagun_zig_credentials from anon, authenticated;

-- Pedidos da Zig, só com o necessário para contar (sem dado pessoal).
create table if not exists public.lagun_zig_orders (
  order_id text primary key,
  event_id uuid references public.lagun_events(id) on delete cascade,
  zig_event_id text,
  status text,
  purchase_date timestamptz,
  tickets_count int not null default 0,
  total_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists lagun_zig_orders_evento_idx
  on public.lagun_zig_orders (event_id, status, purchase_date);

alter table public.lagun_zig_orders enable row level security;

create policy "Equipe lê lagun_zig_orders" on public.lagun_zig_orders
  for select to authenticated using (true);

-- Totais de um evento: ingressos pagos (status finalizado) no total e dentro
-- da janela [p_inicio, p_fim). Agrega no banco para não esbarrar no limite de
-- linhas da API.
create or replace function public.lagun_zig_totais(
  p_event_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz
)
returns table (total_ingressos bigint, ingressos_periodo bigint)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(tickets_count), 0)::bigint,
    coalesce(sum(tickets_count) filter (
      where purchase_date >= p_inicio and purchase_date < p_fim
    ), 0)::bigint
  from public.lagun_zig_orders
  where event_id = p_event_id
    and status = 'finalizado';
$$;

grant execute on function public.lagun_zig_totais(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Configuração do disparo (linha única). Começa desligado.
create table if not exists public.lagun_resumo_config (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false,
  template_name text not null default 'resumo_campanha_evento',
  template_language text not null default 'pt_BR',
  phone_number_id text,
  hora text not null default '20:00',
  updated_at timestamptz not null default now()
);

insert into public.lagun_resumo_config (id) values ('default')
  on conflict (id) do nothing;

alter table public.lagun_resumo_config enable row level security;

create policy "Equipe lê lagun_resumo_config" on public.lagun_resumo_config
  for select to authenticated using (true);

create policy "Equipe edita lagun_resumo_config" on public.lagun_resumo_config
  for update to authenticated using (true) with check (true);

-- Histórico dos envios. O UNIQUE (event_id, dia, telefone) garante no máximo
-- um resumo por pessoa, por evento, por dia, mesmo se o cron rodar de novo.
-- Entregue/lido não é copiado para cá: a tela junta com whatsapp_messages.status
-- pelo wamid (o whatsapp-webhook atualiza esse status).
create table if not exists public.lagun_resumo_envios (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.lagun_events(id) on delete cascade,
  dia date not null,
  dias_faltando int,
  partner_id uuid references public.lagun_partners(id) on delete set null,
  nome text,
  telefone text not null,
  status text not null default 'enviando', -- enviando | sent | failed
  wamid text,
  erro text,
  total_ingressos int,
  ingressos_hoje int,
  -- Link individual do botão (/relatorio/<codigo>): mostra quem abriu.
  codigo text unique default encode(extensions.gen_random_bytes(12), 'hex'),
  aberto_em timestamptz,        -- primeiro clique
  ultimo_clique_em timestamptz,
  cliques int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, dia, telefone)
);

create index if not exists lagun_resumo_envios_created_idx
  on public.lagun_resumo_envios (created_at desc);

alter table public.lagun_resumo_envios enable row level security;

create policy "Equipe lê lagun_resumo_envios" on public.lagun_resumo_envios
  for select to authenticated using (true);

-- Clique no link individual: chamado pela relatorio-evento (service role).
-- Devolve o evento do envio, ou nada se o código não existir.
create or replace function public.lagun_resumo_registrar_clique(p_codigo text)
returns uuid
language sql
volatile
security definer
set search_path = public
as $$
  update public.lagun_resumo_envios
     set cliques = cliques + 1,
         aberto_em = coalesce(aberto_em, now()),
         ultimo_clique_em = now()
   where codigo = p_codigo
  returning event_id;
$$;

revoke all on function public.lagun_resumo_registrar_clique(text) from public, anon, authenticated;
grant execute on function public.lagun_resumo_registrar_clique(text) to service_role;

-- Agendamentos. Mesmo padrão das automações do Instagram: pg_net chamando a
-- função, sem Authorization (as funções rodam com verify_jwt = false).
--  • lagun-zig-sync: a cada 10 minutos.
--  • lagun-resumo-produtores: 23:00 UTC = 20:00 em Brasília (UTC-3, sem
--    horário de verão). A função só dispara entre 20h e 23h59 de Brasília,
--    então uma chamada fora de hora não manda nada.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('lagun-zig-sync')
  where exists (select 1 from cron.job where jobname = 'lagun-zig-sync');
select cron.schedule('lagun-zig-sync', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/lagun-zig-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 60000);
$$);

select cron.unschedule('lagun-resumo-produtores')
  where exists (select 1 from cron.job where jobname = 'lagun-resumo-produtores');
select cron.schedule('lagun-resumo-produtores', '0 23 * * *', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/lagun-resumo-produtores',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

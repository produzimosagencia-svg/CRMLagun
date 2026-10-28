-- Visão geral de vendas (Zig / Superticket) de todos os eventos da Lagun.
--
-- 1. lagun_zig_orders ganha forma de pagamento e cupom do pedido.
-- 2. lagun_zig_tickets guarda cada ingresso do pedido (setor, lote, preço,
--    cortesia, passaporte). Continua sem dado pessoal do comprador: nome,
--    e-mail, telefone e CPF ficam só na Zig.
-- 3. RPC zig_dashboard(p_inicio, p_fim, p_event_id): números agregados no
--    banco para a página /interno/visao-geral.
--
-- Status vistos na Zig (out/2026): finalizado (pago), pendente (aguardando
-- pagamento) e descartado (abandonado ou recusado). Só pedido pago conta como
-- venda (ver lagun_zig_pago).
--
-- A lagun-zig-sync preenche as colunas e a tabela novas a cada 10 min, mas só
-- para eventos de ontem em diante. Evento que já passou precisa de uma leitura
-- manual (botão Atualizar da Visão geral) para ganhar setor, lote e cupom.

-- ── 1. pedido: pagamento e cupom ─────────────────────────────────────────────
alter table public.lagun_zig_orders
  add column if not exists payment_method text,
  add column if not exists coupon_code text,
  add column if not exists discount_value numeric(12,2) not null default 0;

-- ── 2. ingressos de cada pedido ──────────────────────────────────────────────
-- A Zig não manda id por ingresso: a chave é (pedido, posição no pedido).
-- synced_at marca a última leitura; a sync apaga o que ficou para trás.
create table if not exists public.lagun_zig_tickets (
  order_id text not null references public.lagun_zig_orders(order_id) on delete cascade,
  seq int not null,
  event_id uuid references public.lagun_events(id) on delete cascade,
  zig_event_id text,
  sector text,
  lot text,
  price numeric(12,2) not null default 0,
  is_courtesy boolean not null default false,
  is_passport boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (order_id, seq)
);

create index if not exists lagun_zig_tickets_evento_idx
  on public.lagun_zig_tickets (event_id, synced_at);

-- Mesma regra de leitura da lagun_zig_orders: equipe logada lê, só a service
-- role (edge functions) grava.
alter table public.lagun_zig_tickets enable row level security;

drop policy if exists "Equipe lê lagun_zig_tickets" on public.lagun_zig_tickets;
create policy "Equipe lê lagun_zig_tickets" on public.lagun_zig_tickets
  for select to authenticated using (true);

-- ── status pago ──────────────────────────────────────────────────────────────
-- Hoje a Zig usa "finalizado". Os outros nomes ficam aqui caso a API mude.
create or replace function public.lagun_zig_pago(p_status text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_status, '')) in ('finalizado', 'aprovado', 'pago', 'paid', 'approved', 'concluido', 'concluído');
$$;

grant execute on function public.lagun_zig_pago(text) to authenticated, service_role;

-- ── 3. dashboard ─────────────────────────────────────────────────────────────
-- Período pela data da compra [p_inicio, p_fim); nulos = sem limite.
-- p_event_id nulo = todos os eventos. "eventos" traz sempre todos os eventos
-- ligados à Zig (para o seletor e os cartões), com total desde o início das
-- vendas e o recorte do período.
drop function if exists public.zig_dashboard(timestamptz, timestamptz, uuid);
create or replace function public.zig_dashboard(
  p_inicio timestamptz default null,
  p_fim timestamptz default null,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  resultado jsonb;
begin
  with ped_all as (
    select o.*, (o.purchase_date at time zone 'America/Sao_Paulo') local_ts
    from lagun_zig_orders o
    where o.event_id is not null
      and (p_event_id is null or o.event_id = p_event_id)
      and (p_inicio is null or o.purchase_date >= p_inicio)
      and (p_fim is null or o.purchase_date < p_fim)
  ),
  ped as (
    select * from ped_all where lagun_zig_pago(status)
  ),
  ing as (
    select t.*, coalesce(nullif(trim(t.sector), ''), 'Sem setor') setor,
           coalesce(nullif(trim(t.lot), ''), 'Sem lote') lote
    from lagun_zig_tickets t
    join ped p on p.order_id = t.order_id
  ),
  todos as (
    select o.event_id, o.total_amount, o.tickets_count, o.purchase_date,
           lagun_zig_pago(o.status) pago,
           (o.purchase_date at time zone 'America/Sao_Paulo')::date dia
    from lagun_zig_orders o
    where o.event_id is not null
  )
  select jsonb_build_object(
    'hoje', hoje,
    'atualizado_em', (select max(last_sync_at) from lagun_event_zig
                      where p_event_id is null or event_id = p_event_id),
    'kpis', (select jsonb_build_object(
        'bruto', coalesce(sum(total_amount), 0),
        'face', coalesce((select sum(price) from ing), 0),
        'pedidos', count(*),
        'ingressos', coalesce(sum(tickets_count), 0),
        'ingressos_detalhados', (select count(*) from ing),
        'cupom_bruto', coalesce(sum(total_amount) filter (where coalesce(coupon_code, '') <> ''), 0),
        'cupom_pedidos', count(*) filter (where coalesce(coupon_code, '') <> ''),
        'desconto', coalesce(sum(discount_value), 0),
        'primeira', min(purchase_date), 'ultima', max(purchase_date)
      ) from ped),
    'cortesias', (select count(*) from ing where is_courtesy),
    'passaportes', (select count(*) from ing where is_passport),
    'funil', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
              from (select coalesce(nullif(lower(status), ''), 'sem status') status, count(*) n from ped_all group by 1) f),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('t', d, 'bruto', b, 'ingressos', n, 'pedidos', p) order by d)
       from (select local_ts::date d, sum(total_amount) b, sum(tickets_count) n, count(*) p from ped group by 1) x), '[]'::jsonb),
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('t', h, 'bruto', b, 'ingressos', n, 'pedidos', p) order by h)
       from (select date_trunc('hour', local_ts) h, sum(total_amount) b, sum(tickets_count) n, count(*) p from ped
             where p_inicio is not null and p_inicio > now() - interval '3 days' group by 1) x), '[]'::jsonb),
    'setores', coalesce((select jsonb_agg(jsonb_build_object('nome', setor, 'ingressos', n, 'valor', v) order by n desc, v desc)
       from (select setor, count(*) n, sum(price) v from ing group by 1) x), '[]'::jsonb),
    'lotes', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'ingressos', n, 'valor', v) order by v desc, n desc)
       from (select setor || ' · ' || lote nome, count(*) n, sum(price) v from ing group by 1 order by 3 desc, 2 desc limit 15) x), '[]'::jsonb),
    'cupons', coalesce((select jsonb_agg(jsonb_build_object('codigo', c, 'ingressos', n, 'pedidos', p, 'valor', v, 'desconto', dsc))
       from (select upper(trim(coupon_code)) c, sum(tickets_count) n, count(*) p, sum(total_amount) v, sum(discount_value) dsc from ped
             where coalesce(trim(coupon_code), '') <> '' group by 1 order by 4 desc limit 40) x), '[]'::jsonb),
    'pagamento', coalesce((select jsonb_agg(jsonb_build_object('nome', pg, 'pedidos', p, 'valor', v) order by v desc)
       from (select coalesce(nullif(trim(payment_method), ''), 'Outro') pg, count(*) p, sum(total_amount) v from ped group by 1) x), '[]'::jsonb),
    'hora_semana', coalesce((select jsonb_agg(jsonb_build_object('dow', dw, 'hora', hr, 'ingressos', n))
       from (select extract(dow from local_ts)::int dw, extract(hour from local_ts)::int hr, sum(tickets_count) n from ped group by 1, 2) x), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
         'id', e.id, 'nome', e.nome, 'data', e.data, 'imagem', e.imagem_url, 'local', e.local, 'link', e.link,
         'sincronizado_em', z.last_sync_at, 'erro', z.last_sync_error,
         'bruto', coalesce(t.b, 0), 'pedidos', coalesce(t.p, 0), 'ingressos', coalesce(t.n, 0),
         'ult7', coalesce(t.u7, 0), 'ant7', coalesce(t.a7, 0), 'ultima', t.ult, 'nao_pagos', coalesce(t.np, 0),
         'bruto_periodo', coalesce(pp.b, 0), 'face_periodo', coalesce(pf.v, 0),
         'pedidos_periodo', coalesce(pp.p, 0), 'ingressos_periodo', coalesce(pp.n, 0)
       ) order by e.data nulls last, e.nome)
       from lagun_event_zig z
       join lagun_events e on e.id = z.event_id
       left join (
         select event_id,
                sum(total_amount) filter (where pago) b,
                count(*) filter (where pago) p,
                sum(tickets_count) filter (where pago) n,
                sum(tickets_count) filter (where pago and dia between hoje - 6 and hoje) u7,
                sum(tickets_count) filter (where pago and dia between hoje - 13 and hoje - 7) a7,
                max(purchase_date) filter (where pago) ult,
                count(*) filter (where not pago) np
         from todos group by 1
       ) t on t.event_id = e.id
       left join (select event_id, sum(total_amount) b, count(*) p, sum(tickets_count) n from ped group by 1) pp on pp.event_id = e.id
       left join (select event_id, sum(price) v from ing group by 1) pf on pf.event_id = e.id
     ), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.zig_dashboard(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.zig_dashboard(timestamptz, timestamptz, uuid) to authenticated, service_role;

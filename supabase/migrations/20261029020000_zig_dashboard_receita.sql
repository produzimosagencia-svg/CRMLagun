-- Dashboard da Zig só com a receita do produtor: todo valor em dinheiro passa a
-- ser a soma dos ingressos (lagun_zig_tickets.price), sem a taxa de
-- conveniência que o público paga para a Zig. Pedido sem ingresso detalhado
-- (leitura antiga) cai no total do pedido. "taxa" fica nos KPIs só como informação.

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
  with rec as (
    select order_id, sum(price) receita from lagun_zig_tickets group by 1
  ),
  ped_all as (
    select o.*, coalesce(r.receita, o.total_amount) receita,
           (o.purchase_date at time zone 'America/Sao_Paulo') local_ts
    from lagun_zig_orders o
    left join rec r on r.order_id = o.order_id
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
    select o.event_id, coalesce(r.receita, o.total_amount) receita, o.tickets_count, o.purchase_date,
           lagun_zig_pago(o.status) pago,
           (o.purchase_date at time zone 'America/Sao_Paulo')::date dia
    from lagun_zig_orders o
    left join rec r on r.order_id = o.order_id
    where o.event_id is not null
  )
  select jsonb_build_object(
    'hoje', hoje,
    'atualizado_em', (select max(last_sync_at) from lagun_event_zig
                      where p_event_id is null or event_id = p_event_id),
    'kpis', (select jsonb_build_object(
        'bruto', coalesce(sum(receita), 0),
        'taxa', coalesce(sum(total_amount), 0) - coalesce(sum(receita), 0),
        'face', coalesce((select sum(price) from ing), 0),
        'pedidos', count(*),
        'ingressos', coalesce(sum(tickets_count), 0),
        'ingressos_detalhados', (select count(*) from ing),
        'cupom_bruto', coalesce(sum(receita) filter (where coalesce(coupon_code, '') <> ''), 0),
        'cupom_pedidos', count(*) filter (where coalesce(coupon_code, '') <> ''),
        'desconto', coalesce(sum(discount_value), 0),
        'primeira', min(purchase_date), 'ultima', max(purchase_date)
      ) from ped),
    'cortesias', (select count(*) from ing where is_courtesy),
    'passaportes', (select count(*) from ing where is_passport),
    'funil', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
              from (select coalesce(nullif(lower(status), ''), 'sem status') status, count(*) n from ped_all group by 1) f),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('t', d, 'bruto', b, 'ingressos', n, 'pedidos', p) order by d)
       from (select local_ts::date d, sum(receita) b, sum(tickets_count) n, count(*) p from ped group by 1) x), '[]'::jsonb),
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('t', h, 'bruto', b, 'ingressos', n, 'pedidos', p) order by h)
       from (select date_trunc('hour', local_ts) h, sum(receita) b, sum(tickets_count) n, count(*) p from ped
             where p_inicio is not null and p_inicio > now() - interval '3 days' group by 1) x), '[]'::jsonb),
    'setores', coalesce((select jsonb_agg(jsonb_build_object('nome', setor, 'ingressos', n, 'valor', v) order by n desc, v desc)
       from (select setor, count(*) n, sum(price) v from ing group by 1) x), '[]'::jsonb),
    'lotes', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'ingressos', n, 'valor', v) order by v desc, n desc)
       from (select setor || ' · ' || lote nome, count(*) n, sum(price) v from ing group by 1 order by 3 desc, 2 desc limit 15) x), '[]'::jsonb),
    'cupons', coalesce((select jsonb_agg(jsonb_build_object('codigo', c, 'ingressos', n, 'pedidos', p, 'valor', v, 'desconto', dsc))
       from (select upper(trim(coupon_code)) c, sum(tickets_count) n, count(*) p, sum(receita) v, sum(discount_value) dsc from ped
             where coalesce(trim(coupon_code), '') <> '' group by 1 order by 4 desc limit 40) x), '[]'::jsonb),
    'pagamento', coalesce((select jsonb_agg(jsonb_build_object('nome', pg, 'pedidos', p, 'valor', v) order by v desc)
       from (select coalesce(nullif(trim(payment_method), ''), 'Outro') pg, count(*) p, sum(receita) v from ped group by 1) x), '[]'::jsonb),
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
                sum(receita) filter (where pago) b,
                count(*) filter (where pago) p,
                sum(tickets_count) filter (where pago) n,
                sum(tickets_count) filter (where pago and dia between hoje - 6 and hoje) u7,
                sum(tickets_count) filter (where pago and dia between hoje - 13 and hoje - 7) a7,
                max(purchase_date) filter (where pago) ult,
                count(*) filter (where not pago) np
         from todos group by 1
       ) t on t.event_id = e.id
       left join (select event_id, sum(receita) b, count(*) p, sum(tickets_count) n from ped group by 1) pp on pp.event_id = e.id
       left join (select event_id, sum(price) v from ing group by 1) pf on pf.event_id = e.id
     ), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.zig_dashboard(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.zig_dashboard(timestamptz, timestamptz, uuid) to authenticated, service_role;

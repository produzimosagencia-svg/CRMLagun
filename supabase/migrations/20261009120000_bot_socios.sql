-- Assistente dos sócios no WhatsApp (edge function bot-socios).
--
-- O bot responde só a quem está em lagun_partners (fixos: todos os eventos;
-- parceiros: os eventos vinculados). Qualquer outro número é ignorado em
-- silêncio. Para responder "quantos ingressos vendemos hoje / ontem / esta
-- semana" ele precisa das vendas da Zig por dia, agregadas no banco.

create or replace function public.lagun_zig_por_dia(p_event_id uuid, p_dias int default 14)
returns table (dia date, ingressos bigint, valor numeric)
language sql
stable
set search_path = public
as $$
  select
    (purchase_date at time zone 'America/Sao_Paulo')::date as dia,
    coalesce(sum(tickets_count), 0)::bigint as ingressos,
    coalesce(sum(total_amount), 0)::numeric as valor
  from public.lagun_zig_orders
  where event_id = p_event_id
    and status = 'finalizado'
    and purchase_date >= (now() at time zone 'America/Sao_Paulo')::date - greatest(p_dias, 1) + 1
  group by 1
  order by 1 desc;
$$;

revoke all on function public.lagun_zig_por_dia(uuid, int) from public, anon;
grant execute on function public.lagun_zig_por_dia(uuid, int) to authenticated, service_role;

-- Totais do evento com receita (a lagun_zig_totais só conta ingressos).
create or replace function public.lagun_zig_totais_valor(p_event_id uuid)
returns table (total_ingressos bigint, total_valor numeric, primeira_venda timestamptz, ultima_venda timestamptz)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(tickets_count), 0)::bigint,
    coalesce(sum(total_amount), 0)::numeric,
    min(purchase_date),
    max(purchase_date)
  from public.lagun_zig_orders
  where event_id = p_event_id
    and status = 'finalizado';
$$;

revoke all on function public.lagun_zig_totais_valor(uuid) from public, anon;
grant execute on function public.lagun_zig_totais_valor(uuid) to authenticated, service_role;

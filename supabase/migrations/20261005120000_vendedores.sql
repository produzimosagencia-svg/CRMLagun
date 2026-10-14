-- Vendedores da Lagun: cadastro, vendas, mensagens e metas mensais.
--
-- Vendedor é um cadastro à parte (não é usuário do painel). A venda entra de
-- dois jeitos, somados:
--   - automática: compra em crm_purchases feita com um cupom do vendedor;
--   - manual: lançamento em lagun_vendedor_vendas.
-- Mensagens: só a QUANTIDADE por dia, vinda do WhatsApp do vendedor conectado
-- por API não oficial. O conteúdo das conversas dele nunca é gravado.

create table if not exists public.lagun_vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text,
  cupons text[] not null default '{}',
  -- Nome da instância do WhatsApp do vendedor na API não oficial.
  whatsapp_instancia text unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lagun_vendedor_vendas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.lagun_vendedores(id) on delete cascade,
  evento text not null check (char_length(evento) between 1 and 200),
  dia date not null default current_date,
  ingressos integer not null default 0 check (ingressos >= 0),
  receita numeric(12,2) not null default 0 check (receita >= 0),
  observacao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists lagun_vendedor_vendas_vendedor_idx on public.lagun_vendedor_vendas (vendedor_id, dia);

create table if not exists public.lagun_vendedor_mensagens (
  vendedor_id uuid not null references public.lagun_vendedores(id) on delete cascade,
  dia date not null,
  enviadas integer not null default 0 check (enviadas >= 0),
  recebidas integer not null default 0 check (recebidas >= 0),
  updated_at timestamptz not null default now(),
  primary key (vendedor_id, dia)
);

create table if not exists public.lagun_vendedor_metas (
  vendedor_id uuid not null references public.lagun_vendedores(id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  meta_ingressos integer not null default 0 check (meta_ingressos >= 0),
  meta_receita numeric(12,2) not null default 0 check (meta_receita >= 0),
  meta_mensagens integer not null default 0 check (meta_mensagens >= 0),
  updated_at timestamptz not null default now(),
  primary key (vendedor_id, mes)
);

-- Mesmo padrão de lagun_partners: a equipe logada lê e edita.
do $$
declare t text;
begin
  foreach t in array array['lagun_vendedores', 'lagun_vendedor_vendas', 'lagun_vendedor_mensagens', 'lagun_vendedor_metas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Equipe gerencia %s" on public.%I', t, t);
    execute format('create policy "Equipe gerencia %s" on public.%I for all to authenticated using (true) with check (true)', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Todas as vendas por vendedor, automáticas (cupom) e manuais, numa lista só.
create or replace view public.lagun_vendedor_vendas_todas
with (security_invoker = true) as
  select v.id as vendedor_id,
         p.event_name as evento,
         p.purchase_date as dia,
         coalesce(p.quantity, 1)::integer as ingressos,
         coalesce(p.total_value, p.ticket_price * coalesce(p.quantity, 1), 0)::numeric(12,2) as receita,
         'cupom'::text as origem
    from public.lagun_vendedores v
    join public.crm_purchases p
      on upper(trim(p.coupon_used)) = any (select upper(trim(c)) from unnest(v.cupons) c)
   where coalesce(trim(p.coupon_used), '') <> ''
  union all
  select m.vendedor_id, m.evento, m.dia, m.ingressos, m.receita, 'manual'::text
    from public.lagun_vendedor_vendas m;

-- Totais por vendedor no período (ranking, panorama e metas).
create or replace function public.lagun_vendedores_resumo(p_de date, p_ate date)
returns table (vendedor_id uuid, ingressos bigint, receita numeric, mensagens bigint)
language sql stable security invoker set search_path = public as $$
  select v.id,
         coalesce((select sum(t.ingressos) from lagun_vendedor_vendas_todas t where t.vendedor_id = v.id and t.dia between p_de and p_ate), 0)::bigint,
         coalesce((select sum(t.receita) from lagun_vendedor_vendas_todas t where t.vendedor_id = v.id and t.dia between p_de and p_ate), 0)::numeric,
         coalesce((select sum(m.enviadas) from lagun_vendedor_mensagens m where m.vendedor_id = v.id and m.dia between p_de and p_ate), 0)::bigint
    from lagun_vendedores v;
$$;

-- Vendas por vendedor e evento no período (aba Performance).
create or replace function public.lagun_vendedores_vendas_evento(p_de date, p_ate date)
returns table (vendedor_id uuid, evento text, ingressos bigint, receita numeric, por_cupom bigint, manuais bigint)
language sql stable security invoker set search_path = public as $$
  select t.vendedor_id, t.evento,
         sum(t.ingressos)::bigint, sum(t.receita)::numeric,
         coalesce(sum(t.ingressos) filter (where t.origem = 'cupom'), 0)::bigint,
         coalesce(sum(t.ingressos) filter (where t.origem = 'manual'), 0)::bigint
    from lagun_vendedor_vendas_todas t
   where t.dia between p_de and p_ate
   group by t.vendedor_id, t.evento;
$$;

grant execute on function public.lagun_vendedores_resumo(date, date) to authenticated;
grant execute on function public.lagun_vendedores_vendas_evento(date, date) to authenticated;

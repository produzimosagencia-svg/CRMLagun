-- App da Lagun (iPhone) · Área dos Sócios (2026-11-17)
-- Pacote de design: app-iphone/docs/app-fluxo-socios-embaixadoras/FLUXO-SOCIOS.md.
-- A área dos sócios é a cópia do app interno da Tríade com a pele da Lagun. Ela lê:
-- noites (lagun_events), vendas da Zig (lagun_zig_orders / lagun_zig_tickets), demandas
-- (team_tasks), agenda (calendar_events via app_agenda), campanhas (lagun_event_campaigns)
-- e cupons (lagun_vendedores). NÃO lê nada do Programa de Embaixadoras.
-- Tudo aqui é aditivo: colunas novas anuláveis, tabela nova, funções novas e
-- políticas a mais. Nenhum dado é apagado ou alterado.
-- Depende de 20261117190000_papeis_socio_embaixadora.sql (valor 'socio' no enum).
-- Não depende de 20261117210000 (embaixadoras).

-- ── Quem é sócio ────────────────────────────────────────────────────────────
-- socio (papel novo) ou partner (sócio é um fato, ver app_definir_papel), e quem é
-- master/admin, que já vê tudo no Bastidor.
-- Conta de revisão da Apple (auth.users.raw_app_meta_data.revisao = true): tem o papel
-- socio para entrar no app, mas NUNCA lê dado real. O app mostra para ela só dados
-- fictícios, embutidos no próprio app; aqui no banco ela não passa em app_e_socio.
create or replace function public.app_e_revisao(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((select (raw_app_meta_data ->> 'revisao')::boolean from auth.users where id = _user_id), false)
$$;
grant execute on function public.app_e_revisao(uuid) to authenticated;

create or replace function public.app_e_socio(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role::text in ('socio', 'partner', 'master', 'admin'))
     and not public.app_e_revisao(_user_id)
$$;
grant execute on function public.app_e_socio(uuid) to authenticated;

-- ── Noites: meta, horário e comissão das embaixadoras (cupons) ──────────────
alter table public.lagun_events add column if not exists meta_ingressos integer check (meta_ingressos is null or meta_ingressos >= 0);
alter table public.lagun_events add column if not exists hora_inicio time;
alter table public.lagun_events add column if not exists hora_fim time;
alter table public.lagun_events add column if not exists comissao_embaixadora_pct numeric(5,2)
  check (comissao_embaixadora_pct is null or comissao_embaixadora_pct between 0 and 100);

-- Cria ou edita uma noite pelo app (Eventos › +). Noite nova nasce fora da landing
-- (show_on_landing = false) até alguém publicar pelo painel.
create or replace function public.soc_salvar_noite(
  _id uuid, _nome text, _data date, _dia_semana text, _meta integer, _hora_inicio time, _hora_fim time, _comissao numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.app_e_socio() then raise exception 'Só sócio cria ou edita noite.'; end if;
  if coalesce(trim(_nome), '') = '' or _data is null then raise exception 'Informe nome e data da noite.'; end if;
  if _id is null then
    insert into public.lagun_events (nome, data, dia_semana, status, show_on_landing, tag, meta_ingressos, hora_inicio, hora_fim, comissao_embaixadora_pct)
    values (trim(_nome), _data, _dia_semana, 'upcoming', false, 'EM BREVE', _meta, _hora_inicio, _hora_fim, _comissao)
    returning id into v_id;
  else
    update public.lagun_events
       set nome = trim(_nome), data = _data, dia_semana = coalesce(_dia_semana, dia_semana), meta_ingressos = _meta,
           hora_inicio = _hora_inicio, hora_fim = _hora_fim, comissao_embaixadora_pct = _comissao, updated_at = now()
     where id = _id returning id into v_id;
    if v_id is null then raise exception 'Noite não encontrada.'; end if;
  end if;
  return v_id;
end $$;
grant execute on function public.soc_salvar_noite(uuid, text, date, text, integer, time, time, numeric) to authenticated;

-- ── Equipe por noite (como event_members da Tríade) ─────────────────────────
create table if not exists public.lagun_event_members (
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'tarefas' check (role in ('master', 'producao', 'design', 'trafego', 'social', 'atendimento', 'tarefas')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.lagun_event_members enable row level security;
drop policy if exists "Sócio e equipe leem a equipe da noite" on public.lagun_event_members;
create policy "Sócio e equipe leem a equipe da noite" on public.lagun_event_members for select to authenticated
  using (public.app_e_socio() or public.app_papel(auth.uid()) is not null);
drop policy if exists "Master monta a equipe da noite" on public.lagun_event_members;
create policy "Master monta a equipe da noite" on public.lagun_event_members for all to authenticated
  using (public.app_papel(auth.uid()) = 'master') with check (public.app_papel(auth.uid()) = 'master');

-- ── Demandas: o sócio vê, cria e atualiza todas (políticas a mais, permissivas) ──
drop policy if exists "Sócio vê demandas" on public.team_tasks;
create policy "Sócio vê demandas" on public.team_tasks for select to authenticated using (public.app_e_socio());
drop policy if exists "Sócio cria demandas" on public.team_tasks;
create policy "Sócio cria demandas" on public.team_tasks for insert to authenticated with check (public.app_e_socio());
drop policy if exists "Sócio atualiza demandas" on public.team_tasks;
create policy "Sócio atualiza demandas" on public.team_tasks for update to authenticated using (public.app_e_socio());

-- Campanhas da Meta ligadas a cada noite (Tráfego): o sócio lê.
drop policy if exists "Sócio lê campanhas da noite" on public.lagun_event_campaigns;
create policy "Sócio lê campanhas da noite" on public.lagun_event_campaigns for select to authenticated using (public.app_e_socio());

-- Engrenagem do Tráfego (quadro 24): troca as campanhas que contam para a noite.
create or replace function public.soc_ligar_campanhas(_event_id uuid, _account_id text, _campanhas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.app_e_socio() then raise exception 'Só sócio liga campanhas.'; end if;
  if not exists (select 1 from public.lagun_events where id = _event_id) then raise exception 'Noite não encontrada.'; end if;
  -- Desliga da noite só as campanhas que a pessoa desmarcou (vínculo, não dado de venda).
  delete from public.lagun_event_campaigns
   where event_id = _event_id
     and campaign_id not in (select c->>'id' from jsonb_array_elements(coalesce(_campanhas, '[]'::jsonb)) c where c->>'id' is not null);
  insert into public.lagun_event_campaigns (campaign_id, event_id, campaign_name, account_id, updated_at)
  select c->>'id', _event_id, c->>'nome', _account_id, now() from jsonb_array_elements(coalesce(_campanhas, '[]'::jsonb)) c
   where coalesce(c->>'id', '') <> ''
  on conflict (campaign_id) do update set event_id = excluded.event_id, campaign_name = excluded.campaign_name, account_id = excluded.account_id, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.soc_ligar_campanhas(uuid, text, jsonb) to authenticated;

-- ── Nomes da equipe e agenda: o sócio também lê ─────────────────────────────
create or replace function public.app_nomes_equipe()
returns table (id uuid, nome text, avatar_url text, papel text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.full_name, p.username, 'Sem nome'), p.avatar_url, public.app_papel(p.id)
    from public.profiles p
   where (public.app_papel(auth.uid()) is not null or public.app_e_socio())
     and (public.app_papel(p.id) is not null or public.app_e_socio(p.id))
   order by coalesce(p.full_name, p.username)
$$;
grant execute on function public.app_nomes_equipe() to authenticated;

create or replace function public.app_agenda(_de date, _ate date)
returns table (tipo text, id text, dia date, hora time, titulo text, sub text, cor text, event_id uuid, task_id uuid)
language sql stable security definer set search_path = public as $$
  select 'evento', e.id::text, e.data, e.hora_inicio, e.nome, coalesce(e.artista, ''), 'ouro', e.id, null::uuid
    from public.lagun_events e where e.data between _de and _ate and (public.app_papel(auth.uid()) is not null or public.app_e_socio())
  union all
  select 'demanda', t.id::text, t.due_date, t.due_time, t.title,
         coalesce((select p.full_name from public.profiles p where p.id = t.assigned_to), 'Sem responsável') || case when t.priority = 'urgente' then ' · urgente' else '' end,
         case t.area when 'design' then 'rosa' when 'social' then 'rosa' when 'trafego' then 'azul' else 'cinza' end, t.event_id, t.id
    from public.team_tasks t
   where t.due_date between _de and _ate and t.status <> 'finalizado'
     and (public.app_papel(auth.uid()) = 'master' or public.app_e_socio()
          or (public.app_papel(auth.uid()) in ('social', 'trafego', 'design')
              and (t.area = public.app_papel(auth.uid()) or t.area = 'geral' or t.assigned_to = auth.uid() or t.created_by = auth.uid() or t.requested_by = auth.uid())))
  union all
  select 'compromisso', c.id::text, c.date, c.start_time, c.title, coalesce(c.description, ''), coalesce(c.color, 'cinza'), null::uuid, null::uuid
    from public.calendar_events c where c.date between _de and _ate and (public.app_papel(auth.uid()) in ('master', 'social', 'trafego', 'design') or public.app_e_socio())
  order by 3, 4 nulls first
$$;
grant execute on function public.app_agenda(date, date) to authenticated;

-- ── Vendas da Zig por noite (Início, Eventos, Painel da noite) ──────────────
-- Pedido cancelado, estornado ou reembolsado fica fora (mesma regra de app_vendas_por_evento).
create or replace function public.soc_pedido_valido(_status text)
returns boolean language sql immutable as $$
  select not (coalesce(_status, '') ilike any (array['%cancel%', '%estorn%', '%refund%', '%reemb%']))
$$;

create or replace function public.soc_vendas_evento(_event_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r json;
begin
  if not public.app_e_socio() then return null; end if;
  with o as (
    select * from public.lagun_zig_orders where event_id = _event_id and public.soc_pedido_valido(status)
  ), t as (
    select tk.* from public.lagun_zig_tickets tk join o on o.order_id = tk.order_id
  )
  select json_build_object(
    'ingressos', coalesce((select sum(tickets_count) from o), 0),
    'receita', coalesce((select sum(total_amount) from o), 0),
    'hoje', coalesce((select sum(tickets_count) from o where (purchase_date at time zone 'America/Sao_Paulo')::date = v_hoje), 0),
    'receita_hoje', coalesce((select sum(total_amount) from o where (purchase_date at time zone 'America/Sao_Paulo')::date = v_hoje), 0),
    'pedidos', (select count(*) from o),
    'cortesias', (select count(*) from t where is_courtesy),
    'ultima_venda', (select max(purchase_date) from o),
    'por_dia', coalesce((select json_agg(x order by x.dia) from (
        select (purchase_date at time zone 'America/Sao_Paulo')::date as dia, sum(tickets_count) as n, sum(total_amount) as receita
          from o where purchase_date >= now() - interval '60 days' group by 1) x), '[]'::json),
    'por_lote', coalesce((select json_agg(x order by x.n desc) from (
        select coalesce(nullif(trim(lot), ''), 'Sem lote') as lote, count(*) as n, sum(price) as receita from t group by 1) x), '[]'::json),
    'por_setor', coalesce((select json_agg(x order by x.n desc) from (
        select coalesce(nullif(trim(sector), ''), 'Sem setor') as setor, count(*) as n, sum(price) as receita from t group by 1) x), '[]'::json),
    'cupons', coalesce((select json_agg(x order by x.n desc) from (
        select upper(trim(o.coupon_code)) as codigo,
               (select v.nome from public.lagun_vendedores v where upper(trim(o.coupon_code)) = any (select upper(trim(c)) from unnest(v.cupons) c) limit 1) as nome,
               sum(o.tickets_count) as n, sum(o.total_amount) as receita
          from o where coalesce(trim(o.coupon_code), '') <> '' group by 1, 2) x), '[]'::json)
  ) into r;
  return r;
end $$;
grant execute on function public.soc_vendas_evento(uuid) to authenticated;

-- Vendas de um dia (horário de Brasília), por noite e por hora: o gráfico do Início.
create or replace function public.soc_vendas_dia(_dia date)
returns table (event_id uuid, hora integer, ingressos bigint, receita numeric)
language sql stable security definer set search_path = public as $$
  select o.event_id, extract(hour from o.purchase_date at time zone 'America/Sao_Paulo')::integer,
         sum(o.tickets_count)::bigint, sum(o.total_amount)
    from public.lagun_zig_orders o
   where public.app_e_socio() and o.event_id is not null and public.soc_pedido_valido(o.status)
     and o.purchase_date >= (_dia::timestamp at time zone 'America/Sao_Paulo')
     and o.purchase_date < ((_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
   group by 1, 2
$$;
grant execute on function public.soc_vendas_dia(date) to authenticated;

-- ── Meus cupons (quadros 26 e 27): a visão de cupons da Tríade (comissão por venda) ──
-- Quem tem cupom é quem está em lagun_vendedores ligado ao próprio login. A Zig espelhada
-- não guarda nome de comprador: a lista traz setor/lote e hora de cada compra.
create or replace function public.soc_meus_cupons()
returns table (cupom text, evento text, evento_id uuid, data_evento date, compras bigint, ingressos bigint, valor numeric, taxa numeric, comissao numeric, compradores json)
language sql stable security definer set search_path = public as $$
  with meus as (
    select distinct upper(trim(c)) as cupom from public.lagun_vendedores v, unnest(v.cupons) c where v.user_id = auth.uid() and v.ativo
  ), o as (
    select z.*, m.cupom from public.lagun_zig_orders z join meus m on upper(trim(z.coupon_code)) = m.cupom
     where public.soc_pedido_valido(z.status) and z.event_id is not null
  )
  select o.cupom, e.nome, e.id, e.data, count(*), sum(o.tickets_count), sum(o.total_amount), e.comissao_embaixadora_pct,
         case when e.comissao_embaixadora_pct is null then null else round(sum(o.total_amount) * e.comissao_embaixadora_pct / 100, 2) end,
         coalesce(json_agg(json_build_object(
           'nome', null,
           'ingresso', (select string_agg(distinct coalesce(nullif(trim(t.sector), ''), t.lot), ', ') from public.lagun_zig_tickets t where t.order_id = o.order_id)
                       || case when o.tickets_count > 1 then ' · ' || o.tickets_count || ' ingressos' else '' end,
           'data', o.purchase_date) order by o.purchase_date desc), '[]'::json)
    from o join public.lagun_events e on e.id = o.event_id
   group by o.cupom, e.id, e.nome, e.data, e.comissao_embaixadora_pct
   order by e.data desc nulls last
$$;
grant execute on function public.soc_meus_cupons() to authenticated;

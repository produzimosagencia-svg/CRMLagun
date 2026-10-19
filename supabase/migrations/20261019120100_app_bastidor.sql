-- App Bastidor (equipe, master e vendedores no iPhone). Complementa
-- 20261018120000_app_cliente.sql. O login é o mesmo do cliente (telefone):
-- quando o telefone bate com profiles.telefone, a função app-cliente entrega a
-- sessão do usuário da equipe, e o app pergunta por qual área a pessoa entra.

-- ── Colunas novas ───────────────────────────────────────────────────────────
alter table public.profiles add column if not exists area_preferida text
  check (area_preferida is null or area_preferida in ('cliente', 'bastidor'));

alter table public.team_tasks add column if not exists area text not null default 'geral'
  check (area in ('design', 'social', 'trafego', 'geral'));
alter table public.team_tasks add column if not exists requested_by uuid;
alter table public.team_tasks add column if not exists due_time time;
create index if not exists team_tasks_area_idx on public.team_tasks (area, status);
create index if not exists team_tasks_assigned_idx on public.team_tasks (assigned_to, status);

alter table public.lagun_vendedores add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.lagun_vendedores add column if not exists codigo_zig text;

-- ── Papel efetivo de um usuário ─────────────────────────────────────────────
-- master: quem tem 'master' ou 'admin'. Equipe: social / trafego / design.
-- vendedor: quem tem 'vendedor' ou está ligado a um cadastro em lagun_vendedores.
-- Quem só tem 'partner' (sócio) continua master por enquanto, até o Guilherme
-- redistribuir os papéis pela tela Equipe.
create or replace function public.app_papel(_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = _user_id and role::text in ('master', 'admin', 'partner')) then 'master'
    when exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'social') then 'social'
    when exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'trafego') then 'trafego'
    when exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'design') then 'design'
    when exists (select 1 from public.user_roles where user_id = _user_id and role::text = 'vendedor')
      or exists (select 1 from public.lagun_vendedores where user_id = _user_id and ativo) then 'vendedor'
    else null end
$$;
grant execute on function public.app_papel(uuid) to authenticated;

create or replace function public.app_e_master() returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_papel(auth.uid()) = 'master'
$$;
grant execute on function public.app_e_master() to authenticated;

-- O que o app precisa saber de quem entrou: papel, nome, área lembrada, vendedor.
create or replace function public.app_meus_acessos()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_papel text := public.app_papel(auth.uid());
  v_perfil record;
  v_vendedor uuid;
begin
  select full_name, area_preferida, telefone into v_perfil from public.profiles where id = auth.uid();
  select id into v_vendedor from public.lagun_vendedores where user_id = auth.uid() and ativo limit 1;
  return json_build_object(
    'papel', v_papel,
    'nome', v_perfil.full_name,
    'area_preferida', v_perfil.area_preferida,
    'vendedor_id', v_vendedor,
    'cliente', exists (select 1 from public.lagun_app_clientes where id = auth.uid())
  );
end $$;
grant execute on function public.app_meus_acessos() to authenticated;

create or replace function public.app_lembrar_area(_area text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set area_preferida = nullif(_area, '') where id = auth.uid();
$$;
grant execute on function public.app_lembrar_area(text) to authenticated;

-- ── Equipe (tela M4): lista e troca de papel, só pelo master ────────────────
create or replace function public.app_equipe()
returns table (id uuid, nome text, username text, telefone text, avatar_url text, papel text, papeis text[], vendedor_id uuid, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.username, p.telefone, p.avatar_url,
         public.app_papel(p.id),
         coalesce((select array_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = p.id), '{}'),
         (select v.id from public.lagun_vendedores v where v.user_id = p.id limit 1),
         p.created_at
    from public.profiles p
   where public.app_e_master()
   order by p.full_name nulls last
$$;
grant execute on function public.app_equipe() to authenticated;

-- Troca o papel de alguém. Master ↔ equipe (social/trafego/design) ↔ vendedor.
-- Mantém 'partner' (sócio é um fato, não um papel do app) e tira os outros.
create or replace function public.app_definir_papel(_user_id uuid, _papel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.app_e_master() then raise exception 'Só o master troca papéis.'; end if;
  if _papel not in ('master', 'social', 'trafego', 'design', 'vendedor') then raise exception 'Papel inválido.'; end if;
  if _user_id = auth.uid() and _papel <> 'master' then raise exception 'Você não pode tirar o próprio acesso de master.'; end if;
  delete from public.user_roles where user_id = _user_id and role::text in ('master', 'admin', 'social', 'trafego', 'design', 'vendedor');
  insert into public.user_roles (user_id, role) values (_user_id, _papel::public.app_role) on conflict do nothing;
end $$;
grant execute on function public.app_definir_papel(uuid, text) to authenticated;

-- ── Demandas (team_tasks): leitura e escrita por papel ──────────────────────
-- master: tudo. social/trafego/design: a própria área, o que é seu ou o que
-- você pediu. vendedor e cliente: nada.
drop policy if exists "Team can view tasks" on public.team_tasks;
drop policy if exists "Team can insert tasks" on public.team_tasks;
drop policy if exists "Team can update tasks" on public.team_tasks;
drop policy if exists "Team can delete tasks" on public.team_tasks;

create policy "Bastidor vê demandas" on public.team_tasks for select to authenticated
  using (
    public.app_papel(auth.uid()) = 'master'
    or (public.app_papel(auth.uid()) in ('social', 'trafego', 'design')
        and (area = public.app_papel(auth.uid()) or area = 'geral' or assigned_to = auth.uid() or created_by = auth.uid() or requested_by = auth.uid()))
  );
create policy "Equipe cria demandas" on public.team_tasks for insert to authenticated
  with check (public.app_papel(auth.uid()) in ('master', 'social', 'trafego', 'design'));
create policy "Equipe atualiza demandas" on public.team_tasks for update to authenticated
  using (
    public.app_papel(auth.uid()) = 'master'
    or (public.app_papel(auth.uid()) in ('social', 'trafego', 'design')
        and (area = public.app_papel(auth.uid()) or area = 'geral' or assigned_to = auth.uid() or created_by = auth.uid() or requested_by = auth.uid()))
  );
create policy "Master apaga demandas" on public.team_tasks for delete to authenticated
  using (public.app_papel(auth.uid()) = 'master' or created_by = auth.uid());

-- Nomes da equipe pra montar listas (responsável, quem pediu): quem é do
-- bastidor lê nome, usuário e avatar de todo mundo.
drop policy if exists "Bastidor vê nomes da equipe" on public.profiles;
create policy "Bastidor vê nomes da equipe" on public.profiles for select to authenticated
  using (public.app_papel(auth.uid()) in ('master', 'social', 'trafego', 'design', 'vendedor'));

-- ── Vendedores: o vendedor lê o que é dele; a equipe gerencia ───────────────
-- As políticas "Equipe gerencia …" (using true) continuam valendo pra quem é
-- do bastidor; aqui só garantimos que quem for SÓ vendedor não lê o cadastro
-- dos outros. Como as políticas atuais são permissivas pra todo autenticado,
-- trocamos por versões por papel.
do $$
declare t text;
begin
  foreach t in array array['lagun_vendedores', 'lagun_vendedor_vendas', 'lagun_vendedor_metas', 'lagun_vendedor_mensagens'] loop
    execute format('drop policy if exists "Equipe gerencia %s" on public.%I', t, t);
    execute format('drop policy if exists "Bastidor gerencia %s" on public.%I', t, t);
    execute format('create policy "Bastidor gerencia %s" on public.%I for all to authenticated using (public.app_papel(auth.uid()) in (''master'',''social'',''trafego'',''design'')) with check (public.app_papel(auth.uid()) in (''master'',''social'',''trafego'',''design''))', t, t);
  end loop;
end $$;
drop policy if exists "Vendedor lê o próprio cadastro" on public.lagun_vendedores;
create policy "Vendedor lê o próprio cadastro" on public.lagun_vendedores for select to authenticated using (user_id = auth.uid());
drop policy if exists "Vendedor lê as próprias vendas" on public.lagun_vendedor_vendas;
create policy "Vendedor lê as próprias vendas" on public.lagun_vendedor_vendas for select to authenticated
  using (exists (select 1 from public.lagun_vendedores v where v.id = vendedor_id and v.user_id = auth.uid()));
drop policy if exists "Vendedor lê as próprias metas" on public.lagun_vendedor_metas;
create policy "Vendedor lê as próprias metas" on public.lagun_vendedor_metas for select to authenticated
  using (exists (select 1 from public.lagun_vendedores v where v.id = vendedor_id and v.user_id = auth.uid()));
drop policy if exists "Vendedor lê as próprias mensagens" on public.lagun_vendedor_mensagens;
create policy "Vendedor lê as próprias mensagens" on public.lagun_vendedor_mensagens for select to authenticated
  using (exists (select 1 from public.lagun_vendedores v where v.id = vendedor_id and v.user_id = auth.uid()));

-- Ranking do mês com nomes (V2 e M3): agregado, então o vendedor vê os
-- colegas sem ler as linhas de venda deles.
create or replace function public.app_ranking_vendedores(_mes date default date_trunc('month', now() at time zone 'America/Sao_Paulo')::date)
returns table (vendedor_id uuid, nome text, ingressos bigint, receita numeric, meta_ingressos integer, meta_receita numeric, meta_mensagens integer, mensagens bigint, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  with mes as (select date_trunc('month', _mes)::date ini, (date_trunc('month', _mes) + interval '1 month')::date fim)
  select v.id, v.nome,
         coalesce((select sum(t.ingressos) from public.lagun_vendedor_vendas_todas t, mes where t.vendedor_id = v.id and t.dia >= mes.ini and t.dia < mes.fim), 0),
         coalesce((select sum(t.receita) from public.lagun_vendedor_vendas_todas t, mes where t.vendedor_id = v.id and t.dia >= mes.ini and t.dia < mes.fim), 0),
         coalesce(m.meta_ingressos, 0), coalesce(m.meta_receita, 0), coalesce(m.meta_mensagens, 0),
         coalesce((select sum(x.enviadas) from public.lagun_vendedor_mensagens x, mes where x.vendedor_id = v.id and x.dia >= mes.ini and x.dia < mes.fim), 0),
         v.user_id = auth.uid()
    from public.lagun_vendedores v
    left join public.lagun_vendedor_metas m on m.vendedor_id = v.id and m.mes = date_trunc('month', _mes)::date
   where v.ativo and public.app_papel(auth.uid()) is not null
   order by 3 desc, 4 desc, v.nome
$$;
grant execute on function public.app_ranking_vendedores(date) to authenticated;

-- ── Vendas por evento (M1): o que a Zig já sincronizou, mais os totais do
-- evento quando a Zig não está ligada. Só pra quem é do bastidor. ────────────
create or replace function public.app_vendas_por_evento(_de date, _ate date)
returns table (event_id uuid, nome text, data date, dia_semana text, tag text, flyer text, lotacao integer,
               ingressos bigint, receita numeric, pedidos bigint, zig_ligada boolean, zig_sync timestamptz, origem text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.data, e.dia_semana, e.tag, coalesce(e.flyer_mobile_url, e.flyer_desktop_url, e.imagem_url),
         e.participantes,
         coalesce((select sum(o.tickets_count) from public.lagun_zig_orders o where o.event_id = e.id and not (coalesce(o.status, '') ilike any (array['%cancel%', '%estorn%', '%refund%', '%reemb%']))),
                  e.official_tickets, e.total_vendas, 0)::bigint,
         coalesce((select sum(o.total_amount) from public.lagun_zig_orders o where o.event_id = e.id and not (coalesce(o.status, '') ilike any (array['%cancel%', '%estorn%', '%refund%', '%reemb%']))),
                  e.official_revenue, e.receita, 0)::numeric,
         coalesce((select count(*) from public.lagun_zig_orders o where o.event_id = e.id), 0)::bigint,
         z.event_id is not null, z.last_sync_at,
         case when z.event_id is not null then 'zig' when e.official_tickets is not null then 'oficial' when e.total_vendas is not null then 'superticket' else 'nenhuma' end
    from public.lagun_events e
    left join public.lagun_event_zig z on z.event_id = e.id
   where e.data between _de and _ate and public.app_papel(auth.uid()) in ('master', 'social', 'trafego', 'design', 'vendedor')
   order by e.data
$$;
grant execute on function public.app_vendas_por_evento(date, date) to authenticated;

-- ── Agenda (E5): eventos, prazos de demanda e compromissos num feed só ──────
create or replace function public.app_agenda(_de date, _ate date)
returns table (tipo text, id text, dia date, hora time, titulo text, sub text, cor text, event_id uuid, task_id uuid)
language sql stable security definer set search_path = public as $$
  select 'evento', e.id::text, e.data, null::time, e.nome, coalesce(e.artista, ''), 'ouro', e.id, null::uuid
    from public.lagun_events e where e.data between _de and _ate and public.app_papel(auth.uid()) is not null
  union all
  select 'demanda', t.id::text, t.due_date, t.due_time, t.title,
         coalesce((select p.full_name from public.profiles p where p.id = t.assigned_to), 'Sem responsável') || case when t.priority = 'urgente' then ' · urgente' else '' end,
         case t.area when 'design' then 'rosa' when 'social' then 'rosa' when 'trafego' then 'azul' else 'cinza' end, t.event_id, t.id
    from public.team_tasks t
   where t.due_date between _de and _ate and t.status <> 'finalizado'
     and (public.app_papel(auth.uid()) = 'master'
          or (public.app_papel(auth.uid()) in ('social', 'trafego', 'design')
              and (t.area = public.app_papel(auth.uid()) or t.area = 'geral' or t.assigned_to = auth.uid() or t.created_by = auth.uid() or t.requested_by = auth.uid())))
  union all
  select 'compromisso', c.id::text, c.date, c.start_time, c.title, coalesce(c.description, ''), coalesce(c.color, 'cinza'), null::uuid, null::uuid
    from public.calendar_events c where c.date between _de and _ate and public.app_papel(auth.uid()) in ('master', 'social', 'trafego', 'design')
  order by 3, 4 nulls first
$$;
grant execute on function public.app_agenda(date, date) to authenticated;

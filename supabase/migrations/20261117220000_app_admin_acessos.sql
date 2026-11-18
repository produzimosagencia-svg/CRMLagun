-- App "Lagun Administração" (iPhone, 2026-11-17): quem entra é só quem está no cadastro do app.
-- Decisão do Guilherme: o acesso NÃO vem dos papéis do painel (partner, master, admin, socio),
-- e sim desta tabela, mantida pela tela "Usuários" do app, que só o dono da conta usa
-- (profiles.is_app_owner, conferido no servidor, função app-cliente).
--   administrador → vê todas as noites e tudo da área
--   parceiro      → vê só as noites marcadas para ele (lagun_admin_acesso_noites), e tudo filtrado por elas
-- A conta de revisão da Apple (app_metadata.revisao) tem linha aqui como administrador, mas nunca
-- passa em app_e_socio: o app mostra para ela só dados fictícios.
-- Só acrescenta: tabelas novas, coluna nova, funções e políticas substituídas. Nenhum dado é apagado.
-- Depende de 20261117200000 e 20261117200500.

alter table public.profiles add column if not exists is_app_owner boolean not null default false;

create table if not exists public.lagun_admin_acessos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  cargo text not null check (cargo in ('administrador', 'parceiro')),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.lagun_admin_acesso_noites (
  user_id uuid not null references public.lagun_admin_acessos(user_id) on delete cascade,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  primary key (user_id, event_id)
);
alter table public.lagun_admin_acessos enable row level security;
alter table public.lagun_admin_acesso_noites enable row level security;
-- Cada um lê o próprio acesso; gravação só pela função app-cliente (service role), do dono.
drop policy if exists "Lê o próprio acesso ao app" on public.lagun_admin_acessos;
create policy "Lê o próprio acesso ao app" on public.lagun_admin_acessos for select to authenticated using (user_id = auth.uid());
drop policy if exists "Lê as próprias noites do app" on public.lagun_admin_acesso_noites;
create policy "Lê as próprias noites do app" on public.lagun_admin_acesso_noites for select to authenticated using (user_id = auth.uid());

-- Dono da conta (Guilherme) e o acesso dele como administrador.
update public.profiles set is_app_owner = true where id = 'a8ee8fcb-02e1-4335-8866-7d6f82cbc8b6';
insert into public.lagun_admin_acessos (user_id, nome, cargo, criado_por)
select id, coalesce(full_name, 'Guilherme'), 'administrador', id from public.profiles where id = 'a8ee8fcb-02e1-4335-8866-7d6f82cbc8b6'
on conflict (user_id) do nothing;

-- ── Quem entra e o que vê ───────────────────────────────────────────────────
create or replace function public.app_cargo(_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select cargo from public.lagun_admin_acessos where user_id = _user_id
$$;
grant execute on function public.app_cargo(uuid) to authenticated;

-- Sócio da área (lê dado real): está no cadastro do app e não é a conta de revisão.
create or replace function public.app_e_socio(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lagun_admin_acessos where user_id = _user_id) and not public.app_e_revisao(_user_id)
$$;
create or replace function public.app_e_administrador(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_e_socio(_user_id) and public.app_cargo(_user_id) = 'administrador'
$$;
grant execute on function public.app_e_administrador(uuid) to authenticated;

-- Pode ver esta noite? Administrador: todas. Parceiro: só as marcadas.
create or replace function public.soc_pode_noite(_event_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_e_socio(_user_id) and (
    public.app_cargo(_user_id) = 'administrador'
    or exists (select 1 from public.lagun_admin_acesso_noites where user_id = _user_id and event_id = _event_id))
$$;
grant execute on function public.soc_pode_noite(uuid, uuid) to authenticated;

-- Noites liberadas: null = todas (administrador); lista = parceiro; vazio = nenhuma.
create or replace function public.soc_minhas_noites()
returns uuid[] language sql stable security definer set search_path = public as $$
  select case when not public.app_e_socio() then '{}'::uuid[]
              when public.app_cargo() = 'administrador' then null
              else coalesce((select array_agg(event_id) from public.lagun_admin_acesso_noites where user_id = auth.uid()), '{}') end
$$;
grant execute on function public.soc_minhas_noites() to authenticated;

-- ── Demandas: administrador vê tudo; parceiro, as tarefas das noites dele ────
drop policy if exists "Sócio vê demandas" on public.team_tasks;
create policy "Sócio vê demandas" on public.team_tasks for select to authenticated
  using (public.app_e_administrador() or (event_id is not null and public.soc_pode_noite(event_id)));
drop policy if exists "Sócio cria demandas" on public.team_tasks;
create policy "Sócio cria demandas" on public.team_tasks for insert to authenticated
  with check (public.app_e_administrador() or (event_id is not null and public.soc_pode_noite(event_id)));
drop policy if exists "Sócio atualiza demandas" on public.team_tasks;
create policy "Sócio atualiza demandas" on public.team_tasks for update to authenticated
  using (public.app_e_administrador() or (event_id is not null and public.soc_pode_noite(event_id)));

drop policy if exists "Sócio lê campanhas da noite" on public.lagun_event_campaigns;
create policy "Sócio lê campanhas da noite" on public.lagun_event_campaigns for select to authenticated using (public.soc_pode_noite(event_id));

drop policy if exists "Sócio e equipe leem a equipe da noite" on public.lagun_event_members;
create policy "Sócio e equipe leem a equipe da noite" on public.lagun_event_members for select to authenticated
  using (public.soc_pode_noite(event_id) or public.app_papel(auth.uid()) is not null);

-- ── Funções da área com o filtro por noite ──────────────────────────────────
create or replace function public.soc_vendas_dia(_dia date)
returns table (event_id uuid, hora integer, ingressos bigint, receita numeric)
language sql stable security definer set search_path = public as $$
  select o.event_id, extract(hour from o.purchase_date at time zone 'America/Sao_Paulo')::integer,
         sum(o.tickets_count)::bigint, sum(o.total_amount)
    from public.lagun_zig_orders o
   where o.event_id is not null and public.soc_pode_noite(o.event_id) and public.soc_pedido_valido(o.status)
     and o.purchase_date >= (_dia::timestamp at time zone 'America/Sao_Paulo')
     and o.purchase_date < ((_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
   group by 1, 2
$$;

-- soc_vendas_evento: mesma conta da 20261117200000, com o filtro por noite no começo.
do $$
declare v text;
begin
  select pg_get_functiondef('public.soc_vendas_evento(uuid)'::regprocedure) into v;
  v := replace(v, 'if not public.app_e_socio() then return null; end if;', 'if not public.soc_pode_noite(_event_id) then return null; end if;');
  execute v;
end $$;

create or replace function public.soc_salvar_noite(
  _id uuid, _nome text, _data date, _dia_semana text, _meta integer, _hora_inicio time, _hora_fim time, _comissao numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.app_e_administrador() then raise exception 'Só administrador cria ou edita noite.'; end if;
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

do $$
declare v text;
begin
  select pg_get_functiondef('public.soc_ligar_campanhas(uuid, text, jsonb)'::regprocedure) into v;
  v := replace(v, 'if not public.app_e_socio() then raise exception ''Só sócio liga campanhas.''; end if;', 'if not public.app_e_administrador() then raise exception ''Só administrador liga campanhas.''; end if;');
  execute v;
end $$;

-- Agenda: administrador vê tudo; parceiro vê as noites dele e as tarefas delas (sem compromissos internos).
create or replace function public.app_agenda(_de date, _ate date)
returns table (tipo text, id text, dia date, hora time, titulo text, sub text, cor text, event_id uuid, task_id uuid)
language sql stable security definer set search_path = public as $$
  select 'evento', e.id::text, e.data, e.hora_inicio, e.nome, coalesce(e.artista, ''), 'ouro', e.id, null::uuid
    from public.lagun_events e where e.data between _de and _ate and (public.app_papel(auth.uid()) is not null or public.soc_pode_noite(e.id))
  union all
  select 'demanda', t.id::text, t.due_date, t.due_time, t.title,
         coalesce((select p.full_name from public.profiles p where p.id = t.assigned_to), 'Sem responsável') || case when t.priority = 'urgente' then ' · urgente' else '' end,
         case t.area when 'design' then 'rosa' when 'social' then 'rosa' when 'trafego' then 'azul' else 'cinza' end, t.event_id, t.id
    from public.team_tasks t
   where t.due_date between _de and _ate and t.status <> 'finalizado'
     and (public.app_papel(auth.uid()) = 'master' or public.app_e_administrador() or (t.event_id is not null and public.soc_pode_noite(t.event_id))
          or (public.app_papel(auth.uid()) in ('social', 'trafego', 'design')
              and (t.area = public.app_papel(auth.uid()) or t.area = 'geral' or t.assigned_to = auth.uid() or t.created_by = auth.uid() or t.requested_by = auth.uid())))
  union all
  select 'compromisso', c.id::text, c.date, c.start_time, c.title, coalesce(c.description, ''), coalesce(c.color, 'cinza'), null::uuid, null::uuid
    from public.calendar_events c where c.date between _de and _ate and (public.app_papel(auth.uid()) in ('master', 'social', 'trafego', 'design') or public.app_e_administrador())
  order by 3, 4 nulls first
$$;

-- Nomes de quem é da equipe (responsável das tarefas): o parceiro também precisa ler.
create or replace function public.app_nomes_equipe()
returns table (id uuid, nome text, avatar_url text, papel text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.full_name, p.username, 'Sem nome'), p.avatar_url, public.app_papel(p.id)
    from public.profiles p
   where (public.app_papel(auth.uid()) is not null or public.app_e_socio())
     and (public.app_papel(p.id) is not null or public.app_e_socio(p.id))
   order by coalesce(p.full_name, p.username)
$$;

-- ── O que o app precisa saber de quem entrou ────────────────────────────────
create or replace function public.app_meus_acessos()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_papel text := public.app_papel(auth.uid());
  v_perfil record;
  v_vendedor uuid;
  v_revisao boolean := public.app_e_revisao(auth.uid());
  v_acesso record;
begin
  select full_name, area_preferida, telefone, is_app_owner into v_perfil from public.profiles where id = auth.uid();
  select nome, cargo into v_acesso from public.lagun_admin_acessos where user_id = auth.uid();
  select id into v_vendedor from public.lagun_vendedores where user_id = auth.uid() and ativo limit 1;
  return json_build_object(
    'papel', case when v_revisao then null else v_papel end,
    'nome', coalesce(v_perfil.full_name, v_acesso.nome),
    'area_preferida', v_perfil.area_preferida,
    'vendedor_id', v_vendedor,
    'cliente', exists (select 1 from public.lagun_app_clientes where id = auth.uid()),
    -- App Lagun Administração: entra quem está em lagun_admin_acessos (a conta de revisão também, com dados fictícios)
    'socio', v_acesso.cargo is not null,
    'cargo', v_acesso.cargo,
    'dono', coalesce(v_perfil.is_app_owner, false) and not v_revisao,
    'revisao', v_revisao,
    'embaixadora', false
  );
end $$;
grant execute on function public.app_meus_acessos() to authenticated;

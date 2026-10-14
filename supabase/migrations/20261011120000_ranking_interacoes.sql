-- Ranking de interação do Instagram, dentro do próprio sistema.
-- Conta quem mais interage com a conta: comentários (ig_events), mensagens,
-- respostas e menções de story (whatsapp_messages do canal instagram).
-- A pontuação de cada tipo é configurável e vale para a tela de Ranking e
-- para o bloco de interações no perfil do chat.

-- ── Quem pode ver: qualquer pessoa da equipe (tem papel em user_roles) ──────
create or replace function public.ranking_interacoes_pode_ver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid());
$$;
revoke all on function public.ranking_interacoes_pode_ver() from public, anon;
grant execute on function public.ranking_interacoes_pode_ver() to authenticated;

-- ── Pontuação por tipo (linha única) ────────────────────────────────────────
create table if not exists public.ranking_interacoes_config (
  id boolean primary key default true check (id),
  pontos jsonb not null default '{"comentario":1,"comentario_live":1,"dm":1,"resposta_story":1,"mencao_story":1}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.ranking_interacoes_config (id) values (true) on conflict (id) do nothing;

alter table public.ranking_interacoes_config enable row level security;

drop policy if exists "Equipe vê a pontuação do ranking" on public.ranking_interacoes_config;
create policy "Equipe vê a pontuação do ranking" on public.ranking_interacoes_config
  for select to authenticated
  using (public.ranking_interacoes_pode_ver());

drop policy if exists "Admin edita a pontuação do ranking" on public.ranking_interacoes_config;
create policy "Admin edita a pontuação do ranking" on public.ranking_interacoes_config
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'partner'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'partner'::app_role));

revoke all on public.ranking_interacoes_config from anon;
grant select, update on public.ranking_interacoes_config to authenticated;

-- ── Base: uma linha por interação recebida ──────────────────────────────────
-- Uso interno das duas funções abaixo. Monta a consulta conforme o que existe
-- no banco, porque nem todo sistema tem ig_events ou as colunas de @ e foto.
create or replace function public.interacoes_instagram_base(p_desde timestamptz)
returns table (igsid text, username text, nome text, avatar text, tipo text, quando timestamptz, texto text, midia_id text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_username text := 'null::text';
  v_avatar text := 'null::text';
begin
  if to_regclass('public.ig_events') is not null then
    return query execute $q$
      select distinct on (coalesce(e.raw->'value'->>'id', e.id::text))
        coalesce(e.igsid, e.raw->'value'->'from'->>'id')::text,
        nullif(lower(e.raw->'value'->'from'->>'username'), ''),
        null::text,
        null::text,
        case when e.raw->'value'->'media'->>'media_product_type' = 'LIVE' then 'comentario_live' else 'comentario' end,
        e.created_at,
        left(e.raw->'value'->>'text', 280),
        e.raw->'value'->'media'->>'id'
      from public.ig_events e
      where e.event_type = 'comment'
        and e.created_at >= $1
        and coalesce(e.igsid, e.raw->'value'->'from'->>'id') is not null
      order by coalesce(e.raw->'value'->>'id', e.id::text), e.created_at
    $q$ using p_desde;
  end if;

  if exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'whatsapp_messages' and c.column_name = 'contact_username') then
    v_username := 'm.contact_username';
  end if;
  if exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'whatsapp_messages' and c.column_name = 'contact_avatar') then
    v_avatar := 'm.contact_avatar';
  elsif exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'whatsapp_messages' and c.column_name = 'profile_pic_url') then
    v_avatar := 'm.profile_pic_url';
  end if;

  return query execute format($q$
    select
      m.phone::text,
      nullif(lower(ltrim(btrim(%1$s), '@')), ''),
      nullif(btrim(m.contact_name), ''),
      nullif(%2$s, ''),
      case m.message_type
        when 'story_mention' then 'mencao_story'
        when 'story_reply' then 'resposta_story'
        when 'story_reaction' then 'resposta_story'
        else 'dm'
      end,
      m."timestamp",
      left(m.message_text, 280),
      null::text
    from public.whatsapp_messages m
    where m.channel = 'instagram'
      and m.direction = 'incoming'
      and coalesce(m.message_type, '') <> 'system'
      and m."timestamp" >= $1
  $q$, v_username, v_avatar) using p_desde;
end;
$$;

revoke all on function public.interacoes_instagram_base(timestamptz) from public, anon, authenticated;

-- ── Ranking: uma linha por pessoa, já com a pontuação aplicada ──────────────
create or replace function public.ranking_interacoes(p_dias integer default 90, p_limite integer default 200)
returns table (
  chave text, igsid text, username text, nome text, avatar text,
  comentarios integer, comentarios_live integer, dms integer, respostas_story integer, mencoes_story integer,
  total integer, pontos numeric, ultima timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_pontos jsonb;
  v_desde timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 90), 1), 365));
begin
  if not public.ranking_interacoes_pode_ver() then
    raise exception 'Sem permissão para ver o ranking.' using errcode = '42501';
  end if;

  select c.pontos into v_pontos from public.ranking_interacoes_config c limit 1;
  v_pontos := '{"comentario":1,"comentario_live":1,"dm":1,"resposta_story":1,"mencao_story":1}'::jsonb || coalesce(v_pontos, '{}'::jsonb);

  return query
  with b as (
    select * from public.interacoes_instagram_base(v_desde)
  ),
  -- o @ conhecido de cada ID, para juntar comentário e mensagem da mesma pessoa
  u as (
    select b.igsid as id, max(b.username) as uname from b where b.username is not null group by b.igsid
  ),
  r as (
    select b.igsid as id, coalesce(b.username, u.uname) as uname, b.nome, b.avatar, b.tipo, b.quando
    from b left join u on u.id = b.igsid
  ),
  g as (
    select
      coalesce(r.uname, r.id) as chave,
      -- o ID da conversa (mensagem) vem antes do ID do comentário: é ele que abre o chat
      (array_agg(r.id order by (r.tipo in ('dm', 'resposta_story', 'mencao_story')) desc, r.quando desc))[1] as igsid,
      max(r.uname) as username,
      (array_agg(r.nome order by r.quando desc) filter (where r.nome is not null))[1] as nome,
      (array_agg(r.avatar order by r.quando desc) filter (where r.avatar is not null))[1] as avatar,
      (count(*) filter (where r.tipo = 'comentario'))::integer as comentarios,
      (count(*) filter (where r.tipo = 'comentario_live'))::integer as comentarios_live,
      (count(*) filter (where r.tipo = 'dm'))::integer as dms,
      (count(*) filter (where r.tipo = 'resposta_story'))::integer as respostas_story,
      (count(*) filter (where r.tipo = 'mencao_story'))::integer as mencoes_story,
      count(*)::integer as total,
      max(r.quando) as ultima
    from r
    group by coalesce(r.uname, r.id)
  ),
  p as (
    select g.*,
      ( g.comentarios      * coalesce((v_pontos->>'comentario')::numeric, 1)
      + g.comentarios_live * coalesce((v_pontos->>'comentario_live')::numeric, 1)
      + g.dms              * coalesce((v_pontos->>'dm')::numeric, 1)
      + g.respostas_story  * coalesce((v_pontos->>'resposta_story')::numeric, 1)
      + g.mencoes_story    * coalesce((v_pontos->>'mencao_story')::numeric, 1)) as pontos
    from g
  )
  select p.chave, p.igsid, p.username, p.nome, p.avatar,
    p.comentarios, p.comentarios_live, p.dms, p.respostas_story, p.mencoes_story,
    p.total, p.pontos, p.ultima
  from p
  where p.pontos > 0
  order by p.pontos desc, p.ultima desc
  limit p_limite;
end;
$$;

revoke all on function public.ranking_interacoes(integer, integer) from public, anon;
grant execute on function public.ranking_interacoes(integer, integer) to authenticated;

-- ── Interações de uma pessoa: para o perfil no chat ─────────────────────────
create or replace function public.interacoes_do_contato(p_igsid text default null, p_username text default null, p_dias integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 90), 1), 365);
  v_user text := nullif(lower(ltrim(btrim(coalesce(p_username, '')), '@')), '');
  v_id text := nullif(btrim(coalesce(p_igsid, '')), '');
  v_linha jsonb;
  v_pessoas integer;
  v_ultimas jsonb;
begin
  -- a checagem de permissão acontece dentro de ranking_interacoes
  with rk as (
    select t.*, row_number() over (order by t.pontos desc, t.ultima desc) as posicao, count(*) over () as pessoas
    from public.ranking_interacoes(v_dias, null) t
  )
  select to_jsonb(rk), rk.pessoas::integer into v_linha, v_pessoas
  from rk
  where (v_user is not null and rk.username = v_user)
     or (v_id is not null and (rk.igsid = v_id or rk.chave = v_id))
  order by (v_user is not null and rk.username = v_user) desc
  limit 1;

  if v_linha is null then
    return jsonb_build_object('encontrado', false, 'dias', v_dias);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('tipo', x.tipo, 'quando', x.quando, 'texto', x.texto, 'midia_id', x.midia_id) order by x.quando desc), '[]'::jsonb)
  into v_ultimas
  from (
    select b.tipo, b.quando, b.texto, b.midia_id
    from public.interacoes_instagram_base(now() - make_interval(days => v_dias)) b
    where b.igsid in (v_id, v_linha->>'igsid')
       or b.username in (v_user, v_linha->>'username')
    order by b.quando desc
    limit 12
  ) x;

  return jsonb_build_object(
    'encontrado', true,
    'dias', v_dias,
    'posicao', (v_linha->>'posicao')::integer,
    'pessoas', v_pessoas,
    'pontos', (v_linha->>'pontos')::numeric,
    'total', (v_linha->>'total')::integer,
    'ultima', v_linha->>'ultima',
    'tipos', jsonb_build_object(
      'comentario', (v_linha->>'comentarios')::integer,
      'comentario_live', (v_linha->>'comentarios_live')::integer,
      'dm', (v_linha->>'dms')::integer,
      'resposta_story', (v_linha->>'respostas_story')::integer,
      'mencao_story', (v_linha->>'mencoes_story')::integer
    ),
    'ultimas', v_ultimas
  );
end;
$$;

revoke all on function public.interacoes_do_contato(text, text, integer) from public, anon;
grant execute on function public.interacoes_do_contato(text, text, integer) to authenticated;

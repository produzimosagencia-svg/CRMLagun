-- App da Lagun (iPhone) · Programa de Embaixadoras (2026-11-17)
-- Pacote de design: app-iphone/docs/app-fluxo-socios-embaixadoras/FLUXO-EMBAIXADORAS.md.
-- Módulo independente: tabelas, regras e storage próprios. Regras de acesso (RLS):
--   embaixadora (papel ambassador + linha ativa em ambassadors): lê e escreve só o que é dela;
--   operador do programa (profiles.is_amb_operator): lê e opera tudo deste módulo;
--   sócio: NADA. Nenhuma política daqui cita socio nesta fase.
-- Pontos só entram na aprovação (amb_aprovar). Cada aprovação vira um lote que vence em
-- 90 dias (Black não vence). Resgate consome primeiro o lote que vence antes.
-- Tudo aditivo. Depende de 20261117190000 (valor 'ambassador'), 20261117200000, 20261117200500 e 20261117220000.
-- (Versão 210000 ainda NÃO aplicada no remoto: aplicar depois da 220000.)

-- ── Operador do programa ────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_amb_operator boolean not null default false;

create or replace function public.is_amb_operator(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = _user_id and is_amb_operator)
$$;
grant execute on function public.is_amb_operator(uuid) to authenticated;

-- ── Tabelas ─────────────────────────────────────────────────────────────────
create table if not exists public.ambassadors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  instagram text,
  instagram_verified boolean not null default false,
  level text not null default 'normal' check (level in ('normal', 'premio', 'black')),
  joined_at date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  card_code text unique,
  qr_salt uuid not null default gen_random_uuid(),
  pix text,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.amb_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.lagun_events(id) on delete set null,   -- null = geral
  type text not null check (type in ('story', 'post', 'video', 'presence', 'referral')),
  title text not null,
  brief text,
  asset_url text,
  points integer not null check (points >= 0),
  multiplier numeric(4,2) not null default 1 check (multiplier > 0),
  limit_rule text check (limit_rule is null or limit_rule in ('1/24h', '1/event')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists amb_activities_evento_idx on public.amb_activities (event_id, active);

create table if not exists public.amb_submissions (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(user_id) on delete cascade,
  activity_id uuid not null references public.amb_activities(id),
  proofs text[] not null default '{}',
  link text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index if not exists amb_submissions_pessoa_idx on public.amb_submissions (ambassador_id, activity_id, created_at desc);
create index if not exists amb_submissions_fila_idx on public.amb_submissions (status, created_at);

create table if not exists public.amb_point_lots (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(user_id) on delete cascade,
  source_submission uuid unique references public.amb_submissions(id),
  points integer not null check (points > 0),
  remaining integer not null check (remaining >= 0),
  earned_at timestamptz not null default now(),
  expires_at timestamptz,               -- earned_at + 90 dias; null para Black
  expired_at timestamptz,               -- quando o job zerou o que sobrou
  expired_points integer not null default 0,
  check (remaining <= points)
);
create index if not exists amb_point_lots_saldo_idx on public.amb_point_lots (ambassador_id, expires_at);

create table if not exists public.amb_store_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  cost integer not null check (cost > 0),
  stock integer check (stock is null or stock >= 0),   -- null = sem lote
  min_level text not null default 'normal' check (min_level in ('normal', 'premio', 'black')),
  image_url text,
  category text check (category is null or category in ('casa', 'exp', 'status')),
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.amb_redemptions (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(user_id) on delete cascade,
  item_id uuid not null references public.amb_store_items(id),
  cost integer not null,
  lots_used jsonb not null default '[]',
  status text not null default 'reserved' check (status in ('reserved', 'used', 'cancelled')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.amb_feed_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  media_url text,
  tag text,
  cta_label text,
  cta_target text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.amb_checkins (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(user_id) on delete cascade,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  at timestamptz not null default now(),
  via text not null default 'fastpass',
  unique (ambassador_id, event_id)
);

-- ── Quem é embaixadora ativa ────────────────────────────────────────────────
create or replace function public.amb_e_embaixadora(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ambassadors where user_id = _user_id and status = 'active')
$$;
grant execute on function public.amb_e_embaixadora(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.ambassadors enable row level security;
alter table public.amb_activities enable row level security;
alter table public.amb_submissions enable row level security;
alter table public.amb_point_lots enable row level security;
alter table public.amb_store_items enable row level security;
alter table public.amb_redemptions enable row level security;
alter table public.amb_feed_posts enable row level security;
alter table public.amb_checkins enable row level security;

-- Embaixadora: a própria linha (lê; atualiza só Instagram e Pix, pelo gatilho abaixo).
drop policy if exists "Embaixadora lê o próprio cadastro" on public.ambassadors;
create policy "Embaixadora lê o próprio cadastro" on public.ambassadors for select to authenticated using (user_id = auth.uid());
drop policy if exists "Embaixadora atualiza o próprio cadastro" on public.ambassadors;
create policy "Embaixadora atualiza o próprio cadastro" on public.ambassadors for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Atividades, loja e feed: só a embaixadora ativa lê o que está ligado.
drop policy if exists "Embaixadora lê atividades" on public.amb_activities;
create policy "Embaixadora lê atividades" on public.amb_activities for select to authenticated using (active and public.amb_e_embaixadora());
drop policy if exists "Embaixadora lê a loja" on public.amb_store_items;
create policy "Embaixadora lê a loja" on public.amb_store_items for select to authenticated using (active and public.amb_e_embaixadora());
drop policy if exists "Embaixadora lê o feed" on public.amb_feed_posts;
create policy "Embaixadora lê o feed" on public.amb_feed_posts for select to authenticated using (public.amb_e_embaixadora());
-- O que é dela. Gravar comprovação e resgatar é só pelas funções (regras no servidor).
drop policy if exists "Embaixadora lê as próprias comprovações" on public.amb_submissions;
create policy "Embaixadora lê as próprias comprovações" on public.amb_submissions for select to authenticated using (ambassador_id = auth.uid());
drop policy if exists "Embaixadora lê os próprios lotes" on public.amb_point_lots;
create policy "Embaixadora lê os próprios lotes" on public.amb_point_lots for select to authenticated using (ambassador_id = auth.uid());
drop policy if exists "Embaixadora lê os próprios resgates" on public.amb_redemptions;
create policy "Embaixadora lê os próprios resgates" on public.amb_redemptions for select to authenticated using (ambassador_id = auth.uid());
drop policy if exists "Embaixadora lê as próprias presenças" on public.amb_checkins;
create policy "Embaixadora lê as próprias presenças" on public.amb_checkins for select to authenticated using (ambassador_id = auth.uid());

-- Operador: tudo deste módulo.
do $$
declare t text;
begin
  foreach t in array array['ambassadors', 'amb_activities', 'amb_submissions', 'amb_point_lots', 'amb_store_items', 'amb_redemptions', 'amb_feed_posts', 'amb_checkins'] loop
    execute format('drop policy if exists "Operador do programa gerencia %s" on public.%I', t, t);
    execute format('create policy "Operador do programa gerencia %s" on public.%I for all to authenticated using (public.is_amb_operator()) with check (public.is_amb_operator())', t, t);
  end loop;
end $$;

-- A embaixadora só muda Instagram e Pix da própria linha (nível, status e verificação são do operador).
create or replace function public.amb_protege_cadastro() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_amb_operator() or auth.uid() is null then new.updated_at := now(); return new; end if;
  if new.instagram is distinct from old.instagram then new.instagram_verified := false; else new.instagram_verified := old.instagram_verified; end if;
  new.level := old.level; new.status := old.status; new.card_code := old.card_code; new.qr_salt := old.qr_salt;
  new.joined_at := old.joined_at; new.nome := old.nome; new.user_id := old.user_id; new.updated_at := now();
  return new;
end $$;
drop trigger if exists amb_protege_cadastro on public.ambassadors;
create trigger amb_protege_cadastro before update on public.ambassadors for each row execute function public.amb_protege_cadastro();

-- ── Regras no servidor ──────────────────────────────────────────────────────
-- Saldo = soma do que sobra nos lotes que ainda não venceram.
create or replace function public.amb_saldo(_user_id uuid default auth.uid())
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::integer from public.amb_point_lots
   where ambassador_id = _user_id and (_user_id = auth.uid() or public.is_amb_operator())
     and remaining > 0 and (expires_at is null or expires_at > now())
$$;
grant execute on function public.amb_saldo(uuid) to authenticated;

-- Enviar comprovação (2 prints obrigatórios). Confere atividade, prazo e limites.
create or replace function public.amb_enviar_comprovacao(_activity_id uuid, _proofs text[], _link text default null, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_eu uuid := auth.uid();
  a public.amb_activities;
  v_id uuid;
begin
  if not public.amb_e_embaixadora(v_eu) then raise exception 'Acesso de embaixadora não está ativo.'; end if;
  select * into a from public.amb_activities where id = _activity_id;
  if a.id is null or not a.active then raise exception 'Atividade não está disponível.'; end if;
  if a.type = 'presence' then raise exception 'A presença é registrada no check-in do fast-pass.'; end if;
  if (a.starts_at is not null and now() < a.starts_at) or (a.ends_at is not null and now() > a.ends_at) then raise exception 'Fora do prazo desta atividade.'; end if;
  if coalesce(array_length(_proofs, 1), 0) < 2 then raise exception 'Envie os 2 prints obrigatórios.'; end if;
  if coalesce(array_length(_proofs, 1), 0) > 3 then raise exception 'No máximo 3 prints.'; end if;
  -- Cada print precisa estar na pasta da própria embaixadora no bucket.
  if exists (select 1 from unnest(_proofs) p where p not like v_eu::text || '/%') then raise exception 'Print fora da sua pasta.'; end if;
  if a.limit_rule = '1/24h' and exists (
    select 1 from public.amb_submissions where ambassador_id = v_eu and activity_id = a.id and status <> 'rejected' and created_at > now() - interval '24 hours'
  ) then raise exception 'Limite desta atividade: 1 a cada 24h.'; end if;
  if a.limit_rule = '1/event' and exists (
    select 1 from public.amb_submissions s join public.amb_activities x on x.id = s.activity_id
     where s.ambassador_id = v_eu and s.status <> 'rejected' and x.type = a.type and x.event_id is not distinct from a.event_id
  ) then raise exception 'Limite desta atividade: 1 por evento.'; end if;
  insert into public.amb_submissions (ambassador_id, activity_id, proofs, link, note)
  values (v_eu, a.id, _proofs, nullif(trim(coalesce(_link, '')), ''), nullif(trim(coalesce(_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.amb_enviar_comprovacao(uuid, text[], text, text) to authenticated;

-- Aprovar (operador): pontos × multiplicador viram um lote de 90 dias (Black: sem validade).
create or replace function public.amb_aprovar(_submission_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.amb_submissions; a public.amb_activities; v_nivel text; v_pts integer; v_lote uuid;
begin
  if not public.is_amb_operator() then raise exception 'Só o operador do programa aprova.'; end if;
  select * into s from public.amb_submissions where id = _submission_id for update;
  if s.id is null then raise exception 'Comprovação não encontrada.'; end if;
  if s.status <> 'pending' then raise exception 'Essa comprovação já foi analisada.'; end if;
  select * into a from public.amb_activities where id = s.activity_id;
  select level into v_nivel from public.ambassadors where user_id = s.ambassador_id;
  v_pts := round(a.points * a.multiplier)::integer;
  update public.amb_submissions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null where id = s.id;
  if v_pts > 0 then
    insert into public.amb_point_lots (ambassador_id, source_submission, points, remaining, expires_at)
    values (s.ambassador_id, s.id, v_pts, v_pts, case when v_nivel = 'black' then null else now() + interval '90 days' end)
    returning id into v_lote;
  end if;
  return v_lote;
end $$;
grant execute on function public.amb_aprovar(uuid) to authenticated;

-- Recusar (operador): só muda o status, com motivo. Não desconta nada.
create or replace function public.amb_recusar(_submission_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_amb_operator() then raise exception 'Só o operador do programa recusa.'; end if;
  if coalesce(trim(_motivo), '') = '' then raise exception 'Informe o motivo da recusa.'; end if;
  update public.amb_submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = trim(_motivo)
   where id = _submission_id and status = 'pending';
  if not found then raise exception 'Comprovação não encontrada ou já analisada.'; end if;
end $$;
grant execute on function public.amb_recusar(uuid, text) to authenticated;

-- Resgatar: nível mínimo, estoque e saldo; consome os lotes que vencem antes; baixa o estoque.
create or replace function public.amb_resgatar(_item_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_eu uuid := auth.uid();
  i public.amb_store_items; v_nivel text; v_saldo integer; v_falta integer; v_usa integer; l record;
  v_usados jsonb := '[]'::jsonb; v_id uuid;
  ordem constant text[] := array['normal', 'premio', 'black'];
begin
  if not public.amb_e_embaixadora(v_eu) then raise exception 'Acesso de embaixadora não está ativo.'; end if;
  select * into i from public.amb_store_items where id = _item_id for update;
  if i.id is null or not i.active then raise exception 'Item indisponível.'; end if;
  if i.stock is not null and i.stock <= 0 then raise exception 'Esgotado.'; end if;
  select level into v_nivel from public.ambassadors where user_id = v_eu;
  if array_position(ordem, v_nivel) < array_position(ordem, i.min_level) then raise exception 'Este item é a partir do nível %.', i.min_level; end if;
  -- trava os lotes da pessoa para dois resgates ao mesmo tempo não gastarem o mesmo ponto
  perform 1 from public.amb_point_lots where ambassador_id = v_eu for update;
  v_saldo := public.amb_saldo(v_eu);
  if v_saldo < i.cost then raise exception 'Saldo insuficiente: faltam % pts.', i.cost - v_saldo; end if;
  v_falta := i.cost;
  for l in select id, remaining from public.amb_point_lots
            where ambassador_id = v_eu and remaining > 0 and (expires_at is null or expires_at > now())
            order by expires_at asc nulls last, earned_at asc loop
    exit when v_falta <= 0;
    v_usa := least(l.remaining, v_falta);
    update public.amb_point_lots set remaining = remaining - v_usa where id = l.id;
    v_usados := v_usados || jsonb_build_object('lote', l.id, 'pontos', v_usa);
    v_falta := v_falta - v_usa;
  end loop;
  if i.stock is not null then update public.amb_store_items set stock = stock - 1 where id = i.id; end if;
  insert into public.amb_redemptions (ambassador_id, item_id, cost, lots_used) values (v_eu, i.id, i.cost, v_usados) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.amb_resgatar(uuid) to authenticated;

-- Presença (operador, na portaria): check-in do fast-pass cria amb_checkins e uma
-- comprovação 'presence' já aprovada (com lote), quando a noite tem atividade de presença.
create or replace function public.amb_checkin(_ambassador_id uuid, _event_id uuid, _via text default 'fastpass')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_check uuid; a public.amb_activities; v_sub uuid;
begin
  if not public.is_amb_operator() then raise exception 'Só a operação registra presença.'; end if;
  insert into public.amb_checkins (ambassador_id, event_id, via) values (_ambassador_id, _event_id, coalesce(_via, 'fastpass'))
  on conflict (ambassador_id, event_id) do nothing returning id into v_check;
  if v_check is null then return null; end if;   -- já tinha check-in nesta noite
  select * into a from public.amb_activities where event_id = _event_id and type = 'presence' and active order by created_at limit 1;
  if a.id is not null then
    insert into public.amb_submissions (ambassador_id, activity_id, proofs, note, status) values (_ambassador_id, a.id, '{}', 'check-in no fast-pass', 'pending') returning id into v_sub;
    perform public.amb_aprovar(v_sub);
  end if;
  return v_check;
end $$;
grant execute on function public.amb_checkin(uuid, uuid, text) to authenticated;

-- Código do fast-pass da noite (QR do cartão): muda a cada noite e só a dona lê o dela.
create or replace function public.amb_meu_fastpass(_event_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'LGN-FP:' || coalesce(a.card_code, left(a.user_id::text, 8)) || ':' || left(md5(a.user_id::text || ':' || _event_id::text || ':' || a.qr_salt::text), 12)
    from public.ambassadors a where a.user_id = auth.uid() and a.status = 'active'
$$;
grant execute on function public.amb_meu_fastpass(uuid) to authenticated;

-- Job diário 1: zera o que sobrou dos lotes vencidos e registra (vira "Pontos vencidos" no histórico).
create or replace function public.amb_vencer_lotes()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.amb_point_lots set expired_points = remaining, remaining = 0, expired_at = now()
   where remaining > 0 and expires_at is not null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Job diário 2: sobe de nível (nunca desce sozinho).
--   normal → premio: 3 meses de casa e 1.000 pts ganhos nos últimos 90 dias
--   premio → black: 6 meses de casa, ou 2.400 pts ganhos nos últimos 180 dias
-- Quem vira Black tem os lotes em aberto liberados da validade.
create or replace function public.amb_subir_niveis()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer;
begin
  update public.ambassadors a set level = 'premio', updated_at = now()
   where a.status = 'active' and a.level = 'normal' and a.joined_at <= current_date - interval '3 months'
     and (select coalesce(sum(points), 0) from public.amb_point_lots l where l.ambassador_id = a.user_id and l.earned_at > now() - interval '90 days') >= 1000;
  get diagnostics k = row_count; n := n + k;
  update public.ambassadors a set level = 'black', updated_at = now()
   where a.status = 'active' and a.level = 'premio'
     and (a.joined_at <= current_date - interval '6 months'
          or (select coalesce(sum(points), 0) from public.amb_point_lots l where l.ambassador_id = a.user_id and l.earned_at > now() - interval '180 days') >= 2400);
  get diagnostics k = row_count; n := n + k;
  update public.amb_point_lots l set expires_at = null
    from public.ambassadors a where a.user_id = l.ambassador_id and a.level = 'black' and l.remaining > 0 and l.expires_at is not null;
  return n;
end $$;

revoke all on function public.amb_vencer_lotes() from public, anon, authenticated;
revoke all on function public.amb_subir_niveis() from public, anon, authenticated;

-- Agenda dos jobs (pg_cron, 03h e 03h10 de Brasília = 06h/06h10 UTC). Só agenda se o pg_cron existir.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('amb-vencer-lotes', '0 6 * * *', 'select public.amb_vencer_lotes()');
    perform cron.schedule('amb-subir-niveis', '10 6 * * *', 'select public.amb_subir_niveis()');
  end if;
end $$;

-- ── Prints da comprovação: bucket privado com RLS por pasta (<user_id>/arquivo) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('amb-comprovacoes', 'amb-comprovacoes', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Embaixadora envia prints na própria pasta" on storage.objects;
create policy "Embaixadora envia prints na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'amb-comprovacoes' and (storage.foldername(name))[1] = auth.uid()::text and public.amb_e_embaixadora());
drop policy if exists "Embaixadora vê os próprios prints" on storage.objects;
create policy "Embaixadora vê os próprios prints" on storage.objects for select to authenticated
  using (bucket_id = 'amb-comprovacoes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Operador do programa vê os prints" on storage.objects;
create policy "Operador do programa vê os prints" on storage.objects for select to authenticated
  using (bucket_id = 'amb-comprovacoes' and public.is_amb_operator());

-- ── Escolha de área no app: Sócios e Embaixadora entram em app_meus_acessos ──
create or replace function public.app_lembrar_area(_area text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set area_preferida = nullif(_area, '') where id = auth.uid()
$$;
grant execute on function public.app_lembrar_area(text) to authenticated;

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
    -- Embaixadora: papel ambassador e cadastro ativo no programa
    'embaixadora', exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = 'ambassador') and public.amb_e_embaixadora(auth.uid())
  );
end $$;
grant execute on function public.app_meus_acessos() to authenticated;

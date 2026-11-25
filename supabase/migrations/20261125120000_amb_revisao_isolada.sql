-- Programa de Embaixadoras: conta de revisão da Apple isolada dos dados reais (2026-11-25).
-- Mesma ideia do Finobeat (contas_revisao): a conta de revisão (app_metadata.revisao = true)
-- só vê cadastros, atividades, loja e feed marcados como revisão, e a operação real nunca vê
-- os de revisão. Não apaga nada: só acrescenta colunas (padrão false) e troca políticas.

create or replace function public.amb_sou_revisao()
returns boolean language sql stable set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'revisao')::boolean, false)
$$;
grant execute on function public.amb_sou_revisao() to authenticated;

alter table public.ambassadors     add column if not exists revisao boolean not null default false;
alter table public.amb_activities  add column if not exists revisao boolean not null default false;
alter table public.amb_store_items add column if not exists revisao boolean not null default false;
alter table public.amb_feed_posts  add column if not exists revisao boolean not null default false;
-- O que a conta de revisão cria (atividade, item, post) já nasce marcado como revisão.
alter table public.ambassadors     alter column revisao set default public.amb_sou_revisao();
alter table public.amb_activities  alter column revisao set default public.amb_sou_revisao();
alter table public.amb_store_items alter column revisao set default public.amb_sou_revisao();
alter table public.amb_feed_posts  alter column revisao set default public.amb_sou_revisao();

-- Conteúdo da embaixadora: só o do mesmo "mundo" (real ou revisão).
drop policy if exists "Embaixadora lê atividades" on public.amb_activities;
create policy "Embaixadora lê atividades" on public.amb_activities for select to authenticated
  using (active and public.amb_e_embaixadora() and revisao = public.amb_sou_revisao());
drop policy if exists "Embaixadora lê a loja" on public.amb_store_items;
create policy "Embaixadora lê a loja" on public.amb_store_items for select to authenticated
  using (active and public.amb_e_embaixadora() and revisao = public.amb_sou_revisao());
drop policy if exists "Embaixadora lê o feed" on public.amb_feed_posts;
create policy "Embaixadora lê o feed" on public.amb_feed_posts for select to authenticated
  using (public.amb_e_embaixadora() and revisao = public.amb_sou_revisao());

-- Operador: tudo do módulo, mas só do mesmo mundo.
do $$
declare t text;
begin
  foreach t in array array['ambassadors', 'amb_activities', 'amb_store_items', 'amb_feed_posts'] loop
    execute format('drop policy if exists "Operador do programa gerencia %s" on public.%I', t, t);
    execute format('create policy "Operador do programa gerencia %s" on public.%I for all to authenticated using (public.is_amb_operator() and revisao = public.amb_sou_revisao()) with check (public.is_amb_operator() and revisao = public.amb_sou_revisao())', t, t);
  end loop;
  foreach t in array array['amb_submissions', 'amb_point_lots', 'amb_redemptions', 'amb_checkins'] loop
    execute format('drop policy if exists "Operador do programa gerencia %s" on public.%I', t, t);
    execute format('create policy "Operador do programa gerencia %s" on public.%I for all to authenticated using (public.is_amb_operator() and exists (select 1 from public.ambassadors a where a.user_id = ambassador_id and a.revisao = public.amb_sou_revisao())) with check (public.is_amb_operator() and exists (select 1 from public.ambassadors a where a.user_id = ambassador_id and a.revisao = public.amb_sou_revisao()))', t, t);
  end loop;
end $$;

drop policy if exists "Operador do programa vê os prints" on storage.objects;
create policy "Operador do programa vê os prints" on storage.objects for select to authenticated
  using (bucket_id = 'amb-comprovacoes' and public.is_amb_operator() and exists (
    select 1 from public.ambassadors a where a.user_id::text = (storage.foldername(name))[1] and a.revisao = public.amb_sou_revisao()));

-- Multiplicador da noite mexe em várias atividades de uma vez: só nas do mesmo mundo.
create or replace function public.amb_multiplicador_noite(_event_id uuid, _mult numeric)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_amb_operator() then raise exception 'Só o operador do programa muda o multiplicador.'; end if;
  if _mult not in (0.5, 1, 2) then raise exception 'Multiplicador inválido.'; end if;
  update public.amb_activities set multiplier = _mult where event_id = _event_id and revisao = public.amb_sou_revisao();
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.amb_multiplicador_noite(uuid, numeric) to authenticated;

-- A embaixadora não pode se marcar como revisão (nem desmarcar).
create or replace function public.amb_protege_revisao() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.revisao is distinct from old.revisao and auth.uid() is not null then
    raise exception 'Campo reservado.';
  end if;
  return new;
end $$;
drop trigger if exists amb_protege_revisao on public.ambassadors;
create trigger amb_protege_revisao before update on public.ambassadors for each row execute function public.amb_protege_revisao();

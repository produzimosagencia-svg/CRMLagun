-- App do cliente: pagamento por Pix (reserva de lounge e ingresso), lounges
-- Palco e Premium, preço do ingresso no evento.

-- ── Lounges: Palco (1 ou 2 pessoas) e Premium (3 a 6) ─────────────────────
alter table public.lagun_lounges add column if not exists minimo int not null default 1;
update public.lagun_lounges set ativo = false;
insert into public.lagun_lounges (nome, capacidade, minimo, inclui, preco, cor, ordem) values
  ('Lounge Palco',   2, 1, '{"Ao lado do palco","Mesa reservada"}',      800, '#2B0E00', 1),
  ('Lounge Premium', 6, 3, '{"Vista da pista","Mordomo","Mesa reservada"}', 1500, '#3E3113', 2)
on conflict do nothing;

-- ── Preço do ingresso (a partir de) no evento ──────────────────────────────
alter table public.lagun_events add column if not exists ingresso_a_partir numeric(12,2);

-- ── Reserva: nasce aguardando o Pix; vira confirmada quando paga ──────────
alter table public.lagun_lounge_reservas drop constraint if exists lagun_lounge_reservas_status_check;
alter table public.lagun_lounge_reservas add constraint lagun_lounge_reservas_status_check
  check (status in ('aguardando', 'confirmada', 'cancelada', 'expirada'));
alter table public.lagun_lounge_reservas alter column status set default 'aguardando';
drop index if exists public.lagun_lounge_reservas_unico;
create unique index lagun_lounge_reservas_unico
  on public.lagun_lounge_reservas (lounge_id, event_id) where status in ('aguardando', 'confirmada');

drop policy if exists "Cliente reserva para si" on public.lagun_lounge_reservas;
create policy "Cliente reserva para si" on public.lagun_lounge_reservas
  for insert to authenticated with check (cliente_id = auth.uid() and status = 'aguardando');

create or replace view public.lagun_lounges_ocupados with (security_invoker = false) as
  select lounge_id, event_id from public.lagun_lounge_reservas where status in ('aguardando', 'confirmada');

-- Mínimo de pessoas do lounge também vale.
create or replace function public.lagun_lounge_reserva_calcula()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_preco numeric(12,2);
  v_capacidade int;
  v_minimo int;
  v_pontos int;
begin
  select preco, capacidade, minimo into v_preco, v_capacidade, v_minimo from public.lagun_lounges where id = new.lounge_id and ativo;
  if v_preco is null then raise exception 'Lounge indisponível.'; end if;
  if new.pessoas > v_capacidade then raise exception 'Esse lounge recebe até % pessoas.', v_capacidade; end if;
  if new.pessoas < v_minimo then raise exception 'Esse lounge é a partir de % pessoas.', v_minimo; end if;
  new.preco := v_preco;
  new.sinal := round(v_preco * 0.5, 2);
  select coalesce(sum(pontos), 0) into v_pontos from public.lagun_clube_pontos where cliente_id = new.cliente_id;
  new.desconto := case when v_pontos >= 1000 then round(new.sinal * 0.10, 2) else 0 end;
  new.pago := new.sinal - new.desconto;
  return new;
end $$;

-- Pontos só quando a reserva é confirmada (Pix pago).
drop trigger if exists lagun_lounge_reserva_pontua on public.lagun_lounge_reservas;
create or replace function public.lagun_lounge_reserva_pontua()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmada' and (tg_op = 'INSERT' or old.status is distinct from 'confirmada') then
    insert into public.lagun_clube_pontos (cliente_id, pontos, motivo, referencia)
      values (new.cliente_id, greatest(round(new.pago)::int, 0), 'Reserva de lounge', new.codigo);
  end if;
  return new;
end $$;
create trigger lagun_lounge_reserva_pontua after insert or update of status on public.lagun_lounge_reservas
  for each row execute function public.lagun_lounge_reserva_pontua();

-- ── Pedidos (Pix) ──────────────────────────────────────────────────────────
create table if not exists public.lagun_app_pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.lagun_app_clientes(id) on delete cascade,
  tipo text not null check (tipo in ('reserva', 'ingresso')),
  reserva_id uuid references public.lagun_lounge_reservas(id) on delete cascade,
  event_id uuid references public.lagun_events(id) on delete cascade,
  quantidade int not null default 1 check (quantidade > 0),
  valor numeric(12,2) not null check (valor > 0),
  descricao text,
  status text not null default 'aguardando' check (status in ('aguardando', 'pago', 'expirado', 'cancelado')),
  pix_copia_cola text,
  txid text unique,
  expira_em timestamptz not null default (now() + interval '5 minutes'),
  pago_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lagun_app_pedidos_cliente_idx on public.lagun_app_pedidos (cliente_id, created_at desc);
alter table public.lagun_app_pedidos enable row level security;
drop policy if exists "Cliente vê os próprios pedidos" on public.lagun_app_pedidos;
create policy "Cliente vê os próprios pedidos" on public.lagun_app_pedidos
  for select to authenticated using (cliente_id = auth.uid());
revoke all on public.lagun_app_pedidos from anon;
grant select on public.lagun_app_pedidos to authenticated;

-- Pedido pago: confirma a reserva ou emite os ingressos.
create or replace function public.lagun_app_pedido_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  i int;
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    new.pago_em := coalesce(new.pago_em, now());
    if new.tipo = 'reserva' and new.reserva_id is not null then
      update public.lagun_lounge_reservas set status = 'confirmada' where id = new.reserva_id and status = 'aguardando';
    elsif new.tipo = 'ingresso' and new.event_id is not null then
      for i in 1..new.quantidade loop
        insert into public.lagun_app_ingressos (cliente_id, event_id, tipo, quantidade, codigo)
          values (new.cliente_id, new.event_id, 'Pista', 1, 'IN-' || upper(substr(md5(random()::text || i::text), 1, 6)));
      end loop;
      insert into public.lagun_clube_pontos (cliente_id, pontos, motivo, referencia)
        values (new.cliente_id, greatest(round(new.valor)::int, 0), 'Compra de ingresso', new.txid);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lagun_app_pedido_pago on public.lagun_app_pedidos;
create trigger lagun_app_pedido_pago before update of status on public.lagun_app_pedidos
  for each row execute function public.lagun_app_pedido_pago();

-- Pedidos vencidos: expira e solta o lounge (chamado pela função de borda).
create or replace function public.app_expirar_pedidos()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with venc as (
    update public.lagun_app_pedidos set status = 'expirado'
     where status = 'aguardando' and expira_em < now() returning reserva_id
  )
  update public.lagun_lounge_reservas r set status = 'expirada'
    from venc where r.id = venc.reserva_id and r.status = 'aguardando';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.app_expirar_pedidos() from public, anon, authenticated;

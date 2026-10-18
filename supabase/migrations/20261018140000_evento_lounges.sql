-- Lounges configurados por evento, no cadastro do evento (painel Landing).
-- lagun_lounges continua sendo o catálogo (Palco, Premium…); aqui fica o que
-- vale em cada noite: quais lounges abrem e por quanto. Evento sem linha aqui
-- usa o catálogo inteiro com o preço padrão (compatibilidade).
create table if not exists public.lagun_evento_lounges (
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  lounge_id uuid not null references public.lagun_lounges(id) on delete cascade,
  preco numeric(12,2) not null check (preco >= 0),
  created_at timestamptz not null default now(),
  primary key (event_id, lounge_id)
);
alter table public.lagun_evento_lounges enable row level security;
drop policy if exists "Todo mundo vê os lounges do evento" on public.lagun_evento_lounges;
create policy "Todo mundo vê os lounges do evento" on public.lagun_evento_lounges for select to anon, authenticated using (true);
drop policy if exists "Equipe gerencia lounges do evento" on public.lagun_evento_lounges;
create policy "Equipe gerencia lounges do evento" on public.lagun_evento_lounges for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));
grant select on public.lagun_evento_lounges to anon, authenticated;
grant insert, update, delete on public.lagun_evento_lounges to authenticated;

-- Preço da reserva: o do evento, se configurado; senão o do catálogo.
create or replace function public.lagun_lounge_reserva_calcula()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_preco numeric(12,2);
  v_capacidade int;
  v_minimo int;
  v_pontos int;
begin
  select coalesce(el.preco, l.preco), l.capacidade, l.minimo into v_preco, v_capacidade, v_minimo
    from public.lagun_lounges l
    left join public.lagun_evento_lounges el on el.lounge_id = l.id and el.event_id = new.event_id
   where l.id = new.lounge_id and l.ativo;
  if v_preco is null then raise exception 'Lounge indisponível.'; end if;
  if exists (select 1 from public.lagun_evento_lounges where event_id = new.event_id)
     and not exists (select 1 from public.lagun_evento_lounges where event_id = new.event_id and lounge_id = new.lounge_id) then
    raise exception 'Esse lounge não abre nessa noite.';
  end if;
  if new.pessoas > v_capacidade then raise exception 'Esse lounge recebe até % pessoas.', v_capacidade; end if;
  if new.pessoas < v_minimo then raise exception 'Esse lounge é a partir de % pessoas.', v_minimo; end if;
  new.preco := v_preco;
  new.sinal := round(v_preco * 0.5, 2);
  select coalesce(sum(pontos), 0) into v_pontos from public.lagun_clube_pontos where cliente_id = new.cliente_id;
  new.desconto := case when v_pontos >= 1000 then round(new.sinal * 0.10, 2) else 0 end;
  new.pago := new.sinal - new.desconto;
  return new;
end $$;

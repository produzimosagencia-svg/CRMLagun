-- Bot de Lounges no WhatsApp (número "Boate Lagun").
-- Roteiro: cofre/clientes/lagun/bot-lounges (v2, 05/11/2026) e decisoes.md.
--
-- 1. Catálogo passa a ser os 6 lounges físicos do mapa: L1 e L2 (Palco, até 2
--    pessoas) e L3 a L6 (Premium, até 6). Os antigos "Lounge Palco" e "Lounge
--    Premium" ficam inativos; os preços já cadastrados por noite são copiados
--    para os novos (Palco → L1/L2, Premium → L3..L6).
-- 2. Reserva pelo WhatsApp mora na mesma tabela do app (lagun_lounge_reservas),
--    então a trava única (lounge, evento) vale para os dois canais: quem
--    confirmar primeiro leva. Pelo WhatsApp o Pix é do valor cheio.
-- 3. Conversas do bot, configuração (desligado por padrão) e cron de 1 minuto
--    para lembrete (20 min), expiração (30 min) e fim de evento.

-- ── 1. Catálogo L1..L6 ─────────────────────────────────────────────────────
alter table public.lagun_lounges add column if not exists codigo text;
alter table public.lagun_lounges add column if not exists categoria text;
create unique index if not exists lagun_lounges_codigo_unico on public.lagun_lounges (codigo) where codigo is not null;

insert into public.lagun_lounges (codigo, categoria, nome, capacidade, minimo, inclui, preco, cor, ordem, ativo) values
  ('L1', 'Palco',   'L1 · Palco',   2, 1, '{"Ao lado do palco","Mesa reservada"}',          800, '#2B0E00', 1, true),
  ('L2', 'Palco',   'L2 · Palco',   2, 1, '{"Ao lado do palco","Mesa reservada"}',          800, '#2B0E00', 2, true),
  ('L3', 'Premium', 'L3 · Premium', 6, 3, '{"Área VIP","Mordomo","Mesa reservada"}',       1500, '#3E3113', 3, true),
  ('L4', 'Premium', 'L4 · Premium', 6, 3, '{"Área VIP","Mordomo","Mesa reservada"}',       1500, '#3E3113', 4, true),
  ('L5', 'Premium', 'L5 · Premium', 6, 3, '{"Vista da pista","Mordomo","Mesa reservada"}', 1500, '#3E3113', 5, true),
  ('L6', 'Premium', 'L6 · Premium', 6, 3, '{"Vista da pista","Mordomo","Mesa reservada"}', 1500, '#3E3113', 6, true)
on conflict do nothing;

-- Preço por noite: copia do lounge antigo da mesma categoria.
insert into public.lagun_evento_lounges (event_id, lounge_id, preco)
select el.event_id, novo.id, el.preco
  from public.lagun_evento_lounges el
  join public.lagun_lounges antigo on antigo.id = el.lounge_id and antigo.codigo is null
  join public.lagun_lounges novo on novo.codigo is not null
   and novo.categoria = case when antigo.nome ilike '%palco%' then 'Palco' when antigo.nome ilike '%premium%' then 'Premium' end
on conflict (event_id, lounge_id) do nothing;

delete from public.lagun_evento_lounges el
 using public.lagun_lounges l where l.id = el.lounge_id and l.codigo is null;
update public.lagun_lounges set ativo = false where codigo is null and ativo;

-- ── 2. Reserva pelo WhatsApp ───────────────────────────────────────────────
alter table public.lagun_lounge_reservas alter column cliente_id drop not null;
alter table public.lagun_lounge_reservas add column if not exists origem text not null default 'app';
alter table public.lagun_lounge_reservas add column if not exists telefone text;      -- WhatsApp de quem reservou
alter table public.lagun_lounge_reservas add column if not exists cpf text;           -- só dígitos
alter table public.lagun_lounge_reservas add column if not exists txid text;          -- cobrança no Inter
alter table public.lagun_lounge_reservas add column if not exists pix_copia_cola text;
alter table public.lagun_lounge_reservas add column if not exists expira_em timestamptz;
alter table public.lagun_lounge_reservas add column if not exists lembrete_em timestamptz;
alter table public.lagun_lounge_reservas add column if not exists pago_em timestamptz;
alter table public.lagun_lounge_reservas add column if not exists end_to_end_id text;
alter table public.lagun_lounge_reservas add column if not exists equipe_avisada_em timestamptz;
alter table public.lagun_lounge_reservas add column if not exists teste_pago boolean not null default false; -- Pix de teste: comprovante simula o pagamento

alter table public.lagun_lounge_reservas drop constraint if exists lagun_lounge_reservas_origem_check;
alter table public.lagun_lounge_reservas add constraint lagun_lounge_reservas_origem_check
  check ((origem = 'app' and cliente_id is not null) or (origem = 'whatsapp' and telefone is not null));
create unique index if not exists lagun_lounge_reservas_txid on public.lagun_lounge_reservas (txid) where txid is not null;
create index if not exists lagun_lounge_reservas_aguardando_idx on public.lagun_lounge_reservas (expira_em) where status = 'aguardando';

-- O app só insere com origem 'app' (a policy de insert já exige cliente_id = auth.uid()).
drop policy if exists "Cliente reserva para si" on public.lagun_lounge_reservas;
create policy "Cliente reserva para si" on public.lagun_lounge_reservas
  for insert to authenticated with check (cliente_id = auth.uid() and status = 'aguardando' and origem = 'app');

-- Preço: o da noite, senão o do catálogo. App paga sinal de 50% (com desconto
-- do clube); WhatsApp paga o valor cheio.
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
  if new.origem = 'whatsapp' then
    new.sinal := v_preco;
    new.desconto := 0;
    new.pago := v_preco;
    return new;
  end if;
  new.sinal := round(v_preco * 0.5, 2);
  select coalesce(sum(pontos), 0) into v_pontos from public.lagun_clube_pontos where cliente_id = new.cliente_id;
  new.desconto := case when v_pontos >= 1000 then round(new.sinal * 0.10, 2) else 0 end;
  new.pago := new.sinal - new.desconto;
  return new;
end $$;

-- Pontos do clube só para quem tem conta no app.
create or replace function public.lagun_lounge_reserva_pontua()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and new.status = 'confirmada'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmada') then
    insert into public.lagun_clube_pontos (cliente_id, pontos, motivo, referencia)
      values (new.cliente_id, greatest(round(new.pago)::int, 0), 'Reserva de lounge', new.codigo);
  end if;
  return new;
end $$;

-- ── 3. Bot: configuração e conversas ───────────────────────────────────────
create table if not exists public.lagun_bot_lounges_config (
  id boolean primary key default true check (id),
  ativo boolean not null default false,               -- liga/desliga o bot para todo mundo
  testadores text[] not null default '{}',            -- com o bot desligado, responde só a esses telefones (só dígitos, com 55)
  numero text not null default '15554296867',         -- número "Boate Lagun" como a Meta exibe (só dígitos)
  phone_number_id text,                               -- id desse número na Meta (o bot aprende na 1ª mensagem)
  pix_simulado boolean not null default true,         -- testadores recebem Pix de teste (não cobra); comprovante simula o pagamento
  aviso_telefone text,                                -- organizador (pago e estorno)
  aviso_nome text,
  aviso_user_id uuid,                                 -- perfil do organizador: recebe a tarefa (e o template tarefa_nova)
  contato_lista_telefone text not null default '5527998511988',
  site_ingressos text not null default 'lagunvitoria.com.br',
  mapa_url text not null default 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/bot-lounges?mapa=1',
  hora_limite time not null default '18:00',          -- venda até essa hora do dia do evento
  pix_minutos int not null default 30,
  lembrete_minutos int not null default 20,
  updated_at timestamptz not null default now()
);
insert into public.lagun_bot_lounges_config (id, aviso_telefone, aviso_nome)
select true, p.telefone, p.nome
  from (select null) x
  left join lateral (
    select telefone, nome from public.lagun_partners
     where tipo = 'fixo' and nome ilike 'guilherme%' and telefone is not null limit 1
  ) p on true
on conflict (id) do nothing;
-- Perfil do organizador pelo telefone (com ou sem o nono dígito).
update public.lagun_bot_lounges_config c
   set aviso_user_id = (
     select p.id from public.profiles p
      where right(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), 8) = right(regexp_replace(c.aviso_telefone, '\D', '', 'g'), 8)
      limit 1)
 where c.aviso_user_id is null and c.aviso_telefone is not null;
-- Primeiro testador: o organizador.
update public.lagun_bot_lounges_config
   set testadores = array[regexp_replace(aviso_telefone, '\D', '', 'g')]
 where cardinality(testadores) = 0 and aviso_telefone is not null;
alter table public.lagun_bot_lounges_config enable row level security;
drop policy if exists "Equipe vê config do bot de lounges" on public.lagun_bot_lounges_config;
create policy "Equipe vê config do bot de lounges" on public.lagun_bot_lounges_config for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));
revoke all on public.lagun_bot_lounges_config from anon;
grant select on public.lagun_bot_lounges_config to authenticated;

-- Uma linha por telefone: em que ponto do roteiro a conversa está.
create table if not exists public.lagun_bot_lounges_conversas (
  telefone text primary key,
  contact_name text,
  etapa text not null default 'inicio',
  -- inicio | evento | lounge | dados | resumo | pix | pago | expirado
  event_id uuid references public.lagun_events(id) on delete set null,
  lounge_id uuid references public.lagun_lounges(id) on delete set null,
  titular_nome text,
  titular_cpf text,
  reserva_id uuid references public.lagun_lounge_reservas(id) on delete set null,
  pausado boolean not null default false,             -- estorno: bot não responde até a equipe reativar
  pausado_motivo text,
  pausado_em timestamptz,
  atendimento_equipe boolean not null default false,  -- M16/M18: marcada para a equipe no chat
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists lagun_bot_lounges_conversas_evento_idx on public.lagun_bot_lounges_conversas (event_id);
alter table public.lagun_bot_lounges_conversas enable row level security;
drop policy if exists "Equipe vê conversas do bot de lounges" on public.lagun_bot_lounges_conversas;
create policy "Equipe vê conversas do bot de lounges" on public.lagun_bot_lounges_conversas for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "Equipe reativa conversas do bot de lounges" on public.lagun_bot_lounges_conversas;
create policy "Equipe reativa conversas do bot de lounges" on public.lagun_bot_lounges_conversas for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));
revoke all on public.lagun_bot_lounges_conversas from anon;
grant select, update (pausado, pausado_motivo, pausado_em, atendimento_equipe) on public.lagun_bot_lounges_conversas to authenticated;

-- ── Cron: a cada minuto, só se houver Pix aberto ou conversa em andamento ──
select cron.unschedule('bot-lounges-tick') where exists (select 1 from cron.job where jobname = 'bot-lounges-tick');
select cron.schedule('bot-lounges-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/bot-lounges',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 5000)
  where exists (select 1 from public.lagun_bot_lounges_config where ativo or cardinality(testadores) > 0)
    and (exists (select 1 from public.lagun_lounge_reservas where origem = 'whatsapp' and status = 'aguardando')
         or exists (select 1 from public.lagun_bot_lounges_conversas where event_id is not null));
$$);

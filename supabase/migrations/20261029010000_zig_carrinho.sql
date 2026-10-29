-- Carrinho abandonado da Zig, por evento. A lagun-zig-sync (cron de 10 min)
-- manda o template escolhido para quem deixou o pedido pendente (30 min sem
-- pagar) ou descartado, só para pedidos feitos depois que o envio foi ligado.
-- O telefone vem da Zig na hora do envio e não é gravado aqui: o registro de
-- envio guarda só o hash, para não mandar duas vezes e medir a recuperação.

create table if not exists public.lagun_zig_carrinho (
  event_id uuid primary key references public.lagun_events(id) on delete cascade,
  enabled boolean not null default false,
  template_name text,
  template_language text not null default 'pt_BR',
  -- {{1}} do corpo recebe o primeiro nome do comprador.
  template_variable_count int not null default 0,
  -- Cabeçalho com imagem: a Meta exige a imagem no envio.
  header_image_url text,
  phone_number_id text,
  ligado_em timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.lagun_zig_carrinho enable row level security;
drop policy if exists "Equipe lê lagun_zig_carrinho" on public.lagun_zig_carrinho;
create policy "Equipe lê lagun_zig_carrinho" on public.lagun_zig_carrinho
  for select to authenticated using (true);
drop policy if exists "Equipe grava lagun_zig_carrinho" on public.lagun_zig_carrinho;
create policy "Equipe grava lagun_zig_carrinho" on public.lagun_zig_carrinho
  for insert to authenticated with check (true);
drop policy if exists "Equipe altera lagun_zig_carrinho" on public.lagun_zig_carrinho;
create policy "Equipe altera lagun_zig_carrinho" on public.lagun_zig_carrinho
  for update to authenticated using (true) with check (true);

create table if not exists public.lagun_zig_carrinho_envios (
  order_id text primary key,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  status_pedido text,
  telefone_hash text not null,
  template_name text,
  ok boolean not null default false,
  wamid text,
  erro text,
  enviado_em timestamptz not null default now(),
  -- Preenchido quando o mesmo telefone aparece depois com pedido finalizado.
  recuperado_em timestamptz,
  valor_recuperado numeric
);
create index if not exists lagun_zig_carrinho_envios_evento on public.lagun_zig_carrinho_envios (event_id, telefone_hash);

alter table public.lagun_zig_carrinho_envios enable row level security;
drop policy if exists "Equipe lê lagun_zig_carrinho_envios" on public.lagun_zig_carrinho_envios;
create policy "Equipe lê lagun_zig_carrinho_envios" on public.lagun_zig_carrinho_envios
  for select to authenticated using (true);

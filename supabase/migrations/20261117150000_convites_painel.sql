-- Convite de cadastro no painel interno (pedido do Guilherme em 2026-11-17).
-- O link leva um token aleatório; aqui fica só o hash SHA-256 dele.
-- Cada convite serve uma vez e expira. Só a função convite-painel (service role) lê e grava.
create table if not exists public.convites_painel (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  papel text not null default 'admin' check (papel in ('admin','partner','design','trafego')),
  observacao text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_em timestamptz,
  usado_por uuid
);
alter table public.convites_painel enable row level security;
revoke all on public.convites_painel from anon, authenticated;

-- Sessão da conversa do bot dos sócios (edge function bot-socios).
--
-- O fluxo tem menu (lista de eventos → opções do evento) e modo livre
-- ("Outro assunto" / "Perguntar"), em que o texto vai para a IA. Esta tabela
-- guarda em que modo cada telefone está e sobre qual evento. Só a service
-- role lê e grava (RLS ligado, nenhuma policy).

create table if not exists public.bot_sessoes (
  telefone text primary key,
  modo text not null default 'menu' check (modo in ('menu', 'livre')),
  event_id uuid references public.lagun_events(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.bot_sessoes enable row level security;
revoke all on public.bot_sessoes from anon, authenticated;

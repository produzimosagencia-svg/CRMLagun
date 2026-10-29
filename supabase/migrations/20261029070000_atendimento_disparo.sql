-- Link público de atendimento de um disparo: /atendimento/<token> lista quem
-- recebeu o disparo (templates cujo texto contém um dos filtros, enviados
-- depois de "desde") e respondeu, e deixa a equipe responder com texto livre
-- enquanto a janela de 24h estiver aberta. Sem login: o token secreto dá
-- acesso só a essas conversas, até expira_em. Só a edge function
-- atendimento-disparo (service role) lê a tabela.

create table if not exists public.lagun_atendimento_links (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  titulo text not null,
  filtros text[] not null,
  desde timestamptz not null,
  expira_em timestamptz not null,
  resposta_sugerida text,
  created_at timestamptz not null default now()
);
alter table public.lagun_atendimento_links enable row level security;
revoke all on public.lagun_atendimento_links from anon, authenticated;

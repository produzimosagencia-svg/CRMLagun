-- Live Activity "Casa" do app Lagun Administração (2026-11-20), no modelo da Tríade (bar-ao-vivo-push).
-- Só acrescenta: 3 tabelas novas (acesso só pelo servidor, service role), uma chave do robô no Vault,
-- uma função para o servidor ler essa chave e um cron de 30 em 30 s. Nada é apagado nem alterado.
--
--   lagun_app_aparelhos      iPhone cadastrado (chave do aparelho guardada só como hash)
--   lagun_app_live_tokens    tokens da Apple: "inicio" (push-to-start) e "atividade" (atualização)
--   lagun_app_live_eventos   um ao vivo por evento da Zig: quando começou, último estado enviado, quando encerrou

create table if not exists public.lagun_app_aparelhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chave_hash text not null unique,
  criado_em timestamptz not null default now(),
  visto_em timestamptz
);
create index if not exists lagun_app_aparelhos_user_idx on public.lagun_app_aparelhos (user_id);

create table if not exists public.lagun_app_live_tokens (
  token text primary key,
  aparelho_id uuid not null references public.lagun_app_aparelhos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('inicio', 'atividade')),
  ambiente text not null default 'producao' check (ambiente in ('producao', 'sandbox')),
  zig_evento text,
  atividade_id text,
  atualizado_em timestamptz not null default now(),
  invalido_em timestamptz          -- token que a Apple recusou ou atividade encerrada (não se apaga)
);
create index if not exists lagun_app_live_tokens_tipo_idx on public.lagun_app_live_tokens (tipo, zig_evento);

create table if not exists public.lagun_app_live_eventos (
  zig_evento text primary key,
  noite text,
  iniciado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  ultimo_envio timestamptz,
  ultimo_estado jsonb
);

-- Sem política: anon e authenticated não leem nem gravam; só a função (service role).
alter table public.lagun_app_aparelhos enable row level security;
alter table public.lagun_app_live_tokens enable row level security;
alter table public.lagun_app_live_eventos enable row level security;
revoke all on public.lagun_app_aparelhos, public.lagun_app_live_tokens, public.lagun_app_live_eventos from anon, authenticated;

-- Chave do robô (gerada aqui dentro, ninguém vê): o cron manda no cabeçalho e a função confere.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'lagun_bar_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'lagun_bar_cron', 'Chave do cron da lagun-bar-push');
  end if;
end $$;

create or replace function public.lagun_bar_cron_chave()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'lagun_bar_cron' limit 1
$$;
revoke all on function public.lagun_bar_cron_chave() from public, anon, authenticated;
grant execute on function public.lagun_bar_cron_chave() to service_role;

-- Robô: a cada 30 s. A função só lê a Zig quando há iPhone cadastrado ou ao vivo aberto.
select cron.unschedule('lagun-bar-push-tick') where exists (select 1 from cron.job where jobname = 'lagun-bar-push-tick');
select cron.schedule('lagun-bar-push-tick', '30 seconds', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/lagun-bar-push?action=tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-chave', public.lagun_bar_cron_chave()),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000)
  where exists (select 1 from public.lagun_app_live_tokens where invalido_em is null)
     or exists (select 1 from public.lagun_app_live_eventos where encerrado_em is null);
$$);

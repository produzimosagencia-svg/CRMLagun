-- 2026-11-16: fecha tabelas que estavam abertas para a chave anon (revisão de segurança).
-- Quem usa cada tabela:
--   webhook_logs, bt_auto_dispatch: Edge Functions (service role) gravam; painel /interno (logado) lê e configura.
--   influencers, influencer_detections, influencer_ig_accounts: painel /interno (logado) gerencia;
--     Edge Functions (service role) sincronizam; portal público /influenciadores (anon) lê por token.
--   influencer_monitored_accounts: só painel logado e Edge Function.
--   base_crm_event_categories: só painel logado (Base).
-- Nada de dado é apagado.

begin;

-- 1. webhook_logs e bt_auto_dispatch: a policy "Service role full access" valia para public (inclusive anon).
drop policy if exists "Service role full access" on public.webhook_logs;
create policy "Service role full access" on public.webhook_logs
  for all to service_role using (true) with check (true);
drop policy if exists "Painel logado le webhook_logs" on public.webhook_logs;
create policy "Painel logado le webhook_logs" on public.webhook_logs
  for select to authenticated using (true);

drop policy if exists "Service role full access" on public.bt_auto_dispatch;
create policy "Service role full access" on public.bt_auto_dispatch
  for all to service_role using (true) with check (true);
drop policy if exists "Painel logado gerencia bt_auto_dispatch" on public.bt_auto_dispatch;
create policy "Painel logado gerencia bt_auto_dispatch" on public.bt_auto_dispatch
  for all to authenticated using (true) with check (true);

-- 2. Tabelas sem RLS: liga RLS e dá acesso total ao painel logado.
alter table public.influencers enable row level security;
alter table public.influencer_detections enable row level security;
alter table public.influencer_monitored_accounts enable row level security;
alter table public.base_crm_event_categories enable row level security;
alter table public.influencer_ig_accounts enable row level security;

drop policy if exists "Painel logado gerencia influencers" on public.influencers;
create policy "Painel logado gerencia influencers" on public.influencers
  for all to authenticated using (true) with check (true);
drop policy if exists "Painel logado gerencia influencer_detections" on public.influencer_detections;
create policy "Painel logado gerencia influencer_detections" on public.influencer_detections
  for all to authenticated using (true) with check (true);
drop policy if exists "Painel logado gerencia influencer_monitored_accounts" on public.influencer_monitored_accounts;
create policy "Painel logado gerencia influencer_monitored_accounts" on public.influencer_monitored_accounts
  for all to authenticated using (true) with check (true);
drop policy if exists "Painel logado gerencia base_crm_event_categories" on public.base_crm_event_categories;
create policy "Painel logado gerencia base_crm_event_categories" on public.base_crm_event_categories
  for all to authenticated using (true) with check (true);
drop policy if exists "Painel logado gerencia influencer_ig_accounts" on public.influencer_ig_accounts;
create policy "Painel logado gerencia influencer_ig_accounts" on public.influencer_ig_accounts
  for all to authenticated using (true) with check (true);

-- 3. Portal público do influenciador (anon): só leitura, e só das colunas que a página usa.
--    Policies anon de leitura já existem em influencers (public_read_by_token) e
--    influencer_detections (public_read_detections) e influencer_ig_accounts (public_read_ig_accounts).

-- Colunas: anon deixa de ver e-mail, telefone, notas e o token de acesso do Instagram.
revoke all on public.influencers from anon;
grant select (id, full_name, invite_token, status, score, level, score_updated_at) on public.influencers to anon;

revoke all on public.influencer_ig_accounts from anon;
grant select (influencer_id, username, followers_count, profile_picture_url) on public.influencer_ig_accounts to anon;

revoke insert, update, delete, truncate on public.influencer_detections from anon;
revoke all on public.influencer_monitored_accounts from anon;
revoke all on public.base_crm_event_categories from anon;

commit;

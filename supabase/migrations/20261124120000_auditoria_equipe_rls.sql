-- Auditoria de segurança (2026-11-24): "logado" deixou de ser sinônimo de "equipe".
--
-- Problema: todo usuário do Supabase Auth é authenticated, inclusive o cliente do
-- app de iPhone (qualquer pessoa entra com o próprio telefone). As policies
-- "authenticated = true" e "existe em profiles" (todo usuário ganha profile pelo
-- gatilho handle_new_user) davam ao cliente do app leitura e escrita no CRM inteiro
-- (base_crm, crm_customers, whatsapp_messages...), nos preços dos lounges e nas
-- reservas de todo mundo (com CPF e telefone).
--
-- Correção: equipe = tem cargo em user_roles (fora 'cliente' e 'ambassador') ou
-- papel do Bastidor (app_papel, que inclui vendedor ativo). É o mesmo critério do
-- painel (/interno exige user_roles). Nada é apagado: só as condições mudam.

create or replace function public.eh_equipe(_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select _user_id is not null and (
    exists (select 1 from public.user_roles r where r.user_id = _user_id and r.role::text not in ('cliente', 'ambassador'))
    or public.app_papel(_user_id) is not null
  )
$$;
revoke execute on function public.eh_equipe(uuid) from public, anon;
grant execute on function public.eh_equipe(uuid) to authenticated, service_role;

begin;

-- 1. Policies "logado pode tudo" passam a exigir equipe.
alter policy "authenticated delete" on public.base_crm using (public.eh_equipe());
alter policy "authenticated insert" on public.base_crm with check (public.eh_equipe());
alter policy "authenticated read" on public.base_crm using (public.eh_equipe());
alter policy "authenticated update" on public.base_crm using (public.eh_equipe());
alter policy "Painel logado gerencia base_crm_event_categories" on public.base_crm_event_categories using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Painel logado gerencia bt_auto_dispatch" on public.bt_auto_dispatch using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Autenticados podem tudo" on public.calendar_events using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Authenticated staff can insert conversation receipts" on public.chat_conversation_reads with check (public.eh_equipe());
alter policy "Authenticated staff can read conversation receipts" on public.chat_conversation_reads using (public.eh_equipe());
alter policy "Authenticated staff can update conversation receipts" on public.chat_conversation_reads using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "auth_customers_all" on public.crm_customers using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "auth_purchases_all" on public.crm_purchases using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Allow all for authenticated" on public.event_lounges to authenticated using (public.eh_equipe());
alter policy "auth manage ig_automations" on public.ig_automations using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "auth read ig_contacts" on public.ig_contacts using (public.eh_equipe());
alter policy "authenticated read ig_conversations" on public.ig_conversations using (public.eh_equipe());
alter policy "auth read ig_events" on public.ig_events using (public.eh_equipe());
alter policy "auth read ig_link_clicks" on public.ig_link_clicks using (public.eh_equipe());
alter policy "auth read ig_links" on public.ig_links using (public.eh_equipe());
alter policy "authenticated all ig_messages" on public.ig_messages using (public.eh_equipe());
alter policy "auth read ig_queue" on public.ig_queue using (public.eh_equipe());
alter policy "Painel logado gerencia influencer_detections" on public.influencer_detections using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Painel logado gerencia influencer_ig_accounts" on public.influencer_ig_accounts using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Painel logado gerencia influencer_monitored_accounts" on public.influencer_monitored_accounts using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Painel logado gerencia influencers" on public.influencers using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe vê config do bot de lounges" on public.lagun_bot_lounges_config using (public.eh_equipe());
alter policy "Equipe reativa conversas do bot de lounges" on public.lagun_bot_lounges_conversas using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe vê conversas do bot de lounges" on public.lagun_bot_lounges_conversas using (public.eh_equipe());
alter policy "Equipe gerencia lagun_event_campaigns" on public.lagun_event_campaigns using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe gerencia lagun_event_disparos" on public.lagun_event_disparos using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe gerencia lagun_event_partners" on public.lagun_event_partners using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe gerencia lagun_event_posts" on public.lagun_event_posts using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe lê lagun_event_zig" on public.lagun_event_zig using (public.eh_equipe());
alter policy "Equipe gerencia lounges do evento" on public.lagun_evento_lounges using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Authenticated delete lagun_events" on public.lagun_events using (public.eh_equipe());
alter policy "Authenticated insert lagun_events" on public.lagun_events with check (public.eh_equipe());
alter policy "Authenticated read lagun_events" on public.lagun_events using (public.eh_equipe());
alter policy "Authenticated update lagun_events" on public.lagun_events using (public.eh_equipe());
alter policy "authenticated_manage_landing_events" on public.lagun_events using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe gerencia lounges" on public.lagun_lounges using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe gerencia lagun_partners" on public.lagun_partners using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe edita lagun_resumo_config" on public.lagun_resumo_config using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe lê lagun_resumo_config" on public.lagun_resumo_config using (public.eh_equipe());
alter policy "Equipe lê lagun_resumo_envios" on public.lagun_resumo_envios using (public.eh_equipe());
alter policy "Equipe altera lagun_zig_carrinho" on public.lagun_zig_carrinho using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe grava lagun_zig_carrinho" on public.lagun_zig_carrinho with check (public.eh_equipe());
alter policy "Equipe lê lagun_zig_carrinho" on public.lagun_zig_carrinho using (public.eh_equipe());
alter policy "Equipe lê lagun_zig_carrinho_envios" on public.lagun_zig_carrinho_envios using (public.eh_equipe());
alter policy "Equipe lê lagun_zig_orders" on public.lagun_zig_orders using (public.eh_equipe());
alter policy "Equipe lê lagun_zig_tickets" on public.lagun_zig_tickets using (public.eh_equipe());
alter policy "Authenticated manage landing photo links" on public.landing_photo_links using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Autenticados leem cliques" on public.link_clicks using (public.eh_equipe());
alter policy "allow auth select link_clicks" on public.link_clicks using (public.eh_equipe());
alter policy "authenticated_manage_navista_events" on public.navista_events using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Authenticated users can view sidebar settings" on public.sidebar_menu_settings using (public.eh_equipe());
alter policy "Equipe lê team_task_notificacoes" on public.team_task_notificacoes using (public.eh_equipe());
alter policy "Painel logado le webhook_logs" on public.webhook_logs using (public.eh_equipe());
alter policy "authenticated all" on public.whatsapp_bot_settings using (public.eh_equipe()) with check (public.eh_equipe());
alter policy "Equipe lê itens do disparo" on public.whatsapp_disparo_itens using (public.eh_equipe());
alter policy "Equipe lê disparos" on public.whatsapp_disparo_jobs using (public.eh_equipe());
alter policy "authenticated all" on public.whatsapp_messages using (public.eh_equipe()) with check (public.eh_equipe());

-- O app de iPhone (cliente logado) continua vendo as fotos visíveis da landing.
drop policy if exists "Logado vê fotos visíveis da landing" on public.landing_photo_links;
create policy "Logado vê fotos visíveis da landing" on public.landing_photo_links
  for select to authenticated using (is_visible = true);

-- 2. Reservas de lounge: cliente vê só as dele; equipe vê todas.
alter policy "Cliente vê as próprias reservas" on public.lagun_lounge_reservas
  using ((cliente_id = auth.uid()) or public.eh_equipe());

-- Cliente só cancela reserva que ainda aguarda pagamento, e só mexe no status.
-- Antes: podia trocar status para 'confirmada' (lounge de graça + pontos do clube),
-- preço, valor pago e txid da própria reserva.
alter policy "Cliente cancela a própria reserva" on public.lagun_lounge_reservas
  using ((cliente_id = auth.uid()) and (status = 'aguardando'))
  with check ((cliente_id = auth.uid()) and (status = 'cancelada'));
revoke update on public.lagun_lounge_reservas from anon, authenticated;
grant update (status) on public.lagun_lounge_reservas to authenticated;

-- 3. Cadastro do cliente do app: só nome e preferências (o app só mexe nisso).
-- Antes dava para trocar telefone e slug (link de divulgador de outra pessoa).
revoke update on public.lagun_app_clientes from anon, authenticated;
grant update (nome, avisos_semana, flyer_whatsapp, updated_at) on public.lagun_app_clientes to authenticated;

-- 4. Funções SECURITY DEFINER que abriam dado para a chave anon.
-- crm_top_fans / crm_top_superclientes devolviam nome e telefone de cliente para
-- qualquer um com a chave pública. Agora: só equipe.
create or replace function public.crm_dashboard_stats()
 returns table(total_customers bigint, new_customers_30d bigint, superclientes bigint, fans bigint)
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.eh_equipe() then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return query
  select
    (select count(distinct customer_id) from crm_purchases)::bigint,
    (select count(*) from crm_customers where created_at >= now() - interval '30 days')::bigint,
    (select count(*) from crm_customers where ltv > 1000)::bigint,
    (select count(*) from (select customer_id from crm_purchases group by customer_id having count(distinct event_name) >= 4) sub)::bigint;
end;
$function$;

create or replace function public.crm_top_fans(lim integer default 40)
 returns table(customer_id uuid, full_name text, phone text, event_count bigint, total_spent numeric, event_names text[])
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.eh_equipe() then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return query
  select c.id, c.full_name, c.phone, count(distinct p.event_name)::bigint, coalesce(sum(p.total_value), 0)::numeric,
         array_agg(distinct p.event_name order by p.event_name)
  from crm_customers c join crm_purchases p on p.customer_id = c.id
  group by c.id, c.full_name, c.phone
  having count(distinct p.event_name) >= 4
  order by 4 desc, 5 desc
  limit lim;
end;
$function$;

create or replace function public.crm_top_superclientes(lim integer default 40)
 returns table(customer_id uuid, full_name text, phone text, event_count bigint, total_spent numeric, event_names text[])
 language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.eh_equipe() then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return query
  select c.id, c.full_name, c.phone, count(distinct p.event_name)::bigint, coalesce(sum(p.total_value), 0)::numeric,
         array_agg(distinct p.event_name order by p.event_name)
  from crm_customers c join crm_purchases p on p.customer_id = c.id
  group by c.id, c.full_name, c.phone
  having coalesce(sum(p.total_value), 0) > 1000
  order by 5 desc
  limit lim;
end;
$function$;

revoke execute on function public.crm_dashboard_stats() from public, anon;
revoke execute on function public.crm_top_fans(integer) from public, anon;
revoke execute on function public.crm_top_superclientes(integer) from public, anon;
grant execute on function public.crm_dashboard_stats() to authenticated, service_role;
grant execute on function public.crm_top_fans(integer) to authenticated, service_role;
grant execute on function public.crm_top_superclientes(integer) to authenticated, service_role;

-- Fila do Instagram: só o worker (service role) pega lote. Antes anon "reservava" a fila.
revoke execute on function public.ig_claim_queue(integer) from public, anon, authenticated;
grant execute on function public.ig_claim_queue(integer) to service_role;

-- Painel: resumo social, comentários, status do Instagram e directs são do painel.
revoke execute on function public.painel_social_resumo(integer) from public, anon;
revoke execute on function public.painel_ultimos_comentarios(integer) from public, anon;
revoke execute on function public.ig_connection_status() from public, anon;
grant execute on function public.painel_social_resumo(integer) to authenticated, service_role;
grant execute on function public.painel_ultimos_comentarios(integer) to authenticated, service_role;
grant execute on function public.ig_connection_status() to authenticated, service_role;

-- 5. Storage: flyers da landing só a equipe envia ou troca (antes: qualquer logado).
alter policy "authenticated can upload landing-flyers" on storage.objects
  with check ((bucket_id = 'landing-flyers') and public.eh_equipe());
alter policy "authenticated can update landing-flyers" on storage.objects
  using ((bucket_id = 'landing-flyers') and public.eh_equipe());
commit;

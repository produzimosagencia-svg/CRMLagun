-- ============================================================================
-- Instagram do Lagun: perfil dos remetentes no Chat + motor de automações
-- (respostas automáticas a comentários/DMs, estilo ManyChat) portado do BoomRAP.
-- ----------------------------------------------------------------------------
-- 1) whatsapp_messages ganha @username e foto do contato (o Chat já esperava).
-- 2) ig_config guarda o token IGAA (Instagram Login) do @lagunvix; o cron
--    renova toda semana para ele nunca mais expirar como em 24/07.
-- 3) Tabelas ig_* do motor: automações, contatos, fila de envio, eventos,
--    links rastreáveis. Prefixo ig_ para não colidir com nada existente.
-- ============================================================================

-- 1) Chat: @ e foto de quem manda DM ----------------------------------------
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS contact_username text,
  ADD COLUMN IF NOT EXISTS contact_avatar   text;

CREATE INDEX IF NOT EXISTS whatsapp_messages_channel_phone_idx
  ON public.whatsapp_messages (channel, phone);

-- 2) Conta do Instagram conectada (linha única) ------------------------------
CREATE TABLE IF NOT EXISTS public.ig_config (
  id               boolean PRIMARY KEY DEFAULT true,
  ig_user_id       text,
  username         text,
  profile_pic_url  text,
  access_token     text,
  token_expires_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ig_config_singleton CHECK (id = true)
);

-- 3) Motor de automações ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ig_automations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  active            boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  template_key      text,
  -- Definição do editor visual (gatilho + etapas). Compilada nas colunas abaixo.
  definition        jsonb NOT NULL DEFAULT '{}'::jsonb,

  trigger_comment   boolean NOT NULL DEFAULT true,
  trigger_story     boolean NOT NULL DEFAULT false,
  trigger_dm        boolean NOT NULL DEFAULT false,
  keywords          text[]  NOT NULL DEFAULT '{}',
  match_type        text    NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','exact','any')),
  media_id          text,
  public_replies    text[]  NOT NULL DEFAULT '{}',
  welcome_message   text,
  quick_reply_text  text,
  link_message      text,
  link_button_label text,
  link_url          text,
  reminder_message  text,
  reminder_delay_minutes integer NOT NULL DEFAULT 60,
  require_follow    boolean NOT NULL DEFAULT false,
  follow_prompt_message text,
  follow_prompt_button_label text,
  track_links       boolean NOT NULL DEFAULT true,

  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_automations_active ON public.ig_automations (active) WHERE active;

CREATE TABLE IF NOT EXISTS public.ig_contacts (
  igsid           text PRIMARY KEY,
  username        text,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_reply_at   timestamptz,
  last_automation uuid REFERENCES public.ig_automations(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ig_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id  uuid REFERENCES public.ig_automations(id) ON DELETE SET NULL,
  igsid          text,
  comment_id     text,
  send_type      text NOT NULL CHECK (send_type IN ('private_reply','dm','public_reply')),
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  scheduled_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz,
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  requires_24h_window boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ig_queue_drain ON public.ig_queue (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ig_queue_automation ON public.ig_queue (automation_id, status);

CREATE TABLE IF NOT EXISTS public.ig_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text,
  igsid         text,
  automation_id uuid REFERENCES public.ig_automations(id) ON DELETE SET NULL,
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_events_created ON public.ig_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_events_automation ON public.ig_events (automation_id);

CREATE TABLE IF NOT EXISTS public.ig_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,
  automation_id  uuid REFERENCES public.ig_automations(id) ON DELETE CASCADE,
  igsid          text,
  target_url     text NOT NULL,
  clicks         integer NOT NULL DEFAULT 0,
  first_click_at timestamptz,
  last_click_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_links_automation ON public.ig_links (automation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ig_link_clicks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id       uuid NOT NULL REFERENCES public.ig_links(id) ON DELETE CASCADE,
  automation_id uuid,
  igsid         text,
  user_agent    text,
  referer       text,
  clicked_at    timestamptz NOT NULL DEFAULT now()
);

-- Trava atômica da fila (FOR UPDATE SKIP LOCKED): nunca envia em dobro.
CREATE OR REPLACE FUNCTION public.ig_claim_queue(batch_size integer DEFAULT 5)
RETURNS SETOF public.ig_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ig_queue q
  SET status = 'sending', claimed_at = now(), attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.ig_queue
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT batch_size
  )
  RETURNING q.*;
END; $$;

CREATE OR REPLACE FUNCTION public.ig_register_click(p_slug text, p_user_agent text DEFAULT NULL, p_referer text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.ig_links;
BEGIN
  SELECT * INTO l FROM public.ig_links WHERE slug = p_slug;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.ig_link_clicks (link_id, automation_id, igsid, user_agent, referer)
  VALUES (l.id, l.automation_id, l.igsid, left(p_user_agent, 300), left(p_referer, 300));
  UPDATE public.ig_links SET clicks = clicks + 1, last_click_at = now(), first_click_at = coalesce(first_click_at, now()) WHERE id = l.id;
  RETURN l.target_url;
END; $$;

-- Status da conexão sem expor o token (o painel mostra @ e validade).
CREATE OR REPLACE FUNCTION public.ig_connection_status()
RETURNS TABLE (ig_user_id text, username text, profile_pic_url text, token_expires_at timestamptz, updated_at timestamptz, connected boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT c.ig_user_id, c.username, c.profile_pic_url, c.token_expires_at, c.updated_at,
         (c.access_token IS NOT NULL AND (c.token_expires_at IS NULL OR c.token_expires_at > now())) AS connected
  FROM public.ig_config c WHERE c.id = true;
$$;
GRANT EXECUTE ON FUNCTION public.ig_connection_status() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ig_claim_queue(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ig_register_click(text, text, text) FROM anon, authenticated;

-- RLS: o painel (usuário autenticado) gerencia automações e lê métricas;
-- ig_config só pelo servidor (service role).
ALTER TABLE public.ig_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_link_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage ig_automations" ON public.ig_automations;
CREATE POLICY "auth manage ig_automations" ON public.ig_automations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth read ig_contacts" ON public.ig_contacts;
CREATE POLICY "auth read ig_contacts" ON public.ig_contacts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read ig_queue" ON public.ig_queue;
CREATE POLICY "auth read ig_queue" ON public.ig_queue FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read ig_events" ON public.ig_events;
CREATE POLICY "auth read ig_events" ON public.ig_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read ig_links" ON public.ig_links;
CREATE POLICY "auth read ig_links" ON public.ig_links FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read ig_link_clicks" ON public.ig_link_clicks;
CREATE POLICY "auth read ig_link_clicks" ON public.ig_link_clicks FOR SELECT TO authenticated USING (true);

-- 4) Cron: drena a fila a cada minuto (lembretes/retentativas) e renova o token
--    IGAA toda segunda 03:00 UTC. O envio instantâneo já é disparado pelo webhook.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('ig-queue-drain') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ig-queue-drain');
SELECT cron.schedule('ig-queue-drain', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/ig-queue-worker',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb);
$$);

SELECT cron.unschedule('ig-token-refresh') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ig-token-refresh');
SELECT cron.schedule('ig-token-refresh', '0 3 * * 1', $$
  SELECT net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/ig-oauth',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "refresh"}'::jsonb);
$$);

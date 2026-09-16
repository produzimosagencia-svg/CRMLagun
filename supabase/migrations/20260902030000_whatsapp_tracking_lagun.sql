-- Rastreamento de links do WhatsApp, isolado no projeto Lagun.
-- Não referencia pedidos, URLs, chaves ou integrações de outros projetos.

CREATE TABLE IF NOT EXISTS public.wa_tracking_config (
  campaign_key text PRIMARY KEY CHECK (campaign_key IN ('disparo', 'carrinho_abandonado', 'aniversario', 'estornos')),
  destination_url text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wa_tracking_config (campaign_key) VALUES
  ('disparo'), ('carrinho_abandonado'), ('aniversario'), ('estornos')
ON CONFLICT (campaign_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wa_tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  campaign_key text NOT NULL REFERENCES public.wa_tracking_config(campaign_key),
  template_name text,
  recipient_name text,
  phone text,
  email text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wa_tracking_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.wa_tracking_links(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text
);

CREATE INDEX IF NOT EXISTS wa_tracking_links_campaign_sent_idx
  ON public.wa_tracking_links(campaign_key, sent_at DESC);
CREATE INDEX IF NOT EXISTS wa_tracking_clicks_link_clicked_idx
  ON public.wa_tracking_clicks(link_id, clicked_at);

ALTER TABLE public.wa_tracking_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_tracking_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage WhatsApp tracking config" ON public.wa_tracking_config;
CREATE POLICY "Staff manage WhatsApp tracking config" ON public.wa_tracking_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff view WhatsApp tracking links" ON public.wa_tracking_links;
CREATE POLICY "Staff view WhatsApp tracking links" ON public.wa_tracking_links
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Staff view WhatsApp tracking clicks" ON public.wa_tracking_clicks;
CREATE POLICY "Staff view WhatsApp tracking clicks" ON public.wa_tracking_clicks
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Uma conversão é uma compra do mesmo contato feita até sete dias após o
-- primeiro clique. A correspondência usa somente o CRM do próprio Lagun.
CREATE OR REPLACE VIEW public.wa_tracking_activity
WITH (security_invoker = true) AS
WITH first_click AS (
  SELECT link_id, min(clicked_at) AS clicked_at, count(*)::integer AS click_count
  FROM public.wa_tracking_clicks
  GROUP BY link_id
), matched_customer AS (
  SELECT DISTINCT ON (l.id)
    l.id AS link_id,
    c.id AS customer_id
  FROM public.wa_tracking_links l
  JOIN public.crm_customers c ON
    (l.email IS NOT NULL AND lower(trim(c.email)) = lower(trim(l.email))) OR
    (l.phone IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') = regexp_replace(l.phone, '\\D', '', 'g'))
  ORDER BY l.id, c.updated_at DESC NULLS LAST, c.created_at DESC
), conversions AS (
  SELECT
    l.id AS link_id,
    count(p.id)::integer AS purchase_count,
    coalesce(sum(p.quantity), 0)::integer AS item_count,
    coalesce(sum(p.total_value), 0)::numeric AS revenue
  FROM public.wa_tracking_links l
  JOIN first_click fc ON fc.link_id = l.id
  JOIN matched_customer mc ON mc.link_id = l.id
  JOIN public.crm_purchases p ON p.customer_id = mc.customer_id
    AND p.purchase_date >= (fc.clicked_at AT TIME ZONE 'America/Sao_Paulo')::date
    AND p.purchase_date <= (fc.clicked_at AT TIME ZONE 'America/Sao_Paulo')::date + 7
  GROUP BY l.id
)
SELECT
  l.id, l.token, l.campaign_key, l.template_name, l.recipient_name,
  l.phone, l.email, l.sent_at,
  fc.clicked_at AS first_clicked_at,
  coalesce(fc.click_count, 0) AS click_count,
  coalesce(cv.purchase_count, 0) AS purchase_count,
  coalesce(cv.item_count, 0) AS item_count,
  coalesce(cv.revenue, 0) AS revenue
FROM public.wa_tracking_links l
LEFT JOIN first_click fc ON fc.link_id = l.id
LEFT JOIN conversions cv ON cv.link_id = l.id;

CREATE OR REPLACE VIEW public.wa_campaign_attribution_stats
WITH (security_invoker = true) AS
SELECT
  c.campaign_key,
  count(a.id)::bigint AS links_created,
  count(a.id) FILTER (WHERE a.first_clicked_at IS NOT NULL)::bigint AS unique_clicks,
  count(a.id) FILTER (WHERE a.purchase_count > 0)::bigint AS direct_conversions,
  0::bigint AS assisted_conversions,
  coalesce(sum(a.revenue), 0)::numeric AS direct_revenue,
  0::numeric AS assisted_revenue
FROM public.wa_tracking_config c
LEFT JOIN public.wa_tracking_activity a ON a.campaign_key = c.campaign_key
GROUP BY c.campaign_key;

GRANT SELECT ON public.wa_tracking_activity TO authenticated;
GRANT SELECT ON public.wa_campaign_attribution_stats TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_tracking_links;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_tracking_clicks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

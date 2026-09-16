-- Estruturas compartilhadas pelas versões atuais de WhatsApp e Chat.
-- Não agenda jobs nem contém URL, chave ou identificador de outro projeto.

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('birthday')),
  phone_number_id text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'pt_BR',
  template_variable_count integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_automation_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  wamid text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, customer_id, run_date)
);

ALTER TABLE public.whatsapp_automation_campaigns
  ADD COLUMN IF NOT EXISTS template_category text NOT NULL DEFAULT 'MARKETING'
  CHECK (template_category IN ('MARKETING', 'UTILITY'));

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS template_category text
  CHECK (template_category IN ('MARKETING', 'UTILITY'));

ALTER TABLE public.whatsapp_automation_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners can manage WhatsApp automation campaigns" ON public.whatsapp_automation_campaigns;
CREATE POLICY "Partners can manage WhatsApp automation campaigns"
  ON public.whatsapp_automation_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Partners can view WhatsApp automation runs" ON public.whatsapp_automation_runs;
CREATE POLICY "Partners can view WhatsApp automation runs"
  ON public.whatsapp_automation_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_whatsapp_automation_runs_campaign_date
  ON public.whatsapp_automation_runs(campaign_id, run_date DESC);

CREATE TABLE IF NOT EXISTS public.chat_conversation_reads (
  channel text NOT NULL,
  account_scope text NOT NULL DEFAULT 'default',
  contact_id text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, account_scope, contact_id)
);

ALTER TABLE public.chat_conversation_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can read conversation receipts" ON public.chat_conversation_reads;
CREATE POLICY "Authenticated staff can read conversation receipts"
  ON public.chat_conversation_reads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated staff can insert conversation receipts" ON public.chat_conversation_reads;
CREATE POLICY "Authenticated staff can insert conversation receipts"
  ON public.chat_conversation_reads FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated staff can update conversation receipts" ON public.chat_conversation_reads;
CREATE POLICY "Authenticated staff can update conversation receipts"
  ON public.chat_conversation_reads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS chat_conversation_reads_lookup_idx
  ON public.chat_conversation_reads(channel, account_scope, last_read_at DESC);

INSERT INTO public.sidebar_menu_settings (key, label, enabled) VALUES
  ('social_media', 'Social Media', true),
  ('comentarios', 'Comentários', true)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label;

UPDATE public.sidebar_menu_settings SET label = 'Performance' WHERE key = 'ads';

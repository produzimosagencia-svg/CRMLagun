-- ============================================================
-- Bootstrap completo do schema (Na Vista) — gerado a partir do
-- histórico de migrations deste repositório. Rode este arquivo
-- inteiro, uma vez, no SQL Editor do projeto Supabase novo.
-- ============================================================


-- ===== 20260223214147_a39f3342-458d-411e-a994-8f27ae9145d3.sql =====

-- Enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'partner');

-- Enum para classificação de cliente
CREATE TYPE public.client_classification AS ENUM ('cold', 'warm', 'hot', 'vip');

-- Tabela de roles de usuário
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Tabela de perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Função para verificar role (security definer para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Tabela de clientes do CRM
CREATE TABLE public.crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  first_purchase BOOLEAN DEFAULT true,
  previous_purchases_count INTEGER DEFAULT 0,
  ltv NUMERIC(12,2) DEFAULT 0,
  last_event TEXT,
  preferred_event_type TEXT,
  classification client_classification DEFAULT 'cold',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;

-- Tabela de compras
CREATE TABLE public.crm_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.crm_customers(id) ON DELETE CASCADE NOT NULL,
  event_name TEXT NOT NULL,
  event_date DATE,
  ticket_type TEXT,
  ticket_lot TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ticket_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  acquisition_channel TEXT,
  attendance_status TEXT DEFAULT 'pending',
  coupon_used TEXT,
  influencer_code TEXT,
  campaign_origin TEXT,
  campaign_medium TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_purchases ENABLE ROW LEVEL SECURITY;

-- Trigger para criar perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_crm_customers_updated_at
  BEFORE UPDATE ON public.crm_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para recalcular LTV e contagem de compras ao inserir compra
CREATE OR REPLACE FUNCTION public.update_customer_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_purchases INTEGER;
  total_ltv NUMERIC(12,2);
  last_evt TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(total_value), 0)
  INTO total_purchases, total_ltv
  FROM public.crm_purchases
  WHERE customer_id = NEW.customer_id;

  SELECT event_name INTO last_evt
  FROM public.crm_purchases
  WHERE customer_id = NEW.customer_id
  ORDER BY COALESCE(event_date, purchase_date) DESC
  LIMIT 1;

  UPDATE public.crm_customers SET
    previous_purchases_count = total_purchases,
    ltv = total_ltv,
    last_event = last_evt,
    first_purchase = (total_purchases <= 1),
    classification = CASE
      WHEN total_ltv >= 1000 THEN 'vip'::client_classification
      WHEN total_ltv >= 500 THEN 'hot'::client_classification
      WHEN total_ltv >= 200 THEN 'warm'::client_classification
      ELSE 'cold'::client_classification
    END
  WHERE id = NEW.customer_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER after_purchase_insert
  AFTER INSERT ON public.crm_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_stats();

CREATE TRIGGER after_purchase_update
  AFTER UPDATE ON public.crm_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_stats();

-- RLS Policies: só partners e admins podem acessar

-- user_roles: apenas leitura própria
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- crm_customers: apenas partners/admins
CREATE POLICY "Partners can view customers"
  ON public.crm_customers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners can insert customers"
  ON public.crm_customers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners can update customers"
  ON public.crm_customers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners can delete customers"
  ON public.crm_customers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

-- crm_purchases: apenas partners/admins
CREATE POLICY "Partners can view purchases"
  ON public.crm_purchases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners can insert purchases"
  ON public.crm_purchases FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners can update purchases"
  ON public.crm_purchases FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners can delete purchases"
  ON public.crm_purchases FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin'));

-- ===== 20260224040551_33e75256-ca70-4e46-92fb-215f675e9e82.sql =====

-- Table to map event names to categories
CREATE TABLE public.event_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('rap_trap', 'pagode_funk')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view event categories"
  ON public.event_categories FOR SELECT
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can manage event categories"
  ON public.event_categories FOR ALL
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- ===== 20260224041718_41d371cf-5979-42a3-a35c-983ee4a3ea0b.sql =====

-- Function to remove duplicate purchases (keeps the oldest entry)
CREATE OR REPLACE FUNCTION public.deduplicate_purchases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH duplicates AS (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY customer_id, event_name, coupon_used
        ORDER BY created_at ASC
      ) as rn
    FROM public.crm_purchases
    WHERE coupon_used IS NOT NULL
  )
  DELETE FROM public.crm_purchases
  WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ===== 20260224041759_ec5155a9-156f-466b-9e54-c26e34f5ac52.sql =====

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage
GRANT USAGE ON SCHEMA cron TO postgres;

-- ===== 20260224043245_8d7c4e5f-974b-497c-a0af-f57049b5b49d.sql =====

-- Create temp bucket for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('temp-uploads', 'temp-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read
CREATE POLICY "Public read temp-uploads" ON storage.objects FOR SELECT USING (bucket_id = 'temp-uploads');

-- Allow authenticated insert
CREATE POLICY "Auth insert temp-uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'temp-uploads');

-- Allow authenticated delete
CREATE POLICY "Auth delete temp-uploads" ON storage.objects FOR DELETE USING (bucket_id = 'temp-uploads');

-- ===== 20260301065053_1ea6fb00-72fe-4ff8-9e08-57047b6fcaf5.sql =====

CREATE TABLE public.crm_creators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  instagram TEXT NOT NULL,
  tiktok TEXT,
  followers_instagram INTEGER NOT NULL DEFAULT 0,
  followers_tiktok INTEGER NOT NULL DEFAULT 0,
  video_skill TEXT NOT NULL,
  music_style TEXT NOT NULL,
  motivation TEXT NOT NULL,
  expected_value NUMERIC NOT NULL DEFAULT 0,
  qualification TEXT NOT NULL DEFAULT '🧪 Em Observação',
  qualification_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read creators"
  ON public.crm_creators FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert creators"
  ON public.crm_creators FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ===== 20260302060344_67e78ab9-af89-4f94-b359-63b79d75dc25.sql =====
ALTER TABLE public.crm_creators ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
-- ===== 20260308182557_9004bd89-61ee-4acc-9c60-d72329ed8223.sql =====

-- Add username column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Security definer function to get email by username (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE username = _username LIMIT 1;
$$;

-- ===== 20260310044612_e945e74b-a200-485c-b93c-a225386425e4.sql =====

CREATE TABLE public.maestria_birthday (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  whatsapp text NOT NULL,
  birth_date date NOT NULL,
  coupon text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maestria_birthday ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert birthday" ON public.maestria_birthday
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can check coupon exists" ON public.maestria_birthday
  FOR SELECT TO anon, authenticated USING (true);

-- ===== 20260310050224_eb8be78f-6cd9-4be1-b498-2d5242489e35.sql =====
ALTER TABLE public.maestria_birthday ADD COLUMN email text;
-- ===== 20260310170032_bfd852a1-f6f0-4e52-b3c0-76b01dc9a561.sql =====
ALTER TABLE public.maestria_birthday ADD COLUMN cpf text;
-- ===== 20260320172116_1658350b-c3e9-4146-be62-c00254060b32.sql =====

-- Create storage bucket for creative references
INSERT INTO storage.buckets (id, name, public) VALUES ('creative-references', 'creative-references', true);

-- Create table for creative references
CREATE TABLE public.creative_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  observation TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.creative_references ENABLE ROW LEVEL SECURITY;

-- Partners/admins can do everything
CREATE POLICY "Partners can view references" ON public.creative_references
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can insert references" ON public.creative_references
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can delete references" ON public.creative_references
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for creative-references bucket
CREATE POLICY "Partners can upload creative references" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creative-references' AND (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Anyone can view creative references" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'creative-references');

-- ===== 20260324213108_ae440e02-b3a5-4845-a5bd-48e2bd62f727.sql =====

-- Events table for managing events with avatars and webhook configs
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  avatar_url text,
  event_date date,
  webhook_url text,
  api_token text,
  platform text DEFAULT 'manual',
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view events" ON public.events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can insert events" ON public.events FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can update events" ON public.events FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can delete events" ON public.events FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Design demands table
CREATE TABLE public.design_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  publish_date date,
  status text DEFAULT 'pendente',
  attachments text[] DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.design_demands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view demands" ON public.design_demands FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can insert demands" ON public.design_demands FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can update demands" ON public.design_demands FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can delete demands" ON public.design_demands FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket for event avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('event-avatars', 'event-avatars', true);

CREATE POLICY "Partners can upload event avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-avatars' AND (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Anyone can view event avatars" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'event-avatars');

-- Storage bucket for design attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('design-attachments', 'design-attachments', true);

CREATE POLICY "Partners can upload design attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-attachments' AND (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Anyone can view design attachments" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'design-attachments');

-- ===== 20260325044047_0c09aaf5-7233-40af-a7eb-eb2df633b89f.sql =====
ALTER TABLE public.design_demands ADD COLUMN IF NOT EXISTS priority text DEFAULT null;
-- ===== 20260325050617_f89e4e0d-bf08-4df3-9247-46f7173b238a.sql =====
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'blueticket',
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view webhook logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert webhook logs" ON public.webhook_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_logs;
-- ===== 20260325213604_cd4b8f93-5d22-41cd-9ed8-804728f15bce.sql =====

CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  contact_name TEXT,
  direction TEXT NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming', 'outgoing')),
  message_type TEXT NOT NULL DEFAULT 'text',
  message_text TEXT,
  media_url TEXT,
  wamid TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'received',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert messages" ON public.whatsapp_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(phone);
CREATE INDEX idx_whatsapp_messages_timestamp ON public.whatsapp_messages(timestamp DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

-- ===== 20260326001727_86ed6497-320c-4d59-bd75-3db7c88c1fe5.sql =====
CREATE TABLE public.whatsapp_bot_settings (
  phone TEXT PRIMARY KEY,
  bot_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert bot settings" ON public.whatsapp_bot_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update bot settings" ON public.whatsapp_bot_settings FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Partners can view bot settings" ON public.whatsapp_bot_settings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- ===== 20260326034237_7e7b35bb-45c9-4f39-8ee0-abac07f03c6d.sql =====

CREATE TABLE public.chatbot_event_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_date date NULL,
  event_location text NULL,
  attractions text NULL,
  age_rating text NULL,
  observations text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_event_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can manage chatbot knowledge"
ON public.chatbot_event_knowledge
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- ===== 20260326035408_9f917f65-2374-4892-b126-0ba8aa521c7a.sql =====
ALTER TABLE public.chatbot_event_knowledge ADD COLUMN ticket_link text NULL;
-- ===== 20260326190158_email_infra.sql =====
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');

-- ===== 20260328031541_72eb4632-0a49-40ac-8449-934397c5e70a.sql =====
UPDATE events SET platform = 'superticket', api_token = 'SUPERTICKET_MAESTRIA_TOKEN' WHERE id = 'acfb85f9-f105-44c2-9e82-ef0a3021dacd';
-- ===== 20260329234809_3f0b726d-ad44-4a90-bbdf-19cf0b5f44df.sql =====
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS official_tickets integer,
  ADD COLUMN IF NOT EXISTS official_revenue numeric(12,2);
-- ===== 20260401235007_adbb0407-7a3b-49df-a464-a2638be1a273.sql =====

-- 1. Fix temp-uploads storage policies
DROP POLICY IF EXISTS "Auth insert temp-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete temp-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload temp files" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete own temp files" ON storage.objects;

CREATE POLICY "Authenticated can upload temp files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'temp-uploads');

CREATE POLICY "Owners can delete own temp files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'temp-uploads' AND owner = auth.uid());

-- 2. Fix webhook_logs
DROP POLICY IF EXISTS "Anyone can insert webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.webhook_logs;

CREATE POLICY "Service role can insert webhook logs"
  ON public.webhook_logs FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

-- 3. Fix whatsapp_messages
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Service role can insert messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Service role can update messages" ON public.whatsapp_messages;

CREATE POLICY "Service role can insert messages"
  ON public.whatsapp_messages FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update messages"
  ON public.whatsapp_messages FOR UPDATE
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Fix whatsapp_bot_settings
DROP POLICY IF EXISTS "Anyone can insert bot settings" ON public.whatsapp_bot_settings;
DROP POLICY IF EXISTS "Anyone can update bot settings" ON public.whatsapp_bot_settings;
DROP POLICY IF EXISTS "Partners can insert bot settings" ON public.whatsapp_bot_settings;
DROP POLICY IF EXISTS "Partners can update bot settings" ON public.whatsapp_bot_settings;

CREATE POLICY "Partners can insert bot settings"
  ON public.whatsapp_bot_settings FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can update bot settings"
  ON public.whatsapp_bot_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 5. Fix maestria_birthday
DROP POLICY IF EXISTS "Anyone can check coupon exists" ON public.maestria_birthday;
DROP POLICY IF EXISTS "Anyone can insert birthday" ON public.maestria_birthday;
DROP POLICY IF EXISTS "Service role and admins can read birthday" ON public.maestria_birthday;
DROP POLICY IF EXISTS "Service role can insert birthday" ON public.maestria_birthday;

CREATE POLICY "Service role and admins can read birthday"
  ON public.maestria_birthday FOR SELECT
  TO public
  USING (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert birthday"
  ON public.maestria_birthday FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

-- 6. Fix crm_creators
DROP POLICY IF EXISTS "Anyone can insert creators" ON public.crm_creators;
DROP POLICY IF EXISTS "Service role can insert creators" ON public.crm_creators;

CREATE POLICY "Service role can insert creators"
  ON public.crm_creators FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

-- 7. Create secure view for events without api_token
DROP VIEW IF EXISTS public.events_safe;
CREATE OR REPLACE VIEW public.events_safe AS
  SELECT id, name, avatar_url, event_date, webhook_url, platform, status, 
         official_tickets, official_revenue, created_at, updated_at
  FROM public.events;

-- ===== 20260401235028_ac9f0771-44e6-4da9-87e5-5c6dabc1ed93.sql =====

-- Fix events_safe view to use invoker security
ALTER VIEW public.events_safe SET (security_invoker = on);

-- Fix function search_path for functions missing it
CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- ===== 20260403002709_6c880286-9839-4992-809e-a082fc96e290.sql =====

-- Table to store TráfegoGPT conversations
CREATE TABLE public.trafego_gpt_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_name TEXT,
  campaign_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trafego_gpt_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations"
ON public.trafego_gpt_conversations FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.trafego_gpt_conversations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.trafego_gpt_conversations FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.trafego_gpt_conversations FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_trafego_gpt_conversations_user_id ON public.trafego_gpt_conversations(user_id);
CREATE INDEX idx_trafego_gpt_conversations_updated_at ON public.trafego_gpt_conversations(updated_at DESC);

-- ===== 20260403012429_c590b659-bbd1-4aa0-a301-9c000e86c762.sql =====
CREATE TABLE public.meta_ads_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  tool_name TEXT NOT NULL,
  tool_arguments JSONB NOT NULL DEFAULT '{}',
  system_prompt TEXT,
  ai_messages JSONB,
  ai_model TEXT,
  latest_media_url TEXT,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ads_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own jobs" ON public.meta_ads_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own jobs" ON public.meta_ads_jobs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service can update jobs" ON public.meta_ads_jobs FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_meta_ads_jobs_updated_at BEFORE UPDATE ON public.meta_ads_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ===== 20260404045107_70bf6f94-a50c-4cd2-908c-adf1b4209573.sql =====
CREATE POLICY "Partners can insert messages"
ON public.whatsapp_messages
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);
-- ===== 20260404052352_9445bd67-6969-4fa6-9e66-6483e5d09aea.sql =====

CREATE TABLE public.ad_creative_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creative_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view ad comments"
ON public.ad_creative_comments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can insert ad comments"
ON public.ad_creative_comments FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can update ad comments"
ON public.ad_creative_comments FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can delete ad comments"
ON public.ad_creative_comments FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ad_creative_comments_updated_at
BEFORE UPDATE ON public.ad_creative_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ad_creative_comments_ad_id ON public.ad_creative_comments(ad_id);

-- ===== 20260404053254_ad2422b4-a040-4c15-a4b9-5caa8912c311.sql =====

CREATE OR REPLACE FUNCTION public.crm_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_customers bigint;
  new_customers_30d bigint;
  superclientes bigint;
  fans bigint;
BEGIN
  -- Total customers (with at least one purchase)
  SELECT COUNT(DISTINCT customer_id) INTO total_customers FROM crm_purchases;

  -- New customers in last 30 days
  SELECT COUNT(*) INTO new_customers_30d
  FROM crm_customers
  WHERE created_at >= NOW() - INTERVAL '30 days';

  -- Superclientes: customers with LTV > 1000
  SELECT COUNT(*) INTO superclientes
  FROM crm_customers
  WHERE ltv >= 1000;

  -- Fãs: customers with purchases in 4+ distinct events
  SELECT COUNT(*) INTO fans
  FROM (
    SELECT customer_id
    FROM crm_purchases
    GROUP BY customer_id
    HAVING COUNT(DISTINCT event_name) >= 4
  ) sub;

  result := jsonb_build_object(
    'total_customers', total_customers,
    'new_customers_30d', new_customers_30d,
    'superclientes', superclientes,
    'fans', fans
  );

  RETURN result;
END;
$$;

-- ===== 20260404054244_c23e3b46-2738-4ba7-ac9c-a61571269111.sql =====

CREATE OR REPLACE FUNCTION public.crm_top_fans(lim integer DEFAULT 20)
RETURNS TABLE(customer_id uuid, full_name text, phone text, total_spent numeric, event_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, COALESCE(c.ltv, 0)::numeric, sub.event_count
  FROM (
    SELECT p.customer_id AS cid, COUNT(DISTINCT p.event_name) AS event_count
    FROM crm_purchases p
    GROUP BY p.customer_id
    HAVING COUNT(DISTINCT p.event_name) >= 4
  ) sub
  JOIN crm_customers c ON c.id = sub.cid
  ORDER BY sub.event_count DESC, c.ltv DESC NULLS LAST
  LIMIT lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_top_superclientes(lim integer DEFAULT 20)
RETURNS TABLE(customer_id uuid, full_name text, phone text, total_spent numeric, event_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, COALESCE(c.ltv, 0)::numeric,
    (SELECT COUNT(DISTINCT p.event_name) FROM crm_purchases p WHERE p.customer_id = c.id) AS event_count
  FROM crm_customers c
  WHERE c.ltv >= 1000
  ORDER BY c.ltv DESC
  LIMIT lim;
END;
$$;

-- ===== 20260404062340_2760fc08-1ebc-4e21-8742-f30960966cd3.sql =====

DROP FUNCTION IF EXISTS public.crm_top_fans(integer);
DROP FUNCTION IF EXISTS public.crm_top_superclientes(integer);

CREATE OR REPLACE FUNCTION public.crm_top_fans(lim integer DEFAULT 20)
RETURNS TABLE(customer_id uuid, full_name text, phone text, total_spent numeric, event_count bigint, event_names text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, COALESCE(c.ltv, 0)::numeric, sub.event_count, sub.event_names
  FROM (
    SELECT p.customer_id AS cid,
           COUNT(DISTINCT p.event_name) AS event_count,
           ARRAY_AGG(DISTINCT p.event_name) AS event_names
    FROM crm_purchases p
    GROUP BY p.customer_id
    HAVING COUNT(DISTINCT p.event_name) >= 4
  ) sub
  JOIN crm_customers c ON c.id = sub.cid
  ORDER BY sub.event_count DESC, c.ltv DESC NULLS LAST
  LIMIT lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_top_superclientes(lim integer DEFAULT 20)
RETURNS TABLE(customer_id uuid, full_name text, phone text, total_spent numeric, event_count bigint, event_names text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.full_name, c.phone, COALESCE(c.ltv, 0)::numeric,
    (SELECT COUNT(DISTINCT p.event_name) FROM crm_purchases p WHERE p.customer_id = c.id) AS event_count,
    (SELECT ARRAY_AGG(DISTINCT p.event_name) FROM crm_purchases p WHERE p.customer_id = c.id) AS event_names
  FROM crm_customers c
  WHERE c.ltv >= 1000
  ORDER BY c.ltv DESC
  LIMIT lim;
END;
$$;

-- ===== 20260408184410_bce4f061-c58a-4f29-82c0-0aadfc1c9f00.sql =====
-- Add new role values to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'design';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trafego';
-- ===== 20260408184754_18910b2c-9441-45b2-8928-61dbfd3b82a5.sql =====
-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to manage user roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
-- ===== 20260409025047_e33769a4-405c-413e-8b01-1a1c08229626.sql =====

ALTER TABLE public.whatsapp_messages 
ADD COLUMN channel text NOT NULL DEFAULT 'whatsapp';

CREATE INDEX idx_whatsapp_messages_channel ON public.whatsapp_messages(channel);

-- ===== 20260409161918_addc426e-82e5-4494-8d4d-58b32b89d9b9.sql =====

CREATE TABLE public.team_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pendente',
  priority text,
  assigned_to uuid,
  created_by uuid,
  attachments text[] DEFAULT '{}'::text[],
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view tasks" ON public.team_tasks
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

CREATE POLICY "Team can insert tasks" ON public.team_tasks
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

CREATE POLICY "Team can update tasks" ON public.team_tasks
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

CREATE POLICY "Team can delete tasks" ON public.team_tasks
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

CREATE TRIGGER update_team_tasks_updated_at
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 20260409163245_cf20c717-836a-4bb9-8ee4-7538af6499b5.sql =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS squad text;
-- ===== 20260409163751_abf8d9bf-7cb6-43d4-ac76-b1fd07e9e41c.sql =====
ALTER TABLE public.team_tasks ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
-- ===== 20260420181937_3348e6c4-f12c-4154-b822-d4ec6415a5d6.sql =====
-- Deduplicate crm_purchases keeping oldest row per coupon_used
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY coupon_used ORDER BY created_at ASC) AS rn
  FROM public.crm_purchases
  WHERE coupon_used IS NOT NULL
)
DELETE FROM public.crm_purchases
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent future duplicates by SuperTicket ticket id
CREATE UNIQUE INDEX IF NOT EXISTS crm_purchases_coupon_used_unique
  ON public.crm_purchases (coupon_used)
  WHERE coupon_used IS NOT NULL;

-- Recompute customer LTV/counts from now-deduped purchases
UPDATE public.crm_customers c SET
  previous_purchases_count = sub.cnt,
  ltv = sub.total
FROM (
  SELECT customer_id, COUNT(*) AS cnt, COALESCE(SUM(total_value),0) AS total
  FROM public.crm_purchases GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;
-- ===== 20260422022401_7a6ca356-2dfa-4fad-9adc-a9ae4fb5b69c.sql =====
-- Restrict crm_creators reads to partners/admins
DROP POLICY IF EXISTS "Authenticated users can read creators" ON public.crm_creators;
CREATE POLICY "Partners can view creators"
ON public.crm_creators
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Restrict whatsapp_messages Realtime to partners/admins
ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
-- ===== 20260422034929_08a6517b-054b-4271-9435-45b73cb9f0db.sql =====

-- 1. Restrict sensitive columns on events table — only admins read api_token/webhook_url
DROP POLICY IF EXISTS "Partners can view events" ON public.events;

CREATE POLICY "Admins can view all event fields"
ON public.events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Recreate events_safe view (without api_token) so partners can read non-sensitive fields
DROP VIEW IF EXISTS public.events_safe;
CREATE VIEW public.events_safe
WITH (security_invoker = true)
AS
SELECT id, name, avatar_url, event_date, webhook_url, status, platform,
       official_tickets, official_revenue, created_at, updated_at
FROM public.events;

-- Allow partners to read events_safe via a permissive policy on events that excludes sensitive columns
-- Since column-level RLS isn't trivial, we allow partners to SELECT events but app must use events_safe
CREATE POLICY "Partners can view events (non-sensitive via view)"
ON public.events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.events_safe TO authenticated;

-- 2. Realtime authorization for sensitive tables
-- Enable RLS on realtime.messages and add restrictive policy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Authenticated partners can receive realtime" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "Authenticated partners can receive realtime"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'partner'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    $POL$;
  END IF;
END $$;

-- 3. Storage: add DELETE/UPDATE policies for partner/admin on managed buckets
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['creative-references','design-attachments','event-avatars'] LOOP
    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can delete in %1$s" ON storage.objects;
      CREATE POLICY "Partners can delete in %1$s"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = %2$L AND (public.has_role(auth.uid(),'partner'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)));
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can update in %1$s" ON storage.objects;
      CREATE POLICY "Partners can update in %1$s"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = %2$L AND (public.has_role(auth.uid(),'partner'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)))
      WITH CHECK (bucket_id = %2$L AND (public.has_role(auth.uid(),'partner'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role)));
    $P$, b, b);
  END LOOP;
END $$;

-- 4. Lock down temp-uploads bucket
UPDATE storage.buckets SET public = false WHERE id = 'temp-uploads';

DROP POLICY IF EXISTS "Public can read temp uploads" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read temp-uploads" ON storage.objects;

CREATE POLICY "Partners can read temp-uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'temp-uploads'
  AND (public.has_role(auth.uid(),'partner'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role))
);

CREATE POLICY "Partners can delete temp-uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'temp-uploads'
  AND (public.has_role(auth.uid(),'partner'::public.app_role) OR public.has_role(auth.uid(),'admin'::public.app_role))
);

-- ===== 20260425040944_232fe8df-a3da-434e-ad6f-696d0040d810.sql =====

-- 1. Tabela de contas Instagram conectadas por creator
CREATE TABLE public.creator_instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.crm_creators(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  profile_picture_url text,
  account_type text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  followers_count integer DEFAULT 0,
  media_count integer DEFAULT 0,
  last_synced_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and partners can view IG accounts"
  ON public.creator_instagram_accounts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Admins and partners can update IG accounts"
  ON public.creator_instagram_accounts FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Admins can delete IG accounts"
  ON public.creator_instagram_accounts FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert IG accounts"
  ON public.creator_instagram_accounts FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update IG accounts"
  ON public.creator_instagram_accounts FOR UPDATE
  TO public
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_creator_instagram_accounts_updated_at
  BEFORE UPDATE ON public.creator_instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_creator_ig_creator_id ON public.creator_instagram_accounts(creator_id);
CREATE INDEX idx_creator_ig_status ON public.creator_instagram_accounts(status);

-- 2. Lista de @s alvo de divulgação (admin gerencia)
CREATE TABLE public.promotion_target_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text,
  instagram_user_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promotion_target_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and partners can manage target accounts"
  ON public.promotion_target_accounts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Service role can read target accounts"
  ON public.promotion_target_accounts FOR SELECT
  TO public
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_promotion_target_accounts_updated_at
  BEFORE UPDATE ON public.promotion_target_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Vínculo entre eventos e @s alvo
CREATE TABLE public.event_promotion_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  target_account_id uuid NOT NULL REFERENCES public.promotion_target_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, target_account_id)
);

ALTER TABLE public.event_promotion_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and partners can manage event targets"
  ON public.event_promotion_targets FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Service role can read event targets"
  ON public.event_promotion_targets FOR SELECT
  TO public
  USING (auth.role() = 'service_role');

CREATE INDEX idx_event_targets_event ON public.event_promotion_targets(event_id);
CREATE INDEX idx_event_targets_target ON public.event_promotion_targets(target_account_id);

-- 4. Conteúdo detectado (posts e stories que mencionam um @ alvo)
CREATE TABLE public.creator_content_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id uuid NOT NULL REFERENCES public.creator_instagram_accounts(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.crm_creators(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  target_account_id uuid REFERENCES public.promotion_target_accounts(id) ON DELETE SET NULL,
  media_id text NOT NULL,
  media_type text NOT NULL,
  permalink text,
  thumbnail_url text,
  caption text,
  detected_mention text,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  saves integer DEFAULT 0,
  views integer DEFAULT 0,
  posted_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb,
  UNIQUE (instagram_account_id, media_id, target_account_id)
);

ALTER TABLE public.creator_content_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and partners can view detections"
  ON public.creator_content_detections FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY "Admins can delete detections"
  ON public.creator_content_detections FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert detections"
  ON public.creator_content_detections FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update detections"
  ON public.creator_content_detections FOR UPDATE
  TO public
  USING (auth.role() = 'service_role');

CREATE INDEX idx_detections_creator ON public.creator_content_detections(creator_id);
CREATE INDEX idx_detections_event ON public.creator_content_detections(event_id);
CREATE INDEX idx_detections_posted_at ON public.creator_content_detections(posted_at DESC);


-- ===== 20260425043200_c97d4e01-2133-4230-866d-f9c15b77034d.sql =====
-- Tabela de cadastros do formulário de divulgação Maestria
CREATE TABLE public.maestria_divulgadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_at TIMESTAMPTZ,
  full_name TEXT NOT NULL,
  instagram TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  is_creator BOOLEAN,
  origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de cadastros da pré-venda Maestria
CREATE TABLE public.maestria_prevenda (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_at TIMESTAMPTZ,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maestria_divulgadores_submitted_at ON public.maestria_divulgadores(submitted_at DESC);
CREATE INDEX idx_maestria_prevenda_submitted_at ON public.maestria_prevenda(submitted_at DESC);

ALTER TABLE public.maestria_divulgadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maestria_prevenda ENABLE ROW LEVEL SECURITY;

-- Apenas partner/admin podem visualizar
CREATE POLICY "Partners can view divulgadores"
ON public.maestria_divulgadores FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view prevenda"
ON public.maestria_prevenda FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Service role pode inserir (para o webhook do Apps Script futuramente)
CREATE POLICY "Service role can insert divulgadores"
ON public.maestria_divulgadores FOR INSERT TO public
WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can insert prevenda"
ON public.maestria_prevenda FOR INSERT TO public
WITH CHECK (auth.role() = 'service_role'::text);
-- ===== 20260425064328_f0abbdee-aee8-456a-a2f8-f75a31fa7b3a.sql =====
CREATE OR REPLACE FUNCTION public.crm_top_superclientes(lim integer DEFAULT 20)
 RETURNS TABLE(customer_id uuid, full_name text, phone text, total_spent numeric, event_count bigint, event_names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT 
      p.customer_id AS cid,
      SUM(p.total_value)::numeric AS spent,
      COUNT(DISTINCT p.event_name) AS evt_count,
      ARRAY_AGG(DISTINCT p.event_name) AS evt_names
    FROM crm_purchases p
    WHERE p.event_name IS NOT NULL
      AND p.event_name NOT ILIKE '%maestria%'
    GROUP BY p.customer_id
    HAVING SUM(p.total_value) >= 1000
    ORDER BY SUM(p.total_value) DESC
    LIMIT lim
  )
  SELECT c.id, c.full_name, c.phone, a.spent, a.evt_count, a.evt_names
  FROM agg a
  JOIN crm_customers c ON c.id = a.cid
  ORDER BY a.spent DESC;
$function$;
-- ===== 20260425070929_1580f01e-c6ff-4943-9641-34eda8882099.sql =====
ALTER TABLE public.crm_customers ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.crm_purchases ADD COLUMN IF NOT EXISTS payment_method TEXT;
CREATE INDEX IF NOT EXISTS idx_crm_customers_birth_month ON public.crm_customers (EXTRACT(MONTH FROM birth_date));
-- ===== 20260425071058_405e1d72-bc29-4d48-88e3-97b403a10da3.sql =====
CREATE TABLE IF NOT EXISTS public._import_staging (
  event_name TEXT,
  price NUMERIC,
  payment_method TEXT,
  coupon TEXT,
  full_name TEXT,
  birth_date DATE,
  phone TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  neighborhood TEXT
);
ALTER TABLE public._import_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage staging" ON public._import_staging FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- ===== 20260425071525_f53432fe-5943-4de2-8ca1-fd8f3110d32a.sql =====
CREATE INDEX IF NOT EXISTS idx_crm_purchases_customer ON public.crm_purchases (customer_id);
CREATE INDEX IF NOT EXISTS idx_import_staging_email ON public._import_staging (email);
-- ===== 20260425164905_74f8545b-0f84-4395-904a-c76b890fc27c.sql =====

ALTER TABLE public._import_staging ADD COLUMN IF NOT EXISTS id BIGSERIAL;
CREATE INDEX IF NOT EXISTS idx_staging_id_unprocessed ON public._import_staging(id) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_staging_email ON public._import_staging(email);
CREATE INDEX IF NOT EXISTS idx_crm_customers_email ON public.crm_customers(email);

CREATE OR REPLACE FUNCTION public.process_import_batch(batch_size integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_new_customers INTEGER := 0;
  v_purchases INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  CREATE TEMP TABLE tmp_batch ON COMMIT DROP AS
  SELECT * FROM public._import_staging
  WHERE NOT processed
  ORDER BY id
  LIMIT batch_size;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  IF v_processed = 0 THEN
    SELECT COUNT(*) INTO v_remaining FROM public._import_staging WHERE NOT processed;
    RETURN jsonb_build_object('done', true, 'processed', 0, 'remaining', v_remaining);
  END IF;

  -- 1. Insere clientes novos
  WITH new_unique AS (
    SELECT DISTINCT ON (b.email)
      b.full_name, b.email, b.phone, b.city, b.state, b.neighborhood, b.birth_date
    FROM tmp_batch b
    LEFT JOIN public.crm_customers c ON c.email = b.email
    WHERE c.id IS NULL AND b.email IS NOT NULL
    ORDER BY b.email, b.birth_date NULLS LAST
  )
  INSERT INTO public.crm_customers (full_name, email, phone, city, state, neighborhood, birth_date)
  SELECT full_name, email, phone, city, state, neighborhood, birth_date FROM new_unique
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new_customers = ROW_COUNT;

  -- 2. Atualiza dados faltantes nos existentes
  UPDATE public.crm_customers c SET
    phone = COALESCE(c.phone, b.phone),
    city = COALESCE(c.city, b.city),
    state = COALESCE(c.state, b.state),
    neighborhood = COALESCE(c.neighborhood, b.neighborhood),
    birth_date = COALESCE(c.birth_date, b.birth_date),
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (email) email, phone, city, state, neighborhood, birth_date
    FROM tmp_batch WHERE email IS NOT NULL
    ORDER BY email, birth_date NULLS LAST
  ) b
  WHERE c.email = b.email;

  -- 3. Insere compras
  INSERT INTO public.crm_purchases (customer_id, event_name, purchase_date, ticket_price, quantity, total_value, payment_method, coupon_used, attendance_status)
  SELECT c.id, b.event_name, CURRENT_DATE, b.price, 1, b.price, b.payment_method, b.coupon, 'Pendente'
  FROM tmp_batch b
  JOIN public.crm_customers c ON c.email = b.email;
  GET DIAGNOSTICS v_purchases = ROW_COUNT;

  -- 4. Marca como processado por id (rápido)
  UPDATE public._import_staging s SET processed = true
  WHERE s.id IN (SELECT id FROM tmp_batch);

  SELECT COUNT(*) INTO v_remaining FROM public._import_staging WHERE NOT processed;

  RETURN jsonb_build_object(
    'done', false,
    'processed', v_processed,
    'new_customers', v_new_customers,
    'purchases_inserted', v_purchases,
    'remaining', v_remaining
  );
END;
$$;

-- ===== 20260425172658_e27389db-972a-48fd-bbf3-686ca9776d16.sql =====
CREATE INDEX IF NOT EXISTS idx_crm_customers_email_lower 
ON public.crm_customers (LOWER(email)) 
WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_crm_purchases_customer_id 
ON public.crm_purchases (customer_id);
-- ===== 20260425173109_f48f746c-1aab-4c99-991a-4e2d9e90d6a0.sql =====
-- Mapa: para cada email, qual é o ID principal (mais antigo)
CREATE TABLE IF NOT EXISTS public._dedup_email_map (
  email TEXT PRIMARY KEY,
  primary_id UUID NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_dedup_processed ON public._dedup_email_map(processed) WHERE NOT processed;

-- Popular o mapa com 1 principal por email (o mais antigo)
INSERT INTO public._dedup_email_map (email, primary_id)
SELECT DISTINCT ON (LOWER(email)) LOWER(email), id
FROM public.crm_customers
WHERE email IS NOT NULL AND email <> ''
ORDER BY LOWER(email), created_at ASC, id ASC
ON CONFLICT (email) DO NOTHING;

-- Função de deduplicação em lotes
CREATE OR REPLACE FUNCTION public.dedup_customers_batch(batch_size INTEGER DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emails INTEGER := 0;
  v_purchases_moved INTEGER := 0;
  v_customers_deleted INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  CREATE TEMP TABLE tmp_emails ON COMMIT DROP AS
  SELECT email, primary_id
  FROM public._dedup_email_map
  WHERE NOT processed
  ORDER BY email
  LIMIT batch_size;

  GET DIAGNOSTICS v_emails = ROW_COUNT;
  IF v_emails = 0 THEN
    SELECT COUNT(*) INTO v_remaining FROM public._dedup_email_map WHERE NOT processed;
    RETURN jsonb_build_object('done', true, 'remaining', v_remaining);
  END IF;

  -- Identifica clientes duplicados deste lote
  CREATE TEMP TABLE tmp_dups ON COMMIT DROP AS
  SELECT c.id AS dup_id, m.primary_id, m.email
  FROM public.crm_customers c
  JOIN tmp_emails m ON LOWER(c.email) = m.email
  WHERE c.id <> m.primary_id;

  -- Move compras das duplicatas para o principal
  UPDATE public.crm_purchases p
  SET customer_id = d.primary_id
  FROM tmp_dups d
  WHERE p.customer_id = d.dup_id;
  GET DIAGNOSTICS v_purchases_moved = ROW_COUNT;

  -- Atualiza o cliente principal com dados que ele não tem (consolidação)
  UPDATE public.crm_customers c
  SET phone = COALESCE(c.phone, src.phone),
      city = COALESCE(c.city, src.city),
      state = COALESCE(c.state, src.state),
      neighborhood = COALESCE(c.neighborhood, src.neighborhood),
      birth_date = COALESCE(c.birth_date, src.birth_date),
      updated_at = now()
  FROM (
    SELECT DISTINCT ON (d.primary_id) d.primary_id,
           x.phone, x.city, x.state, x.neighborhood, x.birth_date
    FROM tmp_dups d
    JOIN public.crm_customers x ON x.id = d.dup_id
    ORDER BY d.primary_id, x.birth_date NULLS LAST, x.updated_at DESC
  ) src
  WHERE c.id = src.primary_id;

  -- Deleta os duplicados
  DELETE FROM public.crm_customers c
  USING tmp_dups d
  WHERE c.id = d.dup_id;
  GET DIAGNOSTICS v_customers_deleted = ROW_COUNT;

  -- Marca emails como processados
  UPDATE public._dedup_email_map m
  SET processed = true
  WHERE m.email IN (SELECT email FROM tmp_emails);

  SELECT COUNT(*) INTO v_remaining FROM public._dedup_email_map WHERE NOT processed;

  RETURN jsonb_build_object(
    'done', false,
    'emails_processed', v_emails,
    'purchases_moved', v_purchases_moved,
    'customers_deleted', v_customers_deleted,
    'remaining', v_remaining
  );
END;
$$;
-- ===== 20260425173125_bbcfdcde-434c-41c4-9e10-b738a57a9d3e.sql =====
ALTER TABLE public._dedup_email_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage dedup map" ON public._dedup_email_map
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- ===== 20260425185243_aa5b424f-1997-41d1-83fb-fd01862a81aa.sql =====

-- Adiciona contagem de duplicatas no map para ordenar do mais leve ao mais pesado
ALTER TABLE public._dedup_email_map ADD COLUMN IF NOT EXISTS dup_count INTEGER;

UPDATE public._dedup_email_map m
SET dup_count = sub.c
FROM (
  SELECT LOWER(email) AS e, COUNT(*) AS c
  FROM public.crm_customers
  WHERE email IS NOT NULL
  GROUP BY LOWER(email)
) sub
WHERE m.email = sub.e AND m.dup_count IS NULL;

CREATE INDEX IF NOT EXISTS idx_dedup_unprocessed_dupcount
  ON public._dedup_email_map (dup_count) WHERE NOT processed;

-- Recria a função: timeout estendido + processa do mais leve ao mais pesado
CREATE OR REPLACE FUNCTION public.dedup_customers_batch(batch_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emails INTEGER := 0;
  v_purchases_moved INTEGER := 0;
  v_customers_deleted INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  -- Permite até 4 minutos por chamada (cron tem 1 min mas edge invoca async)
  PERFORM set_config('statement_timeout', '240000', true);

  CREATE TEMP TABLE tmp_emails ON COMMIT DROP AS
  SELECT email, primary_id
  FROM public._dedup_email_map
  WHERE NOT processed
  ORDER BY COALESCE(dup_count, 9999) ASC, email
  LIMIT batch_size;

  GET DIAGNOSTICS v_emails = ROW_COUNT;
  IF v_emails = 0 THEN
    SELECT COUNT(*) INTO v_remaining FROM public._dedup_email_map WHERE NOT processed;
    RETURN jsonb_build_object('done', true, 'remaining', v_remaining);
  END IF;

  CREATE TEMP TABLE tmp_dups ON COMMIT DROP AS
  SELECT c.id AS dup_id, m.primary_id, m.email
  FROM public.crm_customers c
  JOIN tmp_emails m ON LOWER(c.email) = m.email
  WHERE c.id <> m.primary_id;

  CREATE INDEX ON tmp_dups (dup_id);
  CREATE INDEX ON tmp_dups (primary_id);

  UPDATE public.crm_purchases p
  SET customer_id = d.primary_id
  FROM tmp_dups d
  WHERE p.customer_id = d.dup_id;
  GET DIAGNOSTICS v_purchases_moved = ROW_COUNT;

  UPDATE public.crm_customers c
  SET phone = COALESCE(c.phone, src.phone),
      city = COALESCE(c.city, src.city),
      state = COALESCE(c.state, src.state),
      neighborhood = COALESCE(c.neighborhood, src.neighborhood),
      birth_date = COALESCE(c.birth_date, src.birth_date),
      updated_at = now()
  FROM (
    SELECT DISTINCT ON (d.primary_id) d.primary_id,
           x.phone, x.city, x.state, x.neighborhood, x.birth_date
    FROM tmp_dups d
    JOIN public.crm_customers x ON x.id = d.dup_id
    ORDER BY d.primary_id, x.birth_date NULLS LAST, x.updated_at DESC
  ) src
  WHERE c.id = src.primary_id;

  DELETE FROM public.crm_customers c
  USING tmp_dups d
  WHERE c.id = d.dup_id;
  GET DIAGNOSTICS v_customers_deleted = ROW_COUNT;

  UPDATE public._dedup_email_map m
  SET processed = true
  WHERE m.email IN (SELECT email FROM tmp_emails);

  SELECT COUNT(*) INTO v_remaining FROM public._dedup_email_map WHERE NOT processed;

  RETURN jsonb_build_object(
    'done', false,
    'emails_processed', v_emails,
    'purchases_moved', v_purchases_moved,
    'customers_deleted', v_customers_deleted,
    'remaining', v_remaining
  );
END;
$function$;

-- ===== 20260425190426_5726156d-b81a-4110-8c47-5111a4c8f85c.sql =====
-- Limpa staging antigo
DELETE FROM public._import_staging;
ALTER SEQUENCE public._import_staging_id_seq RESTART WITH 1;

-- Nova função: import por evento, respeitando merge com clientes existentes
CREATE OR REPLACE FUNCTION public.import_event_batch(batch_size integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_new_customers INTEGER := 0;
  v_purchases INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  PERFORM set_config('statement_timeout', '180000', true);

  CREATE TEMP TABLE tmp_batch ON COMMIT DROP AS
  SELECT * FROM public._import_staging
  WHERE NOT processed
  ORDER BY id
  LIMIT batch_size;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  IF v_processed = 0 THEN
    SELECT COUNT(*) INTO v_remaining FROM public._import_staging WHERE NOT processed;
    RETURN jsonb_build_object('done', true, 'processed', 0, 'remaining', v_remaining);
  END IF;

  -- 1. Insere clientes novos (email não existente)
  WITH new_unique AS (
    SELECT DISTINCT ON (LOWER(b.email))
      b.full_name, LOWER(b.email) AS email, b.phone, b.city, b.state, b.neighborhood, b.birth_date
    FROM tmp_batch b
    WHERE b.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.crm_customers c WHERE LOWER(c.email) = LOWER(b.email))
    ORDER BY LOWER(b.email), b.birth_date NULLS LAST
  )
  INSERT INTO public.crm_customers (full_name, email, phone, city, state, neighborhood, birth_date)
  SELECT full_name, email, phone, city, state, neighborhood, birth_date FROM new_unique;
  GET DIAGNOSTICS v_new_customers = ROW_COUNT;

  -- 2. Atualiza dados faltantes nos existentes (sem sobrescrever)
  UPDATE public.crm_customers c SET
    phone = COALESCE(c.phone, b.phone),
    city = COALESCE(c.city, b.city),
    state = COALESCE(c.state, b.state),
    neighborhood = COALESCE(c.neighborhood, b.neighborhood),
    birth_date = COALESCE(c.birth_date, b.birth_date),
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (LOWER(email)) LOWER(email) AS email, phone, city, state, neighborhood, birth_date
    FROM tmp_batch WHERE email IS NOT NULL
    ORDER BY LOWER(email), birth_date NULLS LAST
  ) b
  WHERE LOWER(c.email) = b.email;

  -- 3. Insere compras (uma por lead, com valor já agregado)
  INSERT INTO public.crm_purchases (
    customer_id, event_name, purchase_date, ticket_price, quantity, total_value,
    payment_method, coupon_used, attendance_status
  )
  SELECT c.id, b.event_name, CURRENT_DATE,
         CASE WHEN b.price > 0 AND v.qty > 0 THEN b.price / v.qty ELSE b.price END,
         GREATEST(1, COALESCE(NULLIF(b.coupon, '')::text IS NOT NULL::int, 1)),
         b.price, b.payment_method, b.coupon, 'Pendente'
  FROM tmp_batch b
  CROSS JOIN LATERAL (SELECT 1 AS qty) v
  JOIN public.crm_customers c ON LOWER(c.email) = LOWER(b.email)
  WHERE b.email IS NOT NULL;
  GET DIAGNOSTICS v_purchases = ROW_COUNT;

  -- 4. Marca processado
  UPDATE public._import_staging s SET processed = true
  WHERE s.id IN (SELECT id FROM tmp_batch);

  SELECT COUNT(*) INTO v_remaining FROM public._import_staging WHERE NOT processed;

  RETURN jsonb_build_object(
    'done', false,
    'processed', v_processed,
    'new_customers', v_new_customers,
    'purchases_inserted', v_purchases,
    'remaining', v_remaining
  );
END;
$$;
-- ===== 20260425191246_55efe0a6-27f8-4050-9ea7-0c220044d42a.sql =====
CREATE OR REPLACE FUNCTION public.import_event_batch(batch_size integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_new_customers INTEGER := 0;
  v_purchases INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  PERFORM set_config('statement_timeout', '180000', true);

  CREATE TEMP TABLE tmp_batch ON COMMIT DROP AS
  SELECT * FROM public._import_staging
  WHERE NOT processed
  ORDER BY id
  LIMIT batch_size;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  IF v_processed = 0 THEN
    SELECT COUNT(*) INTO v_remaining FROM public._import_staging WHERE NOT processed;
    RETURN jsonb_build_object('done', true, 'processed', 0, 'remaining', v_remaining);
  END IF;

  -- 1. Insere clientes novos
  WITH new_unique AS (
    SELECT DISTINCT ON (LOWER(b.email))
      b.full_name, LOWER(b.email) AS email, b.phone, b.city, b.state, b.neighborhood, b.birth_date
    FROM tmp_batch b
    WHERE b.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.crm_customers c WHERE LOWER(c.email) = LOWER(b.email))
    ORDER BY LOWER(b.email), b.birth_date NULLS LAST
  )
  INSERT INTO public.crm_customers (full_name, email, phone, city, state, neighborhood, birth_date)
  SELECT full_name, email, phone, city, state, neighborhood, birth_date FROM new_unique;
  GET DIAGNOSTICS v_new_customers = ROW_COUNT;

  -- 2. Atualiza dados faltantes
  UPDATE public.crm_customers c SET
    phone = COALESCE(c.phone, b.phone),
    city = COALESCE(c.city, b.city),
    state = COALESCE(c.state, b.state),
    neighborhood = COALESCE(c.neighborhood, b.neighborhood),
    birth_date = COALESCE(c.birth_date, b.birth_date),
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (LOWER(email)) LOWER(email) AS email, phone, city, state, neighborhood, birth_date
    FROM tmp_batch WHERE email IS NOT NULL
    ORDER BY LOWER(email), birth_date NULLS LAST
  ) b
  WHERE LOWER(c.email) = b.email;

  -- 3. Insere UMA compra por lead (sem cross join)
  INSERT INTO public.crm_purchases (
    customer_id, event_name, purchase_date, ticket_price, quantity, total_value,
    payment_method, coupon_used, attendance_status
  )
  SELECT c.id, b.event_name, CURRENT_DATE, b.price, 1, b.price,
         b.payment_method, b.coupon, 'Pendente'
  FROM tmp_batch b
  JOIN public.crm_customers c ON LOWER(c.email) = LOWER(b.email)
  WHERE b.email IS NOT NULL;
  GET DIAGNOSTICS v_purchases = ROW_COUNT;

  UPDATE public._import_staging s SET processed = true
  WHERE s.id IN (SELECT id FROM tmp_batch);

  SELECT COUNT(*) INTO v_remaining FROM public._import_staging WHERE NOT processed;

  RETURN jsonb_build_object(
    'done', false,
    'processed', v_processed,
    'new_customers', v_new_customers,
    'purchases_inserted', v_purchases,
    'remaining', v_remaining
  );
END;
$$;
-- ===== 20260425191819_313a075b-d026-4adb-b41a-ab879c6e4f48.sql =====
CREATE INDEX IF NOT EXISTS idx_crm_customers_email_lower ON public.crm_customers (LOWER(email));
ANALYZE public.crm_customers;
-- ===== 20260425194622_e9d74f5c-bf1b-45a0-b859-d8793c8b154f.sql =====
CREATE OR REPLACE FUNCTION public.reset_crm_all_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  TRUNCATE TABLE public.crm_purchases, public.crm_customers, public._import_staging, public._dedup_email_map, public._dedup_id_map RESTART IDENTITY;

  SELECT jsonb_build_object(
    'crm_purchases', (SELECT COUNT(*) FROM public.crm_purchases),
    'crm_customers', (SELECT COUNT(*) FROM public.crm_customers),
    '_import_staging', (SELECT COUNT(*) FROM public._import_staging),
    '_dedup_email_map', (SELECT COUNT(*) FROM public._dedup_email_map),
    '_dedup_id_map', (SELECT COUNT(*) FROM public._dedup_id_map)
  ) INTO result;

  RETURN result;
END;
$$;
-- ===== 20260425194710_2bc4630f-49a7-4e31-9153-0905d1d48f07.sql =====
TRUNCATE TABLE public.crm_purchases, public.crm_customers, public._import_staging, public._dedup_email_map, public._dedup_id_map RESTART IDENTITY;

DROP FUNCTION IF EXISTS public.reset_crm_all_data();
-- ===== 20260503204842_709ffd4a-833f-455a-adf0-f2916c212465.sql =====

CREATE TABLE IF NOT EXISTS public.crm_orphan_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid,
  full_name text,
  email text,
  phone text,
  birth_date date,
  city text,
  state text,
  neighborhood text,
  ltv numeric DEFAULT 0,
  previous_purchases_count integer DEFAULT 0,
  classification text,
  last_event text,
  preferred_event_type text,
  first_purchase boolean,
  tags text[],
  original_created_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orphan_email ON public.crm_orphan_customers (email);
CREATE INDEX IF NOT EXISTS idx_orphan_phone ON public.crm_orphan_customers (phone);
CREATE INDEX IF NOT EXISTS idx_orphan_name ON public.crm_orphan_customers (full_name);

ALTER TABLE public.crm_orphan_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view orphans"
  ON public.crm_orphan_customers FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'partner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage orphans"
  ON public.crm_orphan_customers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ===== 20260504025756_3a342007-9001-4a0f-a063-f5d23c62e1bf.sql =====

DELETE FROM public.crm_purchases WHERE event_name = 'Maestria';
DELETE FROM public.crm_purchases WHERE event_name = 'Do it 4 Brazil Party - 2026';
DELETE FROM public.events WHERE name IN ('Maestria','Do it 4 Brazil Party - 2026');

-- ===== 20260504031420_5637a9d9-870c-4974-a9eb-2d47d527bc0d.sql =====
CREATE OR REPLACE FUNCTION public.grafos_event_aggregates()
RETURNS TABLE(
  event_name text,
  channel text,
  volume bigint,
  conversion numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.event_name,
    CASE
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'meta|facebook|instagram|ads' THEN 'meta_ads'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'whats|wa' THEN 'whatsapp'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'mail' THEN 'email'
      ELSE 'other'
    END AS channel,
    SUM(COALESCE(p.quantity,1))::bigint,
    SUM(COALESCE(p.total_value,0))::numeric
  FROM public.crm_purchases p
  WHERE p.event_name IS NOT NULL
  GROUP BY 1, 2;
$$;
-- ===== 20260504143528_277321c5-a708-4a61-8434-ad5540c6d6af.sql =====
-- 1. Atualizar função do Grafos para filtrar apenas eventos oficiais (tabela events)
CREATE OR REPLACE FUNCTION public.grafos_event_aggregates()
 RETURNS TABLE(event_name text, channel text, volume bigint, conversion numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.event_name,
    CASE
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'meta|facebook|instagram|ads' THEN 'meta_ads'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'whats|wa' THEN 'whatsapp'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'mail' THEN 'email'
      ELSE 'other'
    END AS channel,
    SUM(COALESCE(p.quantity,1))::bigint,
    SUM(COALESCE(p.total_value,0))::numeric
  FROM public.crm_purchases p
  WHERE p.event_name IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.name = p.event_name)
  GROUP BY 1, 2;
$function$;

-- 2. Função para deletar órfãos em batches (evita timeout)
CREATE OR REPLACE FUNCTION public.delete_orphan_customers_batch(batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  PERFORM set_config('statement_timeout', '240000', true);

  WITH orphans AS (
    SELECT c.id
    FROM public.crm_customers c
    WHERE NOT EXISTS (SELECT 1 FROM public.crm_purchases p WHERE p.customer_id = c.id)
    LIMIT batch_size
  )
  DELETE FROM public.crm_customers
  WHERE id IN (SELECT id FROM orphans);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT COUNT(*) INTO v_remaining
  FROM public.crm_customers c
  WHERE NOT EXISTS (SELECT 1 FROM public.crm_purchases p WHERE p.customer_id = c.id);

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'remaining', v_remaining,
    'done', v_deleted = 0
  );
END;
$function$;
-- ===== 20260504145404_577e9e6b-34e4-4733-8574-6a05c7958c55.sql =====
CREATE OR REPLACE FUNCTION public.grafos_event_aggregates()
 RETURNS TABLE(event_name text, channel text, volume bigint, conversion numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.event_name,
    CASE
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'meta|facebook|instagram|ads' THEN 'meta_ads'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'whats|wa' THEN 'whatsapp'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'mail' THEN 'email'
      ELSE 'other'
    END AS channel,
    SUM(COALESCE(p.quantity,1))::bigint,
    SUM(COALESCE(p.total_value,0))::numeric
  FROM public.crm_purchases p
  WHERE p.event_name IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.name = p.event_name)
  GROUP BY 1, 2
  UNION ALL
  -- Eventos cadastrados sem compras: retorna linha placeholder com volume 0
  SELECT e.name, 'other'::text, 0::bigint, 0::numeric
  FROM public.events e
  WHERE NOT EXISTS (SELECT 1 FROM public.crm_purchases p WHERE p.event_name = e.name);
$function$;
-- ===== 20260504145841_4f648d38-7d21-4d0d-a7a3-c65ae02e26e4.sql =====
CREATE OR REPLACE FUNCTION public.grafos_event_aggregates()
 RETURNS TABLE(event_name text, channel text, volume bigint, conversion numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.event_name,
    CASE
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'meta|facebook|instagram|ads' THEN 'meta_ads'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'whats|wa' THEN 'whatsapp'
      WHEN LOWER(COALESCE(p.acquisition_channel,'')) ~ 'mail' THEN 'email'
      ELSE 'other'
    END AS channel,
    SUM(COALESCE(p.quantity,1))::bigint,
    SUM(COALESCE(p.total_value,0))::numeric
  FROM public.crm_purchases p
  WHERE p.event_name IS NOT NULL
    AND p.event_name NOT ILIKE '%maestria%'
  GROUP BY 1, 2;
$function$;
-- ===== 20260504163414_8e7bbd91-7c04-4e0a-a9b9-1a8d5ce8b354.sql =====
CREATE TABLE IF NOT EXISTS public.internal_page_state (
  page_key TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_page_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users can view page state" ON public.internal_page_state;
DROP POLICY IF EXISTS "Internal users can create page state" ON public.internal_page_state;
DROP POLICY IF EXISTS "Internal users can update page state" ON public.internal_page_state;
DROP POLICY IF EXISTS "Internal users can delete page state" ON public.internal_page_state;

CREATE POLICY "Internal users can view page state"
ON public.internal_page_state
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'partner'::app_role)
  OR public.has_role(auth.uid(), 'design'::app_role)
  OR public.has_role(auth.uid(), 'trafego'::app_role)
);

CREATE POLICY "Internal users can create page state"
ON public.internal_page_state
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'partner'::app_role)
  OR public.has_role(auth.uid(), 'design'::app_role)
  OR public.has_role(auth.uid(), 'trafego'::app_role)
);

CREATE POLICY "Internal users can update page state"
ON public.internal_page_state
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'partner'::app_role)
  OR public.has_role(auth.uid(), 'design'::app_role)
  OR public.has_role(auth.uid(), 'trafego'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'partner'::app_role)
  OR public.has_role(auth.uid(), 'design'::app_role)
  OR public.has_role(auth.uid(), 'trafego'::app_role)
);

CREATE POLICY "Internal users can delete page state"
ON public.internal_page_state
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'partner'::app_role)
);

CREATE OR REPLACE FUNCTION public.touch_internal_page_state_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_internal_page_state_updated_at ON public.internal_page_state;
CREATE TRIGGER touch_internal_page_state_updated_at
BEFORE UPDATE ON public.internal_page_state
FOR EACH ROW
EXECUTE FUNCTION public.touch_internal_page_state_updated_at();
-- ===== 20260515120000_lagun_events.sql =====
create table if not exists lagun_events (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  data date not null,
  dia_semana text not null,
  superticket_id text not null,
  superticket_token text not null,
  status text not null default 'upcoming', -- upcoming | past
  -- stats cached when event ends
  total_vendas int,
  receita numeric(10,2),
  participantes int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table lagun_events enable row level security;

create policy "Authenticated read lagun_events" on lagun_events
  for select to authenticated using (true);

create policy "Authenticated insert lagun_events" on lagun_events
  for insert to authenticated with check (true);

create policy "Authenticated update lagun_events" on lagun_events
  for update to authenticated using (true);

create policy "Authenticated delete lagun_events" on lagun_events
  for delete to authenticated using (true);

-- ===== 20260521200819_base_crm.sql =====
create table if not exists base_crm (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  documento text,
  telefone text,
  data_nascimento date,
  eventos text[] default '{}',
  total_eventos integer generated always as (array_length(eventos, 1)) stored,
  checkins_realizados integer default 0,
  checkins_nao_realizados integer default 0,
  created_at timestamptz default now()
);

create index if not exists base_crm_documento_idx on base_crm (documento) where documento is not null and documento != '';
create index if not exists base_crm_email_idx on base_crm (email) where email is not null and email != '';

alter table base_crm enable row level security;
create policy "authenticated read" on base_crm for select to authenticated using (true);
create policy "authenticated insert" on base_crm for insert to authenticated with check (true);
create policy "authenticated update" on base_crm for update to authenticated using (true);
create policy "authenticated delete" on base_crm for delete to authenticated using (true);

-- ===== 20260528180000_bt_auto_dispatch_var_count.sql =====
-- Adiciona contagem de variáveis no template para o auto-disparo
-- Evita enviar components para templates sem variáveis (ex: carrinho_aura)
alter table bt_auto_dispatch
  add column if not exists template_variable_count smallint not null default 0;

-- Atualiza registros existentes: carrinho_lebai tem {{1}}, carrinho_aura não tem
update bt_auto_dispatch set template_variable_count = 1 where template_name = 'carrinho_lebai';
update bt_auto_dispatch set template_variable_count = 0 where template_name = 'carrinho_aura';

-- ===== 20260528190000_link_clicks_rls.sql =====
-- Permite que qualquer visitante anônimo registre cliques na landing page
-- Sem isso, todos os inserts de link_clicks falham com 401 silencioso

-- Permitir INSERT para anon (visitantes da landing page)
create policy "allow anon insert link_clicks"
  on link_clicks
  for insert
  to anon
  with check (true);

-- Permitir SELECT para usuários autenticados (dashboard interno)
create policy "allow auth select link_clicks"
  on link_clicks
  for select
  to authenticated
  using (true);

-- ===== 20260710120000_sidebar_menu_settings.sql =====
-- Configuração de visibilidade dos itens do menu lateral (Admin > Configurações)
CREATE TABLE public.sidebar_menu_settings (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sidebar_menu_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sidebar settings"
  ON public.sidebar_menu_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update sidebar settings"
  ON public.sidebar_menu_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role::text = 'admin'
  ));

INSERT INTO public.sidebar_menu_settings (key, label) VALUES
  ('dashboard', 'Dashboard'),
  ('landing', 'Landing Page'),
  ('crm', 'CRM'),
  ('blueticket', 'Blueticket'),
  ('prive', 'Privê'),
  ('zig_tickets', 'Zig Tickets'),
  ('base', 'Base'),
  ('tarefas', 'Tarefas'),
  ('calendario', 'Calendário'),
  ('chat', 'Chat'),
  ('whatsapp', 'WhatsApp'),
  ('ads', 'Ads'),
  ('mailchimp', 'Mailchimp'),
  ('design', 'Design');

-- ===== 20260710130000_admin_view_all_users.sql =====
-- Permite que administradores vejam todos os perfis e cargos na tela Admin.
-- Sem isso, o RLS limita cada usuário a ver apenas a própria linha, então o
-- admin nunca via os outros usuários criados.

-- Função helper: verifica se o usuário atual é admin.
-- SECURITY DEFINER faz a consulta interna rodar sem RLS, evitando recursão
-- quando usada dentro da policy da própria tabela user_roles.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'admin'
  );
$$;

-- profiles: admin enxerga todos os perfis (soma-se à policy de "ver o próprio")
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

-- user_roles: admin enxerga todos os cargos (soma-se à policy de "ver os próprios")
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

-- ===== 20260710140000_user_menu_overrides.sql =====
-- Acessos de menu por usuário (Admin > Usuários > gerenciar usuário).
-- A visibilidade final de um item = sidebar_menu_settings.enabled AND override do usuário.
-- Ausência de linha = habilitado (default), igual ao padrão da config global.
CREATE TABLE IF NOT EXISTS public.user_menu_overrides (
  user_id uuid NOT NULL,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_menu_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own menu overrides" ON public.user_menu_overrides;
CREATE POLICY "Users can view own menu overrides"
  ON public.user_menu_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins manage menu overrides" ON public.user_menu_overrides;
CREATE POLICY "Admins manage menu overrides"
  ON public.user_menu_overrides FOR ALL
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ===== 20260710150000_fix_has_role_compat.sql =====
-- Correção estrutural: várias policies de RLS no projeto (upload de avatar,
-- anexos de tarefa, referências de criativos, clientes do CRM etc.) chamam
-- public.has_role(uuid, app_role) e/ou fazem cast '...'::app_role, mas o
-- banco live não tem o tipo app_role nem a função has_role — toda operação
-- protegida por essas policies falha silenciosamente.
--
-- Em vez de reescrever cada policy, criamos o tipo e as duas assinaturas de
-- has_role esperadas, delegando para user_roles.role (que no banco live é
-- text). Isso não altera nenhuma tabela nem policy existente.

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'partner', 'design', 'trafego');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Se o tipo já existia (ex: criado pela migration original só com
-- admin/partner), garante que os valores usados pelo app estão presentes.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'design';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trafego';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role::text
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  );
$$;

-- Função de trigger usada por várias tabelas para manter updated_at em dia.
-- Recriada aqui defensivamente (CREATE OR REPLACE é inofensivo se já existir).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- public.team_tasks não existia no banco live (a tela de Tarefas rodava
-- sobre uma tabela fantasma — por isso sempre listava vazio e toda
-- criação falhava). Criada aqui com o schema completo esperado pelo
-- frontend, incluindo event_id como uuid solto, SEM foreign key: a tela
-- de Tarefas lista eventos de public.lagun_events (tabela diferente da
-- que a versão antiga desta migration apontava) e ainda tem uma opção
-- fixa "Lagun" que não é uma linha real em nenhuma tabela — a resolução
-- do evento é feita inteiramente no client (getEvent()).
CREATE TABLE IF NOT EXISTS public.team_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pendente',
  priority text,
  assigned_to uuid,
  created_by uuid,
  attachments text[] DEFAULT '{}'::text[],
  due_date date,
  event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view tasks" ON public.team_tasks;
CREATE POLICY "Team can view tasks" ON public.team_tasks
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP POLICY IF EXISTS "Team can insert tasks" ON public.team_tasks;
CREATE POLICY "Team can insert tasks" ON public.team_tasks
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP POLICY IF EXISTS "Team can update tasks" ON public.team_tasks;
CREATE POLICY "Team can update tasks" ON public.team_tasks
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP POLICY IF EXISTS "Team can delete tasks" ON public.team_tasks;
CREATE POLICY "Team can delete tasks" ON public.team_tasks
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP TRIGGER IF EXISTS update_team_tasks_updated_at ON public.team_tasks;
CREATE TRIGGER update_team_tasks_updated_at
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Se a tabela já existisse com a FK antiga (apontando pra tabela errada),
-- remove — inofensivo se a coluna acabou de ser criada acima sem FK.
ALTER TABLE public.team_tasks DROP CONSTRAINT IF EXISTS team_tasks_event_id_fkey;

-- ===== 20260710160000_fix_design_attachments_bucket.sql =====
-- Anexos de tarefa usam o bucket design-attachments. As policies desse
-- bucket (e do event-avatars) dependiam de has_role(...::app_role), que só
-- passou a existir na migration anterior. Recriamos aqui pra garantir que
-- o bucket existe e que as policies usam a versão que já funciona.

INSERT INTO storage.buckets (id, name, public)
VALUES ('design-attachments', 'design-attachments', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-avatars', 'event-avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['design-attachments', 'event-avatars'] LOOP
    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can upload in %1$s" ON storage.objects;
      CREATE POLICY "Partners can upload in %1$s"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = %2$L AND (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin')));
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Anyone can view in %1$s" ON storage.objects;
      CREATE POLICY "Anyone can view in %1$s"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = %2$L);
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can update in %1$s" ON storage.objects;
      CREATE POLICY "Partners can update in %1$s"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = %2$L AND (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin')));
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can delete in %1$s" ON storage.objects;
      CREATE POLICY "Partners can delete in %1$s"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = %2$L AND (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin')));
    $P$, b, b);
  END LOOP;
END $$;

-- ===== 20260710170000_task_notifications.sql =====
-- Notificações in-app: sininho para quem recebe uma tarefa atribuída, e
-- para quem criou a tarefa quando ela é concluída pelo responsável.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  task_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Sem policy de INSERT: notificações só são criadas pelo trigger abaixo
-- (SECURITY DEFINER), nunca diretamente pelo client. Isso evita que um
-- usuário crie notificações falsas em nome de outro.

-- Dispara automaticamente ao atribuir ou concluir uma tarefa em team_tasks.
-- Assim nenhum caminho de código que edita team_tasks precisa lembrar de
-- notificar — é uma garantia do banco, não uma convenção do frontend.
CREATE OR REPLACE FUNCTION public.notify_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'Alguém') INTO actor_name
  FROM public.profiles WHERE id = auth.uid();

  -- Tarefa atribuída a alguém (na criação, ou quando o responsável muda)
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      NEW.assigned_to,
      'task_assigned',
      'Nova tarefa atribuída',
      actor_name || ' atribuiu "' || NEW.title || '" para você',
      NEW.id
    );
  END IF;

  -- Tarefa concluída: avisa quem criou (se não foi ele mesmo que concluiu)
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'finalizado'
     AND OLD.status IS DISTINCT FROM 'finalizado'
     AND NEW.created_by IS NOT NULL
     AND NEW.created_by <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      NEW.created_by,
      'task_completed',
      'Tarefa concluída',
      actor_name || ' concluiu "' || NEW.title || '"',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_team_tasks_notify ON public.team_tasks;
CREATE TRIGGER on_team_tasks_notify
  AFTER INSERT OR UPDATE ON public.team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_changes();

-- Permite o sino atualizar em tempo real (sem precisar dar F5)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== 20260710180000_fix_profiles_id_matches_auth_user.sql =====
-- O schema original de profiles tem `id` (PK própria, aleatória) separado
-- de `user_id` (FK pra auth.users). Mas todo o código atual (InternoAdmin,
-- InternoPerfil, as edge functions create-partner e manage-user) trata
-- profiles.id como se FOSSE o id do usuário autenticado — undo do drift
-- que aconteceu no banco do Lagun (lá corrigimos só via SQL solto no chat,
-- nunca virou migration; esta migration fecha essa lacuna pra qualquer
-- banco criado a partir do zero com este histórico, incluindo clones).
--
-- Ajusta o trigger de criação de perfil para gravar id = auth.users.id
-- diretamente, mantendo user_id preenchido igual (nada que já dependia
-- de user_id quebra).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, email, full_name)
  VALUES (NEW.id, NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Colunas que o Perfil usa e que só existiam via patch solto no Lagun
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS squad text;

-- Backfill: corrige linhas que já existam com id != user_id (idempotente;
-- em banco novo/vazio isso não encontra nenhuma linha e não faz nada)
UPDATE public.profiles SET id = user_id WHERE id <> user_id;

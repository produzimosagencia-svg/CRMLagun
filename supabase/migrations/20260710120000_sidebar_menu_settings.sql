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

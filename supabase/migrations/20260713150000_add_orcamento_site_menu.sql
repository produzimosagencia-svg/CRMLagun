-- Novo item de sidebar: "Orçamento de Site" (destaque para conversão).
-- Sem esta linha o item já aparece habilitado por padrão (isEnabled() trata
-- chave ausente como true), mas sem ela o toggle não aparece em
-- Admin > Configurações para poder ser desligado.
INSERT INTO public.sidebar_menu_settings (key, label) VALUES
  ('orcamento_site', 'Orçamento de Site')
ON CONFLICT (key) DO NOTHING;

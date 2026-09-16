-- Links rastreáveis individuais para os avisos operacionais FASTPASS.
INSERT INTO public.wa_tracking_links (token, campaign_key, template_name) VALUES
  ('fastpass-acesso-atualizado', 'fastpass', 'fastpass_acesso_atualizado_utilidade'),
  ('fastpass-canal-atualizado', 'fastpass', 'fastpass_canal_atualizado_utilidade'),
  ('fastpass-preferencia-ativa', 'fastpass', 'fastpass_preferencia_ativa_utilidade')
ON CONFLICT (token) DO UPDATE
  SET campaign_key = EXCLUDED.campaign_key,
      template_name = EXCLUDED.template_name;

-- Link único para o CTA do template FASTPASS. O botão aponta para o domínio
-- da Lagun e o redirecionamento segue para o grupo, sem expor o link do
-- WhatsApp no texto da mensagem.

ALTER TABLE public.wa_tracking_config
  DROP CONSTRAINT IF EXISTS wa_tracking_config_campaign_key_check;

ALTER TABLE public.wa_tracking_config
  ADD CONSTRAINT wa_tracking_config_campaign_key_check
  CHECK (campaign_key IN ('disparo', 'carrinho_abandonado', 'aniversario', 'estornos', 'fastpass'));

INSERT INTO public.wa_tracking_config (campaign_key, destination_url, enabled)
VALUES ('fastpass', 'https://chat.whatsapp.com/BZzLThl6JDf8cHWcr05ZTR', true)
ON CONFLICT (campaign_key) DO UPDATE
  SET destination_url = EXCLUDED.destination_url,
      enabled = EXCLUDED.enabled,
      updated_at = now();

INSERT INTO public.wa_tracking_links (token, campaign_key, template_name)
VALUES ('fastpass', 'fastpass', 'fastpass_convite_grupo_marketing')
ON CONFLICT (token) DO UPDATE
  SET campaign_key = EXCLUDED.campaign_key,
      template_name = EXCLUDED.template_name;

-- Disparo do Departamento (31/10): o botão do template aponta para /r/<token>
-- (um token por contato) e o link do texto para /r/departamento (cliques
-- somados). Os dois seguem para a Sympla com o desconto de 5% (código OKTRA).

ALTER TABLE public.wa_tracking_config
  DROP CONSTRAINT IF EXISTS wa_tracking_config_campaign_key_check;

ALTER TABLE public.wa_tracking_config
  ADD CONSTRAINT wa_tracking_config_campaign_key_check
  CHECK (campaign_key IN ('disparo', 'carrinho_abandonado', 'aniversario', 'estornos', 'fastpass', 'breno_bernardo', 'departamento'));

INSERT INTO public.wa_tracking_config (campaign_key, destination_url, enabled)
VALUES ('departamento', 'https://www.sympla.com.br/evento/departamento---lagun-vix/3601634?d=OKTRA', true)
ON CONFLICT (campaign_key) DO UPDATE
  SET destination_url = EXCLUDED.destination_url,
      enabled = EXCLUDED.enabled,
      updated_at = now();

INSERT INTO public.wa_tracking_links (token, campaign_key, template_name)
VALUES ('departamento', 'departamento', 'departamento_lagun_5off')
ON CONFLICT (token) DO NOTHING;

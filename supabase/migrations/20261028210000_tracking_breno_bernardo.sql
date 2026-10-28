-- Disparo do Breno & Bernardo (30/10): o botão do template aponta para
-- /r/<token> e o redirecionamento segue para a página do Zig com o cupom.
-- Cada contato recebe um token próprio, então dá pra saber quem clicou.

ALTER TABLE public.wa_tracking_config
  DROP CONSTRAINT IF EXISTS wa_tracking_config_campaign_key_check;

ALTER TABLE public.wa_tracking_config
  ADD CONSTRAINT wa_tracking_config_campaign_key_check
  CHECK (campaign_key IN ('disparo', 'carrinho_abandonado', 'aniversario', 'estornos', 'fastpass', 'breno_bernardo'));

INSERT INTO public.wa_tracking_config (campaign_key, destination_url, enabled)
VALUES ('breno_bernardo', 'https://zig.tickets/evento/breno-e-bernado-lagun?cupom=FASTPASS', true)
ON CONFLICT (campaign_key) DO UPDATE
  SET destination_url = EXCLUDED.destination_url,
      enabled = EXCLUDED.enabled,
      updated_at = now();

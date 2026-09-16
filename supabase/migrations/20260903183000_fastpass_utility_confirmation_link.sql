-- CTA estático do template de confirmação FASTPASS. Mantém o link do grupo
-- fora da mensagem e registra os acessos no rastreamento próprio da Lagun.
INSERT INTO public.wa_tracking_links (token, campaign_key, template_name)
VALUES ('fastpass-confirmacao', 'fastpass', 'fastpass_confirmacao_acesso_utilidade')
ON CONFLICT (token) DO UPDATE
  SET campaign_key = EXCLUDED.campaign_key,
      template_name = EXCLUDED.template_name;

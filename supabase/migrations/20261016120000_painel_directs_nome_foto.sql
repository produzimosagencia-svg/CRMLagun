-- Últimos directs com nome, @ e foto.
-- A versão anterior só lia o nome gravado na própria mensagem, que vem vazio
-- quando a Meta não devolve o perfil na hora, e nem trazia a foto. Agora busca
-- o que já se sabe da pessoa em qualquer mensagem dela, no ig_contacts e nos
-- comentários. O ID numérico do Instagram nunca vale como nome.
-- Muda o retorno (coluna avatar), por isso o DROP antes.

DROP FUNCTION IF EXISTS public.painel_ultimos_directs(integer);

CREATE FUNCTION public.painel_ultimos_directs(p_limite integer DEFAULT 8)
RETURNS TABLE (texto text, autor text, arroba text, avatar text, quando timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH ultimos AS (
    SELECT m.phone, m.message_text, m.contact_name, m.contact_username, m.contact_avatar, m."timestamp"
    FROM whatsapp_messages m
    WHERE m.channel = 'instagram' AND m.direction = 'incoming'
      AND coalesce(m.message_text, '') <> ''
      AND regexp_replace(m.message_text, '[^[:alnum:]]', '', 'g') <> ''
    ORDER BY m."timestamp" DESC
    LIMIT least(greatest(coalesce(p_limite, 8), 1), 50)
  )
  SELECT
    u.message_text,
    coalesce(
      CASE WHEN btrim(u.contact_name) !~ '^[0-9]*$' AND u.contact_name <> u.phone THEN btrim(u.contact_name) END,
      (SELECT btrim(m2.contact_name) FROM whatsapp_messages m2
        WHERE m2.channel = 'instagram' AND m2.phone = u.phone
          AND btrim(coalesce(m2.contact_name, '')) !~ '^[0-9]*$' AND m2.contact_name <> m2.phone
        ORDER BY m2."timestamp" DESC LIMIT 1)
    ),
    coalesce(
      nullif(ltrim(btrim(u.contact_username), '@'), ''),
      (SELECT nullif(ltrim(btrim(m2.contact_username), '@'), '') FROM whatsapp_messages m2
        WHERE m2.channel = 'instagram' AND m2.phone = u.phone AND nullif(btrim(m2.contact_username), '') IS NOT NULL
        ORDER BY m2."timestamp" DESC LIMIT 1),
      (SELECT nullif(ltrim(btrim(c.username), '@'), '') FROM ig_contacts c WHERE c.igsid = u.phone),
      (SELECT nullif(e.raw->'value'->'from'->>'username', '') FROM ig_events e
        WHERE e.event_type = 'comment' AND e.igsid = u.phone
          AND e.created_at > now() - interval '180 days'
          AND nullif(e.raw->'value'->'from'->>'username', '') IS NOT NULL
        ORDER BY e.created_at DESC LIMIT 1)
    ),
    coalesce(
      nullif(u.contact_avatar, ''),
      (SELECT m2.contact_avatar FROM whatsapp_messages m2
        WHERE m2.channel = 'instagram' AND m2.phone = u.phone AND nullif(m2.contact_avatar, '') IS NOT NULL
        ORDER BY m2."timestamp" DESC LIMIT 1)
    ),
    u."timestamp"
  FROM ultimos u
  ORDER BY u."timestamp" DESC;
$$;

REVOKE ALL ON FUNCTION public.painel_ultimos_directs(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.painel_ultimos_directs(integer) TO authenticated;

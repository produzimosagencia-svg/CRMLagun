-- ============================================================================
-- Resumo do dashboard de redes sociais em uma única chamada.
--
-- Motivo: o PostgREST está com max_rows = 1000, então contar no cliente
-- (buscar as linhas e medir o array) dava número errado — 19 mil cliques
-- viravam mil, e a série diária ficava furada. Aqui a agregação é feita no
-- banco e volta pronta.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.painel_social_resumo(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH inicio AS (SELECT (now() - make_interval(days => p_dias)) AS t),
  dias AS (
    SELECT generate_series((now() - make_interval(days => p_dias - 1))::date, now()::date, '1 day')::date AS dia
  ),
  dms AS (
    SELECT timestamp::date AS dia, count(*) AS n
    FROM whatsapp_messages, inicio
    WHERE channel = 'instagram' AND direction = 'incoming' AND timestamp >= inicio.t
    GROUP BY 1
  ),
  cliques AS (
    SELECT clicked_at::date AS dia, count(*) AS n
    FROM link_clicks, inicio WHERE clicked_at >= inicio.t GROUP BY 1
  ),
  por_evento AS (
    SELECT coalesce(e.nome, 'Outros') AS nome, count(*) AS n
    FROM link_clicks c LEFT JOIN lagun_events e ON e.id = c.event_id, inicio
    WHERE c.clicked_at >= inicio.t GROUP BY 1 ORDER BY 2 DESC LIMIT 6
  )
  SELECT jsonb_build_object(
    'dms',         (SELECT count(*) FROM whatsapp_messages, inicio WHERE channel='instagram' AND direction='incoming' AND timestamp >= inicio.t),
    'comentarios', (SELECT count(*) FROM ig_events, inicio WHERE event_type='comment' AND created_at >= inicio.t),
    'cliques',     (SELECT count(*) FROM link_clicks, inicio WHERE clicked_at >= inicio.t),
    'serie', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'dia', to_char(d.dia, 'DD/MM'),
        'dms', coalesce(dm.n, 0),
        'cliques', coalesce(ck.n, 0)
      ) ORDER BY d.dia), '[]'::jsonb)
      FROM dias d LEFT JOIN dms dm ON dm.dia = d.dia LEFT JOIN cliques ck ON ck.dia = d.dia
    ),
    'por_evento', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'cliques', n)), '[]'::jsonb) FROM por_evento),
    'automacoes', jsonb_build_object(
      'ativas',   (SELECT count(*) FROM ig_automations WHERE status = 'active'),
      'disparos', (SELECT count(*) FROM ig_events WHERE automation_id IS NOT NULL),
      'dms',      (SELECT count(*) FROM ig_queue WHERE status='sent' AND send_type <> 'public_reply'),
      'cliques',  (SELECT coalesce(sum(clicks), 0) FROM ig_links)
    )
  );
$$;

-- Últimos comentários, já sem os que são só emoji/pontuação (não dizem nada).
CREATE OR REPLACE FUNCTION public.painel_ultimos_comentarios(p_limite integer DEFAULT 8)
RETURNS TABLE (texto text, autor text, quando timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    raw->'value'->>'text'               AS texto,
    raw->'value'->'from'->>'username'   AS autor,
    created_at                          AS quando
  FROM ig_events
  WHERE event_type = 'comment'
    AND coalesce(raw->'value'->>'text', '') <> ''
    -- descarta emoji puro: sobra alguma letra ou número depois de limpar
    AND regexp_replace(raw->'value'->>'text', '[^[:alnum:]]', '', 'g') <> ''
  ORDER BY created_at DESC
  LIMIT p_limite;
$$;

-- Últimos directs recebidos (texto), com o @ quando já conhecido.
CREATE OR REPLACE FUNCTION public.painel_ultimos_directs(p_limite integer DEFAULT 8)
RETURNS TABLE (texto text, autor text, arroba text, quando timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT m.message_text, m.contact_name, m.contact_username, m.timestamp
  FROM whatsapp_messages m
  WHERE m.channel = 'instagram' AND m.direction = 'incoming'
    AND coalesce(m.message_text, '') <> ''
    AND regexp_replace(m.message_text, '[^[:alnum:]]', '', 'g') <> ''
  ORDER BY m.timestamp DESC
  LIMIT p_limite;
$$;

GRANT EXECUTE ON FUNCTION public.painel_social_resumo(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_ultimos_comentarios(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_ultimos_directs(integer) TO authenticated;

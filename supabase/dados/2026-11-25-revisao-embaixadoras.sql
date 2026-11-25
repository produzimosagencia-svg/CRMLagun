-- Conta de revisão da Apple no Programa de Embaixadoras (2026-11-25).
-- A conta de revisão (app_metadata.revisao = true, telefone no secret APP_DEMO_TELEFONE) vira
-- embaixadora ativa e operadora do programa, só com dados fictícios marcados revisao = true.
-- A operação real não vê nada disto (migração 20261125120000). Pode rodar de novo sem duplicar.
do $$
declare
  rev uuid := (select id from auth.users where raw_app_meta_data->>'revisao' = 'true' and email like 'revisao.%@app.lagunvitoria.com.br' limit 1);
  tel text;
  f1 uuid := '0f1c0f1c-0000-4000-8000-00000000a001';
  f2 uuid := '0f1c0f1c-0000-4000-8000-00000000a002';
  a_story uuid; a_post uuid; a_presenca uuid; a_amiga uuid; a_video uuid;
  i_kit uuid; s1 uuid; s2 uuid;
begin
  if rev is null then raise exception 'Conta de revisão não encontrada.'; end if;
  select telefone into tel from public.profiles where id = rev;

  update public.profiles set is_amb_operator = true where id = rev;
  insert into public.user_roles (user_id, role) values (rev, 'ambassador') on conflict do nothing;

  insert into public.ambassadors (user_id, nome, phone, birth_date, cpf, pix_key, instagram, instagram_verified, level, status, joined_at, approved_at, card_code, revisao)
  values (rev, 'Bia Revisão', coalesce(tel, '5527900000101'), '1998-03-14', '11144477735', 'bia.revisao@exemplo.com', '@bia.revisao', true, 'ouro', 'active', now() - interval '120 days', now() - interval '120 days', 'LGN-9001', true)
  on conflict (user_id) do update set status = 'active', level = 'ouro', revisao = true;

  -- Duas candidatas fictícias para a fila de cadastros do operador.
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (f1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revisao.candidata1@app.lagunvitoria.com.br', '{"revisao": true}', '{}', now(), now()),
         (f2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'revisao.candidata2@app.lagunvitoria.com.br', '{"revisao": true}', '{}', now(), now())
  on conflict (id) do nothing;
  insert into public.ambassadors (user_id, nome, phone, birth_date, cpf, pix_key, instagram, instagram_followers, referred_by, status, revisao)
  values (f1, 'Carla Exemplo', '5527900000102', '2000-07-02', '52998224725', 'carla@exemplo.com', '@carla.exemplo', 2400, rev, 'pending', true),
         (f2, 'Duda Teste', '5527900000103', '1999-11-20', '15350946056', null, '@duda.teste', 860, null, 'pending', true)
  on conflict (user_id) do nothing;

  -- Atividades, loja e feed só da revisão (só cria se ainda não existir).
  if not exists (select 1 from public.amb_activities where revisao) then
    insert into public.amb_activities (event_id, type, title, brief, points, limit_rule, revisao) values
      (null, 'story', 'Story com a programação da semana', 'Poste um story marcando @lagun.vix com a arte da semana. Envie o print do story e o print das visualizações depois de 24h.', 120, '1/24h', true) returning id into a_story;
    insert into public.amb_activities (event_id, type, title, brief, points, limit_rule, revisao) values
      (null, 'post', 'Post no feed com a sua noite na Lagun', 'Foto sua na casa, marcando @lagun.vix na legenda. Envie o print do post publicado.', 300, '1/event', true) returning id into a_post;
    insert into public.amb_activities (event_id, type, title, brief, points, limit_rule, revisao) values
      ((select id from public.lagun_events where data >= current_date order by data desc limit 1), 'presence', 'Presença na noite', 'Entre pelo fast-pass mostrando o QR do seu cartão na portaria.', 150, '1/event', true) returning id into a_presenca;
    insert into public.amb_activities (event_id, type, title, brief, points, limit_rule, revisao) values
      (null, 'referral', 'Traga uma amiga nova', 'Sua amiga faz o cadastro dizendo que foi indicada por você. Os pontos entram quando ela for aprovada.', 400, null, true) returning id into a_amiga;
    insert into public.amb_activities (event_id, type, title, brief, points, limit_rule, revisao) values
      (null, 'video', 'Reels da pista', 'Vídeo curto da pista ou do DJ, marcando @lagun.vix. Envie o print do Reels publicado.', 500, '1/event', true) returning id into a_video;

    insert into public.amb_store_items (title, subtitle, cost, stock, min_level, category, featured, revisao) values
      ('Jantar para 2 no lounge', 'Qualquer noite do mês, com espumante', 900, 3, 'prata', 'exp', true, true),
      ('Open bar da noite', 'Uma vez por mês', 600, null, 'prata', 'casa', false, true),
      ('Lounge para 4', 'Sinal da reserva coberto', 1200, null, 'prata', 'casa', false, true),
      ('Day spa no fim de semana', 'Parceiro Lagun, 2 vagas', 2400, 2, 'ouro', 'exp', false, true),
      ('Cartão Black', 'Fila zero e 2 convites por noite', 2400, null, 'ouro', 'status', false, true);
    insert into public.amb_store_items (title, subtitle, cost, stock, min_level, category, featured, revisao) values
      ('Kit Lagun', 'Camiseta e boné', 400, null, 'prata', 'casa', false, true) returning id into i_kit;

    insert into public.amb_feed_posts (title, body, tag, cta_label, cta_target, created_by, revisao) values
      ('Pontos em dobro no Reels da pista', 'Reels marcando a casa vale o dobro nesta semana. Arte e referência no detalhe da atividade.', 'Nova atividade', 'Ver atividades', '/e/atividades', rev, true),
      ('Resgate da semana', 'Duas embaixadoras trocaram pontos pelo jantar no lounge. Ainda tem 3 no lote.', 'Loja', 'Ver na loja', '/e/loja', rev, true);

    -- Histórico da Bia: duas comprovações aprovadas (com lote de pontos), uma em análise e um resgate.
    insert into public.amb_submissions (ambassador_id, activity_id, proofs, status, reviewed_by, reviewed_at, created_at)
      values (rev, a_post, '{}', 'approved', rev, now() - interval '20 days', now() - interval '21 days') returning id into s1;
    insert into public.amb_submissions (ambassador_id, activity_id, proofs, status, reviewed_by, reviewed_at, created_at)
      values (rev, a_video, '{}', 'approved', rev, now() - interval '6 days', now() - interval '7 days') returning id into s2;
    insert into public.amb_point_lots (ambassador_id, source_submission, points, remaining, earned_at, expires_at) values
      (rev, s1, 300, 300, now() - interval '20 days', now() + interval '70 days'),
      (rev, s2, 500, 500, now() - interval '6 days', now() + interval '84 days');
    insert into public.amb_point_lots (ambassador_id, points, remaining, earned_at, expires_at) values
      (rev, 800, 400, now() - interval '40 days', now() + interval '50 days');
    insert into public.amb_redemptions (ambassador_id, item_id, cost, status, created_at) values (rev, i_kit, 400, 'reserved', now() - interval '3 days');
    insert into public.amb_submissions (ambassador_id, activity_id, proofs, status, created_at)
      values (f1, a_story, '{}', 'pending', now() - interval '2 hours');
  end if;
end $$;

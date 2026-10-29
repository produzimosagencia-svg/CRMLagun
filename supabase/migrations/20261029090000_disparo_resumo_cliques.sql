-- Resumo do disparo com cliques no link rastreável (wa_tracking_links criado
-- no envio de cada contato, mesmo telefone e template) e quem respondeu no
-- chat depois do envio. Usado pelo Status e pelo relatório em PDF do disparo.
create or replace function public.whatsapp_disparo_resumo(p_job uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with j as (select * from whatsapp_disparo_jobs where id = p_job),
  i as (
    select i.phone, i.enviado_em, i.status as fila, i.erro, m.status as meta, m.raw_payload->'errors'->0 as err
      from whatsapp_disparo_itens i
      left join whatsapp_messages m on m.wamid = i.wamid and i.wamid is not null
     where i.job_id = p_job
  ), falhas as (
    select coalesce(nullif(err->>'title', ''), nullif(regexp_replace(coalesce(erro, ''), '^\[\d+\]\s*', ''), ''), 'Falha informada pela Meta') as motivo,
           coalesce(err->>'code', substring(erro from '^\[(\d+)\]')) as code, count(*) as n
      from i where fila = 'falhou' or meta = 'failed'
     group by 1, 2 order by 3 desc limit 5
  ), links as (
    select l.id from wa_tracking_links l, j
     where l.template_name = j.template_name and l.phone is not null
       and l.sent_at >= j.created_at and l.phone in (select phone from i)
  ), cliques as (
    select c.link_id from wa_tracking_clicks c where c.link_id in (select id from links)
  )
  select jsonb_build_object(
    'job', (select to_jsonb(j) - 'template_components' from j),
    'pendentes', (select count(*) from i where fila in ('pendente', 'enviando')),
    'aceitos', (select count(*) from i where fila = 'enviado' and meta is distinct from 'failed'),
    'entregues', (select count(*) from i where fila = 'enviado' and meta in ('delivered', 'read')),
    'lidos', (select count(*) from i where fila = 'enviado' and meta = 'read'),
    'falhas', (select count(*) from i where fila = 'falhou' or meta = 'failed'),
    'clicaram', (select count(distinct link_id) from cliques),
    'cliques', (select count(*) from cliques),
    'responderam', (select count(distinct right(regexp_replace(w.phone, '\D', '', 'g'), 8))
                      from whatsapp_messages w, j
                     where w.direction = 'incoming' and w.timestamp >= coalesce(j.iniciado_em, j.created_at)
                       and right(regexp_replace(w.phone, '\D', '', 'g'), 8) in (select right(phone, 8) from i)),
    'inicio', (select min(enviado_em) from i),
    'fim', (select max(enviado_em) from i),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'code', code, 'n', n,
                 'conta', whatsapp_erro_da_conta(code))) from falhas), '[]'::jsonb)
  )
  where auth.uid() is not null
$$;

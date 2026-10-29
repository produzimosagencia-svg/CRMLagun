-- Disparo de WhatsApp em fila no servidor. Antes o navegador mandava os lotes
-- um a um: fechar a aba parava o disparo, o contador só andava no fim de cada
-- lote e as falhas que a Meta devolve depois (pelo webhook) não apareciam.
--
-- Agora a tela cria o disparo (job + contatos) e a edge function
-- whatsapp-disparo-worker envia em lotes, chamada na hora, por ela mesma
-- enquanto houver fila e por um cron de 1 min. O progresso sai da RPC
-- whatsapp_disparo_resumo, que junta a fila com o status que o webhook grava
-- em whatsapp_messages (entregue, lido, falhou). Falha da conta (pagamento
-- pendente, conta bloqueada, limite de spam) pausa o disparo com o motivo.

create table if not exists public.whatsapp_disparo_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  phone_number_id text not null,
  template_name text not null,
  template_language text not null default 'pt_BR',
  template_category text not null default 'MARKETING',
  template_components jsonb not null default '[]'::jsonb,
  template_variable_count int,
  template_parameter_format text not null default 'POSITIONAL',
  header_image_url text,
  tracking_campaign text,
  total int not null default 0,
  status text not null default 'na_fila'
    check (status in ('na_fila', 'enviando', 'concluido', 'pausado', 'cancelado')),
  motivo_pausa text,
  trava_ate timestamptz,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.whatsapp_disparo_itens (
  job_id uuid not null references public.whatsapp_disparo_jobs(id) on delete cascade,
  ordem int not null,
  phone text not null,
  name text,
  email text,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'falhou')),
  wamid text,
  erro text,
  enviado_em timestamptz,
  primary key (job_id, ordem)
);
create index if not exists whatsapp_disparo_itens_fila on public.whatsapp_disparo_itens (job_id, status, ordem);
create index if not exists whatsapp_disparo_itens_wamid on public.whatsapp_disparo_itens (wamid) where wamid is not null;
create index if not exists whatsapp_messages_wamid on public.whatsapp_messages (wamid) where wamid is not null;

alter table public.whatsapp_disparo_jobs enable row level security;
alter table public.whatsapp_disparo_itens enable row level security;
drop policy if exists "Equipe lê disparos" on public.whatsapp_disparo_jobs;
create policy "Equipe lê disparos" on public.whatsapp_disparo_jobs for select to authenticated using (true);
drop policy if exists "Equipe lê itens do disparo" on public.whatsapp_disparo_itens;
create policy "Equipe lê itens do disparo" on public.whatsapp_disparo_itens for select to authenticated using (true);

-- Códigos da Meta que são problema da conta, não do contato: pausam o disparo.
create or replace function public.whatsapp_erro_da_conta(p_code text)
returns text language sql immutable as $$
  select case p_code
    when '131042' then 'A conta do WhatsApp tem pagamento pendente na Meta. Regularize a cobrança no Business Manager e retome o disparo.'
    when '131031' then 'A conta do WhatsApp está bloqueada pela Meta. Veja o aviso no Business Manager antes de retomar.'
    when '131048' then 'A Meta limitou os envios por denúncias de spam. Espere algumas horas antes de retomar.'
    when '368'    then 'A Meta bloqueou temporariamente a conta por violação de política. Veja o aviso no Business Manager.'
    when '132001' then 'O template não existe ou ainda não foi aprovado nesse idioma.'
    when '132015' then 'O template foi pausado pela Meta por baixa qualidade.'
    when '132016' then 'O template foi desativado pela Meta por baixa qualidade.'
    else null end
$$;

-- Cria o disparo com todos os contatos numa transação só.
create or replace function public.whatsapp_criar_disparo(p_job jsonb, p_contatos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  insert into whatsapp_disparo_jobs (created_by, phone_number_id, template_name, template_language, template_category,
    template_components, template_variable_count, template_parameter_format, header_image_url, tracking_campaign, total)
  values (auth.uid(), p_job->>'phone_number_id', p_job->>'template_name', coalesce(p_job->>'template_language', 'pt_BR'),
    coalesce(p_job->>'template_category', 'MARKETING'), coalesce(p_job->'template_components', '[]'::jsonb),
    (p_job->>'template_variable_count')::int, coalesce(p_job->>'template_parameter_format', 'POSITIONAL'),
    nullif(p_job->>'header_image_url', ''), nullif(p_job->>'tracking_campaign', ''), jsonb_array_length(p_contatos))
  returning id into v_id;
  insert into whatsapp_disparo_itens (job_id, ordem, phone, name, email)
  select v_id, (c.ord - 1)::int, c.val->>'phone', nullif(c.val->>'name', ''), nullif(c.val->>'email', '')
    from jsonb_array_elements(p_contatos) with ordinality as c(val, ord)
   where coalesce(c.val->>'phone', '') <> '';
  update whatsapp_disparo_jobs set total = (select count(*) from whatsapp_disparo_itens where job_id = v_id) where id = v_id;
  return v_id;
end $$;
grant execute on function public.whatsapp_criar_disparo(jsonb, jsonb) to authenticated;

-- Pausar, retomar e cancelar. Retomar devolve para a fila quem falhou por
-- problema da conta (ex.: pagamento pendente), para tentar de novo.
create or replace function public.whatsapp_controlar_disparo(p_job uuid, p_acao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  if p_acao = 'pausar' then
    update whatsapp_disparo_jobs set status = 'pausado', motivo_pausa = 'Pausado pela equipe.', atualizado_em = now()
     where id = p_job and status in ('na_fila', 'enviando');
  elsif p_acao = 'retomar' then
    update whatsapp_disparo_itens i set status = 'pendente', wamid = null, erro = null, enviado_em = null
     where i.job_id = p_job and (
       i.status = 'enviando'
       or (i.status = 'falhou' and whatsapp_erro_da_conta(substring(i.erro from '^\[(\d+)\]')) is not null)
       or exists (select 1 from whatsapp_messages m where m.wamid = i.wamid and m.status = 'failed'
                   and whatsapp_erro_da_conta(m.raw_payload->'errors'->0->>'code') is not null));
    update whatsapp_disparo_jobs set status = 'na_fila', motivo_pausa = null, trava_ate = null, concluido_em = null, atualizado_em = now()
     where id = p_job and status in ('pausado', 'concluido');
  elsif p_acao = 'cancelar' then
    update whatsapp_disparo_jobs set status = 'cancelado', concluido_em = now(), atualizado_em = now()
     where id = p_job and status in ('na_fila', 'enviando', 'pausado');
  else
    raise exception 'ação inválida';
  end if;
end $$;
grant execute on function public.whatsapp_controlar_disparo(uuid, text) to authenticated;

-- Progresso do disparo: fila + status devolvido pela Meta.
create or replace function public.whatsapp_disparo_resumo(p_job uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with i as (
    select i.status as fila, i.erro, m.status as meta, m.raw_payload->'errors'->0 as err
      from whatsapp_disparo_itens i
      left join whatsapp_messages m on m.wamid = i.wamid and i.wamid is not null
     where i.job_id = p_job
  ), falhas as (
    select coalesce(nullif(err->>'title', ''), nullif(regexp_replace(coalesce(erro, ''), '^\[\d+\]\s*', ''), ''), 'Falha informada pela Meta') as motivo,
           coalesce(err->>'code', substring(erro from '^\[(\d+)\]')) as code, count(*) as n
      from i where fila = 'falhou' or meta = 'failed'
     group by 1, 2 order by 3 desc limit 5
  )
  select jsonb_build_object(
    'job', (select to_jsonb(j) - 'template_components' from whatsapp_disparo_jobs j where j.id = p_job),
    'pendentes', (select count(*) from i where fila in ('pendente', 'enviando')),
    'aceitos', (select count(*) from i where fila = 'enviado' and meta is distinct from 'failed'),
    'entregues', (select count(*) from i where fila = 'enviado' and meta in ('delivered', 'read')),
    'lidos', (select count(*) from i where fila = 'enviado' and meta = 'read'),
    'falhas', (select count(*) from i where fila = 'falhou' or meta = 'failed'),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'code', code, 'n', n,
                 'conta', whatsapp_erro_da_conta(code))) from falhas), '[]'::jsonb)
  )
  where auth.uid() is not null
$$;
grant execute on function public.whatsapp_disparo_resumo(uuid) to authenticated;

-- Worker: pega um disparo da fila com trava de 2 min (dois workers ao mesmo
-- tempo não mandam o mesmo lote) e reserva o próximo lote de contatos.
create or replace function public.whatsapp_disparo_pegar(p_lote int default 40)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_job whatsapp_disparo_jobs; v_itens jsonb;
begin
  update whatsapp_disparo_jobs j set status = 'enviando', trava_ate = now() + interval '2 minutes',
         iniciado_em = coalesce(j.iniciado_em, now()), atualizado_em = now()
   where j.id = (select id from whatsapp_disparo_jobs
                  where status in ('na_fila', 'enviando') and (trava_ate is null or trava_ate < now())
                  order by created_at limit 1 for update skip locked)
  returning * into v_job;
  if v_job.id is null then return null; end if;
  -- Lote anterior que ficou pela metade (worker caiu): volta para a fila.
  update whatsapp_disparo_itens set status = 'pendente'
   where job_id = v_job.id and status = 'enviando' and wamid is null;
  with prox as (
    select ordem from whatsapp_disparo_itens
     where job_id = v_job.id and status = 'pendente' order by ordem limit p_lote for update skip locked
  )
  update whatsapp_disparo_itens i set status = 'enviando' from prox
   where i.job_id = v_job.id and i.ordem = prox.ordem;
  select coalesce(jsonb_agg(jsonb_build_object('ordem', ordem, 'phone', phone, 'name', name, 'email', email) order by ordem), '[]'::jsonb)
    into v_itens from whatsapp_disparo_itens where job_id = v_job.id and status = 'enviando';
  return jsonb_build_object('job', to_jsonb(v_job), 'itens', v_itens);
end $$;
revoke all on function public.whatsapp_disparo_pegar(int) from public, anon, authenticated;

-- Falha da conta já devolvida pela Meta neste disparo (3 ou mais): o motivo.
create or replace function public.whatsapp_disparo_erro_conta(p_job uuid)
returns text language sql stable security definer set search_path = public as $$
  select whatsapp_erro_da_conta(code) from (
    select coalesce(m.raw_payload->'errors'->0->>'code', substring(i.erro from '^\[(\d+)\]')) as code
      from whatsapp_disparo_itens i left join whatsapp_messages m on m.wamid = i.wamid and i.wamid is not null
     where i.job_id = p_job and (i.status = 'falhou' or m.status = 'failed')
  ) f
  where whatsapp_erro_da_conta(code) is not null
  group by code having count(*) >= 3
  order by count(*) desc limit 1
$$;
revoke all on function public.whatsapp_disparo_erro_conta(uuid) from public, anon, authenticated;

-- Worker de 1 em 1 minuto enquanto houver fila (a tela e o próprio worker
-- também o chamam na hora).
select cron.unschedule('whatsapp-disparo-worker')
  where exists (select 1 from cron.job where jobname = 'whatsapp-disparo-worker');
select cron.schedule('whatsapp-disparo-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/whatsapp-disparo-worker',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 5000)
  where exists (select 1 from public.whatsapp_disparo_jobs where status in ('na_fila', 'enviando'));
$$);

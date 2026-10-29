-- Disparos de WhatsApp vinculados aos eventos, para o custo de marketing do
-- dashboard do evento. O histórico (whatsapp_messages) não guarda um id de
-- disparo e o webhook sobrescreve raw_payload, então um disparo é o grupo de
-- templates enviados no mesmo dia (horário de Brasília) com a mesma primeira
-- linha. Grupos com menos de 5 mensagens (resumos internos, testes) ficam de fora.

create table if not exists public.lagun_event_disparos (
  dia date not null,
  titulo text not null,
  event_id uuid not null references public.lagun_events(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (dia, titulo)
);
create index if not exists lagun_event_disparos_evento on public.lagun_event_disparos (event_id);

alter table public.lagun_event_disparos enable row level security;
drop policy if exists "Equipe gerencia lagun_event_disparos" on public.lagun_event_disparos;
create policy "Equipe gerencia lagun_event_disparos" on public.lagun_event_disparos
  for all to authenticated using (true) with check (true);

create or replace function public.whatsapp_disparos(p_desde date default null)
returns table (dia date, titulo text, categoria text, enviados bigint, falhas bigint, event_id uuid)
language sql stable set search_path = public as $$
  with m as (
    select (w.timestamp at time zone 'America/Sao_Paulo')::date as dia,
           left(trim(split_part(coalesce(w.message_text, ''), E'\n', 1)), 120) as titulo,
           coalesce(upper(w.template_category), 'MARKETING') as categoria,
           w.status
      from whatsapp_messages w
     where w.direction = 'outgoing' and w.message_type = 'template'
       and (p_desde is null or w.timestamp >= p_desde::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(w.message_text, '') not like '[Carrinho abandonado]%'
       and coalesce(w.message_text, '') not like '[Estorno]%'
       and coalesce(w.message_text, '') not like '[Auto-disparo] Falha%'
  )
  select m.dia, m.titulo, max(m.categoria), count(*) filter (where m.status is distinct from 'failed'),
         count(*) filter (where m.status = 'failed'), d.event_id
    from m left join lagun_event_disparos d on d.dia = m.dia and d.titulo = m.titulo
   where m.titulo <> ''
   group by m.dia, m.titulo, d.event_id
  having count(*) >= 5
   order by m.dia desc, count(*) desc
$$;
grant execute on function public.whatsapp_disparos(date) to authenticated;

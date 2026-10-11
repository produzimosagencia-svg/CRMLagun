-- Aviso de tarefa no WhatsApp (edge function tarefas-notificar).
--
-- • Quando uma tarefa ganha responsável (criada já atribuída ou atribuída
--   depois), o responsável recebe o template `tarefa_nova` com quem pediu,
--   evento, prazo, botão "Abrir tarefa" e botão "Já fiz".
-- • Lembrete (`tarefa_lembrete`): às 9h de Brasília, para tarefa pendente com
--   prazo amanhã, hoje ou já vencido; um por dia enquanto estiver pendente.
-- • "Já fiz" chega pelo whatsapp-webhook e marca a tarefa como finalizada.
--
-- Precisa do telefone no perfil do usuário (profiles.telefone, só dígitos
-- com 55). Sem telefone, nada é enviado.

alter table public.profiles
  add column if not exists telefone text;

-- Histórico dos avisos: evita repetir no mesmo dia e mostra o que saiu.
create table if not exists public.team_task_notificacoes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  tipo text not null check (tipo in ('nova', 'lembrete', 'concluida')),
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  telefone text not null,
  status text not null default 'sent',
  wamid text,
  erro text,
  created_at timestamptz not null default now()
);

create unique index if not exists team_task_notificacoes_unica
  on public.team_task_notificacoes (task_id, tipo, dia, telefone);

alter table public.team_task_notificacoes enable row level security;

create policy "Equipe lê team_task_notificacoes" on public.team_task_notificacoes
  for select to authenticated using (true);

-- Gatilho: tarefa com responsável novo → avisa (pela edge function, sem esperar).
create or replace function public.tarefa_avisar_responsavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  perform net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/tarefas-notificar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('tipo', 'nova', 'task_id', new.id),
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

drop trigger if exists team_tasks_avisar_responsavel on public.team_tasks;
create trigger team_tasks_avisar_responsavel
  after insert or update of assigned_to on public.team_tasks
  for each row execute function public.tarefa_avisar_responsavel();

-- Lembretes: 12:00 UTC = 9h em Brasília.
select cron.unschedule('tarefas-lembrete')
  where exists (select 1 from cron.job where jobname = 'tarefas-lembrete');
select cron.schedule('tarefas-lembrete', '0 12 * * *', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/tarefas-notificar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"tipo": "lembretes", "source": "cron"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

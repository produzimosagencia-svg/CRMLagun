-- Checklist (subtarefas) dentro de uma tarefa do time.
-- Cada item: { "id": uuid em texto, "text": string, "done": boolean }.
-- Coluna nova com padrão vazio: tarefas existentes não mudam e o app antigo
-- continua funcionando, porque ele não lê nem grava este campo.
alter table public.team_tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;

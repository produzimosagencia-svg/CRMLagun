-- Correção estrutural: várias policies de RLS no projeto (upload de avatar,
-- anexos de tarefa, referências de criativos, clientes do CRM etc.) chamam
-- public.has_role(uuid, app_role) e/ou fazem cast '...'::app_role, mas o
-- banco live não tem o tipo app_role nem a função has_role — toda operação
-- protegida por essas policies falha silenciosamente.
--
-- Em vez de reescrever cada policy, criamos o tipo e as duas assinaturas de
-- has_role esperadas, delegando para user_roles.role (que no banco live é
-- text). Isso não altera nenhuma tabela nem policy existente.

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'partner', 'design', 'trafego');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Se o tipo já existia (ex: criado pela migration original só com
-- admin/partner), garante que os valores usados pelo app estão presentes.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'design';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trafego';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role::text
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  );
$$;

-- Função de trigger usada por várias tabelas para manter updated_at em dia.
-- Recriada aqui defensivamente (CREATE OR REPLACE é inofensivo se já existir).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- public.team_tasks não existia no banco live (a tela de Tarefas rodava
-- sobre uma tabela fantasma — por isso sempre listava vazio e toda
-- criação falhava). Criada aqui com o schema completo esperado pelo
-- frontend, incluindo event_id como uuid solto, SEM foreign key: a tela
-- de Tarefas lista eventos de public.lagun_events (tabela diferente da
-- que a versão antiga desta migration apontava) e ainda tem uma opção
-- fixa "Lagun" que não é uma linha real em nenhuma tabela — a resolução
-- do evento é feita inteiramente no client (getEvent()).
CREATE TABLE IF NOT EXISTS public.team_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pendente',
  priority text,
  assigned_to uuid,
  created_by uuid,
  attachments text[] DEFAULT '{}'::text[],
  due_date date,
  event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view tasks" ON public.team_tasks;
CREATE POLICY "Team can view tasks" ON public.team_tasks
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP POLICY IF EXISTS "Team can insert tasks" ON public.team_tasks;
CREATE POLICY "Team can insert tasks" ON public.team_tasks
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP POLICY IF EXISTS "Team can update tasks" ON public.team_tasks;
CREATE POLICY "Team can update tasks" ON public.team_tasks
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP POLICY IF EXISTS "Team can delete tasks" ON public.team_tasks;
CREATE POLICY "Team can delete tasks" ON public.team_tasks
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'partner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'design') OR has_role(auth.uid(), 'trafego'));

DROP TRIGGER IF EXISTS update_team_tasks_updated_at ON public.team_tasks;
CREATE TRIGGER update_team_tasks_updated_at
  BEFORE UPDATE ON public.team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Se a tabela já existisse com a FK antiga (apontando pra tabela errada),
-- remove — inofensivo se a coluna acabou de ser criada acima sem FK.
ALTER TABLE public.team_tasks DROP CONSTRAINT IF EXISTS team_tasks_event_id_fkey;

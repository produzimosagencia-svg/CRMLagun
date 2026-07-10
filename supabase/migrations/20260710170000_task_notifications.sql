-- Notificações in-app: sininho para quem recebe uma tarefa atribuída, e
-- para quem criou a tarefa quando ela é concluída pelo responsável.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  task_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Sem policy de INSERT: notificações só são criadas pelo trigger abaixo
-- (SECURITY DEFINER), nunca diretamente pelo client. Isso evita que um
-- usuário crie notificações falsas em nome de outro.

-- Dispara automaticamente ao atribuir ou concluir uma tarefa em team_tasks.
-- Assim nenhum caminho de código que edita team_tasks precisa lembrar de
-- notificar — é uma garantia do banco, não uma convenção do frontend.
CREATE OR REPLACE FUNCTION public.notify_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'Alguém') INTO actor_name
  FROM public.profiles WHERE id = auth.uid();

  -- Tarefa atribuída a alguém (na criação, ou quando o responsável muda)
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      NEW.assigned_to,
      'task_assigned',
      'Nova tarefa atribuída',
      actor_name || ' atribuiu "' || NEW.title || '" para você',
      NEW.id
    );
  END IF;

  -- Tarefa concluída: avisa quem criou (se não foi ele mesmo que concluiu)
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'finalizado'
     AND OLD.status IS DISTINCT FROM 'finalizado'
     AND NEW.created_by IS NOT NULL
     AND NEW.created_by <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      NEW.created_by,
      'task_completed',
      'Tarefa concluída',
      actor_name || ' concluiu "' || NEW.title || '"',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_team_tasks_notify ON public.team_tasks;
CREATE TRIGGER on_team_tasks_notify
  AFTER INSERT OR UPDATE ON public.team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_changes();

-- Permite o sino atualizar em tempo real (sem precisar dar F5)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

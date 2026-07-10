-- Acessos de menu por usuário (Admin > Usuários > gerenciar usuário).
-- A visibilidade final de um item = sidebar_menu_settings.enabled AND override do usuário.
-- Ausência de linha = habilitado (default), igual ao padrão da config global.
CREATE TABLE IF NOT EXISTS public.user_menu_overrides (
  user_id uuid NOT NULL,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_menu_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own menu overrides" ON public.user_menu_overrides;
CREATE POLICY "Users can view own menu overrides"
  ON public.user_menu_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins manage menu overrides" ON public.user_menu_overrides;
CREATE POLICY "Admins manage menu overrides"
  ON public.user_menu_overrides FOR ALL
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

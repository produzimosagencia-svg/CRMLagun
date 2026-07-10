-- Permite que administradores vejam todos os perfis e cargos na tela Admin.
-- Sem isso, o RLS limita cada usuário a ver apenas a própria linha, então o
-- admin nunca via os outros usuários criados.

-- Função helper: verifica se o usuário atual é admin.
-- SECURITY DEFINER faz a consulta interna rodar sem RLS, evitando recursão
-- quando usada dentro da policy da própria tabela user_roles.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'admin'
  );
$$;

-- profiles: admin enxerga todos os perfis (soma-se à policy de "ver o próprio")
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

-- user_roles: admin enxerga todos os cargos (soma-se à policy de "ver os próprios")
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

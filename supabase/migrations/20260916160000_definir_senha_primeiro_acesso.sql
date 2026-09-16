-- ============================================================================
-- Senha própria no primeiro acesso.
--
-- Contas criadas pelo Admin nascem com uma senha geral; no primeiro login a
-- pessoa é obrigada a cadastrar a própria senha antes de usar o painel.
-- Quando o Admin redefine a senha de alguém, a obrigação volta a valer.
-- ============================================================================

-- Contas que já existem não são afetadas (a coluna entra como false para elas);
-- só contas novas nascem com a obrigação ligada.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS precisa_definir_senha boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ALTER COLUMN precisa_definir_senha SET DEFAULT true;

-- O usuário não tem permissão de UPDATE em profiles; esta função desliga a
-- obrigação só da própria conta, depois que o app trocou a senha no Auth.
CREATE OR REPLACE FUNCTION public.marcar_senha_definida()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET precisa_definir_senha = false WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_senha_definida() FROM anon;
GRANT EXECUTE ON FUNCTION public.marcar_senha_definida() TO authenticated;

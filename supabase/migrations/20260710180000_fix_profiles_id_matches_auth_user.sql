-- O schema original de profiles tem `id` (PK própria, aleatória) separado
-- de `user_id` (FK pra auth.users). Mas todo o código atual (InternoAdmin,
-- InternoPerfil, as edge functions create-partner e manage-user) trata
-- profiles.id como se FOSSE o id do usuário autenticado — undo do drift
-- que aconteceu no banco do Lagun (lá corrigimos só via SQL solto no chat,
-- nunca virou migration; esta migration fecha essa lacuna pra qualquer
-- banco criado a partir do zero com este histórico, incluindo clones).
--
-- Ajusta o trigger de criação de perfil para gravar id = auth.users.id
-- diretamente, mantendo user_id preenchido igual (nada que já dependia
-- de user_id quebra).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, email, full_name)
  VALUES (NEW.id, NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Colunas que o Perfil usa e que só existiam via patch solto no Lagun
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS squad text;

-- Backfill: corrige linhas que já existam com id != user_id (idempotente;
-- em banco novo/vazio isso não encontra nenhuma linha e não faz nada)
UPDATE public.profiles SET id = user_id WHERE id <> user_id;

-- Nomes de quem é do bastidor (pra escolher responsável, quem pediu etc.).
-- Qualquer papel do bastidor lê; clientes do app ficam de fora.
create or replace function public.app_nomes_equipe()
returns table (id uuid, nome text, avatar_url text, papel text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.full_name, p.username, 'Sem nome'), p.avatar_url, public.app_papel(p.id)
    from public.profiles p
   where public.app_papel(auth.uid()) is not null and public.app_papel(p.id) is not null
   order by coalesce(p.full_name, p.username)
$$;
grant execute on function public.app_nomes_equipe() to authenticated;

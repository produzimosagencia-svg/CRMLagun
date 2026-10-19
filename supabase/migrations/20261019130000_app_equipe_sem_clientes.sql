-- A lista da Equipe (tela M4 do app) não deve mostrar os clientes do app:
-- eles também ganham linha em profiles (gatilho do Auth), mas entram com o
-- e-mail sintético <telefone>@app.lagunvitoria.com.br. Fica de fora quem for
-- só cliente (sem papel e com esse e-mail).
create or replace function public.app_equipe()
returns table (id uuid, nome text, username text, telefone text, avatar_url text, papel text, papeis text[], vendedor_id uuid, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.username, p.telefone, p.avatar_url,
         public.app_papel(p.id),
         coalesce((select array_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = p.id), '{}'),
         (select v.id from public.lagun_vendedores v where v.user_id = p.id limit 1),
         p.created_at
    from public.profiles p
    left join auth.users u on u.id = p.id
   where public.app_e_master()
     and (public.app_papel(p.id) is not null or coalesce(u.email, '') not like '%@app.lagunvitoria.com.br')
   order by p.full_name nulls last
$$;

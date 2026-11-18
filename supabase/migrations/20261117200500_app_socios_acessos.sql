-- App da Lagun (iPhone) · Área dos Sócios: acesso pela escolha de área (2026-11-17).
-- Sem depender do programa de embaixadoras (20261117210000, que fica para depois):
-- app_meus_acessos passa a dizer se a pessoa é sócia e se é a conta de revisão da Apple.
-- 'embaixadora' volta sempre false aqui; a 20261117210000 substitui esta função quando entrar.
-- Depende de 20261117200000_app_socios.sql (app_e_socio, app_e_revisao).

alter table public.profiles drop constraint if exists profiles_area_preferida_check;   -- só a regra de valores; nenhum dado muda
alter table public.profiles add constraint profiles_area_preferida_check
  check (area_preferida is null or area_preferida in ('cliente', 'bastidor', 'socios', 'embaixadora'));

create or replace function public.app_meus_acessos()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_papel text := public.app_papel(auth.uid());
  v_perfil record;
  v_vendedor uuid;
  v_revisao boolean := public.app_e_revisao(auth.uid());
begin
  select full_name, area_preferida, telefone into v_perfil from public.profiles where id = auth.uid();
  select id into v_vendedor from public.lagun_vendedores where user_id = auth.uid() and ativo limit 1;
  return json_build_object(
    'papel', case when v_revisao then null else v_papel end,
    'nome', v_perfil.full_name,
    'area_preferida', v_perfil.area_preferida,
    'vendedor_id', v_vendedor,
    'cliente', exists (select 1 from public.lagun_app_clientes where id = auth.uid()),
    -- Sócios: papel socio (ou partner, master, admin). A conta de revisão entra como sócia,
    -- mas o app mostra para ela só dados fictícios (revisao = true).
    'socio', public.app_e_socio(auth.uid()) or (v_revisao and exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = 'socio')),
    'revisao', v_revisao,
    'embaixadora', false
  );
end $$;
grant execute on function public.app_meus_acessos() to authenticated;

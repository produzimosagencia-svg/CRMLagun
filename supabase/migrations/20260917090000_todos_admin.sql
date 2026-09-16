-- Fim dos cargos: todo usuário do time vira admin, e Design/Tráfego deixam de existir na prática.
-- Só mexe em quem já tem algum cargo (contas do time); contas sem cargo continuam sem acesso.
insert into public.user_roles (user_id, role)
select distinct ur.user_id, 'admin'::app_role
from public.user_roles ur
where not exists (
  select 1 from public.user_roles a where a.user_id = ur.user_id and a.role = 'admin'
);

delete from public.user_roles where role in ('design', 'trafego');

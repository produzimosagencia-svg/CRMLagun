-- Papéis do app Bastidor (FLUXO-BASTIDOR.md, aprovado em 19/10/2026):
-- master | social | trafego | design | vendedor | cliente.
-- Os valores novos entram aqui, sozinhos: o Postgres não deixa usar um valor
-- de enum na mesma transação em que ele foi criado. 'admin' e 'partner'
-- continuam existindo (admin vale como master; partner deixa de dar acesso
-- total sozinho, ver app_papel na migração seguinte).
alter type public.app_role add value if not exists 'master';
alter type public.app_role add value if not exists 'social';
alter type public.app_role add value if not exists 'vendedor';
alter type public.app_role add value if not exists 'cliente';

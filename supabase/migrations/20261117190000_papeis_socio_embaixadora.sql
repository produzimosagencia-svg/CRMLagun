-- App da Lagun (iPhone): papéis das áreas Sócios e Embaixadoras (2026-11-17).
-- Pacote de design docs/app-fluxo-socios-embaixadoras (app-iphone).
-- Os valores novos do enum entram sozinhos nesta migração: o Postgres não deixa
-- usar um valor de enum na mesma transação em que ele foi criado.
--   socio      → Área dos Sócios (cópia do app interno da Tríade)
--   ambassador → Programa de Embaixadoras (módulo independente)
alter type public.app_role add value if not exists 'socio';
alter type public.app_role add value if not exists 'ambassador';

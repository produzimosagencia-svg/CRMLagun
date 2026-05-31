-- Permite que qualquer visitante anônimo registre cliques na landing page
-- Sem isso, todos os inserts de link_clicks falham com 401 silencioso

-- Permitir INSERT para anon (visitantes da landing page)
create policy "allow anon insert link_clicks"
  on link_clicks
  for insert
  to anon
  with check (true);

-- Permitir SELECT para usuários autenticados (dashboard interno)
create policy "allow auth select link_clicks"
  on link_clicks
  for select
  to authenticated
  using (true);

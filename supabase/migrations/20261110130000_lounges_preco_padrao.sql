-- Preço padrão dos lounges (dono da Lagun, 10/11/2026):
--   Palco (L1, L2): R$ 4.000 com R$ 2.500 de consumo
--   Pista (L3 a L6): R$ 3.000 com R$ 2.000 de consumo
-- Atualiza o catálogo e as noites de hoje em diante (ainda sem lounge vendido).

update public.lagun_lounges set preco = 4000,
  inclui = array['R$ 2.500 de consumo', 'Ao lado do palco', 'Mesa reservada']
 where codigo in ('L1', 'L2');

update public.lagun_lounges set preco = 3000,
  inclui = array['R$ 2.000 de consumo'] || array_remove(inclui, 'R$ 2.000 de consumo')
 where codigo in ('L3', 'L4', 'L5', 'L6');

update public.lagun_evento_lounges el
   set preco = l.preco
  from public.lagun_lounges l, public.lagun_events e
 where l.id = el.lounge_id and e.id = el.event_id
   and l.codigo is not null
   and e.data >= (now() at time zone 'America/Sao_Paulo')::date
   and not exists (
     select 1 from public.lagun_lounge_reservas r
      where r.event_id = el.event_id and r.lounge_id = el.lounge_id and r.status in ('aguardando', 'confirmada'));

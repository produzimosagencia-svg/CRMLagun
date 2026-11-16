-- Venda de lounges pelo site (lagunvitoria.com.br/lounges).
-- Mesmo motor do bot do WhatsApp (função bot-lounges): mesma tabela de
-- reservas, mesma trava única (lounge, evento), mesmo Pix de 30 minutos e o
-- mesmo aviso + tarefa "Enviar ingressos" para o organizador.
-- Só vende em evento que está na landing (show_on_landing) e ainda não passou.

-- 1. Reserva com origem 'site' (sem conta no app; telefone obrigatório).
alter table public.lagun_lounge_reservas drop constraint if exists lagun_lounge_reservas_origem_check;
alter table public.lagun_lounge_reservas add constraint lagun_lounge_reservas_origem_check
  check ((origem = 'app' and cliente_id is not null) or (origem in ('whatsapp', 'site') and telefone is not null));

-- Site paga o valor cheio, como o WhatsApp.
create or replace function public.lagun_lounge_reserva_calcula()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_preco numeric(12,2);
  v_capacidade int;
  v_minimo int;
  v_pontos int;
begin
  select coalesce(el.preco, l.preco), l.capacidade, l.minimo into v_preco, v_capacidade, v_minimo
    from public.lagun_lounges l
    left join public.lagun_evento_lounges el on el.lounge_id = l.id and el.event_id = new.event_id
   where l.id = new.lounge_id and l.ativo;
  if v_preco is null then raise exception 'Lounge indisponível.'; end if;
  if exists (select 1 from public.lagun_evento_lounges where event_id = new.event_id)
     and not exists (select 1 from public.lagun_evento_lounges where event_id = new.event_id and lounge_id = new.lounge_id) then
    raise exception 'Esse lounge não abre nessa noite.';
  end if;
  if new.pessoas > v_capacidade then raise exception 'Esse lounge recebe até % pessoas.', v_capacidade; end if;
  if new.pessoas < v_minimo then raise exception 'Esse lounge é a partir de % pessoas.', v_minimo; end if;
  new.preco := v_preco;
  if new.origem in ('whatsapp', 'site') then
    new.sinal := v_preco;
    new.desconto := 0;
    new.pago := v_preco;
    return new;
  end if;
  new.sinal := round(v_preco * 0.5, 2);
  select coalesce(sum(pontos), 0) into v_pontos from public.lagun_clube_pontos where cliente_id = new.cliente_id;
  new.desconto := case when v_pontos >= 1000 then round(new.sinal * 0.10, 2) else 0 end;
  new.pago := new.sinal - new.desconto;
  return new;
end $$;

-- 2. Liga/desliga do site e chave do modo teste.
--    site_ativo = false: a página só abre com ?teste=<site_chave_teste>, e aí o Pix é de teste.
alter table public.lagun_bot_lounges_config add column if not exists site_ativo boolean not null default false;
alter table public.lagun_bot_lounges_config add column if not exists site_chave_teste text not null
  default encode(extensions.gen_random_bytes(9), 'hex');

-- A chave de teste não deve aparecer para toda a equipe pelo client.
revoke select on public.lagun_bot_lounges_config from authenticated;
grant select (id, ativo, testadores, numero, phone_number_id, pix_simulado, aviso_telefone, aviso_nome, aviso_user_id,
  contato_lista_telefone, site_ingressos, mapa_url, hora_limite, pix_minutos, lembrete_minutos, updated_at, site_ativo)
  on public.lagun_bot_lounges_config to authenticated;

create index if not exists lagun_lounge_reservas_evento_idx on public.lagun_lounge_reservas (event_id, status);

-- 3. Cron: roda quando há Pix aberto (WhatsApp ou site) ou conversa em andamento.
select cron.unschedule('bot-lounges-tick') where exists (select 1 from cron.job where jobname = 'bot-lounges-tick');
select cron.schedule('bot-lounges-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://xwxiijbovreucnrbyput.supabase.co/functions/v1/bot-lounges',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb,
    timeout_milliseconds := 5000)
  where exists (select 1 from public.lagun_lounge_reservas where origem in ('whatsapp', 'site') and status = 'aguardando')
     or exists (select 1 from public.lagun_bot_lounges_conversas where event_id is not null);
$$);

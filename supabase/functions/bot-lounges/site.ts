// Venda de lounges pelo site (lagunvitoria.com.br/lounges).
// Mesmo motor do bot: mesma tabela, mesma trava (lounge, evento), mesmo Pix,
// mesma confirmação (fluxo.confirmarPagamento) e o mesmo aviso + tarefa.
//
// Ações (POST, sem login):
//   site_eventos  { teste? }                                   → eventos da landing com lounge
//   site_lounges  { event_id, teste? }                          → L1..L6 com livre/reservado/vendido
//   site_reservar { event_id, lounge_id, nome, cpf, telefone, teste? } → trava + Pix
//   site_status   { id }                                        → confere o banco e devolve a reserva
//   site_simular  { id, teste }                                 → só no modo teste: simula o pagamento
//   site_cancelar { id }                                        → libera o lounge (Pix aberto)
//
// site_ativo = false: só funciona com teste = site_chave_teste, e o Pix é de teste.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmarPagamento, cpfValido } from "./fluxo.ts";
import type { EventoInfo, Porta, Reserva } from "./fluxo.ts";

type Cfg = { site_ativo: boolean; site_chave_teste: string; hora_limite: string };
export type DepsSite<C extends Cfg> = {
  sb: SupabaseClient;
  criarPorta: (cfg: C, opts?: { siteTeste?: boolean }) => Porta;
  infoEvento: (e: any, cfg: C) => EventoInfo;
  hoje: () => string;
  colunas: string;
  paraReserva: (r: any) => Reserva;
  ehTeste: (r: { txid: string | null }) => boolean;
  /** Banco que cobra de verdade está ligado (AbacatePay produção ou Inter). */
  pixRealDisponivel: () => boolean;
  /** Teste no banco (AbacatePay abc_dev_): simula o pagamento lá. false = teste local (teste_pago). */
  simularPix: (txid: string) => Promise<boolean>;
};
type Resp = { status: number; body: unknown };

const ok = (body: unknown): Resp => ({ status: 200, body });
const erro = (status: number, mensagem: string, extra: Record<string, unknown> = {}): Resp =>
  ({ status, body: { error: mensagem, ...extra } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** (27) 99999-9999 → 5527999999999. null se não parecer celular brasileiro. */
export function telefoneSite(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return /^55\d{10,11}$/.test(d) ? d : null;
}
const nomeOk = (n: string) => n.split(/\s+/).filter((p) => p.replace(/\./g, "").length >= 2).length >= 2 && /^[\p{L}' .-]+$/u.test(n);

export async function tratarSite<C extends Cfg>(body: any, cfg: C, d: DepsSite<C>): Promise<Resp> {
  const teste = !!body?.teste && String(body.teste) === cfg.site_chave_teste;
  const aberto = cfg.site_ativo || teste;
  const { sb } = d;

  async function eventoAVenda(id: string) {
    if (!UUID.test(id)) return null;
    const { data } = await sb.from("lagun_events")
      .select("id, nome, data, dia_semana, artista, flyer_mobile_url, flyer_desktop_url, show_on_landing").eq("id", id).maybeSingle();
    if (!data) return null;
    const info = d.infoEvento(data, cfg);
    return info.aVenda ? { ...(data as any), info } : null;
  }

  /** Lounges que abrem na noite, com preço da noite e situação. */
  async function loungesDoEvento(eventId: string) {
    const [{ data: abertos }, { data: res }] = await Promise.all([
      sb.from("lagun_evento_lounges")
        .select("preco, lounge:lagun_lounges!inner(id, codigo, nome, categoria, capacidade, minimo, inclui, ativo, ordem)")
        .eq("event_id", eventId),
      sb.from("lagun_lounge_reservas").select("lounge_id, status")
        .eq("event_id", eventId).in("status", ["aguardando", "confirmada"]),
    ]);
    const situacao = new Map<string, string>();
    for (const r of (res ?? []) as any[]) situacao.set(r.lounge_id, r.status === "confirmada" ? "vendido" : "reservado");
    return ((abertos ?? []) as any[])
      .filter((r) => r.lounge?.ativo)
      .sort((a, b) => (a.lounge.ordem ?? 0) - (b.lounge.ordem ?? 0))
      .map((r) => ({
        id: r.lounge.id, codigo: r.lounge.codigo, nome: r.lounge.nome, categoria: r.lounge.categoria,
        capacidade: r.lounge.capacidade, inclui: r.lounge.inclui ?? [], preco: Number(r.preco),
        situacao: situacao.get(r.lounge.id) ?? "livre",
      }));
  }

  async function lerReserva(id: string): Promise<Reserva | null> {
    if (!UUID.test(id)) return null;
    const { data } = await sb.from("lagun_lounge_reservas").select(d.colunas).eq("id", id).eq("origem", "site").maybeSingle();
    return data ? d.paraReserva(data) : null;
  }

  /** O que a página mostra (sem CPF). */
  async function vista(r: Reserva) {
    const [{ data: ev }, { data: l }] = await Promise.all([
      sb.from("lagun_events").select("nome, data, dia_semana").eq("id", r.event_id).maybeSingle(),
      sb.from("lagun_lounges").select("codigo, nome, capacidade").eq("id", r.lounge_id).maybeSingle(),
    ]);
    return {
      id: r.id, codigo: r.codigo, status: r.status, valor: r.pago, nome: r.nome,
      expira_em: r.expira_em, pix: r.status === "aguardando" ? r.pix_copia_cola : null,
      teste: d.ehTeste(r), event_id: r.event_id,
      evento: ev ? { nome: (ev as any).nome, data: String((ev as any).data).slice(0, 10), dia_semana: (ev as any).dia_semana } : null,
      lounge: l ?? null,
    };
  }

  switch (body?.action) {
    case "site_eventos": {
      if (!aberto) return ok({ aberto: false, teste: false, eventos: [] });
      const { data } = await sb.from("lagun_events")
        .select("id, nome, data, dia_semana, artista, flyer_mobile_url, flyer_desktop_url, show_on_landing, display_order")
        .eq("show_on_landing", true).gte("data", d.hoje()).order("data");
      const aVenda = ((data ?? []) as any[]).filter((e) => d.infoEvento(e, cfg).aVenda);
      const eventos = [];
      for (const e of aVenda) {
        const ls = await loungesDoEvento(e.id);
        if (!ls.length) continue; // noite sem lounge cadastrado não aparece
        const livres = ls.filter((l) => l.situacao === "livre");
        eventos.push({
          id: e.id, nome: e.nome, data: String(e.data).slice(0, 10), dia_semana: e.dia_semana, artista: e.artista,
          flyer: e.flyer_mobile_url || e.flyer_desktop_url || null,
          livres: livres.length, a_partir: livres.length ? Math.min(...livres.map((l) => l.preco)) : null,
        });
      }
      return ok({ aberto: true, teste, eventos });
    }

    case "site_lounges": {
      if (!aberto) return erro(403, "A venda de lounges pelo site ainda não abriu.");
      const ev = await eventoAVenda(String(body.event_id ?? ""));
      if (!ev) return erro(404, "Esse evento não está mais à venda.");
      return ok({
        evento: { id: ev.id, nome: ev.nome, data: ev.info.data, dia_semana: ev.dia_semana, artista: ev.artista, flyer: ev.flyer_mobile_url || ev.flyer_desktop_url || null },
        lounges: await loungesDoEvento(ev.id),
      });
    }

    case "site_reservar": {
      if (!aberto) return erro(403, "A venda de lounges pelo site ainda não abriu.");
      if (!teste && !d.pixRealDisponivel()) return erro(503, "Pagamento indisponível no momento. Tente de novo em alguns minutos.");
      const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
      const cpf = String(body.cpf ?? "").replace(/\D/g, "");
      const telefone = telefoneSite(body.telefone);
      if (!nomeOk(nome)) return erro(400, "Digite o nome completo do titular.", { campo: "nome" });
      if (!cpfValido(cpf)) return erro(400, "CPF inválido.", { campo: "cpf" });
      if (!telefone) return erro(400, "WhatsApp inválido. Use DDD + número.", { campo: "telefone" });
      const ev = await eventoAVenda(String(body.event_id ?? ""));
      if (!ev) return erro(404, "Esse evento não está mais à venda.");
      const loungeId = String(body.lounge_id ?? "");
      const lounge = (await loungesDoEvento(ev.id)).find((l) => l.id === loungeId);
      if (!lounge) return erro(404, "Esse lounge não abre nessa noite.");

      const porta = d.criarPorta(cfg, { siteTeste: teste });
      // Um Pix aberto por CPF: se a pessoa voltou e escolheu de novo, reaproveita ou libera o anterior.
      const { data: abertas } = await sb.from("lagun_lounge_reservas").select(d.colunas)
        .eq("origem", "site").eq("status", "aguardando").eq("cpf", cpf);
      for (const a of ((abertas ?? []) as any[]).map(d.paraReserva)) {
        if (a.event_id === ev.id && a.lounge_id === loungeId && a.expira_em && Date.parse(a.expira_em) > Date.now()) {
          return ok({ reserva: await vista(a) });
        }
        await porta.encerrarReserva(a, "cancelada");
      }
      if (abertas?.length) lounge.situacao = (await loungesDoEvento(ev.id)).find((l) => l.id === loungeId)?.situacao ?? "livre";
      if (lounge.situacao !== "livre") {
        return erro(409, lounge.situacao === "vendido" ? "Esse lounge acabou de ser vendido." : "Alguém está pagando esse lounge agora. Escolha outro ou tente em 30 minutos.", { ocupado: true });
      }

      const c = await porta.criarReserva({ eventId: ev.id, loungeId, nome, cpf, telefone, pessoas: lounge.capacidade, origem: "site" });
      if (!c.ok) {
        if (c.ocupado) return erro(409, "Alguém pegou esse lounge agora há pouco. Escolha outro.", { ocupado: true });
        return erro(500, "Não deu para reservar agora. Tente de novo.");
      }
      try {
        const r = await porta.gerarPix(c.reserva);
        return ok({ reserva: await vista(r) });
      } catch (e) {
        console.error("site gerarPix:", e instanceof Error ? e.message : e);
        await porta.encerrarReserva(c.reserva, "cancelada");
        return erro(503, "Não deu para gerar o Pix agora. Tente de novo em alguns minutos.");
      }
    }

    case "site_status": {
      let r = await lerReserva(String(body.id ?? ""));
      if (!r) return erro(404, "Reserva não encontrada.");
      if (r.status === "aguardando") {
        const porta = d.criarPorta(cfg);
        const banco = r.txid ? await porta.pagamentoNoBanco(r).catch(() => ({ pago: false, endToEndId: null })) : { pago: false };
        if (banco.pago) await confirmarPagamento(porta, r, banco.endToEndId ?? null);
        else if (r.expira_em && Date.now() >= Date.parse(r.expira_em)) await porta.encerrarReserva(r, "expirada");
        r = (await lerReserva(r.id))!;
      }
      return ok({ reserva: await vista(r) });
    }

    case "site_simular": {
      if (!teste) return erro(403, "Só no modo teste.");
      const r = await lerReserva(String(body.id ?? ""));
      if (!r || !d.ehTeste(r)) return erro(404, "Reserva de teste não encontrada.");
      if (r.status === "aguardando") {
        const porta = d.criarPorta(cfg, { siteTeste: true });
        if (await d.simularPix(r.txid!)) {
          // AbacatePay de teste: o pagamento foi simulado lá; confirma conferindo na API.
          const banco = await porta.pagamentoNoBanco(r);
          if (banco.pago) await confirmarPagamento(porta, r, banco.endToEndId ?? null);
        } else {
          await sb.from("lagun_lounge_reservas").update({ teste_pago: true }).eq("id", r.id);
          await confirmarPagamento(porta, r, "TESTE");
        }
      }
      return ok({ reserva: await vista((await lerReserva(r.id))!) });
    }

    case "site_cancelar": {
      const r = await lerReserva(String(body.id ?? ""));
      if (!r) return erro(404, "Reserva não encontrada.");
      if (r.status === "aguardando") await d.criarPorta(cfg).encerrarReserva(r, "cancelada");
      return ok({ reserva: await vista((await lerReserva(r.id))!) });
    }
  }
  return erro(400, "action inválida");
}

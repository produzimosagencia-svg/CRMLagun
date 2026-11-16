// ============================================================================
// bot-lounges — Bot de Lounges no WhatsApp (número "Boate Lagun").
// ----------------------------------------------------------------------------
// Roteiro: cofre/clientes/lagun/bot-lounges (v2) · lógica em fluxo.ts · textos
// em textos.ts. Aqui fica só a ligação com banco, Meta, Inter e OpenAI.
//
// Chamadas (POST, JSON):
//   { action: "mensagem", phone, contact_name, entrada }  ← whatsapp-webhook (service role)
//   { source: "cron" }                                     ← pg_cron a cada minuto
//   { pix: [...] } sem Authorization                       ← webhook do Inter (Pix recebido)
//   ?abacate=1 com X-Webhook-Secret                        ← webhook da AbacatePay (transparent.completed)
//   { action: "webhook_ligar" }                            ← equipe, uma vez, depois das chaves do Inter
//   { action: "site_*", ... } sem login                     ← página pública /lounges (site.ts)
//
// Liga/desliga: lagun_bot_lounges_config.ativo. Desligado, responde só aos
// telefones em `testadores`.
// Nunca confia no corpo do webhook do Inter: consulta a cobrança antes de marcar pago.
// verify_jwt = false (cron e Inter chamam sem JWT).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { variantesDoTelefone } from "../_shared/socios.ts";
import {
  cancelarCobranca, consultarCobranca, criarCobranca, interConfigurado, ligarWebhookCobranca, novoTxid,
} from "../_shared/inter.ts";
import {
  abacateConfigurado, abacateModoTeste, consultarPixAbacate, criarPixAbacate, ligarWebhookAbacate, simularPixAbacate,
  webhookAbacateValido,
} from "../_shared/abacatepay.ts";
import { confirmarPagamento, tick, tratarMensagem } from "./fluxo.ts";
import { tratarSite } from "./site.ts";
import type { Conversa, Entrada, Etapa, EventoInfo, Intencao, Porta, Reserva } from "./fluxo.ts";
import type { Evento, Lounge, Saida } from "./textos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4";
const PAINEL_URL = (Deno.env.get("APP_PUBLIC_URL") || "https://lagunvitoria.com.br").replace(/\/$/, "");
const GRAPH_API = "https://graph.facebook.com/v21.0";
const TZ = "America/Sao_Paulo";

export const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ------------------------------------------------------------------ config
export type Cfg = {
  ativo: boolean; testadores: string[]; numero: string; phone_number_id: string | null; pix_simulado: boolean;
  aviso_telefone: string | null; aviso_nome: string | null; aviso_user_id: string | null;
  contato_lista_telefone: string; site_ingressos: string; mapa_url: string;
  hora_limite: string; pix_minutos: number; lembrete_minutos: number;
  site_ativo: boolean; site_chave_teste: string;
};
export async function lerConfig(): Promise<Cfg | null> {
  const { data } = await sb.from("lagun_bot_lounges_config").select("*").eq("id", true).maybeSingle();
  return (data as Cfg) ?? null;
}
function ehTestador(cfg: Cfg, telefone: string) {
  const v = new Set(variantesDoTelefone(telefone));
  return (cfg.testadores ?? []).some((t) => variantesDoTelefone(t).some((x) => v.has(x)));
}
function podeResponder(cfg: Cfg, telefone: string) {
  return cfg.ativo || ehTestador(cfg, telefone);
}
/** Pix de teste: só para testadores, com o modo ligado. Não cobra nada. */
const pixDeTeste = (cfg: Cfg, telefone: string) => cfg.pix_simulado && ehTestador(cfg, telefone);
const TXID_TESTE = "TESTE";
export const ehTeste = (r: { txid: string | null }) => !!r.txid?.startsWith(TXID_TESTE);

// Banco do Pix: AbacatePay se houver chave, senão Inter.
// Cobrança de teste na AbacatePay (chave abc_dev_) fica com txid "TESTE-ABC:<id>": é teste e é simulável.
const TXID_ABACATE_TESTE = "TESTE-ABC:";
const ehAbacate = (txid: string | null) => !!txid && (txid.startsWith("pix_char_") || txid.startsWith(TXID_ABACATE_TESTE));
const idAbacate = (txid: string) => txid.replace(TXID_ABACATE_TESTE, "");
/** Pode cobrar de verdade? (cliente final, fora do modo teste) */
export const pixRealDisponivel = () => (abacateConfigurado() && !abacateModoTeste()) || interConfigurado();

// ------------------------------------------------------------------ datas
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
export const hoje = () => fmtDia.format(new Date());
const horaAgora = () => fmtHora.format(new Date()); // "19:05"

export function infoEvento(e: any, cfg: Cfg): EventoInfo {
  const dia = String(e.data).slice(0, 10);
  const ativo = !!e.show_on_landing && dia >= hoje();
  const limite = String(cfg.hora_limite ?? "18:00").slice(0, 5);
  const aVenda = ativo && (dia > hoje() || horaAgora() < limite);
  return { id: e.id, nome: e.nome, data: dia, ativo, aVenda };
}

// ------------------------------------------------------------------ Meta
const cortar = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

function paraPayload(to: string, s: Saida): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to };
  switch (s.tipo) {
    case "texto": return { ...base, type: "text", text: { body: cortar(s.texto, 4096), preview_url: false } };
    case "imagem": return { ...base, type: "image", image: { link: s.url, ...(s.legenda ? { caption: s.legenda } : {}) } };
    case "botoes":
      return {
        ...base, type: "interactive",
        interactive: {
          type: "button", body: { text: cortar(s.texto, 1024) },
          action: { buttons: s.botoes.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cortar(b.titulo, 20) } })) },
        },
      };
    case "lista":
      return {
        ...base, type: "interactive",
        interactive: {
          type: "list", body: { text: cortar(s.texto, 1024) },
          action: {
            button: cortar(s.botao, 20),
            sections: [{ title: "Lounges Lagun", rows: s.linhas.slice(0, 10).map((l) => ({
              id: l.id, title: cortar(l.titulo, 24), ...(l.descricao ? { description: cortar(l.descricao, 72) } : {}),
            })) }],
          },
        },
      };
  }
}
const paraLog = (s: Saida) =>
  s.tipo === "texto" ? s.texto
    : s.tipo === "imagem" ? `[Imagem] ${s.legenda ?? ""}`
    : s.tipo === "botoes" ? `${s.texto}\n[${s.botoes.map((b) => b.titulo).join(" | ")}]`
    : `${s.texto}\n[${s.linhas.map((l) => l.titulo).join(" | ")}]`;

async function enviarMeta(cfg: Cfg, to: string, s: Saida, contactName: string | null, etiqueta: string) {
  const phoneId = cfg.phone_number_id;
  let ok = false, erro = "", wamid: string | null = null;
  if (!META_TOKEN || !phoneId) erro = "Número do bot ou token da Meta não configurado";
  else {
    const r = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(paraPayload(to, s)),
    });
    const d = await r.json().catch(() => ({}));
    ok = r.ok && !d?.error;
    erro = ok ? "" : d?.error?.message || `HTTP ${r.status}`;
    wamid = d?.messages?.[0]?.id ?? null;
  }
  await sb.from("whatsapp_messages").insert({
    phone: to, contact_name: contactName, direction: "outgoing",
    message_type: s.tipo === "imagem" ? "image" : "text",
    message_text: ok ? paraLog(s) : `[Bot de lounges] Falha: ${erro}`,
    media_url: s.tipo === "imagem" ? s.url : null,
    wamid, status: ok ? "sent" : "failed", channel: "whatsapp", timestamp: new Date().toISOString(),
    raw_payload: { phone_number_id: phoneId, bot: "lounges", etapa: etiqueta },
  });
  if (!ok) console.error("bot-lounges envio:", to, erro);
  return ok;
}

// ------------------------------------------------------------------ IA
const PROMPT_IA = `Você interpreta mensagens de clientes no WhatsApp de venda de LOUNGES da boate Lagun.
Responda só um JSON: {"intencao": "...", "evento_id": null, "lounge_id": null, "categoria": null, "nome": null, "cpf": null}
intencao, uma de:
- estorno: pede estorno, reembolso, dinheiro de volta (mesmo escrito de outro jeito)
- cancelar: quer cancelar a reserva ou desistiu
- pagou_por_fora: diz que pagou por outro meio (chave Pix da casa, CNPJ, transferência, valor diferente)
- ja_paguei: diz que já pagou o Pix enviado
- reenviar_pix: pede o código Pix de novo
- escolher_evento: cita um dos eventos da lista (preencha evento_id; se também citar lounge, preencha lounge_id ou categoria "Palco"/"Premium")
- escolher_lounge: cita um lounge (L1..L6, "palco", "premium"); preencha lounge_id se for um da lista ou categoria
- dados: manda nome completo e/ou CPF do titular (preencha nome e cpf só com dígitos)
- confirmar: confirma o resumo (sim, pode, confirmo)
- trocar_lounge / ver_eventos: quer outro lounge / outra data
- outro_assunto: ingresso de pista, nome na lista, aniversário, achados e perdidos, outra dúvida que não é compra de lounge
- conversa: cumprimento ou qualquer outra coisa
Use apenas ids que aparecem nas listas. Não invente.`;

async function interpretarComIA(texto: string, ctx: { etapa: Etapa; eventos: Evento[]; lounges: Lounge[] }): Promise<Intencao> {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY não configurado");
  const contexto = [
    `Etapa da conversa: ${ctx.etapa}`,
    `Eventos: ${ctx.eventos.map((e) => `${e.id} = ${e.nome} (${e.data})`).join("; ") || "nenhum"}`,
    `Lounges livres do evento escolhido: ${ctx.lounges.map((l) => `${l.id} = ${l.nome}`).join("; ") || "nenhum"}`,
  ].join("\n");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT_IA },
        { role: "user", content: `${contexto}\n\nMensagem do cliente: """${texto.slice(0, 600)}"""` },
      ],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `OpenAI HTTP ${r.status}`);
  const it = JSON.parse(d?.choices?.[0]?.message?.content ?? "{}");
  if (!it?.intencao) throw new Error("IA sem intenção");
  return it as Intencao;
}

// ------------------------------------------------------------------ porta real
export const COLUNAS_RESERVA = "id, codigo, origem, event_id, lounge_id, status, pago, nome, cpf, telefone, txid, pix_copia_cola, expira_em, lembrete_em";
export const paraReserva = (r: any): Reserva => ({ ...r, pago: Number(r.pago) });

/** siteTeste: reserva do site aberta com a chave de teste (Pix de teste, não cobra). */
export function criarPorta(cfg: Cfg, opts: { siteTeste?: boolean } = {}): Porta {
  const nomes = new Map<string, string | null>(); // contact_name por telefone, para o log

  async function catalogo(eventId: string): Promise<Lounge[]> {
    const { data } = await sb.from("lagun_evento_lounges")
      .select("preco, lounge:lagun_lounges!inner(id, codigo, nome, categoria, capacidade, minimo, inclui, ativo, ordem)")
      .eq("event_id", eventId);
    return ((data ?? []) as any[])
      .filter((r) => r.lounge?.ativo)
      .sort((a, b) => (a.lounge.ordem ?? 0) - (b.lounge.ordem ?? 0))
      .map((r) => ({
        id: r.lounge.id, codigo: r.lounge.codigo, nome: r.lounge.nome, categoria: r.lounge.categoria,
        capacidade: r.lounge.capacidade, minimo: r.lounge.minimo, inclui: r.lounge.inclui ?? [], preco: Number(r.preco),
      }));
  }
  async function ocupados(eventIds: string[]): Promise<Set<string>> {
    if (!eventIds.length) return new Set();
    const { data } = await sb.from("lagun_lounge_reservas").select("event_id, lounge_id")
      .in("event_id", eventIds).in("status", ["aguardando", "confirmada"]);
    return new Set(((data ?? []) as any[]).map((r) => `${r.event_id}:${r.lounge_id}`));
  }

  return {
    cfg: {
      mapaUrl: cfg.mapa_url || null,
      site: cfg.site_ingressos,
      telefoneLista: cfg.contato_lista_telefone,
      pixMinutos: cfg.pix_minutos,
      lembreteMinutos: cfg.lembrete_minutos,
      linkConversa: (t) => `${PAINEL_URL}/interno/whatsapp/chat?telefone=${t}`,
      linkPainel: (ev) => `${PAINEL_URL}/interno/lounges?evento=${ev}`,
    },
    agora: () => new Date(),

    async eventosAVenda() {
      const { data } = await sb.from("lagun_events").select("id, nome, data, show_on_landing")
        .eq("show_on_landing", true).gte("data", hoje()).order("data");
      const eventos = ((data ?? []) as any[]).map((e) => infoEvento(e, cfg)).filter((e) => e.aVenda);
      if (!eventos.length) return [];
      const { data: abertos } = await sb.from("lagun_evento_lounges")
        .select("event_id, lounge_id, lounge:lagun_lounges!inner(ativo)").in("event_id", eventos.map((e) => e.id));
      const occ = await ocupados(eventos.map((e) => e.id));
      const comLivre = new Set(((abertos ?? []) as any[])
        .filter((r) => r.lounge?.ativo && !occ.has(`${r.event_id}:${r.lounge_id}`)).map((r) => r.event_id));
      return eventos.filter((e) => comLivre.has(e.id)).map(({ id, nome, data }) => ({ id, nome, data }));
    },

    async evento(id) {
      const { data } = await sb.from("lagun_events").select("id, nome, data, show_on_landing").eq("id", id).maybeSingle();
      return data ? infoEvento(data, cfg) : null;
    },

    async loungesLivres(eventId) {
      const [todos, occ] = await Promise.all([catalogo(eventId), ocupados([eventId])]);
      return todos.filter((l) => !occ.has(`${eventId}:${l.id}`));
    },

    async lounge(id, eventId) {
      const { data: l } = await sb.from("lagun_lounges").select("id, codigo, nome, categoria, capacidade, minimo, inclui, preco").eq("id", id).maybeSingle();
      if (!l) return null;
      const { data: el } = await sb.from("lagun_evento_lounges").select("preco").eq("event_id", eventId).eq("lounge_id", id).maybeSingle();
      return { ...(l as any), inclui: (l as any).inclui ?? [], preco: Number(el?.preco ?? (l as any).preco) };
    },

    async reserva(id) {
      const { data } = await sb.from("lagun_lounge_reservas").select(COLUNAS_RESERVA).eq("id", id).maybeSingle();
      return data ? paraReserva(data) : null;
    },
    async reservaPagaDoTelefone(telefone) {
      const { data } = await sb.from("lagun_lounge_reservas").select(COLUNAS_RESERVA)
        .eq("origem", "whatsapp").eq("status", "confirmada").in("telefone", variantesDoTelefone(telefone))
        .order("created_at", { ascending: false }).limit(1);
      return data?.[0] ? paraReserva(data[0]) : null;
    },
    async reservasAguardando() {
      const { data } = await sb.from("lagun_lounge_reservas").select(COLUNAS_RESERVA)
        .in("origem", ["whatsapp", "site"]).eq("status", "aguardando").limit(200);
      return ((data ?? []) as any[]).map(paraReserva);
    },

    async criarReserva(d) {
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const { data, error } = await sb.from("lagun_lounge_reservas").insert({
          origem: d.origem ?? "whatsapp", status: "aguardando", event_id: d.eventId, lounge_id: d.loungeId,
          telefone: d.telefone, nome: d.nome, cpf: d.cpf, pessoas: d.pessoas,
        }).select(COLUNAS_RESERVA).single();
        if (!error) return { ok: true as const, reserva: paraReserva(data) };
        // 23505 no índice (lounge, evento) = alguém travou antes. No código = sorteia outro.
        if (error.code === "23505" && /reservas_unico/.test(error.message)) return { ok: false as const, ocupado: true };
        if (error.code === "23505") continue;
        console.error("criarReserva:", error.message);
        return { ok: false as const, ocupado: /não abre|indisponível/i.test(error.message), erro: error.message };
      }
      return { ok: false as const, ocupado: false, erro: "código repetido" };
    },

    async gerarPix(r) {
      const site = r.origem === "site";
      const teste = site ? !!opts.siteTeste : pixDeTeste(cfg, r.telefone);
      const expira = new Date(Date.now() + cfg.pix_minutos * 60_000).toISOString();
      const gravar = async (txid: string, copiaCola: string) => {
        const { data, error } = await sb.from("lagun_lounge_reservas")
          .update({ txid, pix_copia_cola: copiaCola, expira_em: expira }).eq("id", r.id).select(COLUNAS_RESERVA).single();
        if (error) throw new Error(error.message);
        return paraReserva(data);
      };
      const [ev, l] = await Promise.all([this.evento(r.event_id), this.lounge(r.lounge_id, r.event_id)]);
      const descricao = `Lagun ${l?.nome ?? "Lounge"} ${ev?.nome ?? ""} ${r.codigo}`;

      if (teste) {
        // Com chave de teste da AbacatePay: cobrança de mentira de verdade (QR válido, pagamento simulado).
        if (abacateConfigurado() && abacateModoTeste()) {
          const cob = await criarPixAbacate({
            externalId: `${r.codigo}-${Date.now()}`, valor: r.pago, expiracaoSeg: cfg.pix_minutos * 60, descricao,
            metadata: { reserva_id: r.id, codigo: r.codigo, origem: r.origem ?? "whatsapp" },
          });
          return await gravar(TXID_ABACATE_TESTE + cob.id, cob.copiaCola);
        }
        return await gravar(novoTxid(TXID_TESTE), site
          ? "PIX-DE-TESTE-NAO-PAGUE"
          : "🧪 PIX DE TESTE · não pague nada.\nPara simular o pagamento, mande qualquer imagem ou PDF como comprovante.");
      }

      if (abacateConfigurado()) {
        if (abacateModoTeste()) throw new Error("AbacatePay com chave de teste: venda real bloqueada");
        const cob = await criarPixAbacate({
          externalId: `${r.codigo}-${Date.now()}`, valor: r.pago, expiracaoSeg: cfg.pix_minutos * 60, descricao,
          metadata: { reserva_id: r.id, codigo: r.codigo, origem: r.origem ?? "whatsapp" },
        });
        return await gravar(cob.id, cob.copiaCola);
      }
      if (!interConfigurado()) throw new Error("Nenhum banco de Pix configurado (ABACATEPAY_API_KEY ou INTER_*)");
      const txid = novoTxid();
      const cob = await criarCobranca({
        txid, valor: r.pago, expiracaoSeg: cfg.pix_minutos * 60, nome: r.nome, cpf: r.cpf ?? "", descricao,
      });
      return await gravar(cob.txid, cob.copiaCola);
    },

    async encerrarReserva(r, status) {
      const { data } = await sb.from("lagun_lounge_reservas").update({ status })
        .eq("id", r.id).eq("status", "aguardando").select("id");
      const mudou = !!data?.length;
      // AbacatePay não cancela cobrança: ela vence sozinha no mesmo prazo.
      if (mudou && r.txid && !ehTeste(r) && !ehAbacate(r.txid) && interConfigurado()) {
        const c = await cancelarCobranca(r.txid).catch((e) => ({ ok: false, resposta: String(e) }));
        if (!c.ok) console.error("cancelarCobranca:", r.txid, JSON.stringify(c).slice(0, 300));
      }
      return mudou;
    },

    async pagamentoNoBanco(r) {
      if (ehAbacate(r.txid)) {
        const c = await consultarPixAbacate(idAbacate(r.txid!));
        return { pago: c.pago, endToEndId: r.txid };
      }
      if (ehTeste(r)) {
        const { data } = await sb.from("lagun_lounge_reservas").select("teste_pago").eq("id", r.id).maybeSingle();
        return { pago: !!data?.teste_pago, endToEndId: "TESTE" };
      }
      if (!r.txid || !interConfigurado()) return { pago: false };
      const c = await consultarCobranca(r.txid);
      if (!c.ok) return { pago: false };
      return { pago: c.pago && c.valorRecebido + 0.001 >= r.pago, endToEndId: c.endToEndId };
    },

    async marcarPago(r, endToEndId) {
      const { data } = await sb.from("lagun_lounge_reservas")
        .update({ status: "confirmada", pago_em: new Date().toISOString(), end_to_end_id: endToEndId, equipe_avisada_em: new Date().toISOString() })
        .eq("id", r.id).eq("status", "aguardando").select("id");
      return !!data?.length;
    },
    async registrarComprovante(r) {
      if (!ehTeste(r)) return;
      // Teste: o comprovante simula o pagamento (na AbacatePay de teste, pela própria API).
      if (r.txid?.startsWith(TXID_ABACATE_TESTE)) await simularPixAbacate(idAbacate(r.txid)).catch((e) => console.error("simular:", e));
      else await sb.from("lagun_lounge_reservas").update({ teste_pago: true }).eq("id", r.id);
    },
    async marcarLembrete(r) {
      await sb.from("lagun_lounge_reservas").update({ lembrete_em: new Date().toISOString() }).eq("id", r.id);
    },

    async conversa(telefone) {
      const { data } = await sb.from("lagun_bot_lounges_conversas").select("*").eq("telefone", telefone).maybeSingle();
      if (data) return data as Conversa;
      return {
        telefone, contact_name: null, etapa: "inicio", event_id: null, lounge_id: null, titular_nome: null, titular_cpf: null,
        reserva_id: null, pausado: false, pausado_motivo: null, pausado_em: null, atendimento_equipe: false,
        updated_at: new Date().toISOString(),
      };
    },
    async conversasComEvento() {
      const { data } = await sb.from("lagun_bot_lounges_conversas").select("*").not("event_id", "is", null).limit(500);
      return (data ?? []) as Conversa[];
    },
    async salvar(c) {
      nomes.set(c.telefone, c.contact_name);
      const { error } = await sb.from("lagun_bot_lounges_conversas").upsert({
        telefone: c.telefone, contact_name: c.contact_name, etapa: c.etapa, event_id: c.event_id, lounge_id: c.lounge_id,
        titular_nome: c.titular_nome, titular_cpf: c.titular_cpf, reserva_id: c.reserva_id, pausado: c.pausado,
        pausado_motivo: c.pausado_motivo, pausado_em: c.pausado_em, atendimento_equipe: c.atendimento_equipe,
        updated_at: c.updated_at,
      });
      if (error) console.error("salvar conversa:", error.message);
    },

    async enviar(telefone, saidas) {
      for (const s of saidas) {
        const ok = await enviarMeta(cfg, telefone, s, nomes.get(telefone) ?? null, "cliente");
        if (!ok) break; // não manda o resto da sequência fora de ordem
      }
    },

    async marcarEquipe(telefone, motivo) {
      await sb.from("whatsapp_messages").insert({
        phone: telefone, contact_name: nomes.get(telefone) ?? null, direction: "outgoing", message_type: "system",
        message_text: motivo, status: "need_support", channel: "whatsapp", timestamp: new Date().toISOString(),
        raw_payload: { phone_number_id: cfg.phone_number_id, bot: "lounges", marcador: true },
      });
    },

    async avisarOrganizador(texto, tarefa) {
      // Tarefa com responsável: o gatilho manda o template tarefa_nova (chega mesmo fora da janela de 24h).
      const { error } = await sb.from("team_tasks").insert({
        title: tarefa.titulo.slice(0, 200), description: `${tarefa.descricao}\n\n${texto}`,
        status: "pendente", priority: "urgente", assigned_to: cfg.aviso_user_id, event_id: tarefa.eventId, due_date: hoje(),
      });
      if (error) console.error("tarefa:", error.message);
      // Texto completo direto no WhatsApp (só entrega se o organizador falou com o número nas últimas 24h).
      if (cfg.aviso_telefone) await enviarMeta(cfg, cfg.aviso_telefone.replace(/\D/g, ""), { tipo: "texto", texto }, cfg.aviso_nome, "organizador");
    },

    interpretar: interpretarComIA,
  };
}

// ------------------------------------------------------------------ webhooks de Pix
/** Pix avisado pelo banco: confere na API e confirma (ou manda para a equipe se a reserva já venceu). */
async function tratarPixAvisado(p: Porta, txids: string[]) {
  const { data } = await sb.from("lagun_lounge_reservas").select(COLUNAS_RESERVA).in("txid", txids).maybeSingle();
  if (!data) return false;
  const r = paraReserva(data);
  const banco = await p.pagamentoNoBanco(r);
  if (!banco.pago) return false;
  if (r.status === "aguardando") await confirmarPagamento(p, r, banco.endToEndId ?? null);
  else if (r.status !== "confirmada") {
    // Pago numa reserva já vencida/cancelada (corrida no último segundo): equipe resolve.
    await p.marcarEquipe(r.telefone, `Pix pago em reserva ${r.status} · ${r.codigo}`);
    await p.avisarOrganizador(
      `⚠️ *Pix pago em reserva ${r.status}*\n\nReserva ${r.codigo} · ${r.nome}\nValor: R$ ${r.pago.toFixed(2)}\nConferir se o lounge ainda está livre ou devolver.`,
      { titulo: `Pix pago em reserva ${r.status} · ${r.codigo}`, descricao: `txid ${r.txid}`, eventId: r.event_id },
    );
  }
  return true;
}

async function webhookInter(body: any, cfg: Cfg) {
  const itens: any[] = Array.isArray(body?.pix) ? body.pix : [];
  const p = criarPorta(cfg);
  let tratados = 0;
  for (const it of itens) {
    const txid = it?.txid ? String(it.txid) : null;
    if (!txid) continue; // Pix na chave sem cobrança: a equipe confere (M16)
    if (await tratarPixAvisado(p, [txid])) tratados++;
  }
  return json({ ok: true, tratados });
}

async function webhookAbacate(body: any, cfg: Cfg) {
  if (body?.event !== "transparent.completed") return json({ ok: true, ignorado: body?.event ?? null });
  const id = body?.data?.transparent?.id ? String(body.data.transparent.id) : null;
  if (!id) return json({ ok: true, ignorado: "sem id" });
  const tratado = await tratarPixAvisado(criarPorta(cfg), [id, TXID_ABACATE_TESTE + id]);
  return json({ ok: true, tratado });
}

// Mapa dos lounges (a Meta baixa a imagem por este link).
let mapa: Uint8Array | null = null;
async function servirMapa() {
  mapa ??= await Deno.readFile(new URL("./mapa-lounges.jpg", import.meta.url));
  return new Response(mapa, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET" && new URL(req.url).searchParams.has("mapa")) return await servirMapa();
  if (req.method !== "POST") return json({ error: "POST" }, 405);
  const corpoCru = await req.text();
  let body: any = {};
  try { body = JSON.parse(corpoCru); } catch { body = {}; }

  const cfg = await lerConfig();
  if (!cfg) return json({ error: "lagun_bot_lounges_config vazia" }, 500);
  const temAuth = !!req.headers.get("Authorization");

  try {
    // Webhook do Inter: Pix recebido.
    if (!temAuth && Array.isArray(body?.pix)) return await webhookInter(body, cfg);

    // Webhook da AbacatePay: secret + assinatura; mesmo assim consulta a cobrança antes de marcar pago.
    if (new URL(req.url).searchParams.has("abacate") || req.headers.get("X-Webhook-Signature")) {
      if (!(await webhookAbacateValido(req, corpoCru))) return json({ error: "assinatura" }, 401);
      return await webhookAbacate(body, cfg);
    }

    // Cron: o próprio agendamento só chama quando há Pix aberto ou conversa em andamento.
    if (body?.source === "cron") return json({ ok: true, ...(await tick(criarPorta(cfg))) });

    // Página pública /lounges: sem login (o token anon do site vai no Authorization).
    if (typeof body?.action === "string" && body.action.startsWith("site_")) {
      const r = await tratarSite(body, cfg, { sb, criarPorta, infoEvento, hoje, colunas: COLUNAS_RESERVA, paraReserva, ehTeste, pixRealDisponivel, simularPix: async (txid: string) => {
        if (txid.startsWith(TXID_ABACATE_TESTE)) { await simularPixAbacate(idAbacate(txid)); return true; }
        return false;
      } });
      return json(r.body, r.status);
    }

    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    if (body?.action === "webhook_ligar") {
      if (abacateConfigurado()) return json(await ligarWebhookAbacate(`${SUPABASE_URL}/functions/v1/bot-lounges?abacate=1`));
      if (!interConfigurado()) return json({ error: "Nenhum banco de Pix configurado" }, 409);
      return json(await ligarWebhookCobranca(`${SUPABASE_URL}/functions/v1/bot-lounges`));
    }

    if (body?.action === "mensagem") {
      if (!auth.roles.includes("service_role")) return json({ error: "Só o webhook do WhatsApp chama esta ação." }, 403);
      const phone = String(body.phone ?? "").replace(/\D/g, "");
      const entrada = body.entrada as Entrada;
      if (!phone || !entrada?.tipo) return json({ error: "phone e entrada são obrigatórios" }, 400);
      if (!podeResponder(cfg, phone)) return json({ ok: true, ignorado: "bot desligado para este telefone" });
      // Aprende o id do número na primeira mensagem (o webhook reconhece pelo número exibido).
      const pid = body.phone_number_id ? String(body.phone_number_id) : null;
      if (pid && cfg.phone_number_id !== pid) {
        await sb.from("lagun_bot_lounges_config").update({ phone_number_id: pid, updated_at: new Date().toISOString() }).eq("id", true);
        cfg.phone_number_id = pid;
      }
      await tratarMensagem(criarPorta(cfg), phone, body.contact_name ? String(body.contact_name) : null, entrada);
      return json({ ok: true });
    }

    return json({ error: "action inválida" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bot-lounges:", msg);
    return json({ error: msg }, 500);
  }
});

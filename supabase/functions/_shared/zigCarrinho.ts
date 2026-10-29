// ============================================================================
// Carrinho abandonado e estorno da Zig: depois de cada sincronização, manda o
// template do evento (lagun_zig_carrinho). Carrinho: pedido pendente há 30 min
// ou descartado. Estorno: pedido que mudou para estornado nesta sincronização.
// Regras do carrinho:
// • só pedidos feitos depois de ligar o envio (ligado_em);
// • um envio por telefone por evento, e nunca para quem já comprou no evento;
// • o telefone não é gravado: lagun_zig_carrinho_envios guarda o hash.
// Também marca como recuperado o envio cujo telefone voltou com pedido pago.
// ============================================================================

import { normalizarDataZig } from "./zig.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const ESPERA_PENDENTE_MS = 30 * 60_000;
const MAX_POR_RODADA = 50;

const clean = (v: unknown) => String(v ?? "").trim();
const PAGOS = new Set(["finalizado", "aprovado", "pago", "paid", "approved", "concluido", "concluído"]);

function telefoneWhats(raw: unknown): string | null {
  const d = clean(raw).replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Variáveis do template: {{1}} primeiro nome, {{2}} nome do evento; botão com
// link variável recebe o final do link do evento (o que vem depois de botao_url_base).
async function enviarTemplate(cfg: any, para: string, primeiroNome: string, evento: { nome: string; link: string }, token: string) {
  const components: unknown[] = [];
  if (cfg.header_image_url) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: cfg.header_image_url } }] });
  }
  const vars = cfg.template_variable_count ?? 0;
  if (vars >= 1) {
    const valores = [primeiroNome || "tudo bem", evento.nome || "o evento"].slice(0, vars);
    components.push({ type: "body", parameters: valores.map((text) => ({ type: "text", text })) });
  }
  if (cfg.botao_url_base) {
    if (!evento.link.startsWith(cfg.botao_url_base)) {
      return { ok: false as const, erro: `O link do evento não começa com ${cfg.botao_url_base}, como pede o botão do template.` };
    }
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: evento.link.slice(cfg.botao_url_base.length) }] });
  }
  const resp = await fetch(`${GRAPH_API}/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: para,
      type: "template",
      template: {
        name: cfg.template_name,
        language: { code: cfg.template_language || "pt_BR" },
        ...(components.length ? { components } : {}),
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (data?.error) return { ok: false as const, erro: String(data.error.message ?? "erro da Meta").slice(0, 300) };
  return { ok: true as const, wamid: data?.messages?.[0]?.id as string | undefined };
}

const ESTORNOS = new Set(["estornado", "estornado_parcialmente"]);
const receitaDoPedido = (b: any) =>
  (Array.isArray(b?.tickets) ? b.tickets : []).reduce((s: number, t: any) => s + (Number(t?.price) || 0), 0) || Number(b?.order?.total_amount) || 0;

// Reserva o pedido (um envio por pedido e tipo), manda e registra no histórico do WhatsApp.
async function enviarUm(sb: any, eventId: string, tipo: "carrinho" | "estorno", tpl: any, evento: { nome: string; link: string }, orderId: string, b: any, h: string, para: string, token: string) {
  const status = clean(b?.order?.status).toLowerCase();
  // Reserva antes de enviar: duas sincronizações ao mesmo tempo não mandam duas vezes.
  const { error: reserva } = await sb.from("lagun_zig_carrinho_envios").insert({
    order_id: orderId, tipo, event_id: eventId, status_pedido: status, telefone_hash: h, template_name: tpl.template_name,
  });
  if (reserva) return false;
  const primeiroNome = clean(b?.first_name) || clean(b?.name).split(/\s+/)[0] || "";
  const r = await enviarTemplate(tpl, para, primeiroNome, evento, token);
  await sb.from("lagun_zig_carrinho_envios")
    .update({ ok: r.ok, wamid: r.ok ? r.wamid ?? null : null, erro: r.ok ? null : r.erro, enviado_em: new Date().toISOString() })
    .eq("order_id", orderId).eq("tipo", tipo);
  if (!r.ok) return false;
  // Histórico do WhatsApp (mesmo registro do carrinho da Blueticket), pra a resposta cair no chat.
  await sb.from("whatsapp_messages").insert({
    phone: para, contact_name: clean(b?.name) || null, direction: "outgoing", message_type: "template",
    message_text: `[${tipo === "carrinho" ? "Carrinho abandonado" : "Estorno"}] Template: ${tpl.template_name}`, status: "sent", wamid: r.wamid ?? null,
  });
  return true;
}

// porPedido: order_id → comprador como veio da Zig (com phone, name, order, tickets).
// statusAntes: status de cada pedido no banco antes desta sincronização (para ver o estorno acontecer).
export async function dispararCarrinhos(sb: any, eventId: string, porPedido: Map<string, any>, statusAntes: Map<string, string | null> = new Map()) {
  const { data: cfg } = await sb.from("lagun_zig_carrinho").select("*").eq("event_id", eventId).maybeSingle();
  const { data: enviados } = await sb.from("lagun_zig_carrinho_envios")
    .select("order_id, tipo, telefone_hash, recuperado_em, enviado_em").eq("event_id", eventId);
  const doCarrinho = (enviados ?? []).filter((e: any) => e.tipo === "carrinho");
  const jaEnviado = new Set<string>((enviados ?? []).map((e: any) => `${e.order_id}|${e.tipo}`));
  const telefoneJaRecebeu = new Set<string>(doCarrinho.map((e: any) => e.telefone_hash));

  // Quem tem pedido pago no evento (pelo hash do telefone) e quanto foi para o produtor.
  const pagoPorTelefone = new Map<string, number>();
  const comprasPorTelefone = new Map<string, { valor: number; quando: number }[]>();
  const hashes = new Map<any, string | null>();
  for (const b of porPedido.values()) {
    const tel = telefoneWhats(b?.phone);
    hashes.set(b, tel ? await sha256(tel) : null);
  }
  for (const b of porPedido.values()) {
    const h = hashes.get(b);
    if (!h || !PAGOS.has(clean(b?.order?.status).toLowerCase())) continue;
    pagoPorTelefone.set(h, (pagoPorTelefone.get(h) ?? 0) + receitaDoPedido(b));
    const iso = normalizarDataZig(b?.order?.purchase_date);
    if (iso) comprasPorTelefone.set(h, [...(comprasPorTelefone.get(h) ?? []), { valor: receitaDoPedido(b), quando: new Date(iso).getTime() }]);
  }

  // Estorno: quem recebeu a mensagem e comprou de novo depois do envio.
  for (const e of (enviados ?? []).filter((x: any) => x.tipo === "estorno" && !x.recuperado_em)) {
    const depois = (comprasPorTelefone.get(e.telefone_hash) ?? []).filter((c) => c.quando > new Date(e.enviado_em).getTime());
    if (depois.length) {
      await sb.from("lagun_zig_carrinho_envios")
        .update({ recuperado_em: new Date().toISOString(), valor_recuperado: depois.reduce((s, c) => s + c.valor, 0) })
        .eq("order_id", e.order_id).eq("tipo", "estorno");
    }
  }

  // Recuperação: carrinho cujo telefone aparece com pedido pago.
  for (const e of doCarrinho) {
    if (e.recuperado_em) continue;
    const valor = pagoPorTelefone.get(e.telefone_hash);
    if (valor != null) {
      await sb.from("lagun_zig_carrinho_envios")
        .update({ recuperado_em: new Date().toISOString(), valor_recuperado: valor })
        .eq("order_id", e.order_id).eq("tipo", "carrinho");
    }
  }

  const token = Deno.env.get("META_WHATSAPP_TOKEN") || "";
  if (!cfg?.phone_number_id || !token) return { enviados: 0, estornos: 0 };
  const { data: ev } = await sb.from("lagun_events").select("nome, link").eq("id", eventId).maybeSingle();
  const evento = { nome: clean(ev?.nome), link: clean(ev?.link) };
  let enviadosAgora = 0, estornosAgora = 0;

  // ── Carrinho abandonado ──
  if (cfg.enabled && cfg.template_name && cfg.ligado_em) {
    const tpl = { template_name: cfg.template_name, template_language: cfg.template_language, template_variable_count: cfg.template_variable_count, header_image_url: cfg.header_image_url, botao_url_base: cfg.botao_url_base, phone_number_id: cfg.phone_number_id };
    const ligadoEm = new Date(cfg.ligado_em).getTime();
    const agora = Date.now();
    for (const [orderId, b] of porPedido) {
      if (enviadosAgora >= MAX_POR_RODADA) break;
      if (jaEnviado.has(`${orderId}|carrinho`)) continue;
      const status = clean(b?.order?.status).toLowerCase();
      if (status !== "pendente" && status !== "descartado") continue;
      const iso = normalizarDataZig(b?.order?.purchase_date);
      const quando = iso ? new Date(iso).getTime() : NaN;
      if (!Number.isFinite(quando) || quando < ligadoEm) continue;
      if (status === "pendente" && agora - quando < ESPERA_PENDENTE_MS) continue;
      const para = telefoneWhats(b?.phone);
      const h = hashes.get(b);
      if (!para || !h || pagoPorTelefone.has(h) || telefoneJaRecebeu.has(h)) continue;
      telefoneJaRecebeu.add(h);
      if (await enviarUm(sb, eventId, "carrinho", tpl, evento, orderId, b, h, para, token)) enviadosAgora++;
    }
  }

  // ── Estorno: o pedido estava em outro status no banco e agora veio estornado ──
  if (cfg.estorno_enabled && cfg.estorno_template_name && cfg.estorno_ligado_em) {
    const tpl = { template_name: cfg.estorno_template_name, template_language: cfg.estorno_template_language, template_variable_count: cfg.estorno_variable_count, header_image_url: cfg.estorno_header_image_url, botao_url_base: cfg.estorno_botao_url_base, phone_number_id: cfg.phone_number_id };
    for (const [orderId, b] of porPedido) {
      if (estornosAgora >= MAX_POR_RODADA) break;
      if (jaEnviado.has(`${orderId}|estorno`)) continue;
      const status = clean(b?.order?.status).toLowerCase();
      const antes = (statusAntes.get(orderId) ?? "").toLowerCase();
      if (!ESTORNOS.has(status) || !statusAntes.has(orderId) || ESTORNOS.has(antes)) continue;
      const para = telefoneWhats(b?.phone);
      const h = hashes.get(b);
      if (!para || !h) continue;
      if (await enviarUm(sb, eventId, "estorno", tpl, evento, orderId, b, h, para, token)) estornosAgora++;
    }
  }
  return { enviados: enviadosAgora, estornos: estornosAgora };
}

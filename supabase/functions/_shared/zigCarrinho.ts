// ============================================================================
// Carrinho abandonado da Zig: depois de cada sincronização, manda o template do
// evento (lagun_zig_carrinho) para quem tem pedido pendente há 30 min ou
// descartado. Regras:
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

async function enviarTemplate(cfg: any, para: string, primeiroNome: string, token: string) {
  const components: unknown[] = [];
  if (cfg.header_image_url) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: cfg.header_image_url } }] });
  }
  if ((cfg.template_variable_count ?? 0) >= 1) {
    components.push({ type: "body", parameters: [{ type: "text", text: primeiroNome || "tudo bem" }] });
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

// porPedido: order_id → comprador como veio da Zig (com phone, name, order, tickets).
export async function dispararCarrinhos(sb: any, eventId: string, porPedido: Map<string, any>) {
  const { data: cfg } = await sb.from("lagun_zig_carrinho").select("*").eq("event_id", eventId).maybeSingle();
  const { data: enviados } = await sb.from("lagun_zig_carrinho_envios")
    .select("order_id, telefone_hash, recuperado_em").eq("event_id", eventId);
  const jaEnviado = new Set<string>((enviados ?? []).map((e: any) => e.order_id));
  const telefoneJaRecebeu = new Set<string>((enviados ?? []).map((e: any) => e.telefone_hash));

  // Quem tem pedido pago no evento (pelo hash do telefone) e o quanto pagou.
  const pagoPorTelefone = new Map<string, { valor: number; quando: string | null }>();
  const compradores = [...porPedido.values()];
  const hashes = new Map<any, string | null>();
  for (const b of compradores) {
    const tel = telefoneWhats(b?.phone);
    hashes.set(b, tel ? await sha256(tel) : null);
  }
  for (const b of compradores) {
    const h = hashes.get(b);
    if (!h || !PAGOS.has(clean(b?.order?.status).toLowerCase())) continue;
    const atual = pagoPorTelefone.get(h);
    pagoPorTelefone.set(h, { valor: (atual?.valor ?? 0) + (Number(b?.order?.total_amount) || 0), quando: clean(b?.order?.purchase_date) || atual?.quando || null });
  }

  // Recuperação: envio cujo telefone aparece com pedido pago.
  for (const e of enviados ?? []) {
    if (e.recuperado_em) continue;
    const pago = pagoPorTelefone.get(e.telefone_hash);
    if (pago) {
      await sb.from("lagun_zig_carrinho_envios")
        .update({ recuperado_em: new Date().toISOString(), valor_recuperado: pago.valor })
        .eq("order_id", e.order_id);
    }
  }

  if (!cfg?.enabled || !cfg.template_name || !cfg.phone_number_id || !cfg.ligado_em) return { enviados: 0 };
  const token = Deno.env.get("META_WHATSAPP_TOKEN") || "";
  if (!token) return { enviados: 0, erro: "META_WHATSAPP_TOKEN ausente" };

  const ligadoEm = new Date(cfg.ligado_em).getTime();
  const agora = Date.now();
  let enviadosAgora = 0;
  for (const [orderId, b] of porPedido) {
    if (enviadosAgora >= MAX_POR_RODADA) break;
    if (jaEnviado.has(orderId)) continue;
    const status = clean(b?.order?.status).toLowerCase();
    if (status !== "pendente" && status !== "descartado") continue;
    const iso = normalizarDataZig(b?.order?.purchase_date);
    const quando = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(quando) || quando < ligadoEm) continue;
    if (status === "pendente" && agora - quando < ESPERA_PENDENTE_MS) continue;
    const para = telefoneWhats(b?.phone);
    const h = hashes.get(b);
    if (!para || !h || pagoPorTelefone.has(h) || telefoneJaRecebeu.has(h)) continue;

    const primeiroNome = clean(b?.first_name) || clean(b?.name).split(/\s+/)[0] || "";
    // Reserva o pedido antes de enviar: duas sincronizações ao mesmo tempo não mandam duas vezes.
    const { error: reserva } = await sb.from("lagun_zig_carrinho_envios").insert({
      order_id: orderId, event_id: eventId, status_pedido: status, telefone_hash: h, template_name: cfg.template_name,
    });
    telefoneJaRecebeu.add(h);
    if (reserva) continue;
    const r = await enviarTemplate(cfg, para, primeiroNome, token);
    await sb.from("lagun_zig_carrinho_envios")
      .update({ ok: r.ok, wamid: r.ok ? r.wamid ?? null : null, erro: r.ok ? null : r.erro, enviado_em: new Date().toISOString() })
      .eq("order_id", orderId);
    if (r.ok) {
      enviadosAgora++;
      // Histórico do WhatsApp (mesmo registro do carrinho da Blueticket), pra a resposta cair no chat.
      await sb.from("whatsapp_messages").insert({
        phone: para, contact_name: clean(b?.name) || null, direction: "outgoing", message_type: "template",
        message_text: `[Carrinho abandonado] Template: ${cfg.template_name}`, status: "sent", wamid: r.wamid ?? null,
      });
    }
  }
  return { enviados: enviadosAgora };
}

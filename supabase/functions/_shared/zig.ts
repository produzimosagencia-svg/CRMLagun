// ============================================================================
// Zig (Superticket): leitura dos compradores de um evento e gravação dos
// pedidos em lagun_zig_orders e dos ingressos em lagun_zig_tickets. Usado pela
// lagun-zig-sync (cron a cada 10 min) e pela lagun-resumo-produtores
// (sincroniza o evento antes de montar o resumo).
// Nenhum dado pessoal do comprador é gravado: só pedido, status, data, valor,
// forma de pagamento, cupom e, por ingresso, setor, lote, preço e cortesia.
// ============================================================================

const API = "https://public-api.superticket.com.br";
const PER_PAGE = 200;

const clean = (v: unknown) => String(v ?? "").trim();

// A Zig costuma mandar a data com fuso. Se vier sem (ex.: "2026-09-20 14:33:00"),
// é horário de Brasília (UTC-3, sem horário de verão).
export function normalizarDataZig(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const temFuso = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const d = new Date(temFuso ? iso : `${iso}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Busca todas as páginas de compradores (mesma estratégia do BoomRAP: novas
// tentativas em 429/5xx, páginas em lotes de 3, teto de 100 páginas).
export async function buscarCompradores(zigEventId: string, token: string) {
  const requestPage = async (page: number) => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(
          `${API}/buyers?eventId=${encodeURIComponent(zigEventId)}&page=${page}&perPage=${PER_PAGE}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal },
        );
        if (response.ok) {
          const json = await response.json();
          return {
            items: (Array.isArray(json) ? json : (json.data ?? [])) as any[],
            total: Number(Array.isArray(json) ? 0 : json.total) || 0,
          };
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Zig recusou o token (HTTP ${response.status})`);
        }
        if (![429, 502, 503, 504].includes(response.status) || attempt === 4) {
          throw new Error(`Zig buyers: HTTP ${response.status}`);
        }
      } catch (error) {
        if (attempt === 4 || (error instanceof Error && error.message.startsWith("Zig recusou"))) throw error;
      } finally {
        clearTimeout(timeout);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
    throw new Error("Zig buyers: falha após novas tentativas");
  };

  const first = await requestPage(1);
  const rows = [...first.items];
  const totalPages = first.total
    ? Math.min(100, Math.ceil(first.total / PER_PAGE))
    : (first.items.length < PER_PAGE ? 1 : 100);

  if (first.total) {
    for (let start = 2; start <= totalPages; start += 3) {
      const pages = Array.from({ length: Math.min(3, totalPages - start + 1) }, (_, i) => start + i);
      const results = await Promise.all(pages.map(requestPage));
      for (const result of results) rows.push(...result.items);
    }
  } else {
    // Sem "total" na resposta: segue página a página até vir uma incompleta.
    for (let page = 2; page <= totalPages && rows.length === (page - 1) * PER_PAGE; page++) {
      const result = await requestPage(page);
      rows.push(...result.items);
      if (result.items.length < PER_PAGE) break;
    }
  }
  return rows;
}

// Cupom do pedido. A Zig manda {} sem cupom e { coupon_code, discount_value }
// com cupom; aceita também uma lista, por garantia.
function lerDesconto(raw: unknown): { cupom: string | null; valor: number } {
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return { cupom: null, valor: 0 };
  const d = item as Record<string, unknown>;
  return {
    cupom: clean(d.coupon_code ?? d.code) || null,
    valor: Number(d.discount_value ?? d.value) || 0,
  };
}

const sim = (v: unknown) => v === true || Number(v) === 1 || clean(v).toLowerCase() === "true";

// Erro de coluna ou tabela que ainda não existe (migração 20261028230000 não
// aplicada): a sync volta a gravar só as contagens, como antes.
const faltaMigracao = (msg: string) =>
  /payment_method|coupon_code|discount_value|lagun_zig_tickets|schema cache|does not exist/i.test(msg);

// Sincroniza um evento: busca na Zig e faz upsert dos pedidos e ingressos.
export async function sincronizarEvento(sb: any, eventId: string) {
  const [{ data: cfg }, { data: cred }] = await Promise.all([
    sb.from("lagun_event_zig").select("zig_event_id").eq("event_id", eventId).maybeSingle(),
    sb.from("lagun_zig_credentials").select("token").eq("event_id", eventId).maybeSingle(),
  ]);
  if (!cfg?.zig_event_id || !cred?.token) throw new Error("Evento sem configuração da Zig");

  try {
    const compradores = await buscarCompradores(cfg.zig_event_id, cred.token);
    // A API pode repetir a última página durante atualizações simultâneas.
    const porPedido = new Map<string, any>();
    for (const buyer of compradores) {
      const orderId = clean(buyer?.order?.id);
      if (orderId) porPedido.set(orderId, buyer);
    }
    const agora = new Date().toISOString();
    const base = [...porPedido.entries()].map(([orderId, buyer]) => ({
      order_id: orderId,
      event_id: eventId,
      zig_event_id: cfg.zig_event_id,
      status: clean(buyer.order?.status).toLowerCase() || null,
      purchase_date: normalizarDataZig(buyer.order?.purchase_date),
      tickets_count: Array.isArray(buyer.tickets) ? buyer.tickets.length : 0,
      total_amount: Number(buyer.order?.total_amount) || 0,
      updated_at: agora,
    }));
    const linhas = base.map((linha) => {
      const buyer = porPedido.get(linha.order_id);
      const desconto = lerDesconto(buyer.order?.discounts);
      return {
        ...linha,
        payment_method: clean(buyer.order?.payment_method) || null,
        coupon_code: desconto.cupom,
        discount_value: desconto.valor,
      };
    });
    const ingressos = [...porPedido.entries()].flatMap(([orderId, buyer]) =>
      (Array.isArray(buyer.tickets) ? buyer.tickets : []).map((t: any, seq: number) => ({
        order_id: orderId,
        seq,
        event_id: eventId,
        zig_event_id: cfg.zig_event_id,
        sector: clean(t?.sector) || null,
        lot: clean(t?.lot) || null,
        price: Number(t?.price) || 0,
        is_courtesy: sim(t?.is_courtesy),
        is_passport: sim(t?.is_passport),
        synced_at: agora,
      }))
    );

    let detalhe = true;
    for (let start = 0; start < linhas.length; start += 500) {
      const lote = detalhe ? linhas.slice(start, start + 500) : base.slice(start, start + 500);
      let { error } = await sb.from("lagun_zig_orders").upsert(lote, { onConflict: "order_id" });
      if (error && detalhe && faltaMigracao(error.message)) {
        detalhe = false;
        ({ error } = await sb.from("lagun_zig_orders").upsert(base.slice(start, start + 500), { onConflict: "order_id" }));
      }
      if (error) throw new Error(error.message);
    }

    if (detalhe) {
      for (let start = 0; start < ingressos.length; start += 500) {
        const { error } = await sb.from("lagun_zig_tickets").upsert(ingressos.slice(start, start + 500), { onConflict: "order_id,seq" });
        if (error) throw new Error(error.message);
      }
      // Ingresso que sumiu do pedido na Zig (pedido refeito, troca) sai daqui.
      const { error: erroLimpeza } = await sb.from("lagun_zig_tickets").delete().eq("event_id", eventId).lt("synced_at", agora);
      if (erroLimpeza) throw new Error(erroLimpeza.message);
    }

    await sb.from("lagun_event_zig")
      .update({ last_sync_at: agora, last_sync_error: null, orders_count: linhas.length })
      .eq("event_id", eventId);
    return { pedidos: linhas.length, ingressos: detalhe ? ingressos.length : null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await sb.from("lagun_event_zig")
      .update({ last_sync_at: new Date().toISOString(), last_sync_error: msg.slice(0, 500) })
      .eq("event_id", eventId);
    throw error;
  }
}

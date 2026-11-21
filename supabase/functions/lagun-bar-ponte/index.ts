import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ABERTO_MS, ErroZig, SEM_VENDA_MS, diaSP, ehVendaDeBar, lojasDaRede, norm, quando, zig } from "../_shared/casaLagun.ts";

// Ponte só de hoje: resumo do bar da Lagun para o app da Tríade (pedido do Guilherme, 2026-11-21).
// A chave da Zig da Lagun NÃO sai daqui: a Tríade recebe só números agregados do evento de hoje.
// Formato igual ao bar_ao_vivo da Tríade (Fantástico Mundo do Lukão, 14/11), para a tela renderizar igual:
//
//   POST (servidor a servidor, header x-ponte-segredo = secret PONTE_TRIADE_SEGREDO)
//     → { ok, aberto, evento { nome, data } | null,
//         total (recebido no caixa, sem bônus), consumo (soma dos produtos), transacoes, ticketMedio
//         (consumo / vendas), ultimaHora, porHora [{ em, h, valor }], bares [{ nome, valor }] (cada PDV,
//         ambulantes juntos, do maior para o menor), produtos (top 8 [{ nome, qtd, valor, imagem, categoria }],
//         foto do cardápio da Zig), ultimaVenda, atualizadoEm, expiraEm }
//
// Bar = venda de produto ao público: fora estorno, gorjeta, caução do cartão, bilheteria e máquinas PRODUÇÃO.
// Sem dado pessoal (nada de lounges, check-in, cliente, telefone, login de operador), sem token, sem loja.
// Expira sozinha em 2026-11-22 08:00 (Brasília): depois disso responde 410, com ou sem segredo.
// Segredo errado ou ausente: 401. Para desligar antes: `supabase secrets unset PONTE_TRIADE_SEGREDO`
// (ou apagar a função lagun-bar-ponte). Cache de 30 s (como a Tríade).

const EXPIRA_EM = Date.parse("2026-11-22T08:00:00-03:00");
const HORA = 3600_000;
// deno-lint-ignore no-explicit-any
type Any = any;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const reais = (c: number) => Math.round(c) / 100;
const comFuso = (t: unknown) => { const s = t ? String(t) : ""; return !s ? null : /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`; };
const horaBrasilia = (ms: number) => (((Math.floor(ms / HORA) - 3) % 24) + 24) % 24;

/** Compara em tempo constante (hash dos dois lados, mesmo tamanho). */
async function segredoConfere(recebido: string, esperado: string) {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(recebido), h(esperado)]);
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

/** Nome do PDV (regra da Tríade: barName; ambulante sem bar = "Ambulantes"; sem os dois, o tipo do login sem número). */
function nomeDoBar(x: Any): string {
  const bar = String(x?.barName || "").trim();
  if (bar) return bar;
  if (x?.hawkerName) return "Ambulantes";
  const tipo = String(x?.employeeName || "").split("|")[0].replace(/[-\s]*\d+\s*$/, "").trim();
  return tipo || "Sem bar";
}

/** Recebido do evento (formas de pagamento, sem bônus; devolvido desconta). Centavos. */
function recebidoDoEvento(faturamento: Any[], evento: string) {
  let total = 0;
  for (const x of faturamento) {
    if (String(x?.eventId) !== evento) continue;
    const forma = norm(x?.paymentName);
    if (forma.includes("BONUS")) continue;
    const v = Number(x?.value) || 0;
    total += forma.includes("DEVOLVID") ? -Math.abs(v) : v;
  }
  return total;
}

const cacheCardapio = new Map<string, { em: number; porId: Map<string, { imagem: string | null; categoria: string | null }> }>();
async function cardapio(loja: string) {
  const g = cacheCardapio.get(loja);
  if (g && Date.now() - g.em < 600_000) return g.porId;
  const porId = new Map<string, { imagem: string | null; categoria: string | null }>();
  try { for (const p of await zig("erp/menuProducts", { loja })) porId.set(String(p.id), { imagem: p.imageUrl || null, categoria: p.category || null }); }
  catch { /* sem cardápio: produtos sem foto */ }
  cacheCardapio.set(loja, { em: Date.now(), porId });
  return porId;
}

/** Noite da Lagun (lagun_events): vínculo à mão com o evento da Zig; senão a noite do dia (antes das 8 h, a de ontem). */
async function nomeDaNoite(admin: Any, zigEventId: string | null) {
  if (zigEventId) {
    const { data: v } = await admin.from("lagun_zig_evento_noite").select("lagun_events(nome, data)").eq("zig_event_id", zigEventId).maybeSingle();
    if (v?.lagun_events?.nome) return { nome: String(v.lagun_events.nome), data: String(v.lagun_events.data) };
  }
  const horaSP = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const { data: n } = await admin.from("lagun_events").select("nome, data").eq("data", diaSP(horaSP < 8 ? -1 : 0)).limit(1).maybeSingle();
  return n?.nome ? { nome: String(n.nome), data: String(n.data) } : null;
}

let cache: { em: number; dados: Record<string, unknown> } | null = null;

async function lerBar(admin: Any): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.em < 30_000) return cache.dados;
  const lojas = await lojasDaRede();
  const periodo = { dtinicio: diaSP(-2), dtfim: diaSP(0) };
  const porLoja = await Promise.all(lojas.map(async (l) => {
    try {
      const [faturamento, itens, fotos] = await Promise.all([zig("erp/faturamento", { ...periodo, loja: l.id }), zig("erp/saida-produtos", { ...periodo, loja: l.id }), cardapio(l.id)]);
      return { loja: l.id, faturamento, itens, fotos, ok: true };
    } catch {
      return { loja: l.id, faturamento: [] as Any[], itens: [] as Any[], fotos: new Map<string, { imagem: string | null; categoria: string | null }>(), ok: false };
    }
  }));
  const lidas = porLoja.filter((p) => p.ok);
  if (!lidas.length) throw new ErroZig("zig", 502);

  // Evento aberto (mesma regra do app da Lagun): o mais novo de cada loja, até 30 h depois de criado e 4 h sem venda.
  const eventos = new Map<string, { id: string; data: string; loja: string; nome: string | null }>();
  for (const p of lidas) for (const x of [...p.faturamento, ...p.itens]) if (x?.eventId) {
    const id = String(x.eventId);
    const e = eventos.get(id) ?? { id, data: String(x.eventDate ?? ""), loja: p.loja, nome: null };
    if (!e.nome && x.eventName) e.nome = String(x.eventName);
    eventos.set(id, e);
  }
  const ordenados = [...eventos.values()].sort((a, b) => b.data.localeCompare(a.data));
  const ultimaDe = new Map<string, number>();
  for (const p of lidas) for (const x of p.itens) if (x?.eventId) { const t = quando(x.transactionDate); if (t > (ultimaDe.get(String(x.eventId)) ?? 0)) ultimaDe.set(String(x.eventId), t); }
  const maisNovo = new Map<string, string>();
  for (const e of ordenados) if (!maisNovo.has(e.loja)) maisNovo.set(e.loja, e.id);
  const abertos = ordenados.filter((e) => maisNovo.get(e.loja) === e.id && Date.now() - quando(e.data) < ABERTO_MS && (!ultimaDe.get(e.id) || Date.now() - ultimaDe.get(e.id)! < SEM_VENDA_MS));
  const base = { atualizadoEm: new Date().toISOString(), expiraEm: new Date(EXPIRA_EM).toISOString() };

  if (!abertos.length) {
    const n = await nomeDaNoite(admin, null).catch(() => null);
    const dados = { ...base, aberto: false, evento: n, total: 0, consumo: 0, transacoes: 0, ticketMedio: 0, ultimaHora: 0, porHora: [], bares: [], produtos: [], ultimaVenda: null };
    cache = { em: Date.now(), dados };
    return dados;
  }

  const ids = new Set(abertos.map((e) => e.id));
  const fotos = new Map<string, { imagem: string | null; categoria: string | null }>();
  for (const p of lidas) for (const [k, v] of p.fotos) fotos.set(k, v);
  const vendas = lidas.flatMap((p) => p.itens).filter((x) => ids.has(String(x.eventId)) && ehVendaDeBar(x));
  const valor = (x: Any) => (Number(x.unitValue) || 0) * (Number(x.count) || 0) - (Number(x.discountValue) || 0);
  const bares = new Map<string, number>();
  const produtos = new Map<string, { qtd: number; valor: number; imagem: string | null; categoria: string | null }>();
  const porHora = new Map<number, number>();
  const transacoes = new Set<string>();
  const umaHora = Date.now() - HORA;
  let consumo = 0, ultimaHora = 0, ultimaVenda = 0;
  for (const x of vendas) {
    const v = valor(x), t = quando(x.transactionDate);
    consumo += v;
    if (t) { const h = Math.floor(t / HORA) * HORA; porHora.set(h, (porHora.get(h) ?? 0) + v); if (t > ultimaVenda) ultimaVenda = t; if (t >= umaHora) ultimaHora += v; }
    transacoes.add(String(x.transactionId));
    const bar = nomeDoBar(x);
    bares.set(bar, (bares.get(bar) ?? 0) + v);
    const nome = String(x.productName || "Sem nome").trim();
    const doCardapio = fotos.get(String(x.productId));
    const p = produtos.get(nome) ?? { qtd: 0, valor: 0, imagem: doCardapio?.imagem ?? null, categoria: doCardapio?.categoria ?? x.productCategory ?? null };
    p.qtd += Number(x.count) || 0; p.valor += v; produtos.set(nome, p);
  }
  const faturamento = lidas.flatMap((p) => p.faturamento);
  const recebido = [...ids].reduce((t, id) => t + recebidoDoEvento(faturamento, id), 0);
  const principal = abertos[0];
  const noite = await nomeDaNoite(admin, principal.id).catch(() => null);
  const dados = {
    ...base, aberto: true,
    evento: { nome: noite?.nome ?? principal.nome ?? "Noite na Lagun", data: comFuso(principal.data) },
    // Igual à Tríade: número principal = recebido no caixa (sem bônus). Sem recebido ainda, o consumo.
    total: reais(recebido > 0 ? recebido : consumo),
    consumo: reais(consumo),
    transacoes: transacoes.size,
    ticketMedio: transacoes.size ? reais(consumo / transacoes.size) : 0,
    ultimaHora: reais(ultimaHora),
    porHora: [...porHora].sort((a, b) => a[0] - b[0]).map(([em, v]) => ({ em: new Date(em).toISOString(), h: horaBrasilia(em), valor: reais(v) })),
    bares: [...bares].map(([nome, v]) => ({ nome, valor: reais(v) })).sort((a, b) => b.valor - a.valor).slice(0, 40),
    produtos: [...produtos].map(([nome, p]) => ({ nome, qtd: p.qtd, valor: reais(p.valor), imagem: p.imagem, categoria: p.categoria })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    ultimaVenda: ultimaVenda ? new Date(ultimaVenda).toISOString() : null,
  };
  cache = { em: Date.now(), dados };
  return dados;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Date.now() >= EXPIRA_EM) return json({ error: "ponte_expirada" }, 410);
  const esperado = Deno.env.get("PONTE_TRIADE_SEGREDO") || "";
  const recebido = req.headers.get("x-ponte-segredo") || "";
  if (esperado.length < 32 || !recebido || !(await segredoConfere(recebido, esperado))) return json({ error: "nao_autorizado" }, 401);
  try {
    return json({ ok: true, ...(await lerBar(sb())) });
  } catch (e) {
    if (e instanceof ErroZig) return json({ error: "zig_indisponivel" }, 502);
    console.error("[lagun-bar-ponte]", e);
    return json({ error: "erro_interno" }, 500);
  }
});

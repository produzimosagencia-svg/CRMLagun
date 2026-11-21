// "Casa" da Lagun ao vivo: bar (Zig Bar, API ERP), check-ins e lounges da noite.
// Usado pela função lagun-bar-ao-vivo (telas Ao vivo e Mapa do app Lagun Administração) e pela
// lagun-bar-push (Live Activity "Casa"). 2026-11-19/20, no modelo da Tríade (Fantástico Mundo do Lukão).
//
// Zig: lê todas as lojas que o token alcança (hoje só a LAGUN VIX) e acha sozinha o evento aberto
// (aberto no caixa da Zig há menos de 14 h). Nada é ligado à mão.
// Bar: venda de produto ao público. Fora: estorno, gorjeta, caução do cartão (ZigCard/CAUÇÃO),
// bilheteria (ingresso vendido na porta) e máquinas "PRODUÇÃO".
// Dois bares na planta: B1 "Bar da pista" e B2 "Bar VIP". Regra: PDV com VIP/CAMAROTE/LOUNGE no nome
// vai para o VIP; o resto (hoje "BAR GERAL") é o da pista. Secret ZIG_BAR_MAPA (opcional, JSON) troca:
//   {"BAR GERAL": "B1", "BAR VIP 2": "B2", "TABACARIA": "fora"}   (chave = barName ou login do operador)
// Lounges: catálogo lagun_lounges (L1..L6) + reservas da noite (lagun_lounge_reservas, mesma tabela do
// bot e do site). Reservado = reserva confirmada; ocupado = reserva confirmada cujo titular já fez
// check-in na Zig (telefone igual). Consumo por lounge: a API ERP não expõe comanda por mesa
// (conferido em 2026-11-20: /erp/comandas, /erp/mesas, /erp/tabs dão 404), então vai null.
// Check-in: só números saem daqui (nome, CPF e telefone ficam no servidor).
// Valores da Zig vêm em centavos.

export const ZIG_ERP = "https://api.zigcore.com.br/integration";
/** Loja "LAGUN VIX" (a única que o token da Lagun enxerga, conferido em 2026-11-19). */
export const LOJA_PADRAO = "589d0a1f-08f5-402f-a73f-8d10fd5f5820";
const AGENTE = "lagun-app-admin/1.1";
/**
 * Evento aberto (regra de 2026-11-20): em cada loja só o evento MAIS NOVO da Zig pode estar aberto
 * (o anterior foi substituído). Ele conta como aberto até 30 h depois de criado, e, se já vendeu,
 * até 4 h depois da última venda. A Lagun cria o evento de manhã e vende de madrugada.
 */
export const ABERTO_MS = 30 * 3600_000;
export const SEM_VENDA_MS = 4 * 3600_000;

export class ErroZig extends Error {
  status: number;
  constructor(msg: string, status = 502) { super(msg); this.status = status; }
}

// deno-lint-ignore no-explicit-any
type Any = any;

export async function zig(caminho: string, q: Record<string, string>): Promise<Any[]> {
  const token = Deno.env.get("ZIG_ERP_TOKEN") || "";
  if (!token) throw new ErroZig("O acesso à Zig do bar ainda não foi configurado no servidor.", 503);
  const r = await fetch(`${ZIG_ERP}/${caminho}?${new URLSearchParams(q)}`, {
    headers: { Authorization: token, Accept: "application/json", "User-Agent": AGENTE },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const invalido = j?.type === "InvalidToken" || r.status === 401 || r.status === 403;
    throw new ErroZig(invalido ? "A Zig recusou o token do bar." : `A Zig não respondeu (${r.status}).`, 502);
  }
  return Array.isArray(j) ? j : [];
}

/** Data (AAAA-MM-DD) em São Paulo, deslocada em dias. */
export const diaSP = (deslocamento = 0, base = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(base + deslocamento * 86400000));

/** As datas da Zig ERP vêm sem fuso, mas em UTC (igual na Tríade). Devolve com "Z". */
const comFuso = (t: unknown) => {
  const s = t ? String(t) : "";
  if (!s) return null;
  return /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
};
export const quando = (t: unknown) => Date.parse(comFuso(t) || "") || 0;
export const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const reais = (c: number) => Math.round(c) / 100;
const HORA = 3600_000;
const horaBrasilia = (ms: number) => (((Math.floor(ms / HORA) - 3) % 24) + 24) % 24;
/** Só os 11 últimos dígitos (DDD + número), para casar telefones de formatos diferentes. */
const fone = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-11);

// ── O que é venda de bar ─────────────────────────────────────────────────────
const ehProducao = (x: Any) => norm(x?.employeeName).startsWith("PRODUCAO");
const ehCaucao = (x: Any) => x?.type === "ZigCard" || /^CAUCAO/.test(norm(x?.productName));
const ehBilheteria = (x: Any) => /BILHETERIA/.test(norm(x?.barName)) || /BILHETERIA/.test(norm(x?.productCategory)) || /^INGRESSO/.test(norm(x?.productName));
export const ehVendaDeBar = (x: Any) => !x?.isRefunded && x?.type !== "Tip" && !ehCaucao(x) && !ehBilheteria(x) && !ehProducao(x);

/** Nome do PDV na Zig (barName; sem barName, o login do operador sem o número). */
function pdvDe(x: Any): string {
  const bar = String(x?.barName || "").trim();
  if (bar) return bar;
  if (x?.hawkerName) return "Ambulantes";
  const login = String(x?.employeeName || "").split("|")[0].replace(/[-\s]*\d+\s*$/, "").trim();
  return login || "Sem bar";
}

/** B1 (pista), B2 (VIP) ou "fora". */
export type IdBar = "B1" | "B2";
let mapaLido: { bruto: string; m: Map<string, string> } | null = null;
function barDaPlanta(x: Any): IdBar | "fora" {
  const bruto = Deno.env.get("ZIG_BAR_MAPA") || "";
  if (!mapaLido || mapaLido.bruto !== bruto) {
    const m = new Map<string, string>();
    try { for (const [k, v] of Object.entries(JSON.parse(bruto || "{}") ?? {})) m.set(norm(k), norm(typeof v === "string" ? v : (v as Any)?.bar)); } catch { /* JSON inválido: só a regra */ }
    mapaLido = { bruto, m };
  }
  const login = norm(x?.employeeName), tipo = login.split("|")[0].replace(/[-\s]*\d+\s*$/, "").trim();
  const manual = mapaLido.m.get(norm(x?.barName)) ?? mapaLido.m.get(login) ?? mapaLido.m.get(tipo);
  if (manual === "B1" || manual === "B2") return manual;
  if (manual === "FORA") return "fora";
  return /VIP|CAMAROTE|LOUNGE/.test(norm(x?.barName)) ? "B2" : "B1";
}
const NOME_BAR: Record<IdBar, string> = { B1: "Bar da pista", B2: "Bar VIP" };

// ── Lojas que o token alcança (todas da rede; as que recusarem ficam de fora por 10 min) ──
let lojasCache: { em: number; lojas: { id: string; nome: string }[] } | null = null;
const lojaRecusada = new Map<string, number>();
export async function lojasDaRede(): Promise<{ id: string; nome: string }[]> {
  if (lojasCache && Date.now() - lojasCache.em < 600_000) return lojasCache.lojas;
  const extra = Deno.env.get("ZIG_ERP_LOJA");
  let lojas: { id: string; nome: string }[] = [];
  try {
    const rede = Deno.env.get("ZIG_ERP_REDE") || "";
    lojas = (await zig("erp/lojas", rede ? { rede } : {}))
      .map((l: Any) => ({ id: String(l?.id ?? l?.lojaId ?? ""), nome: String(l?.name ?? l?.nome ?? "Loja").replace(/\s+/g, " ").trim() }))
      .filter((l) => l.id);
  } catch { /* sem a lista: fica com a loja padrão */ }
  // Loja de ingresso (ex.: "LAGUN VIX TICKETS") não é bar. Secret ZIG_ERP_LOJAS_FORA (JSON com ids ou trechos de nome) troca a regra.
  let fora: string[] = ["TICKET"];
  try { const f = JSON.parse(Deno.env.get("ZIG_ERP_LOJAS_FORA") || "null"); if (Array.isArray(f)) fora = f.map((x) => norm(x)); } catch { /* fica a padrão */ }
  lojas = lojas.filter((l) => !fora.some((f) => f && (norm(l.id) === f || norm(l.nome).includes(f))));
  if (!lojas.some((l) => l.id === LOJA_PADRAO)) lojas.push({ id: LOJA_PADRAO, nome: "LAGUN VIX" });
  if (extra && !lojas.some((l) => l.id === extra)) lojas.push({ id: extra, nome: "Loja" });
  lojasCache = { em: Date.now(), lojas };
  return lojas;
}

/** Recebido (formas de pagamento do evento) separado em dinheiro e bônus. Centavos. */
function recebidoDoEvento(faturamento: Any[], evento: string) {
  let dinheiro = 0, bonus = 0;
  for (const x of faturamento) {
    if (String(x?.eventId) !== evento) continue;
    const forma = norm(x?.paymentName);
    const v = Number(x?.value) || 0;
    if (forma.includes("BONUS")) { bonus += v; continue; }
    dinheiro += forma.includes("DEVOLVID") ? -Math.abs(v) : v;
  }
  return { dinheiro, bonus };
}

/** Check-ins da loja desde a abertura do evento (todas as páginas). */
async function checkinsDaLoja(loja: string, desde: number) {
  const pessoas = new Map<string, { entrou: number; saiu: boolean; fone: string }>();
  // O "desde" da Zig não respeita o fuso (conferido em 2026-11-19): pede com 12 h de folga e filtra
  // aqui pela hora do check-in (UTC), a partir de 3 h antes da abertura. Máximo de 5 dias por consulta.
  const inicio = new Date(Math.max(desde - 12 * HORA, Date.now() - 4.5 * 86400_000)).toISOString();
  const aPartir = desde - 3 * HORA;
  for (let page = 1; page <= 60; page++) {
    const lista = await zig("erp/checkins", { loja, desde: inicio, page: String(page) });
    if (!lista.length) break;
    let novos = 0;
    for (const c of lista) {
      const id = String(c?.id ?? "");
      if (!id || pessoas.has(id)) continue;
      novos++;
      const entrou = quando(c.checkinTime);
      if (entrou && entrou < aPartir) continue;
      pessoas.set(id, { entrou, saiu: !!c.checkoutTime, fone: fone(c.phone) });
    }
    if (!novos) break; // a Zig repetiu a página
  }
  return [...pessoas.values()];
}

// ── Lounges da noite ─────────────────────────────────────────────────────────
export type StatusLounge = "ocupado" | "reservado" | "livre";
export interface LoungeNoite {
  id: string; nome: string; categoria: string | null; capacidade: number; preco: number;
  status: StatusLounge; cliente: string | null; pessoas: number | null; consumo: number | null;
  chegouEm: string | null; obs: string;
}

/**
 * Noite da Lagun (lagun_events) do evento da Zig. Primeiro o vínculo feito à mão
 * (lagun_zig_evento_noite); sem vínculo, a noite do dia em que o evento foi criado na Zig
 * (criado antes das 8 h conta o dia anterior, porque é a madrugada da noite de ontem).
 */
async function noiteDoDia(admin: Any, abertoEm: number | null, zigEventId?: string | null) {
  if (zigEventId) {
    const { data: v } = await admin.from("lagun_zig_evento_noite").select("lagun_events(id, nome, data)").eq("zig_event_id", zigEventId).maybeSingle();
    const n = v?.lagun_events;
    if (n) return { id: String(n.id), nome: String(n.nome), data: String(n.data) };
  }
  const base = abertoEm || Date.now();
  const horaSP = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date(base)));
  const dia = diaSP(horaSP < 8 ? -1 : 0, base);
  const { data } = await admin.from("lagun_events").select("id, nome, data").eq("data", dia).limit(1).maybeSingle();
  return data ? { id: String(data.id), nome: String(data.nome), data: String(data.data) } : null;
}

async function loungesDaNoite(admin: Any, noiteId: string | null, fonesQueEntraram: Map<string, number>): Promise<LoungeNoite[]> {
  const { data: cat } = await admin.from("lagun_lounges").select("id, codigo, nome, categoria, capacidade, preco, ordem").not("codigo", "is", null).eq("ativo", true).order("ordem");
  const catalogo = (cat ?? []).filter((l: Any) => /^L\d+$/.test(String(l.codigo)));
  let reservas: Any[] = [], precos = new Map<string, number>();
  if (noiteId) {
    const [{ data: rs }, { data: el }] = await Promise.all([
      admin.from("lagun_lounge_reservas").select("lounge_id, nome, pessoas, status, telefone, cliente_id, expira_em, created_at").eq("event_id", noiteId).in("status", ["confirmada", "aguardando"]),
      admin.from("lagun_evento_lounges").select("lounge_id, preco").eq("event_id", noiteId),
    ]);
    reservas = rs ?? [];
    precos = new Map((el ?? []).map((x: Any) => [String(x.lounge_id), Number(x.preco)]));
    // Reserva feita pelo app do cliente: telefone vem do cadastro.
    const ids = reservas.filter((r) => !r.telefone && r.cliente_id).map((r) => r.cliente_id);
    if (ids.length) {
      const { data: cli } = await admin.from("lagun_app_clientes").select("id, telefone").in("id", ids);
      const porId = new Map((cli ?? []).map((c: Any) => [String(c.id), String(c.telefone)]));
      for (const r of reservas) if (!r.telefone && r.cliente_id) r.telefone = porId.get(String(r.cliente_id)) ?? null;
    }
  }
  const primeiroNome = (s: unknown) => {
    const p = String(s ?? "").trim().split(/\s+/).filter(Boolean);
    return p.length ? (p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]) : null;
  };
  const hhmm = (ms: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  return catalogo.map((l: Any) => {
    const conf = reservas.find((r) => String(r.lounge_id) === String(l.id) && r.status === "confirmada");
    const pix = reservas.find((r) => String(r.lounge_id) === String(l.id) && r.status === "aguardando" && (!r.expira_em || Date.parse(r.expira_em) > Date.now()));
    const chegou = conf ? fonesQueEntraram.get(fone(conf.telefone)) ?? 0 : 0;
    const status: StatusLounge = conf ? (chegou ? "ocupado" : "reservado") : "livre";
    const obs = !noiteId ? "Sem noite cadastrada hoje na Lagun: reservas não aparecem."
      : status === "ocupado" ? `Titular da reserva entrou às ${hhmm(chegou)} (check-in na Zig).`
      : status === "reservado" ? "Reserva paga. O titular ainda não fez check-in na Zig."
      : pix ? "Pix de reserva em aberto agora (ainda não pago)." : "Livre nesta noite.";
    return {
      id: String(l.codigo), nome: String(l.nome || l.codigo), categoria: l.categoria ?? null,
      capacidade: Number(l.capacidade) || 0, preco: precos.get(String(l.id)) ?? Number(l.preco) ?? 0,
      status, cliente: conf ? primeiroNome(conf.nome) : null, pessoas: conf ? Number(conf.pessoas) || null : null,
      consumo: null, chegouEm: chegou ? new Date(chegou).toISOString() : null, obs,
    };
  });
}

// ── Leitura completa ─────────────────────────────────────────────────────────
const cache = new Map<string, { em: number; dados: Record<string, Any> }>();

export async function lerCasa(admin: Any, validade = 25_000): Promise<Record<string, Any>> {
  const guardado = cache.get("casa");
  if (guardado && Date.now() - guardado.em < validade) return guardado.dados;
  const todas = await lojasDaRede();
  const lojas = todas.filter((l) => Date.now() - (lojaRecusada.get(l.id) ?? 0) > 600_000);
  const periodo = { dtinicio: diaSP(-2), dtfim: diaSP(0) };
  // Cada loja à parte: a que recusar o token não derruba as outras.
  const porLoja = await Promise.all(lojas.map(async (l) => {
    try {
      const [faturamento, itens] = await Promise.all([zig("erp/faturamento", { ...periodo, loja: l.id }), zig("erp/saida-produtos", { ...periodo, loja: l.id })]);
      return { loja: l, faturamento, itens, ok: true };
    } catch {
      lojaRecusada.set(l.id, Date.now());
      return { loja: l, faturamento: [] as Any[], itens: [] as Any[], ok: false };
    }
  }));
  const lidas = porLoja.filter((p) => p.ok);
  if (!lidas.length) throw new ErroZig("A Zig não liberou nenhuma loja agora. Tente de novo em instantes.", 502);

  // Eventos de todas as lojas lidas; abertos = abertos no caixa há menos de 14 h.
  const eventos = new Map<string, { id: string; data: string; loja: string; lojaNome: string }>();
  for (const p of lidas) for (const x of [...p.faturamento, ...p.itens]) if (x?.eventId) {
    eventos.set(String(x.eventId), { id: String(x.eventId), data: String(x.eventDate ?? ""), loja: p.loja.id, lojaNome: p.loja.nome });
  }
  const ordenados = [...eventos.values()].sort((a, b) => b.data.localeCompare(a.data));
  const ultimaVendaDe = new Map<string, number>();
  for (const p of lidas) for (const x of p.itens) if (x?.eventId) {
    const t = quando(x.transactionDate); const id = String(x.eventId);
    if (t > (ultimaVendaDe.get(id) ?? 0)) ultimaVendaDe.set(id, t);
  }
  const maisNovoDaLoja = new Map<string, string>();
  for (const e of ordenados) if (!maisNovoDaLoja.has(e.loja)) maisNovoDaLoja.set(e.loja, e.id);
  const abertos = ordenados.filter((e) => {
    if (maisNovoDaLoja.get(e.loja) !== e.id) return false;
    if (Date.now() - quando(e.data) >= ABERTO_MS) return false;
    const uv = ultimaVendaDe.get(e.id);
    return !uv || Date.now() - uv < SEM_VENDA_MS;
  });
  const alvos = abertos.length ? abertos : ordenados.slice(0, 1);
  const ids = new Set(alvos.map((e) => e.id));
  const principal = alvos[0] ?? null;
  const aberto = abertos.length > 0;
  const faturamento = lidas.flatMap((p) => p.faturamento);
  const itens = lidas.flatMap((p) => p.itens);

  const doEvento = itens.filter((x) => ids.has(String(x.eventId)));
  const vendas = doEvento.filter(ehVendaDeBar);
  const valor = (x: Any) => (Number(x.unitValue) || 0) * (Number(x.count) || 0) - (Number(x.discountValue) || 0);
  const umaHora = Date.now() - HORA;
  const planta: Record<IdBar, { noite: number; hora: number; itens: number; transacoes: Set<string> }> = {
    B1: { noite: 0, hora: 0, itens: 0, transacoes: new Set() }, B2: { noite: 0, hora: 0, itens: 0, transacoes: new Set() },
  };
  const pdvs = new Map<string, number>();
  const produtos = new Map<string, { qtd: number; valor: number; categoria: string | null }>();
  const porHora = new Map<number, number>();
  const transacoes = new Set<string>();
  let consumo = 0, ultimaHora = 0, ultimaVenda = 0;
  for (const x of vendas) {
    const v = valor(x);
    const t = quando(x.transactionDate);
    const b = barDaPlanta(x);
    if (b === "fora") continue;
    consumo += v;
    if (t) { const h = Math.floor(t / HORA) * HORA; porHora.set(h, (porHora.get(h) ?? 0) + v); if (t > ultimaVenda) ultimaVenda = t; }
    transacoes.add(String(x.transactionId));
    planta[b].noite += v; planta[b].itens += Number(x.count) || 0; planta[b].transacoes.add(String(x.transactionId));
    if (t >= umaHora) { planta[b].hora += v; ultimaHora += v; }
    const pdv = pdvDe(x);
    pdvs.set(pdv, (pdvs.get(pdv) ?? 0) + v);
    const nome = String(x.productName || "Sem nome").trim();
    const p = produtos.get(nome) ?? { qtd: 0, valor: 0, categoria: x.productCategory ?? null };
    p.qtd += Number(x.count) || 0; p.valor += v; produtos.set(nome, p);
  }
  const recebido = [...ids].reduce((t, id) => { const r = recebidoDoEvento(faturamento, id); return { dinheiro: t.dinheiro + r.dinheiro, bonus: t.bonus + r.bonus }; }, { dinheiro: 0, bonus: 0 });
  // Fora do bar, só para conferência: bilheteria na porta e caução do cartão.
  const bilheteria = doEvento.filter((x) => !x.isRefunded && ehBilheteria(x)).reduce((t, x) => t + valor(x), 0);
  const caucao = doEvento.filter((x) => !x.isRefunded && ehCaucao(x)).reduce((t, x) => t + valor(x), 0);

  // Check-ins das lojas com evento aberto.
  let entradas: { entraram: number; sairam: number; porHora: { em: string; h: number; qtd: number }[]; ultimo: string | null } | null = null;
  let erroCheckin: string | null = null;
  const fonesQueEntraram = new Map<string, number>();
  if (aberto) {
    const porLojaAberta = new Map<string, number>();
    for (const e of abertos) { const q = quando(e.data); if (!porLojaAberta.has(e.loja) || q < porLojaAberta.get(e.loja)!) porLojaAberta.set(e.loja, q); }
    const listas = await Promise.all([...porLojaAberta].map(([loja, desde]) => checkinsDaLoja(loja, desde).catch((e) => { erroCheckin = e instanceof Error ? e.message : String(e); return null; })));
    const pessoas = listas.filter(Boolean).flat() as { entrou: number; saiu: boolean; fone: string }[];
    if (listas.some(Boolean)) {
      const hora = new Map<number, number>();
      let ultimo = 0;
      for (const p of pessoas) {
        if (p.entrou) { const h = Math.floor(p.entrou / HORA) * HORA; hora.set(h, (hora.get(h) ?? 0) + 1); if (p.entrou > ultimo) ultimo = p.entrou; }
        if (p.fone && p.entrou && (!fonesQueEntraram.has(p.fone) || p.entrou < fonesQueEntraram.get(p.fone)!)) fonesQueEntraram.set(p.fone, p.entrou);
      }
      entradas = {
        entraram: pessoas.length, sairam: pessoas.filter((p) => p.saiu).length,
        porHora: [...hora].sort((a, b) => a[0] - b[0]).map(([em, n]) => ({ em: new Date(em).toISOString(), h: horaBrasilia(em), qtd: n })),
        ultimo: ultimo ? new Date(ultimo).toISOString() : null,
      };
    }
  }

  const noite = admin && principal ? await noiteDoDia(admin, quando(principal.data), principal.id).catch(() => null) : null;
  const lounges = admin ? await loungesDaNoite(admin, noite?.id ?? null, fonesQueEntraram).catch((e) => { console.error("lounges", e); return [] as LoungeNoite[]; }) : [];
  const nomeEvento = noite?.nome ?? vendas.find((x) => String(x.eventId) === principal?.id)?.eventName ?? doEvento[0]?.eventName ?? null;
  const maiorHora = Math.max(planta.B1.hora, planta.B2.hora);
  const bares = (["B1", "B2"] as IdBar[]).map((id) => ({
    id, nome: NOME_BAR[id], area: id === "B1" ? "pista" : "vip",
    valor: reais(planta[id].noite), ultimaHora: reais(planta[id].hora), itens: planta[id].itens,
    ticketMedio: planta[id].transacoes.size ? reais(planta[id].noite / planta[id].transacoes.size) : 0,
    status: planta[id].hora <= 0 ? (planta[id].noite > 0 ? "parado" : "sem_venda") : planta[id].hora === maiorHora ? "forte" : "normal",
  }));
  const dados = {
    aberto,
    evento: principal ? { id: principal.id, nome: nomeEvento || "Noite na Lagun", data: comFuso(principal.data), loja: principal.lojaNome } : null,
    noite: noite ? { id: noite.id, nome: noite.nome, data: noite.data } : null,
    eventosAbertos: abertos.length,
    lojas: { lidas: lidas.map((p) => p.loja.nome), recusadas: todas.length - lidas.length },
    // total = faturamento do bar (consumo de produto). Recebido no caixa vem separado: dinheiro e bônus.
    total: reais(consumo),
    consumo: reais(consumo),
    recebido: reais(recebido.dinheiro),
    bonus: reais(recebido.bonus),
    foraDoBar: { bilheteria: reais(bilheteria), caucao: reais(caucao) },
    transacoes: transacoes.size,
    ticketMedio: transacoes.size ? reais(consumo / transacoes.size) : 0,
    ultimaHora: reais(ultimaHora),
    porHora: [...porHora].sort((a, b) => a[0] - b[0]).map(([em, v]) => ({ em: new Date(em).toISOString(), h: horaBrasilia(em), valor: reais(v) })),
    bares,
    pdvs: [...pdvs].map(([nome, v]) => ({ nome, valor: reais(v) })).sort((a, b) => b.valor - a.valor).slice(0, 20),
    produtos: [...produtos].map(([nome, p]) => ({ nome, qtd: p.qtd, valor: reais(p.valor), categoria: p.categoria })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    lounges,
    loungesOcupados: lounges.filter((l) => l.status === "ocupado").length,
    loungesTotal: lounges.length,
    checkins: entradas,
    erroCheckin,
    ultimaVenda: ultimaVenda ? new Date(ultimaVenda).toISOString() : null,
    atualizadoEm: new Date().toISOString(),
    renovarEm: aberto ? 30 : 120,
  };
  cache.set("casa", { em: Date.now(), dados });
  return dados;
}

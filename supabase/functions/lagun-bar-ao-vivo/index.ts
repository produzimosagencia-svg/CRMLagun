import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Bar ao vivo do app Lagun Administração (iPhone), 2026-11-19.
// Mesmo modelo da Tríade (app-interno, ação bar_ao_vivo, usado no Fantástico Mundo do Lukão),
// adaptado à Lagun: lê a Zig Bar (API ERP) de todas as lojas que o token alcança (hoje só a LAGUN VIX)
// e acha sozinho o evento aberto (aberto no caixa da Zig há menos de 14 h). Nada é ligado à mão.
//
//   POST (Authorization: Bearer <sessão do app>) { forcar? }
//     → { ok, aberto, evento, total, consumo, transacoes, ticketMedio, porHora, bares, produtos,
//         checkins, atualizadoEm, ultimaVenda }
//
// Quem pode: está em lagun_admin_acessos (cadastro do app) como administrador; parceiro só se tiver
// uma noite de hoje ou de ontem marcada. A conta de revisão da Apple não recebe dado real.
// Secrets: ZIG_ERP_TOKEN (token da rede, nunca sai do servidor), ZIG_ERP_REDE (lista as lojas),
// ZIG_ERP_LOJA (opcional, loja a mais), ZIG_BAR_MAPA (opcional, posição dos PDVs na planta) e ZIG_BAR_APELIDOS (opcional, JSON {"operador":{...},"bar":{...}} para trocar o nome
// do PDV que a Zig manda pelo nome do mapa do app).
// Check-in: só números (quantos entraram, por hora, último). Nome, CPF e telefone não saem daqui.
// Valores da Zig vêm em centavos. Cache de 30 s por instância (forcar: 10 s).

const ZIG_ERP = "https://api.zigcore.com.br/integration";
/** Loja "LAGUN VIX" (a única que o token da Lagun enxerga, conferido em 2026-11-19). */
const LOJA_PADRAO = "589d0a1f-08f5-402f-a73f-8d10fd5f5820";
const AGENTE = "lagun-app-admin/1.0";
/** Evento da Zig conta como aberto até 14 h depois de aberto no caixa (a casa fecha antes). */
const ABERTO_MS = 14 * 3600_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

class ErroZig extends Error {
  constructor(msg: string, public status = 502) { super(msg); }
}

// deno-lint-ignore no-explicit-any
async function zig(caminho: string, q: Record<string, string>): Promise<any[]> {
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
const diaSP = (deslocamento = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + deslocamento * 86400000));

/** As datas da Zig ERP vêm sem fuso, mas em UTC (igual na Tríade). Devolve com "Z". */
const comFuso = (t: unknown) => {
  const s = t ? String(t) : "";
  if (!s) return null;
  return /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
};
const quando = (t: unknown) => Date.parse(comFuso(t) || "") || 0;

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

let apelidos: { bruto: string; operador: Map<string, string>; bar: Map<string, string> } | null = null;
function tabelas() {
  const bruto = Deno.env.get("ZIG_BAR_APELIDOS") || "";
  if (apelidos && apelidos.bruto === bruto) return apelidos;
  const operador = new Map<string, string>(), bar = new Map<string, string>();
  try {
    const j = bruto ? JSON.parse(bruto) : {};
    for (const [k, v] of Object.entries(j?.operador ?? {})) operador.set(norm(k), String(v));
    for (const [k, v] of Object.entries(j?.bar ?? {})) bar.set(norm(k), String(v));
  } catch { /* JSON inválido: segue sem tradução */ }
  apelidos = { bruto, operador, bar };
  return apelidos;
}

/** Nome do PDV de uma venda (traduzido por ZIG_BAR_APELIDOS, se houver). Ambulantes juntos. */
// deno-lint-ignore no-explicit-any
function nomeDoBar(x: any): string {
  const t = tabelas();
  const login = norm(x.employeeName);
  if (login) {
    const tipo = login.split("|")[0].trim();
    const numero = login.replace(/\([^)]*\)/g, "").match(/(\d+)\s*$/)?.[1];
    const porOperador = t.operador.get(login) ?? (numero ? t.operador.get(`${tipo} ${Number(numero)}`) : undefined) ?? t.operador.get(tipo);
    if (porOperador) return porOperador;
  }
  const original = String(x.barName || (x.hawkerName ? "Ambulantes" : "Sem bar")).trim() || "Sem bar";
  return t.bar.get(norm(original)) ?? original;
}

/** Máquina de login "PRODUÇÃO | ..." (consumação da produção, fica fora do bar). */
// deno-lint-ignore no-explicit-any
const ehProducao = (x: any) => norm(x?.employeeName).startsWith("PRODUCAO");

/** Recebido no evento (como o "recebimentos" do painel da Zig): formas de pagamento sem BÔNUS. Centavos. */
// deno-lint-ignore no-explicit-any
function recebidoDoEvento(faturamento: any[], evento: string): number {
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

/** Check-ins da loja desde a abertura do evento (todas as páginas). Só números. */
async function checkins(loja: string, desde: number) {
  const ids = new Map<string, { entrou: number; saiu: boolean }>();
  // O "desde" da Zig não respeita o fuso (conferido em 2026-11-19: desde 01:38Z não trouxe o check-in
  // das 02:10Z). Por isso pede com 12 h de folga e filtra aqui pela hora do check-in (UTC), a partir
  // de 3 h antes da abertura do evento. A Zig não aceita mais de 5 dias de uma vez.
  const inicio = new Date(Math.max(desde - 12 * 3600_000, Date.now() - 4.5 * 86400_000)).toISOString();
  const aPartir = desde - 3 * 3600_000;
  for (let page = 1; page <= 60; page++) {
    const lista = await zig("erp/checkins", { loja, desde: inicio, page: String(page) });
    if (!lista.length) break;
    let novos = 0;
    for (const c of lista) {
      const id = String(c?.id ?? "");
      if (!id || ids.has(id)) continue;
      novos++;
      const entrou = quando(c.checkinTime);
      if (entrou && entrou < aPartir) continue;
      ids.set(id, { entrou, saiu: !!c.checkoutTime });
    }
    if (!novos) break; // a Zig repetiu a página: para aqui
  }
  const porHora = new Map<number, number>();
  let ultimo = 0, saiu = 0;
  for (const c of ids.values()) {
    if (c.entrou) { const h = Math.floor(c.entrou / 3600_000) * 3600_000; porHora.set(h, (porHora.get(h) ?? 0) + 1); if (c.entrou > ultimo) ultimo = c.entrou; }
    if (c.saiu) saiu++;
  }
  return {
    entraram: ids.size,
    sairam: saiu,
    porHora: [...porHora].sort((a, b) => a[0] - b[0]).map(([em, n]) => ({ em: new Date(em).toISOString(), h: (((Math.floor(em / 3600_000) - 3) % 24) + 24) % 24, qtd: n })),
    ultimo: ultimo ? new Date(ultimo).toISOString() : null,
  };
}

// ── Lojas que o token alcança (todas da rede; as que recusarem ficam de fora por 10 min) ──
let lojasCache: { em: number; lojas: { id: string; nome: string }[] } | null = null;
const lojaRecusada = new Map<string, number>();
async function lojasDaRede(): Promise<{ id: string; nome: string }[]> {
  if (lojasCache && Date.now() - lojasCache.em < 600_000) return lojasCache.lojas;
  const extra = Deno.env.get("ZIG_ERP_LOJA");
  let lojas: { id: string; nome: string }[] = [];
  try {
    const rede = Deno.env.get("ZIG_ERP_REDE") || "";
    lojas = (await zig("erp/lojas", rede ? { rede } : {}))
      .map((l: any) => ({ id: String(l?.id ?? l?.lojaId ?? ""), nome: String(l?.name ?? l?.nome ?? "Loja").trim() }))
      .filter((l) => l.id);
  } catch { /* sem a lista: fica com a loja padrão */ }
  // Loja de ingresso (ex.: "LAGUN VIX TICKETS") não é bar: fica fora. Secret ZIG_ERP_LOJAS_FORA
  // (opcional, JSON com ids ou trechos de nome) troca essa regra.
  let fora: string[] = ["TICKET"];
  try { const f = JSON.parse(Deno.env.get("ZIG_ERP_LOJAS_FORA") || "null"); if (Array.isArray(f)) fora = f.map((x) => norm(x)); } catch { /* fica a padrão */ }
  lojas = lojas.filter((l) => !fora.some((f) => f && (norm(l.id) === f || norm(l.nome).includes(f))));
  if (!lojas.some((l) => l.id === LOJA_PADRAO)) lojas.push({ id: LOJA_PADRAO, nome: "LAGUN VIX" });
  if (extra && !lojas.some((l) => l.id === extra)) lojas.push({ id: extra, nome: "Loja" });
  lojasCache = { em: Date.now(), lojas };
  return lojas;
}

// ── Mapa da planta (caixa 350×641 do app). Tudo aqui, no servidor, para mudar sem build novo. ──
// Secret ZIG_BAR_MAPA (opcional, JSON): {"Nome do PDV": {"area": "pista", "x": 307, "y": 197}}.
// x/y = -1 → fica fora da planta (entra no pino "Outros" e nos rankings).
type Area = "pista" | "backstage" | "lounges" | "alimentacao" | "outros";
const AREAS: Area[] = ["pista", "backstage", "lounges", "alimentacao", "outros"];
const SLOT_BAR: Record<number, [number, number]> = { 1: [307, 197], 2: [307, 339], 3: [14, 327], 4: [305, 551] };
const SLOTS_PISTA: [number, number][] = [[307, 197], [307, 339], [14, 327], [305, 551], [14, 200]];
function mapaManual(): Map<string, { area: Area; x: number; y: number }> {
  const m = new Map<string, { area: Area; x: number; y: number }>();
  try {
    const j = JSON.parse(Deno.env.get("ZIG_BAR_MAPA") || "{}");
    for (const [k, v] of Object.entries(j ?? {})) {
      const o = v as any;
      const area = AREAS.includes(o?.area) ? o.area : "outros";
      m.set(norm(k), { area, x: Number.isFinite(o?.x) ? o.x : -1, y: Number.isFinite(o?.y) ? o.y : -1 });
    }
  } catch { /* JSON inválido: só as regras */ }
  return m;
}
function posicionar(bares: { nome: string; valor: number }[]) {
  const manual = mapaManual();
  const usados = new Set<string>();
  const livre = (xy: [number, number]) => !usados.has(xy.join(","));
  const pega = (xy: [number, number]) => { usados.add(xy.join(",")); return { x: xy[0], y: xy[1] }; };
  const fora = { x: -1, y: -1 };
  // Primeiro os que têm lugar certo (manual e "Bar N"), depois os genéricos, do que mais vende para o que menos vende.
  const saida = bares.map((b) => ({ ...b, area: "outros" as Area, x: -1, y: -1, fixo: false }));
  for (const b of saida) {
    const n = norm(b.nome);
    const m = manual.get(n);
    if (m) { Object.assign(b, m, { fixo: true }); if (m.x >= 0) usados.add(`${m.x},${m.y}`); continue; }
    const num = n.match(/\bBAR\s*0?(\d)\b/)?.[1];
    if (num && SLOT_BAR[Number(num)] && livre(SLOT_BAR[Number(num)])) Object.assign(b, { area: "pista", ...pega(SLOT_BAR[Number(num)]), fixo: true });
  }
  for (const b of saida) {
    if (b.fixo) continue;
    const n = norm(b.nome);
    if (/BACKSTAGE|CAMARIM/.test(n)) Object.assign(b, { area: "backstage", ...(livre([113, 94]) ? pega([113, 94]) : fora) });
    else if (/LOUNGE|CAMAROTE|VIP|MESA|BISTRO/.test(n)) Object.assign(b, { area: "lounges", ...(livre([113, 168]) ? pega([113, 168]) : fora) });
    else if (/ALIMENT|COZINHA|FOOD|LANCH|BURGU?ER|PIZZA|COMIDA|PETISC/.test(n)) Object.assign(b, { area: "alimentacao", ...(livre([222, 422]) ? pega([222, 422]) : fora) });
    else if (/\bBAR\b|PISTA|CENTRAL|DRINK|CAIXA/.test(n)) { const s = SLOTS_PISTA.find(livre); Object.assign(b, { area: "pista", ...(s ? pega(s) : fora) }); }
  }
  return saida.map(({ fixo: _f, ...b }) => b);
}

const cache = new Map<string, { em: number; dados: Record<string, unknown> }>();

async function barAoVivo(validade: number, admin: ReturnType<typeof sb> | null) {
  const guardado = cache.get("bar");
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
      return { loja: l, faturamento: [] as any[], itens: [] as any[], ok: false };
    }
  }));
  const lidas = porLoja.filter((p) => p.ok);
  if (!lidas.length) throw new ErroZig("A Zig não liberou nenhuma loja agora. Tente de novo em instantes.", 502);

  // Eventos de todas as lojas lidas: abertos = abertos no caixa há menos de 14 h.
  const eventos = new Map<string, { id: string; data: string; loja: string; lojaNome: string }>();
  for (const p of lidas) for (const x of [...p.faturamento, ...p.itens]) if (x?.eventId) {
    eventos.set(String(x.eventId), { id: String(x.eventId), data: String(x.eventDate ?? ""), loja: p.loja.id, lojaNome: p.loja.nome });
  }
  const ordenados = [...eventos.values()].sort((a, b) => b.data.localeCompare(a.data));
  const abertos = ordenados.filter((e) => Date.now() - quando(e.data) < ABERTO_MS);
  // Com evento aberto: soma todos os abertos (várias lojas na mesma noite). Sem: mostra o último, fechado.
  const alvos = abertos.length ? abertos : ordenados.slice(0, 1);
  const ids = new Set(alvos.map((e) => e.id));
  const principal = alvos[0] ?? null;
  const aberto = abertos.length > 0;
  const faturamento = lidas.flatMap((p) => p.faturamento);
  const itens = lidas.flatMap((p) => p.itens);
  const reais = (c: number) => Math.round(c) / 100;

  // Bar: venda de produto ao público. Fora: estorno, gorjeta, caução do cartão (ZigCard) e máquinas "PRODUÇÃO".
  const vendas = itens.filter((x) => ids.has(String(x.eventId)) && !x.isRefunded && x.type !== "Tip" && x.type !== "ZigCard" && !ehProducao(x));
  const valor = (x: any) => (Number(x.unitValue) || 0) * (Number(x.count) || 0) - (Number(x.discountValue) || 0);
  const bares = new Map<string, number>();
  const produtos = new Map<string, { qtd: number; valor: number; categoria: string | null }>();
  const porHora = new Map<number, number>();
  const transacoes = new Set<string>();
  let consumo = 0, ultimaVenda = 0;
  for (const x of vendas) {
    const v = valor(x);
    consumo += v;
    const t = quando(x.transactionDate);
    if (t) { const h = Math.floor(t / 3600_000) * 3600_000; porHora.set(h, (porHora.get(h) ?? 0) + v); if (t > ultimaVenda) ultimaVenda = t; }
    transacoes.add(String(x.transactionId));
    const bar = nomeDoBar(x);
    bares.set(bar, (bares.get(bar) ?? 0) + v);
    const nome = String(x.productName || "Sem nome").trim();
    const p = produtos.get(nome) ?? { qtd: 0, valor: 0, categoria: x.productCategory ?? null };
    p.qtd += Number(x.count) || 0; p.valor += v; produtos.set(nome, p);
  }
  const recebido = [...ids].reduce((t, id) => t + recebidoDoEvento(faturamento, id), 0);

  // Check-ins das lojas com evento aberto (soma).
  let entradas: Awaited<ReturnType<typeof checkins>> | null = null, erroCheckin: string | null = null;
  if (aberto) {
    const porLojaAberta = new Map<string, number>();
    for (const e of abertos) { const q = quando(e.data); if (!porLojaAberta.has(e.loja) || q < porLojaAberta.get(e.loja)!) porLojaAberta.set(e.loja, q); }
    const res = await Promise.all([...porLojaAberta].map(([loja, desde]) => checkins(loja, desde).catch((e) => { erroCheckin = e instanceof Error ? e.message : String(e); return null; })));
    const ok = res.filter(Boolean) as Awaited<ReturnType<typeof checkins>>[];
    if (ok.length) {
      const hora = new Map<string, { em: string; h: number; qtd: number }>();
      for (const r of ok) for (const h of r.porHora) { const a = hora.get(h.em) ?? { ...h, qtd: 0 }; a.qtd += h.qtd; hora.set(h.em, a); }
      entradas = {
        entraram: ok.reduce((t, r) => t + r.entraram, 0),
        sairam: ok.reduce((t, r) => t + r.sairam, 0),
        porHora: [...hora.values()].sort((a, b) => a.em.localeCompare(b.em)),
        ultimo: ok.map((r) => r.ultimo).filter(Boolean).sort().pop() ?? null,
      };
    }
  }
  let nomeEvento: string | null = vendas.find((x) => String(x.eventId) === principal?.id)?.eventName ?? itens.find((x) => String(x.eventId) === principal?.id)?.eventName ?? null;
  // Sem venda ainda a Zig não manda o nome: usa a noite da Lagun do mesmo dia (abertura em Brasília, antes das 12 h conta o dia anterior).
  if (!nomeEvento && principal && admin) {
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(quando(principal.data) - 12 * 3600_000));
    const { data: noite } = await admin.from("lagun_events").select("nome").eq("data", dia).limit(1).maybeSingle();
    nomeEvento = noite?.nome ?? null;
  }
  const dados = {
    aberto,
    evento: principal ? { id: principal.id, nome: nomeEvento || "Noite na Lagun", data: comFuso(principal.data), loja: principal.lojaNome } : null,
    eventosAbertos: abertos.length,
    lojas: { lidas: lidas.map((p) => p.loja.nome), recusadas: todas.length - lidas.length },
    // Número principal: recebido no caixa (igual à Tríade). Sem pagamento ainda, cai no consumo.
    total: reais(recebido || consumo),
    recebido: reais(recebido),
    consumo: reais(consumo),
    transacoes: transacoes.size,
    ticketMedio: transacoes.size ? reais(consumo / transacoes.size) : 0,
    porHora: [...porHora].sort((a, b) => a[0] - b[0]).map(([em, v]) => ({ em: new Date(em).toISOString(), h: (((Math.floor(em / 3600_000) - 3) % 24) + 24) % 24, valor: reais(v) })),
    bares: posicionar([...bares].map(([nome, v]) => ({ nome, valor: reais(v) })).sort((a, b) => b.valor - a.valor).slice(0, 40)),
    produtos: [...produtos].map(([nome, p]) => ({ nome, qtd: p.qtd, valor: reais(p.valor), categoria: p.categoria })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    checkins: entradas,
    erroCheckin,
    ultimaVenda: ultimaVenda ? new Date(ultimaVenda).toISOString() : null,
    atualizadoEm: new Date().toISOString(),
    // O app renova sozinho neste intervalo (segundos) enquanto a tela está aberta.
    renovarEm: aberto ? 30 : 120,
  };
  cache.set("bar", { em: Date.now(), dados });
  return dados;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Entre de novo no app." }, 401);
    const admin = sb();
    const { data: quem } = await admin.auth.getUser(jwt);
    const user = quem.user;
    if (!user) return json({ error: "Entre de novo no app." }, 401);
    if (user.app_metadata?.revisao === true) return json({ error: "Conta de demonstração: o bar real não aparece aqui." }, 403);
    const { data: acesso } = await admin.from("lagun_admin_acessos").select("cargo").eq("user_id", user.id).maybeSingle();
    if (!acesso) return json({ error: "O bar ao vivo é só para a administração da Lagun." }, 403);
    if (acesso.cargo !== "administrador") {
      const { data: noites } = await admin.from("lagun_admin_acesso_noites").select("lagun_events!inner(data)").eq("user_id", user.id)
        .gte("lagun_events.data", diaSP(-1)).lte("lagun_events.data", diaSP(0));
      if (!noites?.length) return json({ error: "O bar ao vivo aparece só na noite liberada para você." }, 403);
    }
    try {
      return json({ ok: true, ...(await barAoVivo(body.forcar === true ? 10_000 : 25_000, admin)) });
    } catch (e) {
      if (e instanceof ErroZig) return json({ error: e.message }, e.status);
      throw e;
    }
  } catch (e) {
    console.error("[lagun-bar-ao-vivo]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

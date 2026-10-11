// ============================================================================
// bot-socios — assistente dos sócios no WhatsApp.
// ----------------------------------------------------------------------------
// Chamado pelo whatsapp-webhook a cada mensagem (texto ou toque em botão) de
// um número que está no cadastro de Parceiros (lagun_partners): fixo vê todos
// os eventos, parceiro só os vinculados. Número fora da lista: silêncio.
//
// Fluxo:
//   1. Pessoa escreve → saudação + lista de eventos (última opção: "Outro
//      assunto", que abre a conversa livre com a IA).
//   2. Escolheu o evento → lista de opções: Ads · Vendas (se tem Zig) ·
//      Disparo (se houve disparo nos últimos 7 dias) · Relatório geral (PDF) ·
//      Perguntar algo · Outro evento.
//   3. Cada opção responde com números ao vivo (sem IA) e botões para seguir.
//   Modo livre: o texto vai para a OpenAI com o conhecimento.md e as
//   ferramentas (vendas, campanhas, contatos, link do relatório). "menu" volta.
//
// Entrada (POST, service role, vindo do webhook):
//   { phone, message, contact_name?, phone_number_id?, escolha?: {id,title} }
// Teste (POST, sessão de usuário logado, ou dry_run:true por dentro): devolve
//   as mensagens que seriam enviadas, sem mandar.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { sincronizarEvento } from "../_shared/zig.ts";
import { encontrarSocio, type Socio } from "../_shared/socios.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "";
const RELATORIO_BASE = (Deno.env.get("RELATORIO_BASE") || "https://lagunvitoria.com.br/relatorio/").replace(/\/?$/, "/");
const PAINEL_URL = (Deno.env.get("APP_PUBLIC_URL") || "https://lagunvitoria.com.br").replace(/\/$/, "");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4";
const NOME_DA_CASA = Deno.env.get("BOT_NOME_DA_CASA") || "Lagun";
const MAX_RODADAS = 6;
const SESSAO_LIVRE_HORAS = 6;
const MAX_EVENTOS_NA_LISTA = 9; // a lista do WhatsApp aceita 10 linhas; a última é "Outro assunto"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------------------------------------------------------------- datas (BRT)
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeBrasilia = () => fmtDia.format(new Date());
const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000);
const agoraTexto = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
const dataCurta = (dia: string | null) =>
  dia ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${dia.slice(0, 10)}T12:00:00Z`)).replace(".", "") : "sem data";
const dataLonga = (dia: string | null) =>
  dia ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${dia.slice(0, 10)}T12:00:00Z`)) : "sem data";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const quando = (dia: string | null) => {
  if (!dia) return "sem data";
  const d = diasEntre(hojeBrasilia(), dia);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  if (d > 1) return `em ${d} dias`;
  return `há ${-d} dias`;
};
const cortar = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

// ------------------------------------------------------------------- eventos
type Evento = {
  id: string; nome: string; data: string | null; local: string | null; artista: string | null;
  show_on_landing: boolean | null; relatorio_token: string | null; zig: boolean; campanhas: number;
};

// Eventos que o sócio pode consultar: dos últimos 30 dias em diante, só os do
// escopo dele. Vem com o que cada um tem ligado (Zig, campanhas).
async function eventosDoSocio(sb: any, socio: Socio): Promise<Evento[]> {
  let q = sb.from("lagun_events").select("*").gte("data", somarDias(hojeBrasilia(), -30)).order("data", { ascending: true }).limit(40);
  if (socio.eventIds) {
    if (!socio.eventIds.length) return [];
    q = q.in("id", socio.eventIds);
  }
  const [{ data: eventos }, { data: zigs }, { data: camps }] = await Promise.all([
    q,
    sb.from("lagun_event_zig").select("event_id"),
    sb.from("lagun_event_campaigns").select("event_id"),
  ]);
  const comZig = new Set(((zigs ?? []) as any[]).map((z) => z.event_id));
  const nCamp = new Map<string, number>();
  for (const c of (camps ?? []) as any[]) nCamp.set(c.event_id, (nCamp.get(c.event_id) ?? 0) + 1);
  return ((eventos ?? []) as any[]).map((e) => ({
    id: e.id, nome: String(e.nome ?? "Evento"), data: e.data ? String(e.data).slice(0, 10) : null,
    local: e.local ?? null, artista: e.artista ?? null,
    show_on_landing: e.show_on_landing ?? null, relatorio_token: e.relatorio_token ?? null,
    zig: comZig.has(e.id), campanhas: nCamp.get(e.id) ?? 0,
  }));
}

// Os que vão na lista do menu: futuros primeiro (até 9), completando com os
// mais recentes já passados.
function eventosDoMenu(eventos: Evento[]): Evento[] {
  const hoje = hojeBrasilia();
  const futuros = eventos.filter((e) => e.data && e.data >= hoje);
  const passados = eventos.filter((e) => !e.data || e.data < hoje).reverse();
  return [...futuros, ...passados].slice(0, MAX_EVENTOS_NA_LISTA);
}

// ------------------------------------------------------------- dados ao vivo
async function vendasIngressos(sb: any, ev: Evento) {
  if (!ev.zig) return { evento: ev.nome, sem_ticketeira: true, aviso: "Evento sem Zig vinculada: os ingressos só na ticketeira." };
  let sincronizado = true;
  try { await sincronizarEvento(sb, ev.id); } catch (e) { sincronizado = false; console.error("Zig:", e); }
  const hoje = hojeBrasilia();
  const [{ data: tot }, { data: dias }] = await Promise.all([
    sb.rpc("lagun_zig_totais_valor", { p_event_id: ev.id }),
    sb.rpc("lagun_zig_por_dia", { p_event_id: ev.id, p_dias: 14 }),
  ]);
  const t = Array.isArray(tot) ? tot[0] : tot;
  const porDia = ((dias ?? []) as any[]).map((d) => ({ dia: String(d.dia), ingressos: Number(d.ingressos), valor: Number(d.valor) }));
  const achar = (dia: string) => porDia.find((d) => d.dia === dia) ?? { dia, ingressos: 0, valor: 0 };
  const ultimos7 = porDia.filter((d) => d.dia > somarDias(hoje, -7));
  return {
    evento: ev.nome, data_evento: ev.data, sincronizado_agora: sincronizado,
    total: { ingressos: Number(t?.total_ingressos ?? 0), valor: Number(t?.total_valor ?? 0) },
    hoje: achar(hoje), ontem: achar(somarDias(hoje, -1)),
    ultimos_7_dias: { ingressos: ultimos7.reduce((s, d) => s + d.ingressos, 0), valor: ultimos7.reduce((s, d) => s + d.valor, 0) },
    por_dia: porDia,
    primeira_venda: t?.primeira_venda ?? null, ultima_venda: t?.ultima_venda ?? null,
    valores_em: "BRL",
  };
}

type Acao = { action_type: string; value: string };
const valorAcao = (lista: Acao[] | undefined, tipos: string[]) => {
  const a = lista?.find((x) => tipos.includes(x.action_type));
  return a ? Number(a.value) || 0 : 0;
};

function filtroDePeriodo(periodo: string) {
  const hoje = hojeBrasilia();
  const janelas: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30 };
  if (periodo === "today") return `time_range=${encodeURIComponent(JSON.stringify({ since: hoje, until: hoje }))}`;
  if (periodo === "yesterday") { const o = somarDias(hoje, -1); return `time_range=${encodeURIComponent(JSON.stringify({ since: o, until: o }))}`; }
  const dias = janelas[periodo];
  if (dias) return `time_range=${encodeURIComponent(JSON.stringify({ since: somarDias(hoje, -(dias - 1)), until: hoje }))}`;
  return "date_preset=maximum";
}

type Campanha = {
  id: string; nome: string; objetivo?: string; status: string | null; gasto: number; impressoes: number; alcance: number;
  cliques: number; resultados: number; compras: number; receita: number; conversas: number;
  custo_por_resultado: number | null; roas: number | null;
};
type ResumoAds = {
  evento: string; periodo: string; erro?: string; sem_campanhas?: boolean; aviso?: string; erro_parcial?: string | null;
  totais?: { gasto: number; impressoes: number; alcance: number; cliques: number; resultados: number; compras: number; receita: number; conversas: number; custo_por_resultado: number | null };
  campanhas?: Campanha[]; link_relatorio?: string | null;
};

async function campanhasMeta(sb: any, ev: Evento, periodo: string): Promise<ResumoAds> {
  const token = Deno.env.get("META_ADS_TOKEN");
  if (!token) return { evento: ev.nome, periodo, erro: "Meta Ads não configurado neste painel." };
  const { data: vinculos } = await sb.from("lagun_event_campaigns").select("campaign_id, account_id, campaign_name").eq("event_id", ev.id);
  if (!vinculos?.length) return { evento: ev.nome, periodo, sem_campanhas: true, aviso: "Nenhuma campanha vinculada a este evento no painel." };
  const padraoConta = (Deno.env.get("META_AD_ACCOUNT_ID") || "").replace(/^act_/, "");
  const porConta = new Map<string, string[]>();
  for (const v of vinculos as any[]) {
    const conta = String(v.account_id || padraoConta).replace(/^act_/, "");
    if (!/^\d+$/.test(conta) || !/^\d+$/.test(String(v.campaign_id))) continue;
    porConta.set(conta, [...(porConta.get(conta) || []), String(v.campaign_id)]);
  }
  const ids = new Set([...porConta.values()].flat());
  const campos = "campaign_name,campaign_id,objective,spend,impressions,reach,clicks,actions,action_values";
  const linhas: any[] = [];
  let erroMeta: string | null = null;
  await Promise.all([...porConta.entries()].map(async ([conta, lista]) => {
    const filtro = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: lista }]));
    const r = await fetch(`${GRAPH_API}/act_${conta}/insights?fields=${campos}&${filtroDePeriodo(periodo)}&level=campaign&filtering=${filtro}&limit=200&access_token=${token}`);
    const j = await r.json();
    if (j.error) { erroMeta = j.error.message || "erro na Meta"; return; }
    linhas.push(...(j.data || []));
  }));
  const status = new Map<string, string>();
  try {
    const r = await fetch(`${GRAPH_API}/?ids=${[...ids].slice(0, 50).join(",")}&fields=effective_status&access_token=${token}`);
    const j = await r.json();
    if (!j.error) for (const [id, c] of Object.entries(j as Record<string, any>)) status.set(id, c.effective_status ?? "");
  } catch { /* sem status */ }

  const porId = new Map<string, any>();
  for (const row of linhas) {
    const id = String(row.campaign_id || "");
    if (!ids.has(id)) continue;
    const c = porId.get(id) ?? { id, nome: row.campaign_name, objetivo: row.objective, status: status.get(id) ?? null, gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, compras: 0, receita: 0, conversas: 0 };
    c.gasto += Number(row.spend || 0);
    c.impressoes += parseInt(row.impressions || "0", 10);
    c.alcance += parseInt(row.reach || "0", 10);
    c.cliques += parseInt(row.clicks || "0", 10);
    c.compras += valorAcao(row.actions, ["purchase", "omni_purchase"]);
    c.receita += valorAcao(row.action_values, ["purchase", "omni_purchase"]);
    c.conversas += valorAcao(row.actions, ["onsite_conversion.messaging_first_reply", "onsite_conversion.messaging_conversation_started_7d"]);
    const principal = (row.actions as Acao[] | undefined)?.find((a) =>
      ["purchase", "omni_purchase", "lead", "onsite_conversion.messaging_first_reply", "link_click"].includes(a.action_type));
    c.resultados += principal ? parseInt(principal.value, 10) || 0 : 0;
    porId.set(id, c);
  }
  for (const v of vinculos as any[]) {
    const id = String(v.campaign_id);
    if (!porId.has(id)) porId.set(id, { id, nome: v.campaign_name, status: status.get(id) ?? null, gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, compras: 0, receita: 0, conversas: 0 });
  }
  const campanhas: Campanha[] = [...porId.values()].sort((a, b) => b.gasto - a.gasto).map((c) => ({
    ...c, gasto: Math.round(c.gasto * 100) / 100, receita: Math.round(c.receita * 100) / 100,
    custo_por_resultado: c.resultados ? Math.round((c.gasto / c.resultados) * 100) / 100 : null,
    roas: c.gasto && c.receita ? Math.round((c.receita / c.gasto) * 100) / 100 : null,
  }));
  const soma = (k: keyof Campanha) => campanhas.reduce((s, c) => s + Number(c[k] || 0), 0);
  return {
    evento: ev.nome, periodo, erro_parcial: erroMeta,
    totais: {
      gasto: Math.round(soma("gasto") * 100) / 100, impressoes: soma("impressoes"), alcance: soma("alcance"), cliques: soma("cliques"),
      resultados: soma("resultados"), compras: soma("compras"), receita: Math.round(soma("receita") * 100) / 100, conversas: soma("conversas"),
      custo_por_resultado: soma("resultados") ? Math.round((soma("gasto") / soma("resultados")) * 100) / 100 : null,
    },
    campanhas,
    link_relatorio: ev.relatorio_token ? `${RELATORIO_BASE}${ev.relatorio_token}` : null,
  };
}

// Disparos de WhatsApp (templates em massa) dos últimos 7 dias, por template.
// Fora: o resumo diário dos produtores e as respostas do próprio bot.
async function disparosRecentes(sb: any) {
  const desde = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await sb.from("whatsapp_messages")
    .select("status, timestamp, raw_payload").eq("direction", "outgoing").eq("message_type", "template")
    .gte("timestamp", desde).limit(5000);
  const porTemplate = new Map<string, { template: string; enviados: number; entregues: number; lidos: number; falhas: number; ultimo: string }>();
  for (const m of (data ?? []) as any[]) {
    const rp = m.raw_payload ?? {};
    // Só disparo de verdade: com template, fora do resumo diário, do bot e de testes.
    if (!rp.template_name || rp.campaign_key === "resumo_produtores" || rp.bot || rp.teste) continue;
    const nome = String(rp.template_name);
    const t = porTemplate.get(nome) ?? { template: nome, enviados: 0, entregues: 0, lidos: 0, falhas: 0, ultimo: "" };
    const s = String(m.status ?? "");
    if (["failed", "error", "undelivered"].includes(s)) t.falhas++;
    else { t.enviados++; if (s === "delivered" || s === "read") t.entregues++; if (s === "read") t.lidos++; }
    if (!t.ultimo || m.timestamp > t.ultimo) t.ultimo = m.timestamp;
    porTemplate.set(nome, t);
  }
  const lista = [...porTemplate.values()].sort((a, b) => b.enviados - a.enviados);
  return {
    dias: 7, templates: lista,
    totais: {
      enviados: lista.reduce((s, t) => s + t.enviados, 0), entregues: lista.reduce((s, t) => s + t.entregues, 0),
      lidos: lista.reduce((s, t) => s + t.lidos, 0), falhas: lista.reduce((s, t) => s + t.falhas, 0),
    },
  };
}

async function contatosDoDia(sb: any, dia: string) {
  const inicio = `${dia}T00:00:00-03:00`;
  const fim = `${somarDias(dia, 1)}T00:00:00-03:00`;
  const { data: msgs } = await sb.from("whatsapp_messages")
    .select("phone, channel, timestamp").eq("direction", "incoming").gte("timestamp", inicio).lt("timestamp", fim)
    .neq("message_type", "system").limit(5000);
  const lista = (msgs ?? []) as Array<{ phone: string; channel: string | null }>;
  const porCanal = (canal: string) => new Set(lista.filter((m) => (m.channel || "whatsapp") === canal).map((m) => m.phone));
  const wa = porCanal("whatsapp"), ig = porCanal("instagram");
  const todos = [...new Set(lista.map((m) => m.phone))];
  const antigos = new Set<string>();
  for (let i = 0; i < todos.length; i += 200) {
    const { data: antes } = await sb.from("whatsapp_messages").select("phone").eq("direction", "incoming")
      .in("phone", todos.slice(i, i + 200)).lt("timestamp", inicio).limit(1000);
    for (const a of (antes ?? []) as any[]) antigos.add(a.phone);
  }
  const novos = (s: Set<string>) => [...s].filter((p) => !antigos.has(p)).length;
  return {
    dia,
    whatsapp: { pessoas: wa.size, novas: novos(wa), mensagens: lista.filter((m) => (m.channel || "whatsapp") === "whatsapp").length },
    instagram_direct: { pessoas: ig.size, novas: novos(ig), mensagens: lista.filter((m) => m.channel === "instagram").length },
    observacao: "Conta quem mandou mensagem para a casa (recebidas), por canal. 'Novas' = primeira vez que escrevem.",
  };
}

// ---------------------------------------------------------- textos prontos
function textoAds(ev: Evento, total: ResumoAds, hoje: ResumoAds) {
  if (total.erro) return `Não consegui ler o Meta Ads agora: ${total.erro}`;
  if (total.sem_campanhas || !total.totais) return `*${ev.nome}* ainda não tem campanha de Meta Ads vinculada no painel.`;
  const t = total.totais;
  const h = hoje.totais;
  const ativas = (total.campanhas ?? []).filter((c) => c.status === "ACTIVE");
  const linhas = [
    `*${ev.nome}* · Meta Ads · ${quando(ev.data)} (${dataCurta(ev.data)})`,
    "",
    `Investido: *${brl(t.gasto)}*`,
    `Resultados: *${int(t.resultados)}*${t.custo_por_resultado != null ? ` · ${brl(t.custo_por_resultado)} cada` : ""}`,
  ];
  if (t.compras) linhas.push(`Compras pelo anúncio: *${int(t.compras)}* · receita ${brl(t.receita)}${t.gasto ? ` · ROAS ${(t.receita / t.gasto).toFixed(1).replace(".", ",")}x` : ""}`);
  if (t.conversas) linhas.push(`Conversas iniciadas: *${int(t.conversas)}*`);
  linhas.push(`Alcance: ${int(t.alcance)} pessoas · ${int(t.cliques)} cliques`);
  if (h) linhas.push("", `Hoje: ${brl(h.gasto)} investidos · ${int(h.resultados)} resultados`);
  linhas.push("", ativas.length ? `${ativas.length === 1 ? "1 campanha ativa" : `${ativas.length} campanhas ativas`} de ${total.campanhas?.length}:` : `Nenhuma campanha ativa agora (${total.campanhas?.length} vinculadas):`);
  for (const c of (total.campanhas ?? []).slice(0, 5)) {
    linhas.push(`• ${c.nome}${c.status === "ACTIVE" ? "" : " (pausada)"} — ${brl(c.gasto)} · ${int(c.resultados)} res.`);
  }
  if (total.erro_parcial) linhas.push("", `Aviso: parte dos dados não veio (${total.erro_parcial}).`);
  return linhas.join("\n");
}

function textoVendas(ev: Evento, v: Awaited<ReturnType<typeof vendasIngressos>>) {
  if ("sem_ticketeira" in v && v.sem_ticketeira) return `*${ev.nome}* não tem a Zig vinculada: os ingressos só na ticketeira.`;
  const d = v as Exclude<typeof v, { sem_ticketeira: true }>;
  const linhas = [
    `*${ev.nome}* · Vendas (Zig) · ${quando(ev.data)} (${dataCurta(ev.data)})`,
    "",
    `Total: *${int(d.total.ingressos)} ingressos* · ${brl(d.total.valor)}`,
    `Hoje: *${int(d.hoje.ingressos)}* · ${brl(d.hoje.valor)}`,
    `Ontem: ${int(d.ontem.ingressos)} · ${brl(d.ontem.valor)}`,
    `Últimos 7 dias: ${int(d.ultimos_7_dias.ingressos)} · ${brl(d.ultimos_7_dias.valor)}`,
  ];
  const ultimos = d.por_dia.slice(0, 7);
  if (ultimos.length > 1) {
    linhas.push("", "Por dia:");
    for (const p of ultimos) linhas.push(`• ${dataCurta(p.dia)}: ${int(p.ingressos)}`);
  }
  if (!d.sincronizado_agora) linhas.push("", "Aviso: não consegui atualizar com a Zig agora; os números são da última leitura.");
  return linhas.join("\n");
}

function textoDisparos(d: Awaited<ReturnType<typeof disparosRecentes>>) {
  if (!d.templates.length) return "Nenhum disparo de WhatsApp nos últimos 7 dias.";
  const t = d.totais;
  const linhas = [
    `*Disparos de WhatsApp* · últimos 7 dias`,
    "",
    `Enviados: *${int(t.enviados)}* · entregues ${int(t.entregues)} · lidos ${int(t.lidos)}${t.falhas ? ` · ${int(t.falhas)} falhas` : ""}`,
    "",
  ];
  for (const x of d.templates.slice(0, 6)) {
    linhas.push(`• ${x.template}: ${int(x.enviados)} enviados, ${int(x.lidos)} lidos`);
  }
  return linhas.join("\n");
}

// ------------------------------------------------------------- PDF (pdf-lib)
async function gerarPdfRelatorio(ev: Evento, ads: ResumoAds, vendas: Awaited<ReturnType<typeof vendasIngressos>> | null) {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const preto = rgb(0.08, 0.08, 0.08), cinza = rgb(0.45, 0.45, 0.45), ouro = rgb(0.85, 0.69, 0.31), linhaCor = rgb(0.88, 0.88, 0.88);
  let pagina = doc.addPage([595.28, 841.89]); // A4
  const margem = 48;
  let y = 841.89 - margem;
  // pdf-lib só tem WinAnsi nas fontes padrão: troca o que não cabe.
  const limpar = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF]/g, "-");
  const texto = (s: string, x: number, tam: number, f = fonte, cor = preto) => pagina.drawText(limpar(s), { x, y, size: tam, font: f, color: cor });
  const novaLinha = (h: number) => {
    y -= h;
    if (y < margem) { pagina = doc.addPage([595.28, 841.89]); y = 841.89 - margem; }
  };

  texto(NOME_DA_CASA.toUpperCase(), margem, 10, negrito, ouro); novaLinha(18);
  texto(ev.nome, margem, 22, negrito); novaLinha(20);
  texto(`Relatório geral · ${dataLonga(ev.data)}${ev.local ? ` · ${ev.local}` : ""}`, margem, 11, fonte, cinza); novaLinha(14);
  texto(`Gerado em ${agoraTexto()} (Brasília)`, margem, 9, fonte, cinza); novaLinha(28);

  const bloco = (titulo: string, itens: Array<[string, string]>) => {
    texto(titulo, margem, 13, negrito); novaLinha(16);
    pagina.drawLine({ start: { x: margem, y: y + 6 }, end: { x: 595.28 - margem, y: y + 6 }, thickness: 0.6, color: linhaCor });
    novaLinha(10);
    const col = (595.28 - 2 * margem) / 3;
    itens.forEach(([rotulo, valor], i) => {
      const x = margem + (i % 3) * col;
      if (i > 0 && i % 3 === 0) novaLinha(36);
      pagina.drawText(limpar(rotulo), { x, y, size: 9, font: fonte, color: cinza });
      pagina.drawText(limpar(valor), { x, y: y - 14, size: 14, font: negrito, color: preto });
    });
    novaLinha(44);
  };

  if (ads.totais) {
    const t = ads.totais;
    bloco("Tráfego pago (Meta Ads) · acumulado", [
      ["Investido", brl(t.gasto)], ["Resultados", int(t.resultados)], ["Custo por resultado", t.custo_por_resultado != null ? brl(t.custo_por_resultado) : "-"],
      ["Alcance", int(t.alcance)], ["Cliques", int(t.cliques)], ["Compras / receita", `${int(t.compras)} / ${brl(t.receita)}`],
    ]);
    texto("Campanhas", margem, 13, negrito); novaLinha(16);
    const cols = [margem, margem + 250, margem + 330, margem + 400, margem + 470];
    ["Campanha", "Status", "Investido", "Result.", "Custo/res."].forEach((h, i) => pagina.drawText(h, { x: cols[i], y, size: 9, font: negrito, color: cinza }));
    novaLinha(14);
    for (const c of ads.campanhas ?? []) {
      const nome = limpar(cortar(String(c.nome ?? ""), 44));
      [nome, c.status === "ACTIVE" ? "Ativa" : "Pausada", brl(c.gasto), int(c.resultados), c.custo_por_resultado != null ? brl(c.custo_por_resultado) : "-"]
        .forEach((v, i) => pagina.drawText(limpar(v), { x: cols[i], y, size: 9.5, font: fonte, color: preto }));
      pagina.drawLine({ start: { x: margem, y: y - 4 }, end: { x: 595.28 - margem, y: y - 4 }, thickness: 0.4, color: linhaCor });
      novaLinha(16);
    }
    novaLinha(10);
  } else {
    texto("Tráfego pago: sem campanha vinculada a este evento.", margem, 11, fonte, cinza); novaLinha(24);
  }

  if (vendas && !("sem_ticketeira" in vendas && vendas.sem_ticketeira)) {
    const v = vendas as Exclude<typeof vendas, { sem_ticketeira: true }>;
    bloco("Ingressos (Zig)", [
      ["Total vendido", int(v.total.ingressos)], ["Receita", brl(v.total.valor)], ["Hoje", int(v.hoje.ingressos)],
      ["Ontem", int(v.ontem.ingressos)], ["Últimos 7 dias", int(v.ultimos_7_dias.ingressos)], ["Última venda", v.ultima_venda ? new Date(v.ultima_venda).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"],
    ]);
  } else {
    texto("Ingressos: evento sem Zig vinculada.", margem, 11, fonte, cinza); novaLinha(24);
  }
  if (ev.relatorio_token) {
    texto(`Relatório completo com criativos: ${RELATORIO_BASE}${ev.relatorio_token}`, margem, 9, fonte, cinza);
  }
  return await doc.save();
}

// --------------------------------------------------------- mensagens (Meta)
type Saida =
  | { tipo: "texto"; texto: string }
  | { tipo: "botoes"; texto: string; botoes: Array<{ id: string; titulo: string }> }
  | { tipo: "lista"; texto: string; botao: string; titulo?: string; secoes: Array<{ titulo: string; linhas: Array<{ id: string; titulo: string; descricao?: string }> }> }
  | { tipo: "documento"; nome: string; legenda: string; pdf: Uint8Array };

function paraPayload(to: string, s: Saida, mediaId?: string): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to };
  if (s.tipo === "texto") return { ...base, type: "text", text: { body: s.texto, preview_url: true } };
  if (s.tipo === "botoes") {
    return {
      ...base, type: "interactive",
      interactive: {
        type: "button", body: { text: s.texto },
        action: { buttons: s.botoes.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cortar(b.titulo, 20) } })) },
      },
    };
  }
  if (s.tipo === "lista") {
    return {
      ...base, type: "interactive",
      interactive: {
        type: "list",
        ...(s.titulo ? { header: { type: "text", text: cortar(s.titulo, 60) } } : {}),
        body: { text: s.texto },
        action: {
          button: cortar(s.botao, 20),
          sections: s.secoes.map((sec) => ({
            title: cortar(sec.titulo, 24),
            rows: sec.linhas.slice(0, 10).map((l) => ({ id: l.id, title: cortar(l.titulo, 24), ...(l.descricao ? { description: cortar(l.descricao, 72) } : {}) })),
          })),
        },
      },
    };
  }
  return { ...base, type: "document", document: { id: mediaId, filename: s.nome, caption: s.legenda } };
}

const resumoParaLog = (s: Saida) =>
  s.tipo === "texto" ? s.texto
    : s.tipo === "botoes" ? `${s.texto}\n[${s.botoes.map((b) => b.titulo).join(" | ")}]`
    : s.tipo === "lista" ? `${s.texto}\n[${s.secoes.flatMap((x) => x.linhas.map((l) => l.titulo)).join(" | ")}]`
    : `[PDF] ${s.nome} — ${s.legenda}`;

// Ordem: o número que recebeu a mensagem, depois o configurado no resumo, depois o primeiro da conta.
async function numeroRemetente(sb: any, token: string, recebidoEm: string | null) {
  if (recebidoEm && /^\d+$/.test(recebidoEm)) return recebidoEm;
  const { data: cfg } = await sb.from("lagun_resumo_config").select("phone_number_id").eq("id", "default").maybeSingle();
  if (cfg?.phone_number_id) return String(cfg.phone_number_id);
  if (!WABA_ID) return null;
  const resp = await fetch(`${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${token}`);
  const data = await resp.json();
  const cloud = data?.data?.find((p: Record<string, string>) => p.platform_type === "CLOUD_API");
  return (cloud?.id || data?.data?.[0]?.id || null) as string | null;
}

async function subirPdf(token: string, phoneId: string, nome: string, pdf: Uint8Array) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([pdf], { type: "application/pdf" }), nome);
  const r = await fetch(`${GRAPH_API}/${phoneId}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(j?.error?.message || `upload HTTP ${r.status}`);
  return String(j.id);
}

async function enviar(sb: any, socio: Socio, saidas: Saida[], recebidoEm: string | null, etiqueta: string) {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!token) throw new Error("META_WHATSAPP_TOKEN não configurado");
  const phoneId = await numeroRemetente(sb, token, recebidoEm);
  if (!phoneId) throw new Error("Nenhum número de WhatsApp encontrado");
  const wamids: string[] = [];
  for (const s of saidas) {
    let mediaId: string | undefined;
    if (s.tipo === "documento") mediaId = await subirPdf(token, phoneId, s.nome, s.pdf);
    const resp = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(paraPayload(socio.telefone, s, mediaId)),
    });
    const data = await resp.json().catch(() => ({}));
    const ok = resp.ok && !data?.error;
    await sb.from("whatsapp_messages").insert({
      phone: socio.telefone, contact_name: socio.nome, direction: "outgoing",
      message_type: s.tipo === "documento" ? "document" : "text",
      message_text: ok ? resumoParaLog(s) : `[Bot dos sócios] Falha: ${data?.error?.message || `HTTP ${resp.status}`}`,
      wamid: data?.messages?.[0]?.id ?? null, status: ok ? "sent" : "failed",
      timestamp: new Date().toISOString(), channel: "whatsapp",
      raw_payload: { phone_number_id: phoneId, bot: "socios", etapa: etiqueta, tipo: s.tipo },
    });
    if (!ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
    wamids.push(data?.messages?.[0]?.id ?? "");
  }
  return wamids;
}

// ------------------------------------------------------------------ sessão
type Sessao = { modo: "menu" | "livre"; event_id: string | null; updated_at: string };
async function lerSessao(sb: any, telefone: string): Promise<Sessao | null> {
  const { data } = await sb.from("bot_sessoes").select("modo, event_id, updated_at").eq("telefone", telefone).maybeSingle();
  return (data as Sessao) ?? null;
}
async function gravarSessao(sb: any, telefone: string, modo: "menu" | "livre", eventId: string | null) {
  await sb.from("bot_sessoes").upsert({ telefone, modo, event_id: eventId, updated_at: new Date().toISOString() });
}
const sessaoViva = (s: Sessao | null) => !!s && Date.now() - Date.parse(s.updated_at) < SESSAO_LIVRE_HORAS * 3600_000;

// ------------------------------------------------------------------ fluxo
const ID = {
  evento: (id: string) => `ev:${id}`,
  opcao: (op: string, id: string) => `op:${op}:${id}`,
  outro: "outro",
  menu: "menu",
};

function saudacao(socio: Socio) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
  const cumprimento = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return `${cumprimento}, ${socio.nome.split(/\s+/)[0]}!`;
}

function menuDeEventos(socio: Socio, eventos: Evento[], abertura: string): Saida {
  const lista = eventosDoMenu(eventos);
  const linhas = lista.map((e) => ({
    id: ID.evento(e.id), titulo: e.nome,
    descricao: `${dataCurta(e.data)} · ${quando(e.data)}${e.zig ? " · Zig" : ""}${e.campanhas ? " · Ads" : ""}`,
  }));
  linhas.push({ id: ID.outro, titulo: "Outro assunto", descricao: "Pergunte o que quiser sobre a casa" });
  return {
    tipo: "lista", titulo: `Assistente ${NOME_DA_CASA}`,
    texto: `${abertura} Sobre qual evento você quer saber?`,
    botao: "Ver eventos",
    secoes: [{ titulo: "Eventos", linhas }],
  };
}

async function menuDoEvento(sb: any, ev: Evento): Promise<Saida> {
  const disparos = await disparosRecentes(sb);
  const linhas: Array<{ id: string; titulo: string; descricao?: string }> = [
    { id: ID.opcao("ads", ev.id), titulo: "Ads", descricao: ev.campanhas ? `${ev.campanhas} campanha(s) de Meta Ads` : "Sem campanha vinculada ainda" },
  ];
  if (ev.zig) linhas.push({ id: ID.opcao("vendas", ev.id), titulo: "Vendas", descricao: "Ingressos na Zig: total, hoje, por dia" });
  if (disparos.templates.length) linhas.push({ id: ID.opcao("disparo", ev.id), titulo: "Disparo", descricao: `${int(disparos.totais.enviados)} mensagens nos últimos 7 dias` });
  linhas.push({ id: ID.opcao("relatorio", ev.id), titulo: "Relatório geral", descricao: "PDF com campanhas e ingressos" });
  linhas.push({ id: ID.opcao("perguntar", ev.id), titulo: "Perguntar algo", descricao: "Conversa livre sobre este evento" });
  linhas.push({ id: ID.menu, titulo: "Outro evento", descricao: "Voltar à lista de eventos" });
  return {
    tipo: "lista", titulo: cortar(ev.nome, 60),
    texto: `*${ev.nome}* · ${dataCurta(ev.data)} (${quando(ev.data)})${ev.artista ? `\n${ev.artista}` : ""}\n\nO que você quer ver?`,
    botao: "Escolher",
    secoes: [{ titulo: "Opções", linhas }],
  };
}

const botoesDepois = (ev: Evento): Saida => ({
  tipo: "botoes", texto: "Quer ver mais alguma coisa?",
  botoes: [
    { id: ID.evento(ev.id), titulo: "Outra opção" },
    { id: ID.opcao("perguntar", ev.id), titulo: "Perguntar" },
    { id: ID.menu, titulo: "Menu" },
  ],
});

async function tratarEscolha(sb: any, socio: Socio, eventos: Evento[], id: string): Promise<Saida[]> {
  if (id === ID.menu) {
    await gravarSessao(sb, socio.telefone, "menu", null);
    return [menuDeEventos(socio, eventos, "Claro.")];
  }
  if (id === ID.outro) {
    await gravarSessao(sb, socio.telefone, "livre", null);
    return [{ tipo: "texto", texto: "Pode perguntar o que quiser sobre os eventos, campanhas, vendas ou contatos da casa. Quando quiser voltar à lista, é só mandar *menu*." }];
  }
  const ev = id.startsWith("ev:") ? eventos.find((e) => e.id === id.slice(3)) : null;
  if (ev) {
    await gravarSessao(sb, socio.telefone, "menu", ev.id);
    return [await menuDoEvento(sb, ev)];
  }
  const m = /^op:([a-z]+):(.+)$/.exec(id);
  if (m) {
    const op = m[1];
    const evento = eventos.find((e) => e.id === m[2]);
    if (!evento) return [{ tipo: "texto", texto: "Esse evento não está mais na sua lista." }, menuDeEventos(socio, eventos, "Vamos de novo.")];
    if (op === "perguntar") {
      await gravarSessao(sb, socio.telefone, "livre", evento.id);
      return [{ tipo: "texto", texto: `Pode perguntar o que quiser sobre *${evento.nome}*. Pra voltar à lista, mande *menu*.` }];
    }
    await gravarSessao(sb, socio.telefone, "menu", evento.id);
    if (op === "ads") {
      const [total, hoje] = await Promise.all([campanhasMeta(sb, evento, "maximum"), campanhasMeta(sb, evento, "today")]);
      return [{ tipo: "texto", texto: textoAds(evento, total, hoje) }, botoesDepois(evento)];
    }
    if (op === "vendas") {
      const v = await vendasIngressos(sb, evento);
      return [{ tipo: "texto", texto: textoVendas(evento, v) }, botoesDepois(evento)];
    }
    if (op === "disparo") {
      const d = await disparosRecentes(sb);
      return [{ tipo: "texto", texto: textoDisparos(d) }, botoesDepois(evento)];
    }
    if (op === "relatorio") {
      const [ads, vendas] = await Promise.all([campanhasMeta(sb, evento, "maximum"), evento.zig ? vendasIngressos(sb, evento) : Promise.resolve(null)]);
      const pdf = await gerarPdfRelatorio(evento, ads, vendas);
      const nome = `relatorio-${evento.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "evento"}-${hojeBrasilia()}.pdf`;
      const saidas: Saida[] = [{ tipo: "documento", nome, legenda: `Relatório geral · ${evento.nome} · ${dataCurta(evento.data)}`, pdf }];
      if (evento.relatorio_token) saidas.push({ tipo: "texto", texto: `Versão completa, com os criativos: ${RELATORIO_BASE}${evento.relatorio_token}` });
      saidas.push(botoesDepois(evento));
      return saidas;
    }
  }
  return [menuDeEventos(socio, eventos, "Não entendi essa opção.")];
}

// ------------------------------------------------------------------- OpenAI
let conhecimentoCache: string | null = null;
async function conhecimento(): Promise<string> {
  if (conhecimentoCache !== null) return conhecimentoCache;
  try {
    conhecimentoCache = await Deno.readTextFile(new URL("./conhecimento.md", import.meta.url));
  } catch (e) {
    console.error("conhecimento.md não carregou:", e);
    conhecimentoCache = "";
  }
  return conhecimentoCache;
}

const FERRAMENTAS = [
  { type: "function", function: { name: "vendas_ingressos", description: "Ingressos vendidos de um evento (Zig): total, hoje, ontem, últimos 7 dias e por dia, com valor em reais. Sincroniza com a ticketeira antes.", parameters: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] } } },
  { type: "function", function: { name: "campanhas_meta", description: "Meta Ads das campanhas vinculadas a um evento: gasto, alcance, cliques, resultados, compras, receita, custo por resultado, por campanha e total.", parameters: { type: "object", properties: { event_id: { type: "string" }, periodo: { type: "string", enum: ["today", "yesterday", "last_7d", "last_14d", "last_30d", "maximum"] } }, required: ["event_id", "periodo"] } } },
  { type: "function", function: { name: "disparos_recentes", description: "Disparos de WhatsApp (templates em massa) dos últimos 7 dias: enviados, entregues, lidos, falhas, por template.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "contatos_do_dia", description: "Quantas pessoas mandaram mensagem para a casa num dia, no WhatsApp e no direct do Instagram, e quantas eram novas.", parameters: { type: "object", properties: { dia: { type: "string", description: "AAAA-MM-DD; omita para hoje" } } } } },
  { type: "function", function: { name: "link_relatorio", description: "Link público do relatório de tráfego pago de um evento.", parameters: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] } } },
];

async function executarFerramenta(sb: any, nome: string, args: any, eventos: Evento[]) {
  const acharEvento = () => {
    const ev = eventos.find((e) => e.id === String(args?.event_id ?? ""));
    if (!ev) throw new Error("Evento fora da lista deste sócio.");
    return ev;
  };
  switch (nome) {
    case "vendas_ingressos": return await vendasIngressos(sb, acharEvento());
    case "campanhas_meta": return await campanhasMeta(sb, acharEvento(), String(args?.periodo || "maximum"));
    case "disparos_recentes": return await disparosRecentes(sb);
    case "contatos_do_dia": return await contatosDoDia(sb, /^\d{4}-\d{2}-\d{2}$/.test(String(args?.dia ?? "")) ? String(args.dia) : hojeBrasilia());
    case "link_relatorio": {
      const ev = acharEvento();
      return ev.relatorio_token ? { evento: ev.nome, link: `${RELATORIO_BASE}${ev.relatorio_token}` } : { evento: ev.nome, sem_link: true };
    }
    default: throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}

async function promptDoSistema(socio: Socio, eventos: Evento[], eventoAtual: Evento | null) {
  const linhas = eventos.map((e) =>
    `- ${e.nome} | id: ${e.id} | ${dataLonga(e.data)} (${quando(e.data)})${e.zig ? " | Zig" : " | sem Zig"}${e.campanhas ? ` | ${e.campanhas} campanha(s)` : " | sem campanha"}${e.relatorio_token ? " | tem relatório" : ""}`);
  return [
    `Você é o assistente da ${NOME_DA_CASA} para os sócios e produtores, no WhatsApp. Está falando com ${socio.nome} (${socio.tipo === "fixo" ? "sócio da casa" : "produtor parceiro"}).`,
    `Agora: ${agoraTexto()} (Brasília).`,
    eventoAtual ? `A conversa está sobre o evento *${eventoAtual.nome}* (id ${eventoAtual.id}); se a pergunta não disser outro evento, é sobre ele.` : "",
    "",
    "Eventos que esta pessoa pode consultar (não fale de nenhum outro):",
    linhas.length ? linhas.join("\n") : "- (nenhum evento no escopo desta pessoa)",
    "",
    `Painel: ${PAINEL_URL}/interno`,
    "",
    "=== Conhecimento do negócio (siga à risca) ===",
    await conhecimento(),
  ].filter((l) => l !== null).join("\n");
}

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

async function historico(sb: any, telefone: string): Promise<Msg[]> {
  const { data } = await sb.from("whatsapp_messages")
    .select("direction, message_text, message_type, timestamp, raw_payload")
    .eq("phone", telefone).eq("channel", "whatsapp").neq("message_type", "system")
    .gte("timestamp", new Date(Date.now() - 2 * 86400_000).toISOString())
    .order("timestamp", { ascending: false }).limit(16);
  return ((data ?? []) as any[]).reverse()
    .filter((m) => m.message_text && !String(m.message_text).startsWith("[Auto-disparo] Falha") && !String(m.message_text).startsWith("[Bot dos sócios] Falha"))
    .map((m) => ({ role: m.direction === "incoming" ? "user" : "assistant", content: String(m.message_text).slice(0, 2000) } as Msg));
}

async function chamarOpenAI(mensagens: Msg[]) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, messages: mensagens, tools: FERRAMENTAS, tool_choice: "auto", parallel_tool_calls: true }),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error?.message || `OpenAI HTTP ${resp.status}`);
  return data.choices?.[0]?.message as Msg;
}

async function responderLivre(sb: any, socio: Socio, eventos: Evento[], eventoAtual: Evento | null, textoDoUsuario: string) {
  const anteriores = await historico(sb, socio.telefone);
  const ultima = anteriores[anteriores.length - 1];
  if (!(ultima?.role === "user" && ultima.content === textoDoUsuario)) anteriores.push({ role: "user", content: textoDoUsuario });
  const mensagens: Msg[] = [{ role: "system", content: await promptDoSistema(socio, eventos, eventoAtual) }, ...anteriores];
  const usadas: string[] = [];
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const m = await chamarOpenAI(mensagens);
    if (!m) throw new Error("OpenAI sem resposta");
    mensagens.push(m);
    if (!m.tool_calls?.length) return { texto: (m.content ?? "").trim(), ferramentas: usadas };
    for (const tc of m.tool_calls) {
      const nome = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* vazio */ }
      usadas.push(nome);
      let resultado: unknown;
      try { resultado = await executarFerramenta(sb, nome, args, eventos); } catch (e) { resultado = { erro: e instanceof Error ? e.message : String(e) }; }
      mensagens.push({ role: "tool", tool_call_id: tc.id, name: nome, content: JSON.stringify(resultado) });
    }
  }
  return { texto: "Não consegui fechar essa consulta agora. Pode perguntar de novo em um minuto?", ferramentas: usadas };
}

// --------------------------------------------------------------- segurança
async function ehServiceRole(bearer: string) {
  if (!bearer || bearer.split(".").length !== 3) return false;
  try {
    const payload = JSON.parse(atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.role !== "service_role") return false;
    const cliente = createClient(Deno.env.get("SUPABASE_URL")!, bearer, { auth: { persistSession: false } });
    const { error } = await cliente.from("lagun_zig_credentials").select("event_id", { head: true, count: "exact" });
    return !error;
  } catch { return false; }
}

const PEDE_MENU = /^\s*(menu|oi|ol[aá]|opa|e\s*a[ií]|bom dia|boa tarde|boa noite|in[ií]cio|come[cç]ar|start|voltar)\s*[!.?]*\s*$/i;

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const interno = bearer === serviceKey || await ehServiceRole(bearer);
    if (!interno) {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
    }
    const dryRun = body.dry_run === true || (!interno && body.dry_run !== false);

    const telefone = String(body.phone ?? "").replace(/\D/g, "");
    const texto = String(body.message ?? "").trim();
    const escolha = body.escolha?.id ? String(body.escolha.id) : null;
    if (!telefone || (!texto && !escolha)) return json({ ok: false, error: "phone e message (ou escolha) obrigatórios" }, 400);

    const socio = await encontrarSocio(sb, telefone);
    if (!socio) return json({ ok: true, respondeu: false, motivo: "nao_e_socio" });
    const eventos = await eventosDoSocio(sb, socio);
    const sessao = await lerSessao(sb, socio.telefone);

    let saidas: Saida[] = [];
    let etapa = "";
    let ferramentas: string[] = [];
    if (escolha) {
      etapa = escolha;
      saidas = await tratarEscolha(sb, socio, eventos, escolha);
    } else if (PEDE_MENU.test(texto) || !sessaoViva(sessao) || sessao?.modo !== "livre") {
      etapa = "menu";
      await gravarSessao(sb, socio.telefone, "menu", null);
      saidas = [menuDeEventos(socio, eventos, saudacao(socio))];
    } else {
      etapa = "livre";
      const eventoAtual = sessao?.event_id ? eventos.find((e) => e.id === sessao.event_id) ?? null : null;
      const r = await responderLivre(sb, socio, eventos, eventoAtual, texto);
      ferramentas = r.ferramentas;
      if (r.texto) saidas = [{ tipo: "texto", texto: r.texto }];
      await gravarSessao(sb, socio.telefone, "livre", eventoAtual?.id ?? null);
    }
    if (!saidas.length) return json({ ok: true, respondeu: false, motivo: "resposta_vazia", etapa, ferramentas });

    if (dryRun) {
      const b64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
      return json({
        ok: true, respondeu: false, dry_run: true, etapa, ferramentas,
        socio: { nome: socio.nome, tipo: socio.tipo },
        conhecimento_carregado: (await conhecimento()).length > 0,
        mensagens: saidas.map((s) => (s.tipo === "documento"
          ? { tipo: s.tipo, nome: s.nome, legenda: s.legenda, bytes: s.pdf.length, ...(body.pdf_base64 ? { pdf_base64: b64(s.pdf) } : {}) }
          : { ...s })),
      });
    }
    const wamids = await enviar(sb, socio, saidas, body.phone_number_id ? String(body.phone_number_id) : null, etapa);
    return json({ ok: true, respondeu: true, etapa, ferramentas, wamids });
  } catch (e) {
    console.error("bot-socios:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

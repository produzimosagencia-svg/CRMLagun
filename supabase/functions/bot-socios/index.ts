// ============================================================================
// bot-socios — assistente dos sócios no WhatsApp.
// ----------------------------------------------------------------------------
// Chamado pelo whatsapp-webhook a cada mensagem de texto recebida. Só responde
// a quem está no cadastro de Parceiros (lagun_partners): fixo vê todos os
// eventos, parceiro só os vinculados. Número fora da lista: não responde nada.
//
// Conversa com a OpenAI e usa ferramentas para buscar dado de verdade:
//   • vendas_ingressos  — Zig: total, hoje, ontem, por dia (sincroniza antes)
//   • campanhas_meta    — Meta Ads das campanhas vinculadas ao evento
//   • contatos_do_dia   — quantas pessoas escreveram no WhatsApp e no direct
//   • link_relatorio    — link público do relatório de tráfego do evento
//
// Entrada (POST, Bearer = service role, vindo do webhook):
//   { phone, message, contact_name? }
// Teste pelo painel (POST, Bearer = sessão de alguém logado):
//   { phone, message, dry_run: true } → devolve a resposta sem mandar no WhatsApp.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { sincronizarEvento } from "../_shared/zig.ts";
import { encontrarSocio, type Socio } from "../_shared/socios.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "";
const RELATORIO_BASE = (Deno.env.get("RELATORIO_BASE") || "https://lagunvitoria.com.br/relatorio/").replace(/\/?$/, "/");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4";
const NOME_DA_CASA = Deno.env.get("BOT_NOME_DA_CASA") || "Lagun";
const MAX_RODADAS = 6;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------------------------------------------------------------- datas (BRT)
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeBrasilia = () => fmtDia.format(new Date());
const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const agoraTexto = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
const dataLonga = (dia: string | null) =>
  dia ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${dia.slice(0, 10)}T12:00:00Z`)) : "sem data";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ------------------------------------------------------------------- eventos
type Evento = {
  id: string; nome: string; data: string | null; show_on_landing: boolean | null; relatorio_token: string | null;
  zig: boolean; campanhas: number;
};

// Eventos que o sócio pode consultar: dos últimos 60 dias em diante, só os do
// escopo dele. Vem com o que cada um tem ligado (Zig, campanhas).
async function eventosDoSocio(sb: any, socio: Socio): Promise<Evento[]> {
  let q = sb.from("lagun_events").select("*").gte("data", somarDias(hojeBrasilia(), -60)).order("data", { ascending: true }).limit(40);
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
    id: e.id, nome: e.nome, data: e.data ? String(e.data).slice(0, 10) : null,
    show_on_landing: e.show_on_landing ?? null, relatorio_token: e.relatorio_token ?? null,
    zig: comZig.has(e.id), campanhas: nCamp.get(e.id) ?? 0,
  }));
}

// ------------------------------------------------------------- ferramentas
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

async function campanhasMeta(sb: any, ev: Evento, periodo: string) {
  const token = Deno.env.get("META_ADS_TOKEN");
  if (!token) return { erro: "Meta Ads não configurado neste painel." };
  const { data: vinculos } = await sb.from("lagun_event_campaigns").select("campaign_id, account_id, campaign_name").eq("event_id", ev.id);
  if (!vinculos?.length) return { evento: ev.nome, sem_campanhas: true, aviso: "Nenhuma campanha vinculada a este evento no painel." };
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
    const r = await fetch(`${GRAPH_API}/?ids=${[...ids].slice(0, 50).join(",")}&fields=effective_status,daily_budget,lifetime_budget&access_token=${token}`);
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
  // Campanhas vinculadas sem gasto no período entram zeradas, para o bot saber que existem.
  for (const v of vinculos as any[]) {
    const id = String(v.campaign_id);
    if (!porId.has(id)) porId.set(id, { id, nome: v.campaign_name, status: status.get(id) ?? null, gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, compras: 0, receita: 0, conversas: 0 });
  }
  const campanhas = [...porId.values()].sort((a, b) => b.gasto - a.gasto).map((c) => ({
    ...c, gasto: Math.round(c.gasto * 100) / 100, receita: Math.round(c.receita * 100) / 100,
    custo_por_resultado: c.resultados ? Math.round((c.gasto / c.resultados) * 100) / 100 : null,
    roas: c.gasto && c.receita ? Math.round((c.receita / c.gasto) * 100) / 100 : null,
  }));
  const soma = (k: string) => campanhas.reduce((s, c) => s + Number(c[k] || 0), 0);
  return {
    evento: ev.nome, periodo, erro_parcial: erroMeta,
    totais: {
      gasto: Math.round(soma("gasto") * 100) / 100, impressoes: soma("impressoes"), alcance: soma("alcance"), cliques: soma("cliques"),
      resultados: soma("resultados"), compras: soma("compras"), receita: Math.round(soma("receita") * 100) / 100, conversas: soma("conversas"),
      custo_por_resultado: soma("resultados") ? Math.round((soma("gasto") / soma("resultados")) * 100) / 100 : null,
    },
    campanhas, valores_em: "BRL",
    link_relatorio: ev.relatorio_token ? `${RELATORIO_BASE}${ev.relatorio_token}` : null,
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
  // Novos = nunca tinham escrito antes desse dia.
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

const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "vendas_ingressos",
      description: "Ingressos vendidos de um evento (Zig): total, hoje, ontem, últimos 7 dias e por dia, com valor em reais. Sincroniza com a ticketeira antes de responder.",
      parameters: { type: "object", properties: { event_id: { type: "string", description: "id do evento (da lista de eventos)" } }, required: ["event_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "campanhas_meta",
      description: "Desempenho das campanhas de Meta Ads vinculadas a um evento: gasto, alcance, cliques, resultados, compras, receita, custo por resultado, por campanha e total.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          periodo: { type: "string", enum: ["today", "yesterday", "last_7d", "last_14d", "last_30d", "maximum"], description: "maximum = desde o início da campanha" },
        },
        required: ["event_id", "periodo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contatos_do_dia",
      description: "Quantas pessoas mandaram mensagem para a casa num dia, no WhatsApp e no direct do Instagram, e quantas eram novas.",
      parameters: { type: "object", properties: { dia: { type: "string", description: "AAAA-MM-DD em Brasília; omita para hoje" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "link_relatorio",
      description: "Link público do relatório de tráfego pago de um evento, para mandar ao sócio.",
      parameters: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] },
    },
  },
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
    case "contatos_do_dia": {
      const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(args?.dia ?? "")) ? String(args.dia) : hojeBrasilia();
      return await contatosDoDia(sb, dia);
    }
    case "link_relatorio": {
      const ev = acharEvento();
      return ev.relatorio_token ? { evento: ev.nome, link: `${RELATORIO_BASE}${ev.relatorio_token}` } : { evento: ev.nome, sem_link: true, aviso: "Este evento ainda não tem link de relatório." };
    }
    default: throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}

// ------------------------------------------------------------------- OpenAI
function promptDoSistema(socio: Socio, eventos: Evento[]) {
  const linhas = eventos.map((e) =>
    `- ${e.nome} | id: ${e.id} | data: ${dataLonga(e.data)}${e.zig ? " | ingressos: Zig" : " | ingressos: só na ticketeira"}${e.campanhas ? ` | ${e.campanhas} campanha(s) de Meta Ads` : " | sem campanha vinculada"}${e.relatorio_token ? " | tem relatório" : ""}`);
  return [
    `Você é o assistente da ${NOME_DA_CASA} para os sócios e produtores, no WhatsApp. Está falando com ${socio.nome} (${socio.tipo === "fixo" ? "sócio da casa" : "produtor parceiro"}).`,
    `Agora: ${agoraTexto()} (Brasília).`,
    "",
    "O que você faz: informa como estão os eventos — ingressos vendidos (Zig), campanhas de Meta Ads, contatos que chegaram no WhatsApp e no direct, e manda o link do relatório de tráfego. Use sempre as ferramentas para pegar número; nunca invente nem estime.",
    "",
    "Eventos que esta pessoa pode consultar (não fale de nenhum outro):",
    linhas.length ? linhas.join("\n") : "- (nenhum evento no escopo desta pessoa)",
    "",
    "Regras de resposta:",
    "- Português do Brasil, direto, como uma mensagem de WhatsApp: curto, sem cabeçalhos, sem markdown de asterisco duplo. Negrito só com *um asterisco*, se ajudar. Quebre em linhas curtas.",
    "- Se houver mais de um evento no escopo e a pergunta não disser qual, pergunte qual — a não ser que só um esteja em venda/próximo, aí responda sobre ele e diga qual é.",
    "- Dinheiro em reais (R$ 1.234,56), inteiros com ponto de milhar.",
    "- Datas: fale 'hoje', 'ontem', ou dia/mês.",
    "- Se a ferramenta devolver aviso ou erro, repasse em uma frase simples, sem jargão técnico.",
    "- Não dê opinião sobre o que fazer com as campanhas a menos que peçam; se pedirem, seja objetivo e baseie nos números.",
    "- Fora desse assunto (ingressos, campanhas, contatos, relatório, eventos listados), diga em uma linha que você só cuida disso.",
  ].join("\n");
}

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string };

async function historico(sb: any, telefone: string): Promise<Msg[]> {
  const { data } = await sb.from("whatsapp_messages")
    .select("direction, message_text, message_type, timestamp")
    .eq("phone", telefone).eq("channel", "whatsapp").neq("message_type", "system")
    .gte("timestamp", new Date(Date.now() - 2 * 86400_000).toISOString())
    .order("timestamp", { ascending: false }).limit(16);
  return ((data ?? []) as any[]).reverse()
    .filter((m) => m.message_text && !String(m.message_text).startsWith("[Auto-disparo] Falha"))
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

async function responder(sb: any, socio: Socio, eventos: Evento[], textoDoUsuario: string) {
  const anteriores = await historico(sb, socio.telefone);
  // A mensagem atual já está gravada pelo webhook; se for a última do histórico, não duplica.
  const ultima = anteriores[anteriores.length - 1];
  if (!(ultima?.role === "user" && ultima.content === textoDoUsuario)) anteriores.push({ role: "user", content: textoDoUsuario });
  const mensagens: Msg[] = [{ role: "system", content: promptDoSistema(socio, eventos) }, ...anteriores];
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

// ---------------------------------------------------------------- WhatsApp
async function numeroRemetente(sb: any, token: string) {
  const { data: cfg } = await sb.from("lagun_resumo_config").select("phone_number_id").eq("id", "default").maybeSingle();
  if (cfg?.phone_number_id) return String(cfg.phone_number_id);
  if (!WABA_ID) return null;
  const resp = await fetch(`${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${token}`);
  const data = await resp.json();
  const cloud = data?.data?.find((p: Record<string, string>) => p.platform_type === "CLOUD_API");
  return (cloud?.id || data?.data?.[0]?.id || null) as string | null;
}

async function enviarTexto(sb: any, socio: Socio, texto: string, ferramentas: string[]) {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!token) throw new Error("META_WHATSAPP_TOKEN não configurado");
  const phoneId = await numeroRemetente(sb, token);
  if (!phoneId) throw new Error("Nenhum número de WhatsApp encontrado");
  const resp = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: socio.telefone, type: "text", text: { body: texto, preview_url: true } }),
  });
  const data = await resp.json().catch(() => ({}));
  const ok = resp.ok && !data?.error;
  await sb.from("whatsapp_messages").insert({
    phone: socio.telefone, contact_name: socio.nome, direction: "outgoing", message_type: "text",
    message_text: ok ? texto : `[Bot dos sócios] Falha: ${data?.error?.message || `HTTP ${resp.status}`}`,
    wamid: data?.messages?.[0]?.id ?? null, status: ok ? "sent" : "failed",
    timestamp: new Date().toISOString(), channel: "whatsapp",
    raw_payload: { phone_number_id: phoneId, bot: "socios", ferramentas },
  });
  if (!ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  return data?.messages?.[0]?.id ?? null;
}

// A chave de serviço pode ter sido rotacionada depois do deploy; confirma pelo
// que só ela consegue fazer: ler lagun_zig_credentials (sem policy, revogada
// de anon e authenticated).
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
    // Pelo painel é sempre prévia; por dentro (webhook) manda de verdade, a não ser que peça dry_run.
    const dryRun = body.dry_run === true || (!interno && body.dry_run !== false);

    const telefone = String(body.phone ?? "").replace(/\D/g, "");
    const texto = String(body.message ?? "").trim();
    if (!telefone || !texto) return json({ ok: false, error: "phone e message obrigatórios" }, 400);

    const socio = await encontrarSocio(sb, telefone);
    if (!socio) {
      console.log("bot-socios: número fora da lista, ignorado");
      return json({ ok: true, respondeu: false, motivo: "nao_e_socio" });
    }
    const eventos = await eventosDoSocio(sb, socio);
    const { texto: resposta, ferramentas } = await responder(sb, socio, eventos, texto);
    if (!resposta) return json({ ok: true, respondeu: false, motivo: "resposta_vazia", ferramentas });

    if (dryRun) return json({ ok: true, respondeu: false, dry_run: true, socio: { nome: socio.nome, tipo: socio.tipo }, eventos: eventos.map((e) => e.nome), ferramentas, resposta });
    const wamid = await enviarTexto(sb, socio, resposta, ferramentas);
    return json({ ok: true, respondeu: true, wamid, ferramentas });
  } catch (e) {
    console.error("bot-socios:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

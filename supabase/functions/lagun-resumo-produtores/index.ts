// ============================================================================
// lagun-resumo-produtores — resumo de vendas por WhatsApp para os produtores.
// ----------------------------------------------------------------------------
// Regra: às 20h de Brasília, quando o evento da landing acontece em 4, 3, 2 ou
// 1 dia, e no próprio dia, os produtores fixos e os parceiros vinculados ao
// evento recebem o template `resumo_campanha_evento`:
//   {{1}} primeiro nome · {{2}} evento · {{3}} "acontece em N dias" /
//   "acontece amanhã" / "é hoje" · {{4}} ingressos vendidos no total ·
//   {{5}} ingressos vendidos hoje (00h às 20h) · botão {{1}} = código do envio
//   (lagun_resumo_envios.codigo, individual: a relatorio-evento registra quem
//   abriu). O teste usa o relatorio_token do evento (não conta clique).
//
// • Sem action (pg_cron 23:00 UTC): dispara, se ligado em lagun_resumo_config
//   e se já passou das 20h em Brasília (chamada fora de hora não envia nada).
//   Idempotente: UNIQUE (event_id, dia, telefone) em lagun_resumo_envios.
// • ?action=previa&event_id=… (usuário logado): o que seria enviado, sem enviar.
// • ?action=teste&event_id=…&telefone=… (usuário logado): envia uma mensagem
//   real só para o telefone informado (não entra no histórico da regra).
// verify_jwt = false (o cron chama sem Authorization).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { sincronizarEvento } from "../_shared/zig.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "1169322241814706";
const RELATORIO_BASE = "https://lagunvitoria.com.br/relatorio/";
const DIAS_DA_REGRA = [4, 3, 2, 1, 0];
const CAMPAIGN_KEY = "resumo_produtores";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- datas (BRT)
// Brasília = UTC-3 fixo (sem horário de verão desde 2019).
const agoraBrasilia = () => new Date(Date.now() - 3 * 3600_000);
const hojeBrasilia = () => agoraBrasilia().toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000);

function horaCorte(hora: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora ?? "").trim());
  const h = m ? Math.min(23, Number(m[1])) : 20;
  const min = m ? Math.min(59, Number(m[2])) : 0;
  return { h, min, texto: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}

function frase(dias: number) {
  if (dias === 0) return "é hoje";
  if (dias === 1) return "acontece amanhã";
  if (dias > 1) return `acontece em ${dias} dias`;
  return dias === -1 ? "aconteceu ontem" : `aconteceu há ${-dias} dias`;
}

const primeiroNome = (nome: string | null | undefined) => String(nome ?? "").trim().split(/\s+/)[0] || "produtor";

function normalizarTelefone(raw: unknown) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

// ------------------------------------------------------------------- dados
type Destinatario = { partner_id: string | null; nome: string; telefone: string; tipo: string };

// Fixos da casa + parceiros vinculados ao evento, sem repetir telefone.
async function destinatarios(sb: any, eventId: string): Promise<Destinatario[]> {
  const [{ data: fixos }, { data: vinculos }] = await Promise.all([
    sb.from("lagun_partners").select("id, nome, telefone, tipo").eq("tipo", "fixo"),
    sb.from("lagun_event_partners").select("lagun_partners(id, nome, telefone, tipo)").eq("event_id", eventId),
  ]);
  const todos = [
    ...((fixos ?? []) as any[]),
    ...((vinculos ?? []) as any[]).map((v) => v.lagun_partners).filter(Boolean),
  ];
  const porTelefone = new Map<string, Destinatario>();
  for (const p of todos) {
    const telefone = normalizarTelefone(p.telefone);
    if (!telefone || porTelefone.has(telefone)) continue;
    porTelefone.set(telefone, { partner_id: p.id, nome: p.nome, telefone, tipo: p.tipo });
  }
  return [...porTelefone.values()];
}

async function totais(sb: any, eventId: string, dia: string, corte: { texto: string }) {
  const { data, error } = await sb.rpc("lagun_zig_totais", {
    p_event_id: eventId,
    p_inicio: `${dia}T00:00:00-03:00`,
    p_fim: `${dia}T${corte.texto}:00-03:00`,
  });
  if (error) throw new Error(error.message);
  const linha = Array.isArray(data) ? data[0] : data;
  return { total: Number(linha?.total_ingressos ?? 0), hoje: Number(linha?.ingressos_periodo ?? 0) };
}

// ---------------------------------------------------------------- WhatsApp
type Template = { body: string | null; buttonIndex: number; status: string | null };

async function carregarTemplate(token: string, nome: string, idioma: string): Promise<Template> {
  try {
    const resp = await fetch(
      `${GRAPH_API}/${WABA_ID}/message_templates?name=${encodeURIComponent(nome)}&limit=50&access_token=${token}`,
    );
    const data = await resp.json();
    const def = (data?.data ?? []).find((t: any) => t.name === nome && (!t.language || t.language === idioma))
      ?? (data?.data ?? []).find((t: any) => t.name === nome);
    const body = def?.components?.find((c: any) => c.type === "BODY")?.text ?? null;
    const buttons = def?.components?.find((c: any) => c.type === "BUTTONS")?.buttons ?? [];
    const idx = buttons.findIndex((b: any) => b.type === "URL" && String(b.url ?? "").includes("{{1}}"));
    return { body, buttonIndex: idx >= 0 ? idx : 0, status: def ? String(def.status ?? "") : "NAO_ENCONTRADO" };
  } catch (e) {
    console.error("Falha ao ler o template:", e);
    return { body: null, buttonIndex: 0, status: null };
  }
}

function renderizar(tpl: Template, vars: string[], nomeTemplate: string) {
  if (!tpl.body) return `[Template: ${nomeTemplate}] ${vars.join(" · ")}`;
  return tpl.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => vars[Number(n) - 1] ?? "");
}

async function numeroRemetente(token: string, configurado: string | null) {
  if (configurado) return configurado;
  const resp = await fetch(`${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${token}`);
  const data = await resp.json();
  const cloud = data?.data?.find((p: Record<string, string>) => p.platform_type === "CLOUD_API");
  return (cloud?.id || data?.data?.[0]?.id || null) as string | null;
}

async function enviarTemplate(opts: {
  token: string; phoneNumberId: string; to: string; template: string; idioma: string;
  vars: string[]; buttonIndex: number; relatorioToken: string;
}) {
  const payload = {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.template,
      language: { code: opts.idioma },
      components: [
        { type: "body", parameters: opts.vars.map((text) => ({ type: "text", text })) },
        {
          type: "button", sub_type: "url", index: String(opts.buttonIndex),
          parameters: [{ type: "text", text: opts.relatorioToken }],
        },
      ],
    },
  };
  try {
    const resp = await fetch(`${GRAPH_API}/${opts.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      return { ok: false as const, erro: data?.error?.message || `HTTP ${resp.status}`, wamid: null };
    }
    return { ok: true as const, erro: null, wamid: (data.messages?.[0]?.id ?? null) as string | null };
  } catch (e) {
    return { ok: false as const, erro: String(e), wamid: null };
  }
}

// Mesmo formato de registro do whatsapp-api (painel de disparos / chat).
async function registrarMensagem(sb: any, m: {
  telefone: string; nome: string; ok: boolean; erro: string | null; wamid: string | null; texto: string;
  phoneNumberId: string; template: string; eventId: string; teste?: boolean;
}) {
  const { error } = await sb.from("whatsapp_messages").insert({
    phone: m.telefone,
    contact_name: m.nome || null,
    direction: "outgoing",
    message_type: "template",
    message_text: m.ok ? m.texto : `[Auto-disparo] Falha: ${m.erro ?? "erro"} (Template: ${m.template})`,
    status: m.ok ? "sent" : "failed",
    wamid: m.wamid,
    template_category: "UTILITY",
    channel: "whatsapp",
    timestamp: new Date().toISOString(),
    raw_payload: {
      phone_number_id: m.phoneNumberId, template_name: m.template, campaign_key: CAMPAIGN_KEY,
      event_id: m.eventId, ...(m.teste ? { teste: true } : {}),
    },
  });
  if (error) console.error("Falha ao registrar em whatsapp_messages:", error);
}

// ------------------------------------------------------- montagem do resumo
async function montarResumo(sb: any, evento: any, dia: string, corte: { texto: string }, sincronizar: boolean) {
  const pendencias: string[] = [];
  const dias = evento.data ? diasEntre(dia, String(evento.data).slice(0, 10)) : null;
  const { data: zig } = await sb.from("lagun_event_zig")
    .select("zig_event_id, last_sync_at, last_sync_error").eq("event_id", evento.id).maybeSingle();
  if (!zig) pendencias.push("Zig não configurada para o evento");
  if (!evento.relatorio_token) pendencias.push("Evento sem link do relatório (relatorio_token)");
  if (dias === null) pendencias.push("Evento sem data");

  if (zig && sincronizar) {
    try { await sincronizarEvento(sb, evento.id); } catch (e) {
      pendencias.push(`Última leitura da Zig falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const numeros = zig ? await totais(sb, evento.id, dia, corte) : { total: 0, hoje: 0 };
  const lista = await destinatarios(sb, evento.id);
  if (lista.length === 0) pendencias.push("Nenhum produtor com telefone");
  return { dias, frase: dias === null ? "" : frase(dias), numeros, lista, pendencias, zig };
}

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const { data: config } = await sb.from("lagun_resumo_config").select("*").eq("id", "default").maybeSingle();
    const templateName = config?.template_name || "resumo_campanha_evento";
    const idioma = config?.template_language || "pt_BR";
    const corte = horaCorte(config?.hora);
    const dia = hojeBrasilia();

    // ------------------------------------------------------------- prévia
    if (action === "previa" || action === "teste") {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      const eventId = url.searchParams.get("event_id") ?? "";
      if (!eventId) return json({ error: "event_id obrigatório" }, 400);
      // select('*') para não quebrar se relatorio_token ainda não existir.
      const { data: evento } = await sb.from("lagun_events").select("*").eq("id", eventId).maybeSingle();
      if (!evento) return json({ error: "Evento não encontrado." }, 404);

      const resumo = await montarResumo(sb, evento, dia, corte, true);
      const waToken = Deno.env.get("META_WHATSAPP_TOKEN");
      const tpl = waToken ? await carregarTemplate(waToken, templateName, idioma) : { body: null, buttonIndex: 0, status: null };
      const varsPara = (nome: string) => [
        primeiroNome(nome), String(evento.nome ?? ""), resumo.frase,
        resumo.numeros.total.toLocaleString("pt-BR"), resumo.numeros.hoje.toLocaleString("pt-BR"),
      ];

      if (action === "previa") {
        const { data: jaEnviados } = await sb.from("lagun_resumo_envios")
          .select("telefone, status").eq("event_id", eventId).eq("dia", dia);
        const enviados = new Map(((jaEnviados ?? []) as any[]).map((r) => [r.telefone, r.status]));
        return json({
          evento: { id: evento.id, nome: evento.nome, data: evento.data },
          dia,
          hora: corte.texto,
          dias_faltando: resumo.dias,
          dentro_da_regra: resumo.dias !== null && DIAS_DA_REGRA.includes(resumo.dias) && !!evento.show_on_landing,
          frase: resumo.frase,
          total_ingressos: resumo.numeros.total,
          ingressos_hoje: resumo.numeros.hoje,
          template: templateName,
          template_encontrado: !!tpl.body,
          template_status: tpl.status,
          // No envio real cada produtor recebe um código próprio no lugar do token.
          botao_url: evento.relatorio_token ? `${RELATORIO_BASE}${evento.relatorio_token}` : null,
          botao_individual: true,
          ultima_sync: resumo.zig?.last_sync_at ?? null,
          pendencias: resumo.pendencias,
          destinatarios: resumo.lista.map((d) => ({
            nome: d.nome, telefone: d.telefone, tipo: d.tipo,
            status_hoje: enviados.get(d.telefone) ?? null,
            texto: renderizar(tpl, varsPara(d.nome), templateName),
          })),
        });
      }

      // ------------------------------------------------------------ teste
      const telefone = normalizarTelefone(url.searchParams.get("telefone"));
      if (!telefone) return json({ error: "Telefone inválido: use DDD + número." }, 400);
      if (!waToken) return json({ error: "META_WHATSAPP_TOKEN não configurado" }, 500);
      if (!evento.relatorio_token) return json({ error: "Evento sem link do relatório (relatorio_token)." }, 400);
      const phoneNumberId = await numeroRemetente(waToken, config?.phone_number_id ?? null);
      if (!phoneNumberId) return json({ error: "Nenhum número de WhatsApp encontrado." }, 400);

      const conhecido = resumo.lista.find((d) => d.telefone === telefone);
      const nome = conhecido?.nome ?? "Teste";
      const vars = varsPara(nome);
      const r = await enviarTemplate({
        token: waToken, phoneNumberId, to: telefone, template: templateName, idioma,
        vars, buttonIndex: tpl.buttonIndex, relatorioToken: evento.relatorio_token,
      });
      const texto = renderizar(tpl, vars, templateName);
      await registrarMensagem(sb, {
        telefone, nome, ok: r.ok, erro: r.erro, wamid: r.wamid, texto,
        phoneNumberId, template: templateName, eventId, teste: true,
      });
      if (!r.ok) return json({ ok: false, error: r.erro }, 400);
      return json({ ok: true, wamid: r.wamid, texto, telefone });
    }

    // -------------------------------------------------- disparo do cron
    if (!config?.enabled) return json({ ok: true, enviado: false, motivo: "Disparo desligado" });
    const agora = agoraBrasilia();
    const minutosAgora = agora.getUTCHours() * 60 + agora.getUTCMinutes();
    if (minutosAgora < corte.h * 60 + corte.min) {
      return json({ ok: true, enviado: false, motivo: `Antes das ${corte.texto} em Brasília` });
    }
    const waToken = Deno.env.get("META_WHATSAPP_TOKEN");
    if (!waToken) return json({ error: "META_WHATSAPP_TOKEN não configurado" }, 500);
    const phoneNumberId = await numeroRemetente(waToken, config.phone_number_id ?? null);
    if (!phoneNumberId) return json({ error: "Nenhum número de WhatsApp encontrado." }, 500);
    const tpl = await carregarTemplate(waToken, templateName, idioma);
    // Template ainda não aprovado (ou inexistente): não envia nada hoje. Se a
    // leitura do template falhou (status null), tenta enviar mesmo assim.
    if (tpl.status && tpl.status !== "APPROVED") {
      return json({ ok: true, enviado: false, motivo: `Template ${templateName}: ${tpl.status}` });
    }

    const { data: eventos, error: erroEventos } = await sb.from("lagun_events").select("*")
      .eq("show_on_landing", true).gte("data", dia).lte("data", somarDias(dia, 4));
    if (erroEventos) throw new Error(erroEventos.message);

    const relatorio: Array<Record<string, unknown>> = [];
    for (const evento of (eventos ?? []) as any[]) {
      const resumo = await montarResumo(sb, evento, dia, corte, true);
      if (resumo.dias === null || !DIAS_DA_REGRA.includes(resumo.dias)) continue;
      if (!resumo.zig || !evento.relatorio_token) {
        relatorio.push({ event_id: evento.id, pulado: true, motivo: resumo.pendencias.join("; ") });
        continue;
      }

      let enviados = 0, falhas = 0, jaFeitos = 0;
      for (const d of resumo.lista) {
        // Reserva a vaga (evento, dia, telefone). Se já existe: só tenta de
        // novo quando o envio anterior falhou.
        const base = {
          event_id: evento.id, dia, dias_faltando: resumo.dias, partner_id: d.partner_id, nome: d.nome,
          telefone: d.telefone, status: "enviando", erro: null, wamid: null,
          total_ingressos: resumo.numeros.total, ingressos_hoje: resumo.numeros.hoje,
        };
        const { data: nova, error: erroNova } = await sb.from("lagun_resumo_envios")
          .insert(base).select("id, codigo").maybeSingle();
        let envioId: string | null = nova?.id ?? null;
        let codigo: string | null = nova?.codigo ?? null;
        if (!envioId) {
          if (erroNova && erroNova.code !== "23505") { console.error(erroNova); falhas++; continue; }
          const { data: retomada } = await sb.from("lagun_resumo_envios")
            .update({ ...base, created_at: new Date().toISOString() })
            .eq("event_id", evento.id).eq("dia", dia).eq("telefone", d.telefone).eq("status", "failed")
            .select("id, codigo").maybeSingle();
          envioId = retomada?.id ?? null;
          codigo = retomada?.codigo ?? null;
        }
        if (!envioId) { jaFeitos++; continue; }

        const vars = [
          primeiroNome(d.nome), String(evento.nome ?? ""), resumo.frase,
          resumo.numeros.total.toLocaleString("pt-BR"), resumo.numeros.hoje.toLocaleString("pt-BR"),
        ];
        const r = await enviarTemplate({
          token: waToken, phoneNumberId, to: d.telefone, template: templateName, idioma,
          vars, buttonIndex: tpl.buttonIndex, relatorioToken: codigo || evento.relatorio_token,
        });
        await sb.from("lagun_resumo_envios")
          .update({ status: r.ok ? "sent" : "failed", wamid: r.wamid, erro: r.erro })
          .eq("id", envioId);
        await registrarMensagem(sb, {
          telefone: d.telefone, nome: d.nome, ok: r.ok, erro: r.erro, wamid: r.wamid,
          texto: renderizar(tpl, vars, templateName), phoneNumberId, template: templateName, eventId: evento.id,
        });
        if (r.ok) enviados++; else falhas++;
        await sleep(150);
      }
      relatorio.push({
        event_id: evento.id, dias_faltando: resumo.dias, total: resumo.numeros.total,
        hoje: resumo.numeros.hoje, enviados, falhas, ja_enviados: jaFeitos,
        avisos: resumo.pendencias.length ? resumo.pendencias : undefined,
      });
    }
    return json({ ok: true, dia, eventos: relatorio });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Falha no resumo." }, 500);
  }
});

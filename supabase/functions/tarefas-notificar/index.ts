// ============================================================================
// tarefas-notificar — aviso e lembrete de tarefa no WhatsApp.
// ----------------------------------------------------------------------------
// • { tipo: "nova", task_id }   ← gatilho do banco quando a tarefa ganha
//   responsável. Manda o template `tarefa_nova` para o telefone do perfil.
// • { tipo: "lembretes" }       ← pg_cron às 9h (Brasília). Para cada tarefa
//   pendente com prazo amanhã, hoje ou vencido, manda `tarefa_lembrete`, um
//   por dia (UNIQUE em team_task_notificacoes).
// • { tipo: "concluir", task_id, phone } ← whatsapp-webhook, quando a pessoa
//   toca em "Já fiz". Confere que o telefone é do responsável (ou de alguém da
//   equipe), marca como finalizada e responde no chat.
//
// Variáveis dos templates: {{1}} nome · {{2}} quem pediu (nova) / título
// (lembrete) · {{3}} título (nova) / evento (lembrete) · {{4}} evento (nova) /
// prazo (lembrete) · {{5}} prazo (nova) / quem pediu (lembrete). Botões:
// 0 = URL "Abrir tarefa" (…/interno/tarefas?task={{1}}), 1 = resposta rápida
// "Já fiz" (payload tarefa_feita:<id>).
// verify_jwt = false (gatilho e cron chamam sem Authorization).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { variantesDoTelefone } from "../_shared/socios.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WABA_ID = Deno.env.get("WHATSAPP_WABA_ID") || "";
const PAINEL_URL = (Deno.env.get("APP_PUBLIC_URL") || "https://lagunvitoria.com.br").replace(/\/$/, "");
const NOME_DA_CASA = Deno.env.get("BOT_NOME_DA_CASA") || "Lagun";
const TPL_NOVA = Deno.env.get("TPL_TAREFA_NOVA") || "tarefa_nova";
const TPL_LEMBRETE = Deno.env.get("TPL_TAREFA_LEMBRETE") || "tarefa_lembrete";
const IDIOMA = "pt_BR";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeBrasilia = () => fmtDia.format(new Date());
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000);
const dataCurta = (dia: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${dia}T12:00:00Z`)).replace(".", "");
const primeiroNome = (nome: string | null | undefined) => String(nome ?? "").trim().split(/\s+/)[0] || "pessoal";
const normalizarTelefone = (raw: unknown) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
};

function textoPrazo(due: string | null) {
  if (!due) return "sem prazo";
  const d = diasEntre(hojeBrasilia(), due);
  if (d === 0) return `hoje (${dataCurta(due)})`;
  if (d === 1) return `amanhã (${dataCurta(due)})`;
  if (d < 0) return `${d === -1 ? "ontem" : `há ${-d} dias`} (${dataCurta(due)}), já venceu`;
  return `${dataCurta(due)}, em ${d} dias`;
}

// ------------------------------------------------------------------- dados
type Tarefa = {
  id: string; title: string; status: string; due_date: string | null; assigned_to: string | null; created_by: string | null; event_id: string | null;
};
async function carregarTarefa(sb: any, id: string) {
  const { data: t } = await sb.from("team_tasks").select("id, title, status, due_date, assigned_to, created_by, event_id").eq("id", id).maybeSingle();
  if (!t) return null;
  const ids = [t.assigned_to, t.created_by].filter(Boolean);
  const [{ data: perfis }, { data: evento }] = await Promise.all([
    ids.length ? sb.from("profiles").select("id, full_name, username, telefone").in("id", ids) : Promise.resolve({ data: [] }),
    t.event_id ? sb.from("lagun_events").select("nome").eq("id", t.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const perfil = (uid: string | null) => ((perfis ?? []) as any[]).find((p) => p.id === uid) ?? null;
  const resp = perfil(t.assigned_to), criador = perfil(t.created_by);
  return {
    tarefa: t as Tarefa,
    responsavel: resp ? { nome: resp.full_name || resp.username || "", telefone: normalizarTelefone(resp.telefone) } : null,
    quemPediu: criador?.full_name || criador?.username || NOME_DA_CASA,
    evento: evento?.nome || "sem evento",
  };
}

// ---------------------------------------------------------------- WhatsApp
async function numeroRemetente(sb: any, token: string) {
  const { data: cfg } = await sb.from("lagun_resumo_config").select("phone_number_id").eq("id", "default").maybeSingle();
  if (cfg?.phone_number_id) return String(cfg.phone_number_id);
  if (!WABA_ID) return null;
  const r = await fetch(`${GRAPH_API}/${WABA_ID}/phone_numbers?access_token=${token}`);
  const d = await r.json();
  const cloud = d?.data?.find((p: Record<string, string>) => p.platform_type === "CLOUD_API");
  return (cloud?.id || d?.data?.[0]?.id || null) as string | null;
}

async function enviarTemplate(sb: any, opts: { to: string; nome: string; template: string; vars: string[]; taskId: string; tipo: "nova" | "lembrete"; textoLog: string }) {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!token) throw new Error("META_WHATSAPP_TOKEN não configurado");
  const phoneId = await numeroRemetente(sb, token);
  if (!phoneId) throw new Error("Nenhum número de WhatsApp encontrado");
  const payload = {
    messaging_product: "whatsapp", to: opts.to, type: "template",
    template: {
      name: opts.template, language: { code: IDIOMA },
      components: [
        { type: "body", parameters: opts.vars.map((text) => ({ type: "text", text })) },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: opts.taskId }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `tarefa_feita:${opts.taskId}` }] },
      ],
    },
  };
  const r = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  const ok = r.ok && !d?.error;
  const wamid = d?.messages?.[0]?.id ?? null;
  await sb.from("whatsapp_messages").insert({
    phone: opts.to, contact_name: opts.nome || null, direction: "outgoing", message_type: "template",
    message_text: ok ? opts.textoLog : `[Tarefa] Falha: ${d?.error?.message || `HTTP ${r.status}`} (Template: ${opts.template})`,
    status: ok ? "sent" : "failed", wamid, template_category: "UTILITY", channel: "whatsapp", timestamp: new Date().toISOString(),
    raw_payload: { phone_number_id: phoneId, template_name: opts.template, campaign_key: "tarefas", task_id: opts.taskId, tipo: opts.tipo },
  });
  await sb.from("team_task_notificacoes").upsert({
    task_id: opts.taskId, tipo: opts.tipo, dia: hojeBrasilia(), telefone: opts.to,
    status: ok ? "sent" : "failed", wamid, erro: ok ? null : (d?.error?.message || `HTTP ${r.status}`),
  }, { onConflict: "task_id,tipo,dia,telefone" });
  return { ok, erro: ok ? null : (d?.error?.message || `HTTP ${r.status}`), wamid };
}

async function enviarTexto(sb: any, to: string, nome: string, texto: string, taskId: string) {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  if (!token) return;
  const phoneId = await numeroRemetente(sb, token);
  if (!phoneId) return;
  const r = await fetch(`${GRAPH_API}/${phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
  const d = await r.json().catch(() => ({}));
  await sb.from("whatsapp_messages").insert({
    phone: to, contact_name: nome || null, direction: "outgoing", message_type: "text", message_text: texto,
    status: r.ok && !d?.error ? "sent" : "failed", wamid: d?.messages?.[0]?.id ?? null, channel: "whatsapp",
    timestamp: new Date().toISOString(), raw_payload: { phone_number_id: phoneId, campaign_key: "tarefas", task_id: taskId, tipo: "concluida" },
  });
}

// -------------------------------------------------------------------- ações
async function avisarNova(sb: any, taskId: string) {
  const c = await carregarTarefa(sb, taskId);
  if (!c) return { ok: false, motivo: "tarefa_nao_encontrada" };
  if (c.tarefa.status !== "pendente") return { ok: true, enviado: false, motivo: "tarefa_nao_pendente" };
  if (!c.responsavel) return { ok: true, enviado: false, motivo: "sem_responsavel" };
  if (!c.responsavel.telefone) return { ok: true, enviado: false, motivo: "responsavel_sem_telefone" };
  const { data: ja } = await sb.from("team_task_notificacoes").select("id").eq("task_id", taskId).eq("tipo", "nova").eq("telefone", c.responsavel.telefone).eq("status", "sent").limit(1);
  if (ja?.length) return { ok: true, enviado: false, motivo: "ja_avisado" };
  const vars = [primeiroNome(c.responsavel.nome), c.quemPediu, c.tarefa.title, c.evento, textoPrazo(c.tarefa.due_date)];
  const r = await enviarTemplate(sb, {
    to: c.responsavel.telefone, nome: c.responsavel.nome, template: TPL_NOVA, vars, taskId, tipo: "nova",
    textoLog: `Oi, ${vars[0]}! ${vars[1]} te passou uma tarefa no painel da ${NOME_DA_CASA}: ${vars[2]} · Evento: ${vars[3]} · Prazo: ${vars[4]}`,
  });
  return { ok: r.ok, enviado: r.ok, erro: r.erro };
}

async function lembretes(sb: any) {
  const hoje = hojeBrasilia();
  const { data: tarefas } = await sb.from("team_tasks").select("id")
    .eq("status", "pendente").not("assigned_to", "is", null).not("due_date", "is", null).lte("due_date", somarDias(hoje, 1)).limit(200);
  const relatorio: Array<Record<string, unknown>> = [];
  for (const t of (tarefas ?? []) as Array<{ id: string }>) {
    const c = await carregarTarefa(sb, t.id);
    if (!c?.responsavel?.telefone) { relatorio.push({ task_id: t.id, pulado: "sem_telefone" }); continue; }
    const { data: ja } = await sb.from("team_task_notificacoes").select("id").eq("task_id", t.id).eq("tipo", "lembrete").eq("dia", hoje).eq("telefone", c.responsavel.telefone).eq("status", "sent").limit(1);
    if (ja?.length) { relatorio.push({ task_id: t.id, pulado: "ja_hoje" }); continue; }
    const vars = [primeiroNome(c.responsavel.nome), c.tarefa.title, c.evento, textoPrazo(c.tarefa.due_date), c.quemPediu];
    const r = await enviarTemplate(sb, {
      to: c.responsavel.telefone, nome: c.responsavel.nome, template: TPL_LEMBRETE, vars, taskId: t.id, tipo: "lembrete",
      textoLog: `Lembrete: a tarefa ${vars[1]} do evento ${vars[2]} vence ${vars[3]} e ainda está pendente. Quem pediu: ${vars[4]}.`,
    });
    relatorio.push({ task_id: t.id, enviado: r.ok, erro: r.erro });
    await new Promise((res) => setTimeout(res, 150));
  }
  return { ok: true, dia: hoje, tarefas: relatorio };
}

async function concluir(sb: any, taskId: string, phone: string) {
  const c = await carregarTarefa(sb, taskId);
  if (!c) return { ok: false, motivo: "tarefa_nao_encontrada" };
  const variantes = variantesDoTelefone(phone);
  // Quem toca tem que ser alguém da equipe com esse telefone (de preferência o responsável).
  const { data: donos } = await sb.from("profiles").select("id, full_name, username, telefone").not("telefone", "is", null);
  const pessoa = ((donos ?? []) as any[]).find((p) => variantes.includes(String(p.telefone ?? "").replace(/\D/g, "")) || variantesDoTelefone(String(p.telefone ?? "")).some((v) => variantes.includes(v)));
  if (!pessoa) return { ok: true, feito: false, motivo: "telefone_nao_e_da_equipe" };
  const nome = pessoa.full_name || pessoa.username || "";
  const telefone = normalizarTelefone(phone) ?? phone;
  if (c.tarefa.status === "finalizado") {
    await enviarTexto(sb, telefone, nome, `A tarefa *${c.tarefa.title}* já estava marcada como feita. 👍`, taskId);
    return { ok: true, feito: false, motivo: "ja_finalizada" };
  }
  const { error } = await sb.from("team_tasks").update({ status: "finalizado", updated_at: new Date().toISOString() }).eq("id", taskId);
  if (error) {
    await enviarTexto(sb, telefone, nome, `Não consegui marcar *${c.tarefa.title}* como feita agora. Tenta pelo painel: ${PAINEL_URL}/interno/tarefas?task=${taskId}`, taskId);
    return { ok: false, erro: error.message };
  }
  await sb.from("team_task_notificacoes").upsert({ task_id: taskId, tipo: "concluida", dia: hojeBrasilia(), telefone, status: "sent" }, { onConflict: "task_id,tipo,dia,telefone" });
  await enviarTexto(sb, telefone, nome, `Feito! *${c.tarefa.title}* marcada como concluída.${c.evento !== "sem evento" ? ` (${c.evento})` : ""}`, taskId);
  return { ok: true, feito: true };
}

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const tipo = String(body.tipo ?? "");
    const taskId = String(body.task_id ?? "");
    const uuid = /^[0-9a-f-]{36}$/i;
    if (tipo === "nova") {
      if (!uuid.test(taskId)) return json({ error: "task_id inválido" }, 400);
      return json(await avisarNova(sb, taskId));
    }
    if (tipo === "lembretes") return json(await lembretes(sb));
    if (tipo === "concluir") {
      if (!uuid.test(taskId)) return json({ error: "task_id inválido" }, 400);
      const phone = String(body.phone ?? "").replace(/\D/g, "");
      if (!phone) return json({ error: "phone obrigatório" }, 400);
      return json(await concluir(sb, taskId, phone));
    }
    return json({ error: "tipo inválido (nova | lembretes | concluir)" }, 400);
  } catch (e) {
    console.error("tarefas-notificar:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

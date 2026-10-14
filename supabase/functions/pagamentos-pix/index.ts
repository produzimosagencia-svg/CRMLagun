// Pagamentos por Pix pela API do Banco Inter (conta PJ da Lagun).
//
// Quem chama: a aba Pagamentos do painel (usuário da lista
// lagun_pagamentos_usuarios) e o webhook do banco.
//
// Ações (POST, JSON { action, ... }):
//   banco        → { configurado, banco, conta }: se as credenciais já estão nos secrets.
//   pagar        → { pagamento_id }: manda o Pix. a_pagar → processando → pago | falhou.
//   consultar    → { pagamento_id }: pergunta ao banco o status de um processando.
//   webhook_ligar→ registra no Inter a URL deste webhook (uma vez, depois das chaves).
// Webhook do Inter: POST sem action, corpo com a(s) transação(ões). Nunca
// confiamos no corpo: a função consulta o banco antes de marcar como pago.
//
// Secrets: INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PEM (certificado),
// INTER_KEY_PEM (chave privada), INTER_CONTA_CORRENTE (opcional, se a conta
// tiver mais de uma), INTER_AMBIENTE (sandbox | producao; padrão producao).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ------------------------------------------------------------------ Inter
const INTER = {
  clientId: Deno.env.get("INTER_CLIENT_ID") ?? "",
  clientSecret: Deno.env.get("INTER_CLIENT_SECRET") ?? "",
  cert: Deno.env.get("INTER_CERT_PEM") ?? "",
  key: Deno.env.get("INTER_KEY_PEM") ?? "",
  conta: Deno.env.get("INTER_CONTA_CORRENTE") ?? "",
  base: (Deno.env.get("INTER_AMBIENTE") ?? "producao") === "sandbox"
    ? "https://cdpj-sandbox.partners.uatinter.co"
    : "https://cdpj.partners.bancointer.com.br",
};
const configurado = () => !!(INTER.clientId && INTER.clientSecret && INTER.cert && INTER.key);

// Os secrets guardam o PEM em uma linha com "\n" literal; aqui vira quebra de linha.
const pem = (s: string) => s.includes("\\n") ? s.replace(/\\n/g, "\n") : s;

let httpClient: Deno.HttpClient | null = null;
function clienteMtls(): Deno.HttpClient {
  if (!httpClient) {
    httpClient = Deno.createHttpClient({ certChain: pem(INTER.cert), privateKey: pem(INTER.key) });
  }
  return httpClient;
}

let tokenCache: { token: string; expira: number } | null = null;
async function tokenInter(scope: string): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 30_000) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: INTER.clientId, client_secret: INTER.clientSecret,
    grant_type: "client_credentials", scope,
  });
  const r = await fetch(`${INTER.base}/oauth/v2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    client: clienteMtls(),
  } as RequestInit);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(`Inter não deu token (${r.status}): ${JSON.stringify(data).slice(0, 300)}`);
  tokenCache = { token: data.access_token, expira: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

const ESCOPO_PIX = "pagamento-pix.write pagamento-pix.read";
const ESCOPO_WEBHOOK = "webhook-banking.write webhook-banking.read";

async function inter(method: string, caminho: string, scope: string, body?: unknown, extra: Record<string, string> = {}) {
  const token = await tokenInter(scope);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
  if (INTER.conta) headers["x-conta-corrente"] = INTER.conta;
  const r = await fetch(`${INTER.base}${caminho}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, client: clienteMtls(),
  } as RequestInit);
  const texto = await r.text();
  let data: any = {};
  try { data = texto ? JSON.parse(texto) : {}; } catch { data = { raw: texto }; }
  return { ok: r.ok, status: r.status, data };
}

// Status do Inter → nosso. O que não conhecemos fica "processando".
function traduzirStatus(s: string | undefined): "pago" | "falhou" | "processando" {
  const v = String(s ?? "").toUpperCase();
  if (["REALIZADO", "APROVADO", "PAGO", "CONCLUIDO", "CONCLUÍDO", "EFETIVADO"].includes(v)) return "pago";
  if (["REJEITADO", "CANCELADO", "ERRO", "FALHA", "NEGADO", "EXPIRADO", "DEVOLVIDO"].includes(v)) return "falhou";
  return "processando";
}

// ------------------------------------------------------------------ banco de dados
async function registrar(pagamentoId: string, acao: string, detalhe: unknown, userId: string | null) {
  await sb.from("lagun_pagamentos_log").insert({ pagamento_id: pagamentoId, acao, detalhe, user_id: userId });
}

async function podeUsar(userId: string) {
  const { data } = await sb.from("lagun_pagamentos_usuarios").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

async function pagoHoje(): Promise<number> {
  const inicio = new Date(); inicio.setUTCHours(3, 0, 0, 0); // 0h de Brasília
  if (inicio.getTime() > Date.now()) inicio.setUTCDate(inicio.getUTCDate() - 1);
  const { data } = await sb.from("lagun_pagamentos").select("valor")
    .in("status", ["processando", "pago"]).gte("pago_em", inicio.toISOString());
  return ((data ?? []) as any[]).reduce((s, p) => s + Number(p.valor), 0);
}

// Consulta um pagamento no banco e atualiza o status aqui.
async function sincronizar(pag: any, origem: string, userId: string | null) {
  if (!pag.codigo_banco) return pag;
  const r = await inter("GET", `/banking/v2/pix/${pag.codigo_banco}`, ESCOPO_PIX);
  await registrar(pag.id, origem, { http: r.status, resposta: r.data }, userId);
  if (!r.ok) return pag;
  const tx = r.data?.transacaoPix ?? r.data;
  const novo = traduzirStatus(tx?.status);
  const patch: Record<string, unknown> = {
    status: novo,
    end_to_end_id: tx?.endToEnd ?? tx?.endToEndId ?? pag.end_to_end_id ?? null,
    nome_no_banco: tx?.recebedor?.nome ?? tx?.nomeRecebedor ?? pag.nome_no_banco ?? null,
  };
  if (novo === "falhou") patch.erro = tx?.motivo ?? tx?.descricaoStatus ?? tx?.status ?? "Rejeitado pelo banco";
  const { data } = await sb.from("lagun_pagamentos").update(patch).eq("id", pag.id).select("*").single();
  return data ?? pag;
}

// ------------------------------------------------------------------ ações
async function pagar(pagamentoId: string, userId: string) {
  if (!configurado()) return json({ error: "banco_nao_configurado", mensagem: "A conta do banco ainda não foi conectada." }, 409);

  const { data: pag } = await sb.from("lagun_pagamentos").select("*, favorecido:lagun_favorecidos(*)").eq("id", pagamentoId).maybeSingle();
  if (!pag) return json({ error: "Pagamento não encontrado." }, 404);
  if (pag.status !== "a_pagar") return json({ error: `Este pagamento está ${pag.status}.` }, 409);
  if (!pag.favorecido?.ativo) return json({ error: "Favorecido inativo." }, 409);

  const { data: cfg } = await sb.from("lagun_pagamentos_config").select("limite_diario").eq("id", true).maybeSingle();
  const limite = Number(cfg?.limite_diario ?? 0);
  const hoje = await pagoHoje();
  if (limite > 0 && hoje + Number(pag.valor) > limite) {
    return json({ error: "limite_diario", mensagem: `Passa do limite do dia (R$ ${limite.toFixed(2)}; já foram R$ ${hoje.toFixed(2)}).` }, 409);
  }

  // Reserva: só um clique leva o pagamento de a_pagar para processando.
  const { data: reservado } = await sb.from("lagun_pagamentos")
    .update({ status: "processando", pago_por: userId, pago_em: new Date().toISOString(), chave_pix_usada: pag.favorecido.chave_pix, erro: null })
    .eq("id", pagamentoId).eq("status", "a_pagar").select("*").maybeSingle();
  if (!reservado) return json({ error: "Alguém já mandou pagar este pagamento." }, 409);
  await registrar(pagamentoId, "pagar", { valor: pag.valor, chave: pag.favorecido.chave_pix }, userId);

  const corpo = {
    valor: Number(pag.valor),
    descricao: String(pag.descricao).slice(0, 140),
    destinatario: { tipo: "CHAVE", chave: pag.favorecido.chave_pix },
  };
  let r;
  try {
    r = await inter("POST", "/banking/v2/pix", ESCOPO_PIX, corpo, { "x-id-idempotente": pagamentoId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("lagun_pagamentos").update({ status: "falhou", erro: msg }).eq("id", pagamentoId);
    await registrar(pagamentoId, "falhou", { erro: msg }, userId);
    return json({ error: msg }, 502);
  }

  if (!r.ok) {
    const erro = r.data?.detail ?? r.data?.title ?? r.data?.violacoes?.[0]?.razao ?? `Banco respondeu ${r.status}`;
    await sb.from("lagun_pagamentos").update({ status: "falhou", erro: String(erro).slice(0, 300) }).eq("id", pagamentoId);
    await registrar(pagamentoId, "falhou", { http: r.status, resposta: r.data }, userId);
    return json({ error: erro }, 502);
  }

  const codigo = r.data?.codigoSolicitacao ?? r.data?.codigo ?? null;
  await sb.from("lagun_pagamentos").update({ codigo_banco: codigo }).eq("id", pagamentoId);
  await registrar(pagamentoId, "banco_aceitou", r.data, userId);

  // O Inter costuma responder PROCESSADO na hora; confirmamos consultando.
  const { data: atual } = await sb.from("lagun_pagamentos").select("*").eq("id", pagamentoId).single();
  const final = codigo ? await sincronizar(atual, "consulta", userId) : atual;
  if (final.status === "pago") await registrar(pagamentoId, "pago", { end_to_end_id: final.end_to_end_id }, userId);
  return json({ ok: true, pagamento: final });
}

async function consultar(pagamentoId: string, userId: string) {
  if (!configurado()) return json({ error: "banco_nao_configurado" }, 409);
  const { data: pag } = await sb.from("lagun_pagamentos").select("*").eq("id", pagamentoId).maybeSingle();
  if (!pag) return json({ error: "Pagamento não encontrado." }, 404);
  if (!pag.codigo_banco) return json({ ok: true, pagamento: pag });
  const final = await sincronizar(pag, "consulta", userId);
  if (final.status === "pago" && pag.status !== "pago") await registrar(pagamentoId, "pago", { end_to_end_id: final.end_to_end_id }, userId);
  return json({ ok: true, pagamento: final });
}

async function webhookLigar(userId: string) {
  if (!configurado()) return json({ error: "banco_nao_configurado" }, 409);
  const url = `${SUPABASE_URL}/functions/v1/pagamentos-pix`;
  const r = await inter("PUT", "/banking/v2/webhooks/pix-pagamento", ESCOPO_WEBHOOK, { webhookUrl: url });
  return json({ ok: r.ok, http: r.status, resposta: r.data, url, por: userId });
}

// Webhook do Inter: lista de transações com codigoSolicitacao. Só usamos o
// código para achar o pagamento e consultar o banco de novo.
async function webhook(body: unknown) {
  const itens = Array.isArray(body) ? body : body ? [body] : [];
  let tratados = 0;
  for (const it of itens as any[]) {
    const codigo = it?.codigoSolicitacao ?? it?.codigoTransacao ?? it?.transacaoPix?.codigoSolicitacao;
    if (!codigo) continue;
    const { data: pag } = await sb.from("lagun_pagamentos").select("*").eq("codigo_banco", String(codigo)).maybeSingle();
    if (!pag) continue;
    await registrar(pag.id, "webhook", it, null);
    if (pag.status === "processando") {
      const final = await sincronizar(pag, "consulta", null);
      if (final.status === "pago") await registrar(pag.id, "pago", { end_to_end_id: final.end_to_end_id }, null);
    }
    tratados++;
  }
  return json({ ok: true, tratados });
}

// ------------------------------------------------------------------ servidor
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // Sem action e sem Authorization = webhook do banco.
  const action = typeof body?.action === "string" ? body.action : null;
  if (!action && !req.headers.get("Authorization")) return await webhook(body);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const interno = auth.roles.includes("service_role");
  if (!interno && !(await podeUsar(auth.userId))) return json({ error: "Sem acesso a pagamentos." }, 403);

  try {
    switch (action) {
      case "banco":
        return json({ configurado: configurado(), banco: "Banco Inter", ambiente: INTER.base.includes("sandbox") ? "sandbox" : "producao", conta: INTER.conta || null });
      case "pagar":
        return await pagar(String(body.pagamento_id ?? ""), auth.userId);
      case "consultar":
        return await consultar(String(body.pagamento_id ?? ""), auth.userId);
      case "webhook_ligar":
        return await webhookLigar(auth.userId);
      default:
        return json({ error: "action inválida" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("pagamentos-pix", msg);
    return json({ error: msg }, 500);
  }
});

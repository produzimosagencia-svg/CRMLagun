// AbacatePay (API v2): cobrança Pix "transparente" (QR + copia e cola na nossa tela).
// Docs: https://docs.abacatepay.com (llms.txt tem o índice)
//
// Secrets:
//   ABACATEPAY_API_KEY        abc_dev_... (modo teste: nada é cobrado, dá para simular)
//                             abc_prod_... (produção)
//   ABACATEPAY_WEBHOOK_SECRET 32+ caracteres; o mesmo cadastrado no webhook da AbacatePay
//
// Permissões da chave: TRANSPARENT:CREATE, TRANSPARENT:READ, WEBHOOK:CREATE, WEBHOOK:READ.
// Não existe cancelar cobrança: o Pix vence sozinho em expiresIn (mínimo 300 s).
// Webhook: nunca confiar no corpo. Confere o secret (X-Webhook-Secret), a assinatura
// (X-Webhook-Signature = HMAC-SHA256 base64 do corpo cru com a chave pública da AbacatePay)
// e, mesmo assim, consulta a cobrança antes de marcar pago.

const API = "https://api.abacatepay.com/v2";
const chave = () => Deno.env.get("ABACATEPAY_API_KEY") ?? "";
const segredoWebhook = () => Deno.env.get("ABACATEPAY_WEBHOOK_SECRET") ?? "";
// Chave pública da AbacatePay para a assinatura do webhook (a mesma para todas as contas, publicada na doc).
const CHAVE_PUBLICA =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

export const abacateConfigurado = () => !!chave();
/** Chave de teste (abc_dev_): cobranças de mentira, com simulação de pagamento. */
export const abacateModoTeste = () => chave().startsWith("abc_dev_");

async function chamar(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${chave()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(`AbacatePay ${caminho}: ${d?.error?.message ?? d?.error ?? `HTTP ${r.status}`}`);
  return d?.data;
}

/** Descrição só com letras, números e pontuação simples (a API recusa emoji). */
const limparDescricao = (s: string) => s.normalize("NFC").replace(/[^\p{L}\p{N} .,:/()\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 140);

export async function criarPixAbacate(d: {
  externalId: string; valor: number; expiracaoSeg: number; descricao: string; metadata?: Record<string, string>;
}) {
  const data = await chamar("/transparents/create", {
    method: "POST",
    body: JSON.stringify({
      method: "PIX",
      data: {
        amount: Math.round(d.valor * 100),
        expiresIn: Math.max(300, Math.round(d.expiracaoSeg)),
        description: limparDescricao(d.descricao),
        externalId: d.externalId,
        metadata: d.metadata ?? {},
      },
    }),
  });
  return {
    id: String(data.id),
    copiaCola: String(data.brCode),
    expiraEm: data.expiresAt ? String(data.expiresAt) : null,
    devMode: !!data.devMode,
  };
}

export async function consultarPixAbacate(id: string) {
  const data = await chamar(`/transparents/check?id=${encodeURIComponent(id)}`);
  const status = String(data?.status ?? "");
  return { status, pago: status === "PAID" };
}

/** Só com chave abc_dev_: marca a cobrança como paga (e dispara o webhook de teste). */
export async function simularPixAbacate(id: string) {
  return await chamar(`/transparents/simulate-payment?id=${encodeURIComponent(id)}`, { method: "POST" });
}

export async function ligarWebhookAbacate(endpoint: string) {
  if (segredoWebhook().length < 32) throw new Error("ABACATEPAY_WEBHOOK_SECRET precisa ter 32+ caracteres");
  const existentes = (await chamar("/webhooks/list").catch(() => [])) as any[];
  const ja = (Array.isArray(existentes) ? existentes : []).find((w) => w?.endpoint === endpoint);
  if (ja) return { ok: true, jaExistia: true, webhook: ja };
  const webhook = await chamar("/webhooks/create", {
    method: "POST",
    body: JSON.stringify({ name: "Lagun lounges", endpoint, secret: segredoWebhook(), events: ["transparent.completed"] }),
  });
  return { ok: true, webhook };
}

function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Confere secret e assinatura do webhook. corpoCru = texto exatamente como chegou. */
export async function webhookAbacateValido(req: Request, corpoCru: string): Promise<boolean> {
  const segredo = segredoWebhook();
  const recebido = req.headers.get("X-Webhook-Secret") ?? new URL(req.url).searchParams.get("webhookSecret") ?? "";
  if (!segredo || !iguais(recebido, segredo)) return false;
  const assinatura = req.headers.get("X-Webhook-Signature");
  if (!assinatura) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(CHAVE_PUBLICA), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(corpoCru)));
  const esperado = btoa(String.fromCharCode(...mac));
  return iguais(esperado, assinatura);
}

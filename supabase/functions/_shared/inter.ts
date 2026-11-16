// Banco Inter (conta PJ da Lagun): mTLS + OAuth com cache de token por escopo.
// Usado pelo bot-lounges para a cobrança Pix (cob) de 30 minutos.
//
// Secrets: INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PEM, INTER_KEY_PEM,
// INTER_CONTA_CORRENTE (opcional), INTER_AMBIENTE (sandbox | producao),
// PIX_CHAVE (chave Pix da conta, recebe as cobranças).

const env = (k: string) => Deno.env.get(k) ?? "";

export const INTER = {
  clientId: env("INTER_CLIENT_ID"),
  clientSecret: env("INTER_CLIENT_SECRET"),
  cert: env("INTER_CERT_PEM"),
  key: env("INTER_KEY_PEM"),
  conta: env("INTER_CONTA_CORRENTE"),
  chave: env("PIX_CHAVE"),
  sandbox: (env("INTER_AMBIENTE") || "producao") === "sandbox",
};
const BASE = INTER.sandbox ? "https://cdpj-sandbox.partners.uatinter.co" : "https://cdpj.partners.bancointer.com.br";

export const interConfigurado = () =>
  !!(INTER.clientId && INTER.clientSecret && INTER.cert && INTER.key && INTER.chave);

const pem = (s: string) => (s.includes("\\n") ? s.replace(/\\n/g, "\n") : s);

let httpClient: Deno.HttpClient | null = null;
function clienteMtls(): Deno.HttpClient {
  if (!httpClient) httpClient = Deno.createHttpClient({ certChain: pem(INTER.cert), privateKey: pem(INTER.key) });
  return httpClient;
}

const tokens = new Map<string, { token: string; expira: number }>();
async function token(scope: string): Promise<string> {
  const c = tokens.get(scope);
  if (c && c.expira > Date.now() + 30_000) return c.token;
  const r = await fetch(`${BASE}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: INTER.clientId, client_secret: INTER.clientSecret, grant_type: "client_credentials", scope }),
    client: clienteMtls(),
  } as RequestInit);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Inter não deu token (${r.status}): ${JSON.stringify(d).slice(0, 300)}`);
  tokens.set(scope, { token: d.access_token, expira: Date.now() + Number(d.expires_in ?? 3600) * 1000 });
  return d.access_token;
}

async function chamar(method: string, caminho: string, scope: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${await token(scope)}`, "Content-Type": "application/json" };
  if (INTER.conta) headers["x-conta-corrente"] = INTER.conta;
  const r = await fetch(`${BASE}${caminho}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, client: clienteMtls(),
  } as RequestInit);
  const texto = await r.text();
  let data: any = {};
  try { data = texto ? JSON.parse(texto) : {}; } catch { data = { raw: texto }; }
  return { ok: r.ok, status: r.status, data };
}

const ESCOPO_COB = "cob.write cob.read";
const ESCOPO_WEBHOOK = "webhook.write webhook.read";

/** txid da cobrança imediata: 26 a 35 caracteres alfanuméricos. */
export function novoTxid(prefixo = "LGLOUNGE"): string {
  const rnd = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  return (prefixo + rnd).slice(0, 32);
}

export type Cobranca = { txid: string; copiaCola: string; status: string };

/** Cria a cobrança com validade em segundos; o banco recusa pagamento depois disso. */
export async function criarCobranca(opts: {
  txid: string; valor: number; expiracaoSeg: number; nome: string; cpf: string; descricao: string;
}): Promise<Cobranca> {
  const r = await chamar("PUT", `/pix/v2/cob/${opts.txid}`, ESCOPO_COB, {
    calendario: { expiracao: opts.expiracaoSeg },
    devedor: { cpf: opts.cpf, nome: opts.nome.slice(0, 200) },
    valor: { original: opts.valor.toFixed(2), modalidadeAlteracao: 0 },
    chave: INTER.chave,
    solicitacaoPagador: opts.descricao.slice(0, 140),
  });
  if (!r.ok) {
    const erro = r.data?.detail ?? r.data?.title ?? r.data?.violacoes?.[0]?.razao ?? `Inter respondeu ${r.status}`;
    throw new Error(String(erro));
  }
  return { txid: opts.txid, copiaCola: String(r.data?.pixCopiaECola ?? ""), status: String(r.data?.status ?? "ATIVA") };
}

/** Consulta a cobrança. pago = status CONCLUIDA com Pix recebido. */
export async function consultarCobranca(txid: string) {
  const r = await chamar("GET", `/pix/v2/cob/${txid}`, ESCOPO_COB);
  if (!r.ok) return { ok: false as const, http: r.status, resposta: r.data };
  const pix = Array.isArray(r.data?.pix) ? r.data.pix : [];
  const valorRecebido = pix.reduce((s: number, p: any) => s + Number(p?.valor ?? 0), 0);
  return {
    ok: true as const,
    status: String(r.data?.status ?? ""),
    pago: String(r.data?.status ?? "").toUpperCase() === "CONCLUIDA" && pix.length > 0,
    valorRecebido,
    endToEndId: pix[0]?.endToEndId ? String(pix[0].endToEndId) : null,
  };
}

/** Cancela a cobrança no banco (cliente desistiu, prazo venceu ou evento acabou). */
export async function cancelarCobranca(txid: string) {
  const r = await chamar("PATCH", `/pix/v2/cob/${txid}`, ESCOPO_COB, { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" });
  return { ok: r.ok, http: r.status, resposta: r.data };
}

/** Registra no Inter a URL que recebe o aviso de Pix recebido nessa chave. */
export async function ligarWebhookCobranca(url: string) {
  const r = await chamar("PUT", `/pix/v2/webhook/${encodeURIComponent(INTER.chave)}`, ESCOPO_WEBHOOK, { webhookUrl: url });
  return { ok: r.ok, http: r.status, resposta: r.data };
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Login do app do cliente da Lagun (iPhone), por telefone.
//
//   POST ?action=codigo   { telefone }            → manda um código de 6 dígitos
//                                                   pelo WhatsApp (template de
//                                                   autenticação codigo_acesso_app)
//   POST ?action=entrar   { telefone, codigo, nome? } → confere o código, garante o
//                                                   usuário no Supabase Auth (e-mail
//                                                   sintético) e devolve um token
//                                                   de sessão para o app trocar com
//                                                   auth.verifyOtp(type magiclink)
//   POST ?action=template  (Authorization: service role) → cria o template no WABA
//
// Sem SMS pago: o código vai pelo WhatsApp oficial da Lagun. Enquanto o template
// não é aprovado pela Meta, APP_DEMO_CODIGO (secret) funciona como código de
// demonstração para qualquer telefone, só para testar o app no simulador.

const GRAPH = "https://graph.facebook.com/v21.0";
const TEMPLATE = "codigo_acesso_app";
const DOMINIO_EMAIL = "app.lagunvitoria.com.br";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** Só dígitos, com DDI 55. Aceita "27 9 9876-5432", "+55 27 99876-5432", "5527998765432". */
function normalizarTelefone(bruto: string): string | null {
  let d = String(bruto || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return d;
}

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function enviarCodigo(telefone: string, codigo: string): Promise<{ ok: boolean; erro?: string }> {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return { ok: false, erro: "WhatsApp não configurado" };
  const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefone,
      type: "template",
      template: {
        name: TEMPLATE,
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: codigo }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] },
        ],
      },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, erro: j?.error?.message || `HTTP ${r.status}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const action = new URL(req.url).searchParams.get("action");
  const body = await req.json().catch(() => ({}));

  try {
    // ── Cria o template de autenticação no WABA (uso único, com service role) ──
    if (action === "template") {
      // Só quem tem a chave service role (ela lê a tabela de códigos, que não tem policy).
      const chave = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const teste = createClient(Deno.env.get("SUPABASE_URL")!, chave, { auth: { persistSession: false } });
      const { error: semAcesso } = await teste.from("lagun_app_codigos").select("telefone").limit(1);
      if (!chave || semAcesso) return json({ error: "não autorizado" }, 401);
      const token = Deno.env.get("META_WHATSAPP_TOKEN");
      const waba = Deno.env.get("WHATSAPP_WABA_ID");
      const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: TEMPLATE,
          language: "pt_BR",
          category: "AUTHENTICATION",
          components: [
            { type: "BODY", add_security_recommendation: true },
            { type: "FOOTER", code_expiration_minutes: 10 },
            { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copiar código" }] },
          ],
        }),
      });
      return json(await r.json(), r.status);
    }

    // ── Pede o código ─────────────────────────────────────────────────────
    if (action === "codigo") {
      const telefone = normalizarTelefone(body.telefone);
      if (!telefone) return json({ error: "Telefone inválido. Use DDD + número." }, 400);
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const { error } = await sb().from("lagun_app_codigos").upsert({
        telefone, codigo_hash: await sha256(`${telefone}:${codigo}`),
        expira_em: new Date(Date.now() + 10 * 60_000).toISOString(), tentativas: 0,
      });
      if (error) throw error;
      const envio = await enviarCodigo(telefone, codigo);
      const demo = Boolean(Deno.env.get("APP_DEMO_CODIGO"));
      return json({ ok: true, telefone, enviado: envio.ok, canal: envio.ok ? "whatsapp" : null, erro_envio: envio.ok ? undefined : envio.erro, demo });
    }

    // ── Confere o código e entrega a sessão ───────────────────────────────
    if (action === "entrar") {
      const telefone = normalizarTelefone(body.telefone);
      const codigo = String(body.codigo || "").replace(/\D/g, "");
      if (!telefone || codigo.length !== 6) return json({ error: "Código inválido." }, 400);
      const admin = sb();

      const demo = Deno.env.get("APP_DEMO_CODIGO");
      let valido = Boolean(demo && codigo === demo);
      if (!valido) {
        const { data: reg } = await admin.from("lagun_app_codigos").select("codigo_hash, expira_em, tentativas").eq("telefone", telefone).maybeSingle();
        if (!reg) return json({ error: "Peça um código novo." }, 400);
        if (new Date(reg.expira_em).getTime() < Date.now()) return json({ error: "Código expirado. Peça outro." }, 400);
        if (reg.tentativas >= 5) return json({ error: "Muitas tentativas. Peça um código novo." }, 429);
        valido = reg.codigo_hash === await sha256(`${telefone}:${codigo}`);
        if (!valido) {
          await admin.from("lagun_app_codigos").update({ tentativas: reg.tentativas + 1 }).eq("telefone", telefone);
          return json({ error: "Código incorreto." }, 400);
        }
        await admin.from("lagun_app_codigos").delete().eq("telefone", telefone);
      }

      // Usuário no Auth: e-mail sintético por telefone.
      const email = `${telefone}@${DOMINIO_EMAIL}`;
      let userId: string | null = null;
      const criado = await admin.auth.admin.createUser({ email, email_confirm: true, phone_confirm: true, user_metadata: { telefone, app: "cliente" } });
      if (criado.data.user) userId = criado.data.user.id;
      else {
        // Já existe: acha pelo e-mail.
        const lista = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = lista.data.users.find((u) => u.email === email)?.id ?? null;
        if (!userId) throw criado.error ?? new Error("Não foi possível criar o usuário.");
      }

      const nome = typeof body.nome === "string" && body.nome.trim() ? body.nome.trim().slice(0, 80) : null;
      const { data: existente } = await admin.from("lagun_app_clientes").select("id").eq("id", userId).maybeSingle();
      if (!existente) {
        const { error } = await admin.from("lagun_app_clientes").insert({ id: userId, telefone, nome });
        if (error) throw error;
      } else if (nome) {
        await admin.from("lagun_app_clientes").update({ nome, updated_at: new Date().toISOString() }).eq("id", userId);
      }

      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (link.error) throw link.error;
      return json({ ok: true, token_hash: link.data.properties.hashed_token, email });
    }

    return json({ error: "action inválida" }, 400);
  } catch (e) {
    console.error("[app-cliente]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

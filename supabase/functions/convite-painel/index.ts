// Convite de cadastro no painel interno da Lagun.
// POST { acao: "ver", token }                      -> { ok, papel, expira_em }
// POST { acao: "aceitar", token, nome, usuario, email, senha } -> { ok }
// Sem login: quem prova o acesso é o token (uso único, com validade).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(t: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    if (token.length < 32) return resp({ error: "Convite inválido." }, 400);

    const { data: conv } = await admin.from("convites_painel")
      .select("id, papel, expira_em, usado_em").eq("token_hash", await sha256(token)).maybeSingle();
    if (!conv) return resp({ error: "Convite inválido." }, 404);
    if (conv.usado_em) return resp({ error: "Este convite já foi usado." }, 410);
    if (new Date(conv.expira_em) < new Date()) return resp({ error: "Este convite expirou. Peça um novo." }, 410);

    if (body.acao === "ver") return resp({ ok: true, papel: conv.papel, expira_em: conv.expira_em });
    if (body.acao !== "aceitar") return resp({ error: "Ação desconhecida." }, 400);

    const nome = String(body.nome ?? "").trim();
    const usuario = String(body.usuario ?? "").trim().toLowerCase();
    const email = String(body.email ?? "").trim().toLowerCase();
    const senha = String(body.senha ?? "");
    if (nome.length < 2) return resp({ error: "Informe seu nome." }, 400);
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return resp({ error: "Usuário: 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resp({ error: "E-mail inválido." }, 400);
    if (senha.length < 8) return resp({ error: "A senha precisa de pelo menos 8 caracteres." }, 400);

    const { data: jaTem } = await admin.from("profiles").select("id").ilike("username", usuario).maybeSingle();
    if (jaTem) return resp({ error: "Esse usuário já existe. Escolha outro." }, 409);

    // Marca o convite como usado antes de criar a conta (evita dois cadastros com o mesmo link).
    const { data: travado } = await admin.from("convites_painel")
      .update({ usado_em: new Date().toISOString() }).eq("id", conv.id).is("usado_em", null).select("id");
    if (!travado?.length) return resp({ error: "Este convite já foi usado." }, 410);

    const { data: criado, error: errUser } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { full_name: nome },
    });
    if (errUser || !criado?.user) {
      await admin.from("convites_painel").update({ usado_em: null }).eq("id", conv.id);
      const msg = /already|registered|exists/i.test(errUser?.message ?? "") ? "Esse e-mail já tem conta." : "Não foi possível criar a conta.";
      return resp({ error: msg }, 400);
    }
    const uid = criado.user.id;
    const { error: errPerfil } = await admin.from("profiles")
      .upsert({ id: uid, username: usuario, full_name: nome, precisa_definir_senha: false });
    const papeis = conv.papel === "admin" ? ["partner", "admin"] : ["partner", conv.papel].filter((v, i, a) => a.indexOf(v) === i);
    const { error: errPapel } = await admin.from("user_roles").insert(papeis.map((role) => ({ user_id: uid, role })));
    if (errPerfil || errPapel) {
      await admin.auth.admin.deleteUser(uid);
      await admin.from("convites_painel").update({ usado_em: null }).eq("id", conv.id);
      return resp({ error: "Não foi possível concluir o cadastro. Tente de novo." }, 500);
    }
    await admin.from("convites_painel").update({ usado_por: uid }).eq("id", conv.id);
    return resp({ ok: true });
  } catch (_e) {
    return resp({ error: "Erro inesperado. Tente de novo." }, 500);
  }
});

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
//   POST ?action=convidar  (master logado) { nome, email, papel, telefone? } → convida alguém
//                                                   da equipe por e-mail (senha no 1º acesso)
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

/** Campo EMV: id + tamanho (2 dígitos) + valor. */
const emv = (id: string, v: string) => id + String(v.length).padStart(2, "0") + v;
function crc16(payload: string) {
  let crc = 0xffff;
  for (const ch of new TextEncoder().encode(payload)) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
/** Pix copia e cola (BR Code estático com valor), padrão do Banco Central. */
function brCodePix(chave: string, valor: number, txid: string, descricao?: string) {
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim();
  const conta = emv("00", "br.gov.bcb.pix") + emv("01", chave) + (descricao ? emv("02", semAcento(descricao).slice(0, 40)) : "");
  const corpo = emv("00", "01") + emv("26", conta) + emv("52", "0000") + emv("53", "986") + emv("54", valor.toFixed(2))
    + emv("58", "BR") + emv("59", "LAGUN") + emv("60", "VITORIA") + emv("62", emv("05", txid.slice(0, 25))) + "6304";
  return corpo + crc16(corpo);
}

/** Quem está logado no app (token do Supabase Auth no Authorization). */
async function usuarioLogado(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const cli = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await cli.auth.getUser();
  return data.user ?? null;
}

/** Perfil da equipe (profiles.telefone) com esse telefone, e o e-mail dele no Auth. */
async function usuarioDaEquipePeloTelefone(admin: ReturnType<typeof sb>, telefone: string): Promise<{ id: string; email: string } | null> {
  const { data: perfis } = await admin.from("profiles").select("id, telefone").not("telefone", "is", null);
  const semDdi = telefone.replace(/^55/, "");
  const sem9 = semDdi.replace(/^(\d{2})9(\d{8})$/, "$1$2");
  const perfil = (perfis ?? []).find((p) => {
    const d = String(p.telefone || "").replace(/\D/g, "").replace(/^0/, "");
    const dSemDdi = d.replace(/^55/, "");
    return d === telefone || dSemDdi === semDdi || dSemDdi === sem9 || dSemDdi.replace(/^(\d{2})9(\d{8})$/, "$1$2") === sem9;
  });
  if (!perfil) return null;
  const { data } = await admin.auth.admin.getUserById(perfil.id);
  if (!data.user?.email) return null;
  return { id: perfil.id, email: data.user.email };
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

      // Equipe (Bastidor): se o telefone é de alguém com perfil no painel, a
      // sessão é a desse usuário, e não a de um cliente sintético. Assim a
      // mesma pessoa tem uma conta só, com os dois acessos.
      let userId: string | null = null;
      let email = `${telefone}@${DOMINIO_EMAIL}`;
      const equipe = await usuarioDaEquipePeloTelefone(admin, telefone);
      if (equipe) { userId = equipe.id; email = equipe.email; }
      else {
        // Cliente: e-mail sintético por telefone.
        const criado = await admin.auth.admin.createUser({ email, email_confirm: true, phone_confirm: true, user_metadata: { telefone, app: "cliente" } });
        if (criado.data.user) userId = criado.data.user.id;
        else {
          // Já existe: acha pelo e-mail.
          const lista = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          userId = lista.data.users.find((u) => u.email === email)?.id ?? null;
          if (!userId) throw criado.error ?? new Error("Não foi possível criar o usuário.");
        }
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

    // ── Bastidor: master convida alguém da equipe por e-mail (tela M4) ─────
    if (action === "convidar") {
      const user = await usuarioLogado(req);
      if (!user) return json({ error: "Entre de novo no app." }, 401);
      const admin = sb();
      const { data: papel } = await admin.rpc("app_papel", { _user_id: user.id });
      if (papel !== "master") return json({ error: "Só o master convida." }, 403);
      const nome = String(body.nome || "").trim().slice(0, 80);
      const email = String(body.email || "").trim().toLowerCase();
      const novoPapel = String(body.papel || "").trim();
      const telefoneConvite = body.telefone ? normalizarTelefone(body.telefone) : null;
      if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Nome e e-mail válidos, por favor." }, 400);
      if (!["master", "social", "trafego", "design", "vendedor"].includes(novoPapel)) return json({ error: "Papel inválido." }, 400);
      const convite = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: nome, app: "bastidor" } });
      let convidadoId = convite.data.user?.id ?? null;
      if (!convidadoId) {
        const lista = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        convidadoId = lista.data.users.find((u) => (u.email || "").toLowerCase() === email)?.id ?? null;
        if (!convidadoId) return json({ error: convite.error?.message || "Não deu pra convidar." }, 400);
      }
      await admin.from("profiles").upsert({ id: convidadoId, full_name: nome, telefone: telefoneConvite, precisa_definir_senha: true }, { onConflict: "id" });
      await admin.from("user_roles").delete().eq("user_id", convidadoId).in("role", ["master", "admin", "social", "trafego", "design", "vendedor"]);
      await admin.from("user_roles").insert({ user_id: convidadoId, role: novoPapel });
      if (novoPapel === "vendedor") {
        const { data: vend } = await admin.from("lagun_vendedores").select("id").eq("user_id", convidadoId).maybeSingle();
        if (!vend) await admin.from("lagun_vendedores").insert({ nome, telefone: telefoneConvite, user_id: convidadoId });
      }
      return json({ ok: true, id: convidadoId, enviado: !convite.error });
    }

    // ── Pedido com Pix: reserva de lounge ou ingressos ────────────────────
    if (action === "pedido") {
      const user = await usuarioLogado(req);
      if (!user) return json({ error: "Entre de novo no app." }, 401);
      const admin = sb();
      await admin.rpc("app_expirar_pedidos");
      const tipo = body.tipo === "ingresso" ? "ingresso" : "reserva";
      let valor = 0, descricao = "", reservaId: string | null = null, eventId: string | null = null, quantidade = 1;
      if (tipo === "reserva") {
        const { data: r } = await admin.from("lagun_lounge_reservas").select("id, pago, status, event_id, lounge:lagun_lounges(nome)").eq("id", body.reserva_id).eq("cliente_id", user.id).maybeSingle();
        if (!r) return json({ error: "Reserva não encontrada." }, 404);
        if (r.status !== "aguardando") return json({ error: "Essa reserva não está aguardando pagamento." }, 400);
        valor = Number(r.pago); reservaId = r.id; eventId = r.event_id; descricao = `Sinal ${(r as any).lounge?.nome ?? "lounge"}`;
      } else {
        quantidade = Math.max(1, Math.min(10, Number(body.quantidade) || 1));
        const { data: ev } = await admin.from("lagun_events").select("id, nome, ingresso_a_partir").eq("id", body.event_id).maybeSingle();
        if (!ev || !ev.ingresso_a_partir) return json({ error: "Esse evento não vende ingresso pelo app." }, 400);
        valor = Number(ev.ingresso_a_partir) * quantidade; eventId = ev.id; descricao = `${quantidade}x ingresso ${ev.nome}`;
      }
      const chave = Deno.env.get("PIX_CHAVE") || "";
      const demo = !chave;
      const txid = crypto.randomUUID().replace(/-/g, "").slice(0, 25).toUpperCase();
      const copiaCola = brCodePix(chave || "00000000000", valor, txid, descricao);
      const { data: pedido, error } = await admin.from("lagun_app_pedidos").insert({
        cliente_id: user.id, tipo, reserva_id: reservaId, event_id: eventId, quantidade, valor, descricao, txid, pix_copia_cola: copiaCola,
      }).select("*").single();
      if (error) throw error;
      return json({ ok: true, pedido, demo });
    }

    // Teste: marca o pedido como pago (só com APP_DEMO_CODIGO ligado).
    if (action === "pagar_teste") {
      if (!Deno.env.get("APP_DEMO_CODIGO")) return json({ error: "Fora do modo de teste." }, 403);
      const user = await usuarioLogado(req);
      if (!user) return json({ error: "Entre de novo no app." }, 401);
      const { data, error } = await sb().from("lagun_app_pedidos").update({ status: "pago" }).eq("id", body.pedido_id).eq("cliente_id", user.id).eq("status", "aguardando").select("*").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Pedido não está aguardando." }, 400);
      return json({ ok: true, pedido: data });
    }

    return json({ error: "action inválida" }, 400);
  } catch (e) {
    console.error("[app-cliente]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErroZig, diaSP, lerCasa } from "../_shared/casaLagun.ts";

// Live Activity "Casa" do app Lagun Administração (iPhone), 2026-11-20. Modelo: bar-ao-vivo-push da Tríade.
//
//   POST ?action=aparelho (login do app, só administração da Lagun) → cria a chave deste iPhone
//   POST ?action=token    (header x-aparelho) { tipo: inicio|atividade, token, ambiente, zig_evento?, atividade_id? }
//   POST ?action=tick     (header x-cron-chave, robô pg_cron a cada 30 s):
//        1. evento aberto na Zig (mesma leitura do Ao vivo, _shared/casaLagun.ts) e ainda sem ao vivo:
//           liga a atividade sozinha nos iPhones cadastrados (push-to-start, iOS 17.2+);
//        2. ao vivo aberto: atualiza (total, bares na última hora, lounges) quando algo muda, no
//           mínimo a cada 15 s e pelo menos a cada 5 min;
//        3. evento fechou na Zig (ou outro evento abriu): encerra, com o total final e "ENCERRADO".
//      { testar_chave: true } confere a chave APNs (token falso deve voltar BadDeviceToken).
//
// Segredos: APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID (chave .p8 da equipe da Apple do Guilherme) e a do robô
// no Vault (lagun_bar_cron). Nenhum vai para o app. O app só manda tokens com a chave do aparelho.

const BUNDLE = "br.com.lagunvitoria.admin";
const MIN_ENTRE_PUSH_MS = 15_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-aparelho, x-cron-chave",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// deno-lint-ignore no-explicit-any
type Any = any;
type Admin = ReturnType<typeof sb>;

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pode receber: está no cadastro do app como administrador; parceiro, com noite de hoje ou ontem marcada. */
async function podeReceber(admin: Admin, uid: string) {
  const { data: acesso } = await admin.from("lagun_admin_acessos").select("cargo").eq("user_id", uid).maybeSingle();
  if (!acesso) return false;
  if (acesso.cargo === "administrador") return true;
  const { data: noites } = await admin.from("lagun_admin_acesso_noites").select("lagun_events!inner(data)").eq("user_id", uid)
    .gte("lagun_events.data", diaSP(-1)).lte("lagun_events.data", diaSP(0));
  return !!noites?.length;
}

// ── APNs (token .p8, HTTP/2) ─────────────────────────────────────────────────
let jwtGuardado: { em: number; jwt: string } | null = null;
const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function jwtApns() {
  if (jwtGuardado && Date.now() - jwtGuardado.em < 45 * 60_000) return jwtGuardado.jwt;
  const pem = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID"), iss = Deno.env.get("APNS_TEAM_ID");
  if (!pem || !kid || !iss) throw new Error("Chave APNs não configurada");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const corpo = `${b64url(JSON.stringify({ alg: "ES256", kid }))}.${b64url(JSON.stringify({ iss, iat: Math.floor(Date.now() / 1000) }))}`;
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo)));
  jwtGuardado = { em: Date.now(), jwt: `${corpo}.${b64url(assinatura)}` };
  return jwtGuardado.jwt;
}
async function enviarApns(token: string, ambiente: string, aps: Record<string, unknown>) {
  const host = ambiente === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const r = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await jwtApns()}`,
      "apns-topic": `${BUNDLE}.push-type.liveactivity`, "apns-push-type": "liveactivity", "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps }),
  });
  const motivo = r.ok ? null : ((await r.json().catch(() => ({}))) as Any)?.reason ?? `HTTP ${r.status}`;
  return { ok: r.ok, status: r.status, motivo };
}
/** App instalado pelo Xcode usa o sandbox, da loja usa produção: se errar o ambiente, tenta o outro e corrige. */
async function enviar(admin: Admin, t: { token: string; ambiente: string }, aps: Record<string, unknown>) {
  let r = await enviarApns(t.token, t.ambiente, aps);
  if (!r.ok && r.motivo === "BadDeviceToken") {
    const outro = t.ambiente === "sandbox" ? "producao" : "sandbox";
    const r2 = await enviarApns(t.token, outro, aps);
    if (r2.ok) { await admin.from("lagun_app_live_tokens").update({ ambiente: outro }).eq("token", t.token); t.ambiente = outro; r = r2; }
  }
  // Token que a Apple diz que não vale mais: marcado como inválido (nada é apagado; a pessoa continua cadastrada).
  if (!r.ok && (r.status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "ExpiredToken"].includes(String(r.motivo)))) {
    await admin.from("lagun_app_live_tokens").update({ invalido_em: new Date().toISOString() }).eq("token", t.token);
  }
  return r;
}

/** content-state da atividade (< 1 KB). Mesmos campos do CasaAoVivoAttributes.ContentState do app. */
function estadoDe(c: Any, fim = false) {
  return {
    total: Number(c.total) || 0,
    bares: (c.bares ?? []).map((b: Any) => ({ id: b.id, nome: b.area === "pista" ? "Pista" : "VIP", v: Number(b.ultimaHora) || 0 })),
    lounges: (c.lounges ?? []).map((l: Any) => ({ id: l.id, st: l.status, ...(l.consumo != null ? { gasto: l.consumo } : {}) })),
    estado: fim || !c.aberto ? "encerrado" : (Number(c.total) || 0) > 0 ? "vivo" : "aguardando",
    atualizadoEm: Math.floor(Date.now() / 1000),
  };
}
const assinatura = (e: Any) => JSON.stringify({ t: e.total, b: e.bares, l: e.lounges, s: e.estado });

type Token = { token: string; tipo: string; ambiente: string; user_id: string; zig_evento: string | null; atualizado_em: string };

async function tick(admin: Admin) {
  const { data: todos } = await admin.from("lagun_app_live_tokens").select("token, tipo, ambiente, user_id, zig_evento, atualizado_em").is("invalido_em", null);
  const tokens = (todos ?? []) as Token[];
  const { data: abertos } = await admin.from("lagun_app_live_eventos").select("*").is("encerrado_em", null);
  if (!tokens.length && !(abertos ?? []).length) return { acao: "nada" };
  const casa = await lerCasa(admin, 12_000);
  const agora = Date.now(), seg = Math.floor(agora / 1000);
  const zig = casa.aberto && casa.evento ? String(casa.evento.id) : null;
  const liberados = new Map<string, boolean>();
  const pode = async (uid: string) => { if (!liberados.has(uid)) liberados.set(uid, await podeReceber(admin, uid)); return liberados.get(uid)!; };
  const relatorio: Record<string, unknown>[] = [];

  // 3. Encerra o que não está mais aberto na Zig.
  for (const v of (abertos ?? []) as Any[]) {
    if (v.zig_evento === zig) continue;
    const estado = { ...(v.ultimo_estado ?? estadoDe(casa)), estado: "encerrado", atualizadoEm: seg };
    const alvos = tokens.filter((t) => t.tipo === "atividade" && (t.zig_evento === v.zig_evento || !t.zig_evento));
    const envios = await Promise.all(alvos.map((t) => enviar(admin, t, { timestamp: seg, event: "end", "content-state": estado, "dismissal-date": seg + 2 * 3600 })));
    if (alvos.length) await admin.from("lagun_app_live_tokens").update({ invalido_em: new Date().toISOString() }).in("token", alvos.map((t) => t.token));
    await admin.from("lagun_app_live_eventos").update({ encerrado_em: new Date().toISOString(), ultimo_envio: new Date().toISOString(), ultimo_estado: estado }).eq("zig_evento", v.zig_evento);
    relatorio.push({ evento: v.zig_evento, acao: "encerrado", enviados: envios.filter((r) => r.ok).length });
  }
  if (!zig) return { acao: relatorio.length ? "ok" : "sem_evento_aberto", eventos: relatorio };

  const estado = estadoDe(casa);
  const noite = String(casa.evento.nome || "Noite na Lagun");
  const vivo = ((abertos ?? []) as Any[]).find((v) => v.zig_evento === zig);
  const { data: jaTeve } = vivo ? { data: vivo } : await admin.from("lagun_app_live_eventos").select("zig_evento, encerrado_em").eq("zig_evento", zig).maybeSingle();

  // 1. Começa sozinha, uma vez por evento da Zig.
  if (!jaTeve) {
    await admin.from("lagun_app_live_eventos").insert({ zig_evento: zig, noite, ultimo_envio: new Date().toISOString(), ultimo_estado: estado });
    // Quem já tem a atividade aberta pelo app (token de atividade deste evento) não recebe outra.
    const comAtividade = new Set(tokens.filter((t) => t.tipo === "atividade" && t.zig_evento === zig).map((t) => t.user_id));
    const inicio = [];
    for (const t of tokens.filter((t) => t.tipo === "inicio" && !comAtividade.has(t.user_id))) if (await pode(t.user_id)) inicio.push(t);
    const envios = await Promise.all(inicio.map((t) => enviar(admin, t, {
      timestamp: seg, event: "start", "content-state": estado,
      "attributes-type": "CasaAoVivoAttributes", attributes: { noite, zigEvento: zig },
      "stale-date": seg + 900,
      alert: { title: `${noite}: casa ao vivo`, body: "Bar e lounges da noite na tela bloqueada." },
    })));
    relatorio.push({ evento: zig, acao: "iniciado", enviados: envios.filter((r) => r.ok).length, falhas: envios.filter((r) => !r.ok).map((r) => r.motivo) });
    return { acao: "ok", eventos: relatorio };
  }
  if (jaTeve.encerrado_em) return { acao: "encerrado_antes", eventos: relatorio };

  // 2. Atualiza quando muda (mínimo 15 s) ou a cada 5 min.
  const ultimo = vivo?.ultimo_envio ? Date.parse(vivo.ultimo_envio) : 0;
  const mudou = assinatura(vivo?.ultimo_estado ?? {}) !== assinatura(estado);
  if (agora - ultimo < MIN_ENTRE_PUSH_MS || (!mudou && agora - ultimo < 5 * 60_000)) return { acao: "sem_mudanca", eventos: relatorio };
  const alvos = [];
  for (const t of tokens.filter((t) => t.tipo === "atividade" && (t.zig_evento === zig || !t.zig_evento))) if (await pode(t.user_id)) alvos.push(t);
  const envios = await Promise.all(alvos.map((t) => enviar(admin, t, { timestamp: seg, event: "update", "content-state": estado, "stale-date": seg + 900 })));
  await admin.from("lagun_app_live_eventos").update({ ultimo_envio: new Date().toISOString(), ultimo_estado: estado, noite }).eq("zig_evento", zig);
  relatorio.push({ evento: zig, acao: "atualizado", total: estado.total, enviados: envios.filter((r) => r.ok).length, falhas: envios.filter((r) => !r.ok).map((r) => r.motivo) });
  return { acao: "ok", eventos: relatorio };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const action = new URL(req.url).searchParams.get("action");
  const body = await req.json().catch(() => ({}));
  const admin = sb();
  try {
    if (action === "aparelho") {
      const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: quem } = await admin.auth.getUser(jwt);
      const uid = quem.user?.id;
      if (!uid) return json({ error: "Entre de novo no app." }, 401);
      if (quem.user?.app_metadata?.revisao === true) return json({ ok: true, chave: null, motivo: "revisao" });
      if (!(await podeReceber(admin, uid))) return json({ ok: true, chave: null, motivo: "sem_acesso" });
      const chave = crypto.randomUUID() + crypto.randomUUID();
      const { error } = await admin.from("lagun_app_aparelhos").insert({ user_id: uid, chave_hash: await sha256(chave) });
      if (error) throw error;
      return json({ ok: true, chave });
    }

    if (action === "token") {
      const chave = req.headers.get("x-aparelho") || "";
      if (chave.length < 40) return json({ error: "aparelho" }, 401);
      const { data: ap } = await admin.from("lagun_app_aparelhos").select("id, user_id").eq("chave_hash", await sha256(chave)).maybeSingle();
      if (!ap) return json({ error: "aparelho" }, 401);
      if (!(await podeReceber(admin, ap.user_id))) return json({ error: "sem_acesso" }, 403);
      const tipo = body.tipo === "atividade" ? "atividade" : "inicio";
      const token = String(body.token || "").toLowerCase();
      if (!/^[0-9a-f]{32,400}$/.test(token)) return json({ error: "token" }, 400);
      // Um token de início por aparelho: o novo substitui o antigo (só o token antigo deste aparelho).
      if (tipo === "inicio") await admin.from("lagun_app_live_tokens").update({ invalido_em: new Date().toISOString() }).eq("aparelho_id", ap.id).eq("tipo", "inicio").neq("token", token).is("invalido_em", null);
      const { error } = await admin.from("lagun_app_live_tokens").upsert({
        token, aparelho_id: ap.id, user_id: ap.user_id, tipo, ambiente: body.ambiente === "sandbox" ? "sandbox" : "producao",
        zig_evento: tipo === "atividade" && body.zig_evento ? String(body.zig_evento).slice(0, 80) : null,
        atividade_id: body.atividade_id ? String(body.atividade_id).slice(0, 80) : null, atualizado_em: new Date().toISOString(), invalido_em: null,
      });
      if (error) throw error;
      await admin.from("lagun_app_aparelhos").update({ visto_em: new Date().toISOString() }).eq("id", ap.id);
      return json({ ok: true });
    }

    if (action === "tick") {
      const { data: segredo } = await admin.rpc("lagun_bar_cron_chave");
      if (!segredo || req.headers.get("x-cron-chave") !== segredo) return json({ error: "não autorizado" }, 401);
      if (body.testar_chave === true) {
        const r = await enviarApns("0".repeat(64), body.ambiente === "producao" ? "producao" : "sandbox", { timestamp: Math.floor(Date.now() / 1000), event: "update", "content-state": {} });
        return json({ ok: true, apple: r });
      }
      return json({ ok: true, ...(await tick(admin)) });
    }

    return json({ error: "ação desconhecida" }, 404);
  } catch (e) {
    console.error("lagun-bar-push", e);
    if (e instanceof ErroZig) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

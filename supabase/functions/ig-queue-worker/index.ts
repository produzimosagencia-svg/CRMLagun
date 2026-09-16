// ============================================================================
// ig-queue-worker — drena a ig_queue e envia via API do Instagram (@lagunvix).
// ----------------------------------------------------------------------------
// Chamado a cada minuto pelo pg_cron E disparado pelo instagram-webhook logo
// após enfileirar (envio instantâneo). A trava atômica ig_claim_queue
// (FOR UPDATE SKIP LOCKED) garante que nunca envia em dobro.
// Limites práticos da Meta: ~2 envios/seg e ~200 DMs automáticas/hora.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IG_BASE = "https://graph.instagram.com/v25.0";
const LAGUN_IG_ID = "17841436376156784";
const BATCH = 20;
const GAP_MS = 500;
const HOURLY_CAP = 200;

const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface QueueRow {
  id: string; automation_id: string | null; igsid: string | null; comment_id: string | null;
  send_type: "private_reply" | "dm" | "public_reply"; payload: any; requires_24h_window: boolean; attempts?: number;
}

// Token IGAA: ig_config (renovado pelo cron) ou, na falta, o secret antigo.
async function credentials(supabase: any): Promise<{ igUserId: string; token: string } | null> {
  const { data: cfg } = await supabase.from("ig_config").select("ig_user_id, access_token, token_expires_at").maybeSingle();
  if (cfg?.access_token && (!cfg.token_expires_at || new Date(cfg.token_expires_at).getTime() > Date.now())) {
    return { igUserId: cfg.ig_user_id || LAGUN_IG_ID, token: cfg.access_token };
  }
  const secret = (Deno.env.get("INSTAGRAM_USER_TOKEN_LAGUN") ?? "").trim();
  return secret ? { igUserId: LAGUN_IG_ID, token: secret } : null;
}

function buildMessage(payload: any): any {
  if (payload?.type === "link" && payload.url) {
    return { attachment: { type: "template", payload: { template_type: "button", text: payload.text || "Aqui está seu link 👇",
      buttons: [{ type: "web_url", url: payload.url, title: (payload.button_label || "Abrir").slice(0, 20) }] } } };
  }
  if (payload?.quick_reply_text) {
    return { text: payload.text || "", quick_replies: [{ content_type: "text", title: String(payload.quick_reply_text).slice(0, 20),
      payload: payload.quick_reply_payload || "IG_AUTO_GET_LINK" }] };
  }
  return { text: payload?.text || "" };
}

async function sendOne(row: QueueRow, igUserId: string, token: string) {
  if (row.send_type === "public_reply") {
    const res = await fetch(`${IG_BASE}/${row.comment_id}/replies?message=${encodeURIComponent(row.payload?.text || "")}&access_token=${token}`, { method: "POST" });
    if (!res.ok) throw new Error(`public_reply ${res.status}: ${await res.text()}`);
    return;
  }
  const recipient = row.send_type === "private_reply" ? { comment_id: row.comment_id } : { id: row.igsid };
  const res = await fetch(`${IG_BASE}/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient, message: buildMessage(row.payload), messaging_type: "RESPONSE" }),
  });
  if (!res.ok) throw new Error(`${row.send_type} ${res.status}: ${await res.text()}`);
  // Espelha a DM automática no Chat para a equipe ver o que o robô mandou.
  if (row.igsid) {
    const texto = row.payload?.text || (row.payload?.type === "link" ? `[link] ${row.payload.url}` : "");
    await sb().from("whatsapp_messages").insert({
      phone: row.igsid, contact_name: row.igsid, direction: "outgoing", message_type: "text",
      message_text: texto ? `[Automação] ${texto}` : "[Automação]", timestamp: new Date().toISOString(),
      status: "sent", channel: "instagram",
    });
  }
}

Deno.serve(async () => {
  const supabase = sb();
  const cred = await credentials(supabase);
  if (!cred) return out({ ok: false, reason: "Instagram não conectado (ig_config sem token)" });

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: sentLastHour } = await supabase.from("ig_queue").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", hourAgo);
  let budget = Math.max(0, HOURLY_CAP - (sentLastHour ?? 0));
  if (budget <= 0) return out({ ok: true, throttled: true });

  const { data: claimed, error: claimErr } = await supabase.rpc("ig_claim_queue", { batch_size: Math.min(BATCH, budget) });
  if (claimErr) return out({ ok: false, error: claimErr.message }, 500);

  const rows = (claimed ?? []) as QueueRow[];
  let sent = 0, failed = 0, skipped = 0;
  for (const row of rows) {
    if (budget <= 0) { await supabase.from("ig_queue").update({ status: "pending", claimed_at: null }).eq("id", row.id); continue; }
    if (row.requires_24h_window && row.igsid) {
      const { data: c } = await supabase.from("ig_contacts").select("last_reply_at").eq("igsid", row.igsid).maybeSingle();
      const lastReply = c?.last_reply_at ? new Date(c.last_reply_at).getTime() : 0;
      if (Date.now() - lastReply > 24 * 3600_000) {
        await supabase.from("ig_queue").update({ status: "skipped", last_error: "fora da janela de 24h" }).eq("id", row.id);
        skipped++; continue;
      }
    }
    try {
      await sendOne(row, cred.igUserId, cred.token);
      await supabase.from("ig_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      sent++; budget--;
    } catch (err: any) {
      const attempts = row.attempts ?? 1;
      await supabase.from("ig_queue").update({ status: attempts >= 3 ? "failed" : "pending", claimed_at: null, last_error: String(err?.message ?? err) }).eq("id", row.id);
      failed++;
    }
    await sleep(GAP_MS);
  }
  return out({ ok: true, claimed: rows.length, sent, failed, skipped });
});

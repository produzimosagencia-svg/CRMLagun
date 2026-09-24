// ============================================================================
// lagun-zig-sync — vendas da Zig (Superticket) por evento da landing.
// ----------------------------------------------------------------------------
// • Sem action (pg_cron a cada 10 min): sincroniza todo evento com Zig
//   configurada e data a partir de ontem (ou sem data), gravando só contagens
//   em lagun_zig_orders.
// • ?action=sincronizar&event_id=… (usuário logado): sincroniza um evento agora.
// • ?action=salvar_config (usuário logado), POST { event_id, zig_event_id, token }:
//   grava o vínculo com a Zig e o token (tabela sem leitura pelo navegador).
//   O token nunca volta na resposta. token vazio mantém o token já salvo.
// verify_jwt = false: o cron chama sem Authorization; as actions que gravam
// configuração validam o usuário aqui dentro (requireUser).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { sincronizarEvento } from "../_shared/zig.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Data de hoje em Brasília (UTC-3, sem horário de verão), formato AAAA-MM-DD.
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "salvar_config") {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      const body = await req.json().catch(() => ({}));
      const eventId = String(body.event_id ?? "").trim();
      const zigEventId = String(body.zig_event_id ?? "").trim();
      const token = String(body.token ?? "").trim();
      if (!eventId || !zigEventId) return json({ error: "Informe o evento e o id do evento na Zig." }, 400);
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(zigEventId)) return json({ error: "Id do evento na Zig inválido." }, 400);

      const { data: evento } = await sb.from("lagun_events").select("id").eq("id", eventId).maybeSingle();
      if (!evento) return json({ error: "Evento não encontrado." }, 404);

      const { data: credAtual } = await sb.from("lagun_zig_credentials").select("event_id").eq("event_id", eventId).maybeSingle();
      if (!token && !credAtual) return json({ error: "Informe o token da Zig." }, 400);

      const agora = new Date().toISOString();
      const { error: erroCfg } = await sb.from("lagun_event_zig").upsert(
        { event_id: eventId, zig_event_id: zigEventId, updated_at: agora, last_sync_error: null },
        { onConflict: "event_id" },
      );
      if (erroCfg) throw new Error(erroCfg.message);
      if (token) {
        const { error: erroCred } = await sb.from("lagun_zig_credentials").upsert(
          { event_id: eventId, token, updated_at: agora },
          { onConflict: "event_id" },
        );
        if (erroCred) throw new Error(erroCred.message);
      }

      // Primeira leitura já na hora, para validar id + token.
      let sync: { pedidos?: number; erro?: string };
      try {
        sync = await sincronizarEvento(sb, eventId);
      } catch (e) {
        sync = { erro: e instanceof Error ? e.message : String(e) };
      }
      return json({ ok: true, token_salvo: true, sync });
    }

    if (action === "sincronizar") {
      const auth = await requireUser(req);
      if (!auth.ok) return auth.response;
      const eventId = url.searchParams.get("event_id") ?? "";
      if (!eventId) return json({ error: "event_id obrigatório" }, 400);
      const sync = await sincronizarEvento(sb, eventId);
      return json({ ok: true, ...sync });
    }

    // Execução do cron: todos os eventos configurados, de ontem em diante.
    const { data: configs, error } = await sb
      .from("lagun_event_zig")
      .select("event_id, lagun_events!inner(id, data)");
    if (error) throw new Error(error.message);
    const desde = somarDias(hojeBrasilia(), -1);
    const alvos = (configs ?? []).filter((c: any) => !c.lagun_events?.data || c.lagun_events.data >= desde);

    // Resposta sem nomes: esta chamada não exige login.
    const resultados: Array<{ event_id: string; pedidos?: number; erro?: string }> = [];
    for (const alvo of alvos as any[]) {
      try {
        const r = await sincronizarEvento(sb, alvo.event_id);
        resultados.push({ event_id: alvo.event_id, pedidos: r.pedidos });
      } catch (e) {
        resultados.push({ event_id: alvo.event_id, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ ok: true, eventos: resultados.length, resultados });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Falha na sincronização." }, 500);
  }
});

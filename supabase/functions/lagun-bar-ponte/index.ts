import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErroZig, diaSP, lerCasa } from "../_shared/casaLagun.ts";

// Ponte só de hoje: resumo do bar da Lagun para o app da Tríade (pedido do Guilherme, 2026-11-21).
// A chave da Zig da Lagun NÃO sai daqui: a Tríade recebe só números agregados do evento de hoje.
//
//   POST (servidor a servidor, header x-ponte-segredo = secret PONTE_TRIADE_SEGREDO)
//     → { ok, aberto, evento { nome, data } | null, total, transacoes, ticketMedio, ultimaHora,
//         porHora, bares [{ nome, valor, ultimaHora, itens, ticketMedio }], produtos (top 8),
//         ultimaVenda, atualizadoEm, expiraEm }
//
// Sem dado pessoal (nada de lounges, check-in, cliente, telefone), sem token, sem loja.
// Expira sozinha em 2026-11-22 08:00 (Brasília): depois disso responde 410, com ou sem segredo.
// Segredo errado ou ausente: 401. Para desligar antes: `supabase secrets unset PONTE_TRIADE_SEGREDO`
// (ou apagar a função lagun-bar-ponte).

const EXPIRA_EM = Date.parse("2026-11-22T08:00:00-03:00");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** Compara em tempo constante (hash dos dois lados, mesmo tamanho). */
async function segredoConfere(recebido: string, esperado: string) {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(recebido), h(esperado)]);
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Date.now() >= EXPIRA_EM) return json({ error: "ponte_expirada" }, 410);
  const esperado = Deno.env.get("PONTE_TRIADE_SEGREDO") || "";
  const recebido = req.headers.get("x-ponte-segredo") || "";
  if (esperado.length < 32 || !recebido || !(await segredoConfere(recebido, esperado))) return json({ error: "nao_autorizado" }, 401);

  try {
    const admin = sb();
    const c = await lerCasa(admin, 25_000);
    const base = { ok: true, atualizadoEm: new Date().toISOString(), expiraEm: new Date(EXPIRA_EM).toISOString() };
    if (!c.aberto) {
      // Sem evento aberto na Zig ainda (sem venda hoje): só o nome da noite de hoje, números zerados.
      const horaSP = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      const { data: n } = await admin.from("lagun_events").select("nome, data").eq("data", diaSP(horaSP < 8 ? -1 : 0)).limit(1).maybeSingle();
      return json({
        ...base, aberto: false, evento: n ? { nome: String(n.nome), data: String(n.data) } : null,
        total: 0, transacoes: 0, ticketMedio: 0, ultimaHora: 0, porHora: [], bares: [], produtos: [], ultimaVenda: null,
      });
    }
    return json({
      ...base, aberto: true,
      evento: c.evento ? { nome: String(c.noite?.nome ?? c.evento.nome ?? "Noite na Lagun"), data: c.evento.data ?? null } : null,
      total: c.total, transacoes: c.transacoes, ticketMedio: c.ticketMedio, ultimaHora: c.ultimaHora,
      porHora: (c.porHora ?? []).map((p: { em: string; h: number; valor: number }) => ({ em: p.em, h: p.h, valor: p.valor })),
      bares: (c.bares ?? []).map((b: { nome: string; valor: number; ultimaHora: number; itens: number; ticketMedio: number }) =>
        ({ nome: b.nome, valor: b.valor, ultimaHora: b.ultimaHora, itens: b.itens, ticketMedio: b.ticketMedio })),
      produtos: (c.produtos ?? []).slice(0, 8).map((p: { nome: string; qtd: number; valor: number; categoria: string | null }) =>
        ({ nome: p.nome, qtd: p.qtd, valor: p.valor, categoria: p.categoria })),
      ultimaVenda: c.ultimaVenda ?? null,
    });
  } catch (e) {
    if (e instanceof ErroZig) return json({ error: "zig_indisponivel" }, 502);
    console.error("[lagun-bar-ponte]", e);
    return json({ error: "erro_interno" }, 500);
  }
});

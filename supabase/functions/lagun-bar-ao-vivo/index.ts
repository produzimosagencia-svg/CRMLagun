import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErroZig, diaSP, lerCasa } from "../_shared/casaLagun.ts";

// Bar ao vivo e Mapa da casa do app Lagun Administração (iPhone), 2026-11-19/20.
// Mesmo modelo da Tríade (app-interno, ação bar_ao_vivo, usado no Fantástico Mundo do Lukão).
// A leitura (Zig Bar, check-ins, lounges da noite) fica em _shared/casaLagun.ts, que a
// lagun-bar-push (Live Activity) também usa.
//
//   POST (Authorization: Bearer <sessão do app>) { forcar? }
//     → { ok, aberto, evento, noite, total (consumo do bar), recebido, bonus, foraDoBar, transacoes,
//         ticketMedio, ultimaHora, porHora, bares [B1 pista, B2 VIP], pdvs, produtos, lounges [L1..L6],
//         checkins, atualizadoEm, ultimaVenda, renovarEm }
//
// Quem pode: está em lagun_admin_acessos (cadastro do app) como administrador; parceiro só se tiver
// uma noite de hoje ou de ontem marcada. A conta de revisão da Apple recebe uma noite fictícia (casaDemonstracao).
// Secrets: ZIG_ERP_TOKEN (nunca sai do servidor), ZIG_ERP_REDE, e os opcionais ZIG_ERP_LOJA,
// ZIG_ERP_LOJAS_FORA e ZIG_BAR_MAPA (qual PDV é o bar da pista ou o VIP). Cache de 25 s (forcar: 10 s).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// Noite fictícia para a conta de revisão (números inventados, horários relativos a agora).
function casaDemonstracao() {
  const agora = Date.now(), HORA = 3600_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const hBr = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
  const inicio = Math.floor((agora - 4 * HORA) / HORA) * HORA;
  const horas = [0, 1, 2, 3, 4].map((i) => inicio + i * HORA);
  const valores = [3200, 9800, 14650, 12400, 6150];
  const entradas = [180, 260, 140, 60, 20];
  const lounge = (id: string, nome: string, cap: number, preco: number, status: "ocupado" | "reservado" | "livre", cliente: string | null, pessoas: number | null) => ({
    id, nome, categoria: id <= "L3" ? "Palco" : "Premium", capacidade: cap, preco, status, cliente, pessoas, consumo: null,
    chegouEm: status === "ocupado" ? iso(agora - 2 * HORA) : null,
    obs: status === "ocupado" ? "Demonstração: titular entrou (check-in)." : status === "reservado" ? "Demonstração: reserva paga, titular ainda não chegou." : "Livre nesta noite.",
  });
  const lounges = [
    lounge("L1", "Lounge 1", 2, 800, "ocupado", "Ana P.", 2), lounge("L2", "Lounge 2", 2, 800, "reservado", "Bruno M.", 2),
    lounge("L3", "Lounge 3", 2, 800, "livre", null, null), lounge("L4", "Lounge 4", 6, 1500, "ocupado", "Carla S.", 6),
    lounge("L5", "Lounge 5", 6, 1500, "livre", null, null), lounge("L6", "Lounge 6", 6, 1500, "reservado", "Diego R.", 5),
  ];
  return {
    aberto: true,
    evento: { id: "demo", nome: "Noite de demonstração", data: iso(inicio), loja: "Demonstração" },
    noite: null, eventosAbertos: 1, lojas: { lidas: ["Demonstração"], recusadas: 0 },
    total: 46200, consumo: 46200, recebido: 41800, bonus: 1200, foraDoBar: { bilheteria: 0, caucao: 0 },
    transacoes: 612, ticketMedio: 75.49, ultimaHora: 6150,
    porHora: horas.map((em, i) => ({ em: iso(em), h: hBr(em), valor: valores[i] })),
    bares: [
      { id: "B1", nome: "Bar da pista", area: "pista", valor: 31400, ultimaHora: 4200, itens: 980, ticketMedio: 68.9, status: "forte" },
      { id: "B2", nome: "Bar VIP", area: "vip", valor: 14800, ultimaHora: 1950, itens: 310, ticketMedio: 96.1, status: "normal" },
    ],
    pdvs: [{ nome: "Bar da pista", valor: 31400 }, { nome: "Bar VIP", valor: 14800 }],
    produtos: [
      { nome: "Gin (garrafa)", qtd: 22, valor: 10560, categoria: "Garrafas" }, { nome: "Energético", qtd: 610, valor: 9150, categoria: "Soft" },
      { nome: "Drink da casa", qtd: 240, valor: 7200, categoria: "Drinks" }, { nome: "Whisky (garrafa)", qtd: 9, valor: 4950, categoria: "Garrafas" },
      { nome: "Água", qtd: 520, valor: 3120, categoria: "Soft" }, { nome: "Cerveja", qtd: 260, valor: 3900, categoria: "Cervejas" },
    ],
    lounges, loungesOcupados: 2, loungesTotal: 6,
    checkins: { entraram: 660, sairam: 85, porHora: horas.map((em, i) => ({ em: iso(em), h: hBr(em), qtd: entradas[i] })), ultimo: iso(agora - 6 * 60_000) },
    erroCheckin: null, ultimaVenda: iso(agora - 40_000), atualizadoEm: iso(agora), renovarEm: 30,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Entre de novo no app." }, 401);
    const admin = sb();
    const { data: quem } = await admin.auth.getUser(jwt);
    const user = quem.user;
    if (!user) return json({ error: "Entre de novo no app." }, 401);
    // Conta de revisão da Apple: noite fictícia (nunca dado real), para o revisor ver a tela e a Live Activity.
    if (user.app_metadata?.revisao === true) return json({ ok: true, demonstracao: true, ...casaDemonstracao() });
    const { data: acesso } = await admin.from("lagun_admin_acessos").select("cargo").eq("user_id", user.id).maybeSingle();
    if (!acesso) return json({ error: "O bar ao vivo é só para a administração da Lagun." }, 403);
    if (acesso.cargo !== "administrador") {
      const { data: noites } = await admin.from("lagun_admin_acesso_noites").select("lagun_events!inner(data)").eq("user_id", user.id)
        .gte("lagun_events.data", diaSP(-1)).lte("lagun_events.data", diaSP(0));
      if (!noites?.length) return json({ error: "O bar ao vivo aparece só na noite liberada para você." }, 403);
    }
    try {
      return json({ ok: true, ...(await lerCasa(admin, body.forcar === true ? 10_000 : 25_000)) });
    } catch (e) {
      if (e instanceof ErroZig) return json({ error: e.message }, e.status);
      throw e;
    }
  } catch (e) {
    console.error("[lagun-bar-ao-vivo]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

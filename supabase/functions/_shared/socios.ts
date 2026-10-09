// Quem é sócio do evento, pelo telefone do WhatsApp.
//
// A lista é o cadastro de Parceiros do painel (lagun_partners): os `fixo` são
// a casa e enxergam todos os eventos; os `parceiro` só enxergam os eventos em
// que estão vinculados (lagun_event_partners). Mesma lista do resumo diário.
//
// O número que a Meta manda (wa_id) pode vir sem o nono dígito em celulares
// brasileiros antigos; compara as duas formas.

export type Socio = {
  partner_id: string;
  nome: string;
  telefone: string;
  tipo: "fixo" | "parceiro";
  /** null = todos os eventos (fixo). */
  eventIds: string[] | null;
};

export function variantesDoTelefone(raw: string): string[] {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return [];
  const v = new Set<string>([d]);
  if (d.startsWith("55")) {
    // 55 + DDD(2) + 9 + 8 dígitos = 13; sem o 9 = 12.
    if (d.length === 13 && d[4] === "9") v.add(d.slice(0, 4) + d.slice(5));
    if (d.length === 12) v.add(d.slice(0, 4) + "9" + d.slice(4));
  } else if (d.length === 10 || d.length === 11) {
    v.add("55" + d);
    if (d.length === 11 && d[2] === "9") v.add("55" + d.slice(0, 2) + d.slice(3));
    if (d.length === 10) v.add("55" + d.slice(0, 2) + "9" + d.slice(2));
  }
  return [...v];
}

export async function encontrarSocio(sb: any, telefone: string): Promise<Socio | null> {
  const variantes = variantesDoTelefone(telefone);
  if (!variantes.length) return null;
  const { data: parceiros } = await sb.from("lagun_partners")
    .select("id, nome, telefone, tipo").in("telefone", variantes).limit(5);
  const lista = (parceiros ?? []) as Array<{ id: string; nome: string; telefone: string; tipo: string }>;
  if (!lista.length) return null;
  // Fixo ganha de parceiro se o mesmo telefone estiver nos dois.
  const p = lista.find((x) => x.tipo === "fixo") ?? lista[0];
  if (p.tipo === "fixo") {
    return { partner_id: p.id, nome: p.nome, telefone, tipo: "fixo", eventIds: null };
  }
  const { data: vinculos } = await sb.from("lagun_event_partners").select("event_id").eq("partner_id", p.id);
  return {
    partner_id: p.id, nome: p.nome, telefone, tipo: "parceiro",
    eventIds: ((vinculos ?? []) as Array<{ event_id: string }>).map((v) => v.event_id),
  };
}

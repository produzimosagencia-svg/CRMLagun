// Mesma regra de supabase/functions/_shared/socios.ts: o wa_id da Meta pode vir
// sem o nono dígito em celulares brasileiros antigos; gera as duas formas.
export function variantesDoTelefone(raw: string): string[] {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return [];
  const v = new Set<string>([d]);
  if (d.startsWith("55")) {
    if (d.length === 13 && d[4] === "9") v.add(d.slice(0, 4) + d.slice(5));
    if (d.length === 12) v.add(d.slice(0, 4) + "9" + d.slice(4));
  } else if (d.length === 10 || d.length === 11) {
    v.add("55" + d);
    if (d.length === 11 && d[2] === "9") v.add("55" + d.slice(0, 2) + d.slice(3));
    if (d.length === 10) v.add("55" + d.slice(0, 2) + "9" + d.slice(2));
  }
  return [...v];
}

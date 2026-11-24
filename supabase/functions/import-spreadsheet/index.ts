import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { requireEquipe } from "../_shared/equipe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // Auditoria 2026-11-24: só equipe da Lagun (ou service role); cliente do app e chave anon ficam de fora.
  { const eq = await requireEquipe(req); if (!eq.ok) return eq.response; }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    let eventName = "";
    let eventCategory = "";
    let rows: Record<string, string>[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      eventName = formData.get("event_name") as string || "";
      eventCategory = formData.get("event_category") as string || "";
      const file = formData.get("file") as File;

      if (file) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      }
    } else {
      const body = await req.json();
      eventName = body.event_name || "";
      eventCategory = body.event_category || "";
      rows = body.rows || [];
    }

    if (!eventName || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Missing event_name or no rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventCategory) {
      await supabase.from("event_categories").upsert(
        { event_name: eventName, category: eventCategory },
        { onConflict: "event_name" }
      );
    }

    let customersCreated = 0;
    let customersUpdated = 0;
    let purchasesCreated = 0;
    let skipped = 0;

    const getVal = (row: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
          return String(row[k]).trim();
        }
      }
      return null;
    };

    // Parse date in formats: M/D/YYYY, DD/MM/YYYY, YYYY-MM-DD
    const parseDate = (raw: string | null): string | null => {
      if (!raw) return null;
      const s = raw.split(" ")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const parts = s.split("/");
      if (parts.length !== 3) return null;
      let [a, b, c] = parts;
      if (c.length === 2) c = "20" + c;
      // Heuristic: if first part > 12, it's day-first (DD/MM/YYYY)
      const ai = parseInt(a, 10);
      const bi = parseInt(b, 10);
      if (ai > 12) {
        return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
      }
      // Otherwise assume M/D/YYYY (US format from spreadsheets)
      return `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    };

    const parsePrice = (raw: string | null): number => {
      if (!raw) return 0;
      const cleaned = raw.replace(/[^\d,.\-]/g, "").replace(",", ".");
      const v = parseFloat(cleaned);
      return isNaN(v) ? 0 : v;
    };

    for (const row of rows) {
      const buyerName = getVal(row, "Nome do Comprador", "Nome");
      const buyerEmail = getVal(row, "Email do Comprador", "Email")?.toLowerCase();
      const buyerPhone = getVal(row, "Telefone do Comprador", "Telefone");
      const city = getVal(row, "Cidade do Comprador", "Cidade");
      const state = getVal(row, "Estado do Comprador", "Estado");
      const neighborhood = getVal(row, "Bairro do Comprador", "Bairro");
      const birthRaw = getVal(row, "Data de Nascimento", "Data Nasc");
      const birthDate = parseDate(birthRaw);
      const paymentMethod = getVal(row, "Método de pagamento", "Método de Pagamento", "Metodo de Pagamento");
      const coupon = getVal(row, "Código do Cupom", "Codigo Cupom", "Codigo do Cupom");
      const ticketPrice = parsePrice(getVal(row, "Valor do ingresso", "Valor do Ingresso"));

      if (!buyerName || !buyerEmail) {
        skipped++;
        continue;
      }

      // Upsert customer by email
      const { data: existing } = await supabase
        .from("crm_customers")
        .select("id, birth_date")
        .eq("email", buyerEmail)
        .maybeSingle();

      let customerId: string;

      if (existing) {
        const updatePayload: Record<string, unknown> = {
          phone: buyerPhone,
          city,
          state,
          neighborhood,
        };
        if (birthDate && !existing.birth_date) updatePayload.birth_date = birthDate;
        await supabase.from("crm_customers").update(updatePayload).eq("id", existing.id);
        customerId = existing.id;
        customersUpdated++;
      } else {
        const { data: newCust, error: insertErr } = await supabase
          .from("crm_customers")
          .insert({
            full_name: buyerName,
            email: buyerEmail,
            phone: buyerPhone,
            city,
            state,
            neighborhood,
            birth_date: birthDate,
          })
          .select("id")
          .single();

        if (insertErr || !newCust) {
          skipped++;
          continue;
        }
        customerId = newCust.id;
        customersCreated++;
      }

      await supabase.from("crm_purchases").insert({
        customer_id: customerId,
        event_name: eventName,
        purchase_date: new Date().toISOString().split("T")[0],
        ticket_price: ticketPrice,
        quantity: 1,
        total_value: ticketPrice,
        payment_method: paymentMethod,
        coupon_used: coupon,
        attendance_status: "Pendente",
      });

      purchasesCreated++;
    }

    return new Response(
      JSON.stringify({ totalRows: rows.length, customersCreated, customersUpdated, purchasesCreated, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("import-spreadsheet error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { event_name, event_category, rows } = await req.json();

    if (!event_name || !rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Missing event_name or rows" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event_category) {
      await supabase.from("event_categories").upsert(
        { event_name, category: event_category },
        { onConflict: "event_name" }
      );
    }

    // Parse rows
    interface ParsedRow {
      buyerName: string; buyerEmail: string; buyerPhone: string | null;
      city: string | null; state: string | null; neighborhood: string | null;
      ticketCode: string | null; purchaseDate: string; ticketPrice: number;
      attendanceStatus: string; ticketType: string | null; ticketLot: string | null;
      channel: string | null; promoterCode: string | null; coupon: string | null;
      birthDate: string | null; extraTags: string[];
    }

    const getVal = (row: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return String(row[k]).trim();
      }
      return null;
    };

    const parsedRows: ParsedRow[] = [];
    const uniqueEmails = new Set<string>();
    let skipped = 0;

    // Detect format: "blueticket-customer-list" uses different column names
    const isBtCustomerList = rows.length > 0 && ("E-mail" in rows[0] || "Nome" in rows[0]);

    for (const row of rows) {
      let buyerName: string | null, buyerEmail: string | null, status: string;

      if (isBtCustomerList) {
        // Blueticket customer list format (E-mail, Nome, Celular, Bairro, Cidade, Estado, Data Nascimento)
        buyerName = getVal(row, "Nome");
        buyerEmail = getVal(row, "E-mail")?.toLowerCase() || null;
        status = "finalizado"; // all rows in this list are confirmed buyers
      } else {
        buyerName = getVal(row, "Nome do Comprador");
        buyerEmail = getVal(row, "Email do Comprador")?.toLowerCase() || null;
        status = getVal(row, "Status da compra") || "";
      }

      if (!buyerName || !buyerEmail) { skipped++; continue; }
      if (!isBtCustomerList && !status.toLowerCase().trim().startsWith("finaliza")) { skipped++; continue; }

      const rawDate = isBtCustomerList ? null : (getVal(row, "Data da compra") || "");
      let purchaseDate = new Date().toISOString().split("T")[0];
      if (rawDate) {
        const parts = rawDate.split(" ")[0]?.split("/");
        if (parts && parts.length === 3) purchaseDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      // Parse birth_date from row (DD/MM/YYYY → YYYY-MM-DD)
      const rawBirth = getVal(row, "Data Nascimento", "Data de Nascimento", "birth_date");
      let birthDate: string | null = null;
      if (rawBirth) {
        const bp = rawBirth.split("/");
        if (bp.length === 3) birthDate = `${bp[2]}-${bp[1].padStart(2,"0")}-${bp[0].padStart(2,"0")}`;
        else birthDate = rawBirth; // already ISO
      }

      // Extra tags passed in row or from request-level tags
      const rowTagsRaw = getVal(row, "Tags", "tags");
      const extraTags: string[] = rowTagsRaw ? rowTagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];

      // Normalize phone: strip non-digits
      const rawPhone = isBtCustomerList
        ? getVal(row, "Celular", "Telefone")
        : getVal(row, "Telefone do Comprador");
      const normalizedPhone = rawPhone ? rawPhone.replace(/\D/g, "") : null;

      // State: map full names to abbreviations
      const STATE_MAP: Record<string, string> = {
        "acre":"AC","alagoas":"AL","amapá":"AP","amazonas":"AM","bahia":"BA","ceará":"CE",
        "distrito federal":"DF","espírito santo":"ES","goiás":"GO","maranhão":"MA",
        "mato grosso":"MT","mato grosso do sul":"MS","minas gerais":"MG","pará":"PA",
        "paraíba":"PB","paraná":"PR","pernambuco":"PE","piauí":"PI","rio de janeiro":"RJ",
        "rio grande do norte":"RN","rio grande do sul":"RS","rondônia":"RO","roraima":"RR",
        "santa catarina":"SC","são paulo":"SP","sergipe":"SE","tocantins":"TO",
      };
      const rawState = isBtCustomerList ? getVal(row, "Estado") : getVal(row, "Estado do Comprador");
      const normalizedState = rawState
        ? (rawState.length === 2 ? rawState.toUpperCase() : (STATE_MAP[rawState.toLowerCase()] ?? rawState))
        : null;

      const rawPrice = getVal(row, "Valor do ingresso");
      const ticketPrice = rawPrice ? parseFloat(String(rawPrice).replace(",", ".")) : 0;
      const checkin = getVal(row, "Checkin");
      const attendanceStatus = checkin === "Realizado" ? "Compareceu" : checkin === "Não Realizado" ? "Não Compareceu" : "Pendente";

      uniqueEmails.add(buyerEmail);
      parsedRows.push({
        buyerName, buyerEmail,
        buyerPhone: normalizedPhone,
        city: isBtCustomerList ? getVal(row, "Cidade") : getVal(row, "Cidade do Comprador"),
        state: normalizedState,
        neighborhood: isBtCustomerList ? getVal(row, "Bairro") : getVal(row, "Bairro do Comprador"),
        ticketCode: getVal(row, "Código do ingresso"),
        purchaseDate, ticketPrice, attendanceStatus,
        ticketType: getVal(row, "Tipo do Ingresso"),
        ticketLot: getVal(row, "Lote"),
        channel: getVal(row, "Canal de Compra"),
        promoterCode: getVal(row, "Código do Promotor"),
        coupon: getVal(row, "Código do Cupom"),
        birthDate,
        extraTags,
      });
    }

    // Batch fetch existing customers
    const emailList = Array.from(uniqueEmails);
    const customerByEmail = new Map<string, string>();
    for (let i = 0; i < emailList.length; i += 200) {
      const batch = emailList.slice(i, i + 200);
      const { data } = await supabase.from("crm_customers").select("id, email").in("email", batch);
      for (const c of (data || [])) {
        if (c.email) customerByEmail.set(c.email, c.id);
      }
    }

    // Batch insert new customers
    const newCustomersMap = new Map<string, any>();
    for (const r of parsedRows) {
      if (customerByEmail.has(r.buyerEmail) || newCustomersMap.has(r.buyerEmail)) continue;
      newCustomersMap.set(r.buyerEmail, {
        full_name: r.buyerName, email: r.buyerEmail,
        phone: r.buyerPhone, city: r.city, state: r.state, neighborhood: r.neighborhood,
        birth_date: r.birthDate || null,
        tags: r.extraTags.length > 0 ? r.extraTags : [],
      });
    }

    let customersCreated = 0;
    const newList = Array.from(newCustomersMap.values());
    for (let i = 0; i < newList.length; i += 50) {
      const chunk = newList.slice(i, i + 50);
      const { data: inserted, error } = await supabase.from("crm_customers").insert(chunk).select("id, email");
      if (error) {
        for (const c of chunk) {
          const { data: s, error: e } = await supabase.from("crm_customers").insert(c).select("id, email").single();
          if (!e && s?.email) { customerByEmail.set(s.email, s.id); customersCreated++; }
        }
      } else if (inserted) {
        for (const c of inserted) {
          if (c.email) customerByEmail.set(c.email, c.id);
          customersCreated++;
        }
      }
    }

    // Update existing customers — also merge tags and set birth_date if missing
    let customersUpdated = 0;
    const updated = new Set<string>();

    // Fetch existing tags + birth_date for customers that need updates
    const existingCustomerIds = [...new Set(
      parsedRows
        .filter(r => customerByEmail.has(r.buyerEmail) && !newCustomersMap.has(r.buyerEmail))
        .map(r => customerByEmail.get(r.buyerEmail)!)
    )];
    const existingTagsMap = new Map<string, { tags: string[]; birth_date: string | null }>();
    for (let i = 0; i < existingCustomerIds.length; i += 200) {
      const batch = existingCustomerIds.slice(i, i + 200);
      const { data } = await supabase.from("crm_customers").select("id, tags, birth_date").in("id", batch);
      for (const c of (data || [])) {
        existingTagsMap.set(c.id, { tags: c.tags || [], birth_date: c.birth_date || null });
      }
    }

    for (const r of parsedRows) {
      const cid = customerByEmail.get(r.buyerEmail);
      if (!cid || newCustomersMap.has(r.buyerEmail) || updated.has(cid)) continue;
      const existing = existingTagsMap.get(cid) || { tags: [], birth_date: null };
      const mergedTags = Array.from(new Set([...existing.tags, ...r.extraTags]));
      const d: Record<string, any> = {};
      if (r.buyerPhone) d.phone = r.buyerPhone;
      if (r.city) d.city = r.city;
      if (r.state) d.state = r.state;
      if (r.neighborhood) d.neighborhood = r.neighborhood;
      if (r.birthDate && !existing.birth_date) d.birth_date = r.birthDate;
      if (mergedTags.length > (existing.tags?.length ?? 0)) d.tags = mergedTags;
      if (Object.keys(d).length > 0) {
        await supabase.from("crm_customers").update(d).eq("id", cid);
        updated.add(cid);
        customersUpdated++;
      }
    }

    // Dedup existing purchases
    const existingCodes = new Set<string>();
    const codes = parsedRows.map(r => r.ticketCode).filter(Boolean) as string[];
    for (let i = 0; i < codes.length; i += 200) {
      const batch = codes.slice(i, i + 200);
      const { data } = await supabase.from("crm_purchases").select("coupon_used")
        .eq("event_name", event_name).in("coupon_used", batch);
      for (const p of (data || [])) {
        if (p.coupon_used) existingCodes.add(p.coupon_used);
      }
    }

    // Batch insert purchases
    const purchases: any[] = [];
    for (const r of parsedRows) {
      if (r.ticketCode && existingCodes.has(r.ticketCode)) { skipped++; continue; }
      const cid = customerByEmail.get(r.buyerEmail);
      if (!cid) { skipped++; continue; }
      purchases.push({
        customer_id: cid, event_name,
        purchase_date: r.purchaseDate,
        ticket_type: r.ticketType, ticket_lot: r.ticketLot,
        ticket_price: r.ticketPrice, quantity: 1, total_value: r.ticketPrice,
        acquisition_channel: r.channel, attendance_status: r.attendanceStatus,
        coupon_used: r.ticketCode || null, influencer_code: r.promoterCode,
        campaign_origin: r.coupon,
      });
    }

    let purchasesCreated = 0;
    for (let i = 0; i < purchases.length; i += 50) {
      const chunk = purchases.slice(i, i + 50);
      const { error } = await supabase.from("crm_purchases").insert(chunk);
      if (error) {
        for (const p of chunk) {
          const { error: e } = await supabase.from("crm_purchases").insert(p);
          if (!e) purchasesCreated++;
        }
      } else {
        purchasesCreated += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      customersCreated, customersUpdated, purchasesCreated, skipped,
      processedRows: parsedRows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Import error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

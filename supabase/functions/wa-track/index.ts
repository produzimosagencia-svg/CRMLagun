import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const fallback = "https://lagun-gamma.vercel.app";

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("token") || requestUrl.pathname.split("/").filter(Boolean).pop() || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return Response.redirect(fallback, 302);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: link } = await supabase
    .from("wa_tracking_links")
    .select("id,campaign_key")
    .eq("token", token)
    .maybeSingle();
  if (!link) return Response.redirect(`${fallback}/?link_invalido=1`, 302);

  const { data: config } = await supabase
    .from("wa_tracking_config")
    .select("destination_url,enabled")
    .eq("campaign_key", link.campaign_key)
    .maybeSingle();

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ipHash = forwarded
    ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forwarded))))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("")
    : null;
  await supabase.from("wa_tracking_clicks").insert({
    link_id: link.id,
    user_agent: req.headers.get("user-agent"),
    ip_hash: ipHash,
  });

  const destination = config?.enabled && /^https:\/\//i.test(config.destination_url || "")
    ? config.destination_url
    : fallback;
  return Response.redirect(destination, 302);
});

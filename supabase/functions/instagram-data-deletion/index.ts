import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    let userId: string | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      userId = body.user_id ?? body.instagram_user_id ?? null;
    } else {
      const form = await req.formData();
      // signed_request is base64url encoded — just extract user_id if present
      userId = String(form.get("user_id") ?? "");
    }

    const confirmationCode = `lagun-del-${crypto.randomUUID()}`;

    if (userId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Delete Instagram conversations and messages for this user
      const { data: conv } = await supabase
        .from("ig_conversations")
        .select("id")
        .eq("ig_user_id", userId)
        .maybeSingle();

      if (conv) {
        await supabase.from("ig_messages").delete().eq("conversation_id", conv.id);
        await supabase.from("ig_conversations").delete().eq("id", conv.id);
      }

      // Also delete from whatsapp_messages if any Instagram channel messages
      await supabase
        .from("whatsapp_messages")
        .delete()
        .eq("phone", userId)
        .eq("channel", "instagram");

      console.log(`Data deletion completed for user: ${userId}, code: ${confirmationCode}`);
    }

    // Required Meta response format
    return new Response(
      JSON.stringify({
        url: `https://lagun.com.br/exclusao-de-dados?code=${confirmationCode}`,
        confirmation_code: confirmationCode,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error("Data deletion error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

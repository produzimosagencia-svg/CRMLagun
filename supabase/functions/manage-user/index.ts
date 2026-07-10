import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Authenticate caller
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claims.claims.sub as string;

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2. Authorize: caller must be admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const { action, user_id, full_name, username, password } = await req.json();
    if (!user_id) return json({ error: "user_id obrigatório" }, 400);

    if (action === "delete") {
      if (user_id === callerId) {
        return json({ error: "Você não pode excluir seu próprio usuário" }, 400);
      }
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      await supabaseAdmin.from("user_menu_overrides").delete().eq("user_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("id", user_id);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "update") {
      const attrs: Record<string, unknown> = {};
      if (password) attrs.password = password;
      if (full_name) attrs.user_metadata = { full_name };
      if (username) attrs.email = `${username}@triade.internal`;
      if (Object.keys(attrs).length > 0) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, attrs);
        if (error) throw error;
      }
      const profileFields: Record<string, unknown> = { id: user_id };
      if (full_name !== undefined) profileFields.full_name = full_name;
      if (username !== undefined) profileFields.username = username;
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(profileFields);
      if (profileError) throw profileError;
      return json({ success: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});

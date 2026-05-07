import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let email = "teste@letscookies.com";
    let password = "Teste@123456";
    let fullName = "Usuário Teste";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.email) email = body.email;
        if (body?.password) password = body.password;
        if (body?.full_name) fullName = body.full_name;
      } catch {}
    }

    // Check existing
    const { data: existing } = await supabase.auth.admin.listUsers();
    let userId = existing?.users?.find((u) => u.email === email)?.id;

    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      userId = data.user!.id;
    } else {
      // Reset password to known value
      await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    }

    // Ensure admin role
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });

    return new Response(
      JSON.stringify({ ok: true, email, password, user_id: userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

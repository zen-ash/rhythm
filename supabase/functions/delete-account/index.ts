// Supabase Edge Function: delete-account
//
// Security model:
//  * The caller's JWT is required (verify_jwt stays ON — the default).
//  * The user id is derived ONLY from the verified JWT (getUser), never from
//    the request body. There is no user_id argument.
//  * The service role key is read from the function's environment and is never
//    sent to the client.
//  * Data is deleted explicitly in FK-safe order (children -> parents -> auth
//    user), not relying on cascade.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("delete-account: missing environment configuration");
      return json({ error: "Could not delete account" }, 500);
    }

    // Verify the caller and derive the user id from the JWT only.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const uid = user.id;

    // Service-role client (server-only) for the actual deletes.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // FK-safe order: timer_action_logs -> focus_sessions -> tasks -> profiles.
    const timerLogs = await admin
      .from("timer_action_logs")
      .delete()
      .eq("user_id", uid);
    if (timerLogs.error) throw timerLogs.error;

    const sessions = await admin
      .from("focus_sessions")
      .delete()
      .eq("user_id", uid);
    if (sessions.error) throw sessions.error;

    const tasks = await admin.from("tasks").delete().eq("user_id", uid);
    if (tasks.error) throw tasks.error;

    const profile = await admin.from("profiles").delete().eq("id", uid);
    if (profile.error) throw profile.error;

    // Finally remove the auth user via the Admin API.
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(uid);
    if (deleteUserError) throw deleteUserError;

    return json({ ok: true }, 200);
  } catch (error) {
    // Calm, minimal error — no internals leaked to the client.
    console.error("delete-account failed:", error);
    return json({ error: "Could not delete account" }, 500);
  }
});
